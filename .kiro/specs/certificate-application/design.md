# Design — Setu Gateway

## Architecture
```
Citizen frontend (separate app; refrences/ is the design guide)
        │  /api/v1/... (gateway-scoped JWT in Authorization header)
        ▼
   Setu Gateway (standalone Node/Express)
        │
        ├─ citizen-api/ (Layer 1) ── auth, applications, consent, documents
        │      └─ owns gateway DB: citizens, linked_references,
        │         applications, application_department_calls,
        │         consent_grants, audit_log  (PostgreSQL)
        │
        └─ department-clients/ (Layer 2) ── one HTTP client per department,
               each attaching that department's own X-Gateway-Key:
               ├─► Digital Tax Records        (FastAPI, GET /pan/{ref}/fields)
               ├─► National Identity Registry (Express, path TBC; retry-on-token-expiry)
               └─► Driving Licence & Jan Aadhaar (Express, GET /api/v1/gateway/registrations/:ref)

Every department call → application_department_calls row + audit_log summary.
```

Authoritative contracts: `api.md` (Part 1 = citizen API, Part 2 =
department APIs), `database-schema.md` (tables), `appflow.md` (sequence),
and `Mock_Sites/HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md` (per-site wiring).

## Sequence of calls (happy path)
1. Citizen logs in → gateway returns a JWT (`POST /api/v1/auth/login`).
2. Citizen starts an application → `applications` row, `status = submitted`.
3. Citizen approves consent → `consent_grants` row written.
4. Gateway checks consent exists, moves to `gateway_relay`, resolves the
   `linked_references` row for that department.
5. Gateway → department: real HTTP call with the correct `X-Gateway-Key`;
   `status = department_verifying`.
6. Department → gateway: verified data.
7. Gateway writes `application_department_calls` (succeeded) + `audit_log`
   summary, sets `linked_references.verified = true`, `status = complete`.
8. Citizen sees the result via `GET /api/v1/applications/:id` and
   `GET /api/v1/documents`.

## Sequence of calls (failure path)
1–5. same as above.
6. Department is unreachable / times out / rejects (after any built-in
   retry, e.g. NIR token expiry).
7. Gateway writes `application_department_calls` (failed) + `audit_log`
   summary, sets `status = failed`.
8. Citizen sees an honest error; no fake data is substituted.

## Reuse path
If a `linked_references` row for the needed department already has
`verified = true`, a later application skips re-entry (steps around
citizen data entry) and goes straight to a fresh consented, logged fetch.

---

## Citizen-facing API surface (Layer 1)
See `api.md` Part 1 for the full contract. Endpoints:
`POST /api/v1/auth/register`, `POST /api/v1/auth/login`,
`GET/POST /api/v1/applications`, `GET /api/v1/applications/:id`,
`POST /api/v1/consent`, `GET /api/v1/documents`.

## Frontend (built later, separate app)
Design direction comes from `refrences/` (see HOW_TO_USE_REFRENCES.md —
90% match the tone/structure, 10% reconcile against what the gateway
really does). `refrences/setu_sih26129_demo.html` is the closest
structural reference (view-switching, consent-modal flow) and already
names the three real departments. Do not build frontend behavior the
gateway can't back yet — flag mismatches instead.

States to handle on every screen: loading, success, business-level
"not found/rejected" (a calm informative state, not a crash), and
network/infrastructure failure (distinct, retry-safe, still logged).

## Visual direction

> **Correction (Phase 1 reset).** The earlier version of this section
> decided *against* the `refrences/` look and made the demo HTML the
> primary visual source, producing a warm-paper/serif "govtech-editorial"
> theme. That was the wrong call — it contradicted the citizen-provided
> references, which ARE the intended design, and `HOW_TO_USE_REFRENCES.md`
> says to match them ~90%. This section is rewritten to the correct source
> hierarchy so a future agent does not repeat the mistake.

### Source hierarchy (authoritative)

1. **`refrences/dashboard.png` — PRIMARY visual source.** The whole
   look-and-feel target: a clean, LIGHT SaaS dashboard. Light cool-grey
   canvas, crisp white cards on hairline cool-grey borders, near-black
   primary action buttons, one restrained blue accent, generous 4px-based
   padding rhythm, a modern grotesque sans. `scrolanimation.png` is the
   companion motion reference.
2. **The `.txt` section references — per-section sources for the section
   each names.** They are React+Tailwind+shadcn snippets for a stack we
   are NOT using, so they are mined for *intent, layout, and interaction*
   (never copied as markup), each applied to its own section:
   - `signin.txt` / `signup.txt` → the auth screen (split-panel, sliding
     sign-in/sign-up), reconciled to the gateway's real email+password
     auth (NO social/OAuth login — the gateway doesn't have it).
   - `background.txt` → the interactive dark particle/mesh backdrop,
     scoped to the auth screen, reimplemented in vanilla JS.
   - `button1.txt` / `button2.txt` / `butten.jpeg` / `2butten.jpeg` →
     CTA shape, weight, and hierarchy. Their literal liquid/gradient-blur
     effects are reference for *feel*, not to be reproduced pixel-for-pixel.
   - `hero1.txt` / `feature1.txt` / `lock screen 1.txt` → the landing/
     hero, feature sections, and locked/session-expired state.
   - `Animation_lib_etc.jpeg` → motion-library inspiration (GSAP is the
     one in our locked stack; the others are out of scope).
3. **`refrences/setu_sih26129_demo.html` — FEATURE / INTERACTION reference
   ONLY. DO NOT use the demo HTML as a visual source.** It contributes the
   view-switching pattern (tabs → sections), the consent-modal → relay
   flow, and the fact that it already names the three real departments.
   Its palette, its Source Serif 4 type, and its warm-paper surfaces are
   explicitly NOT to be copied — that is exactly the aesthetic Phase 1
   removed.

### Palette / type (from dashboard.png — see `tokens.css` for exact hexes)

LIGHT UI. Canvas `#F7F8FA`, cards `#FFFFFF`, hairline borders `#EAECEF` /
`#DDE1E6`. Text: near-black `#101317` → mid-grey `#5A6069` → muted
`#9AA0A8`. Single dark **primary action** colour is near-black
`#111317` → `#000` on hover (the legacy `--indigo` token name is kept but
now holds this near-black). One restrained **accent**, blue `#2E6BFF`
(the legacy `--terracotta` token name is kept but now holds this blue).
Semantic success `#1F9254`, warning `#B7791F`, danger `#D0342C`, info =
accent blue. Radius 12px cards / 10px inner / pill. Shadows are a whisper
(`0 1px 2px` resting) — separation is border-first. **Type is a modern
grotesque sans (Inter) only — Source Serif 4 is removed; no serif tokens,
no warm-paper hexes.**

### Structure (tab/view pattern — behavioural, from the demo HTML)

A single shell: topbar (brand mark + citizen name) and tab-switched views,
trimmed to only what an endpoint backs. Kept: Dashboard, Find a service,
Documents, Applications. **Cut** relative to the demo mock (unchanged
scope decisions): the "Department view" (admin/KPI) tab — out of scope per
`product.md`; a live "Connected platforms" health page — no live-health
endpoint backs it, faking numbers violates the "never fabricate" rule; the
"Ask Setu" chatbot — a canned-KB script with no real gateway capability.
These stay cut; the reset is about the *look*, not re-expanding scope.

### The one motif carried through

The hub-and-spoke network diagram (citizen at center, three department
nodes) remains the visual thesis — reused as the auth-screen backdrop
motif and as the relay-status track skeleton (submitted → gateway_relay →
department_verifying → complete/failed).

### Motion

GSAP only, reserved for the relay-status reveal (per `tech.md`) plus the
interactive auth backdrop; not decorative elsewhere. Motion tokens live in
`tokens.css` and honour `prefers-reduced-motion`. Motion libraries in
`Animation_lib_etc.jpeg` beyond GSAP are out of the locked stack.

### Buttons

Near-black solid fill for primary (dashboard.png's CTA), hairline-outline
ghost for secondary, success-green for a "verified/reuse" affordance, with
a real pressed/hover depth. Shape/weight/hierarchy take from
`button1.txt` / `button2.txt` / the button images; their literal
liquid/gradient-blur is reference for feel, applied with restraint.

### Final build (Phase 6 closeout — what actually shipped)

The 6-phase re-skin is complete and the description above matches the
built result. Confirming the final state and the one addition:

- **Light app shell** (landing, dashboard, services, documents,
  applications, consent, relay) is governed entirely by `dashboard.png`:
  `#F7F8FA` canvas, white cards, hairline borders, whisper shadows, solid
  near-black primary CTAs, blue accent used sparingly. Tokens in
  `tokens.css`.
- **One dark surface only:** the auth screen's interactive particle
  backdrop (`particles.js`, concept from `background.txt`), scoped to that
  screen. Every other surface is light.
- **`setu_sih26129_demo.html` was NOT used as a visual source anywhere in
  the final build.** Its structure informed the tab/view + consent→relay
  interaction pattern only (behaviour), which predates this rebuild. Its
  warm-paper palette and Source Serif type are fully gone.
- **Landing page (`views/landing.js`) is new** — it did not exist before
  this rebuild. Pre-auth marketing surface (fixed blurred nav, hero with
  gradient-text headline + dual CTA + network-diagram preview, feature
  grid, departments band, minimal footer). Content is grounded in real
  project facts: the three departments come from the gateway's
  `application-service.js` `KNOWN_TYPES` / `relay-service.js`
  `TYPE_TO_DEPARTMENT`; feature copy describes only built capabilities;
  no stats/testimonials are invented. It is the unauthenticated entry
  point; a valid session skips straight to the app shell; logout returns
  to it.
- **The hub-spoke network diagram + brand mark (`netmap.js`) are now
  token-driven** — colours resolved from `:root` at call time (with
  fallbacks equal to current tokens), so the motif tracks the light
  system instead of the old hardcoded indigo/terracotta.
- **Motion:** GSAP for the relay reveal (tuned for the light palette in
  Phase 5) and the landing entrance/scroll reveals (core GSAP +
  IntersectionObserver, no ScrollTrigger plugin). The auth particle field
  is its own dependency-free canvas loop. All honour
  `prefers-reduced-motion`.
- **Keyboard access (Phase 6):** the two click-only elements
  (`.app-top-click`, `tr.row-click`) are now `role="button"` +
  `tabindex="0"` with an Enter/Space keydown path equivalent to their
  click, plus a visible focus ring. All other interactive elements were
  already real `<button>`s.
- **Gateway wiring unchanged throughout:** no view's data fetching, error
  handling, or session flow was altered in any phase — verified live end
  to end (register → apply → consent → relay → reuse → documents →
  detail) against the real gateway + Digital Tax Records mock at closeout.

## Error handling design
- Business-level response (e.g. reference not found) is a normal
  expected outcome — render it calmly, still log it.
- Network/infrastructure failure (a department is down) is a distinct
  state — "couldn't reach <department>, try again shortly" — and must be
  logged to `application_department_calls` + `audit_log` as `failed`.
