# Frontend — Open Items (Phase 5)

Running checklist of what's demo-ready vs. what still needs a pass before
Sept 30. Update this file, don't let it go stale — same drift-discipline
rule as the rest of the repo.

## Demo-ready (verified live against the real gateway + all 3 departments)

- **Auth**: register/login against the gateway's real `citizens` table.
  No fake OAuth — only the fields the gateway actually supports.
- **Dashboard**: real stats from `GET /applications` + `GET /documents`.
  Zero fabricated numbers (the reference mock's "12,450 requests / 97.8%"
  admin KPIs were cut entirely — see `design.md`).
- **Find a service**: catalog matches the gateway's exact three
  `KNOWN_TYPES` and each department's real field names. Reuse badge
  ("Verified — reuse instantly") appears correctly once a department is
  verified, and the consent modal skips the reference input in that case.
- **Consent modal → relay centerpiece**: wired to
  `POST /consent` → `POST /applications/:id/verify`. Verified live against
  **all three** departments (Digital Tax Records, National Identity
  Registry, Driving Licence & Jan Aadhaar Portal) — masking renders
  correctly for each (name-initials, DOB-year-only, address-pincode-only
  for NIR; 7-field summary incl. `verification_status` for DLJA fits the
  card at both desktop and mobile widths).
- **GSAP relay animation**: track nodes/lines animate on real state
  transitions only (no fabricated intermediate network calls); the
  currently-active node pulses; failure settles with the same
  deliberateness as success (identical reveal treatment, per instruction).
  Fully respects `prefers-reduced-motion` — verified the reduced-motion
  path still completes and still shows the reuse tag, just without tweens.
  GSAP is vendored locally (`public/js/vendor/gsap.min.js`), not CDN-loaded
  — zero external network dependency at demo time.
- **Documents view**: `GET /documents` rendered per department, verified
  vs. not-yet-verified states.
- **Applications list + detail**: `GET /applications` /
  `GET /applications/:id`, including the real `application_department_calls`
  history (endpoint, status code, masked `response_summary`, duration) —
  this is the on-screen audit-visibility substitute agreed for this phase
  (no new read-endpoint was added).
- **Reuse path, end to end**: confirmed live — second application against
  an already-verified department skips the reference field, the gateway
  reports `reused: true`, and the UI shows the reuse tag. This is the
  actual payoff moment and it works.
- **Business-level failure path**: bad reference → gateway's real
  `200 { status: "failed" }` → rendered as a calm, honest failure state,
  never a crash, never fake success.
- **Infrastructure-failure path (department fully unreachable)**:
  verified live in the browser by stopping DLJA mid-session and starting
  a driving-licence application — renders the same calm "Couldn't verify
  this right now / Could not reach Driving Licence & Jan Aadhaar Portal /
  Outcome code: unreachable" state, same visual treatment as the
  business-failure path, no crash.
- **Race-condition fix**: navigating away from a view while its data
  fetch is still in flight (e.g. right after a relay completes) no longer
  crashes — `render-guard.js` invalidates stale renders. Found and fixed
  during the NIR/DLJA pass; re-verified with a deliberate adversarial
  navigation sequence.
- **Data-fetch error surface**: when `dashboard.js` or `services.js`
  can't load its data (gateway unreachable, non-2xx, timeout), it shows
  an inline `.data-error-banner` (shared `dataErrorBannerHtml` in
  `util.js`, danger-soft tokens) with a **Retry** that re-runs the fetch
  — no full reload. A legitimately empty/new account still shows the
  normal "0 of 3 / no activity yet" state, never the banner. Verified
  live by pointing `api.js` at a dead port.

## Rough / needs a pass before the real demo

- **Toast stacking**: only one toast is shown at a time (a second `toast()`
  call replaces the first via a shared timer). Fine for the current flows
  since nothing fires two toasts back to back today, but worth knowing if
  a future change adds one.
- **Session expiry UX is minimal.** If the gateway JWT expires
  mid-session, `requireAuth` on the backend will 401 and the frontend's
  `ApiError` will surface the gateway's message inline wherever that call
  happened (e.g. inside a view's empty-state or the consent modal) —
  there's no dedicated "your session expired, please log in again"
  redirect-to-login screen. For an 8-hour JWT (`gateway/.env:
  JWT_EXPIRES_IN=8h`) this is unlikely to bite during a demo slot, but
  it's the least polished corner of the auth story.
- **No pagination on Applications/Documents.** Lists render everything
  the gateway returns. Not a problem for a demo account with a handful of
  applications; would need attention if the account used for judging ends
  up with dozens.

## Verified clean (Sept 18 tablet-width pass)

- **Tablet widths 768px / 834px / 900px**, screenshotted live against the
  real running stack (Playwright driving the actual gateway + DLJA — not
  a static mock): dashboard hero collapse, DLJA's 7-field masked
  `response_summary` inside the application-detail call-history card, and
  the auth-screen split-panel collapse straddling its exact 900px
  breakpoint (899px / 901px / 820px). Nothing broke — no overflow, no
  clipped text, no overlap at the breakpoint boundary. No code changes
  were needed; this item is closed, not deferred.

## Deliberately not built (scope decisions, not oversights)

These map 1:1 to gaps versus `refrences/setu_sih26129_demo.html` — see
`design.md`'s "Visual direction" section for the full rationale on each:

- **No "Department view" admin/KPI tab.** Nothing in the gateway backs
  the illustrative "12,450 requests / 97.8% success" numbers the reference
  mock shows; faking them would violate the project's own "never
  fabricate" rule.
- **No live "Connected platforms" health page.** Same reasoning — no
  gateway endpoint reports live per-department health; the departments'
  connection status is only ever proven by an actual call succeeding or
  failing, which the Applications detail view already shows honestly.
- **No "Ask Setu" chatbot.** The reference's chat widget answers from a
  hardcoded script (`chatKB` array) with no real backend behind it —
  the single most "generic AI-SaaS template" element in the reference
  folder, and not something the gateway can currently answer for real.
- **No raw `audit_log` viewer.** Per the agreed scope for this phase, reuse
  and audit visibility are shown through existing endpoints only
  (`data.reused` + `response_summary` + the documents state) — no new
  read-endpoint was added on the backend to expose `audit_log` rows
  directly to the frontend. The DB-level proof still lives in
  `gateway/scripts/phase4b-reuse-walkthrough.js` per the original plan.
- **No automated test suite for the frontend.** Verification for this
  phase was manual (curl + a disposable Playwright script run live against
  the real gateway and departments, then deleted) rather than a kept
  smoke/e2e suite — a deliberate speed tradeoff for the Sept 30 runway,
  not an oversight.

## For the demo-day operator (not code, just a reminder)

- All three department mock services + the gateway + this frontend need
  to be running concurrently for the full three-department story to work
  — see the gateway's `PROGRESS.md` "Restart sequence" section for exact
  start commands and ports.
- The frontend expects the gateway at `http://localhost:4000` (hardcoded
  in `public/js/api.js` — the two apps are deliberately decoupled, not
  reading each other's config).


---

# Frontend visual rebuild — closeout (6-phase re-skin)

The frontend was re-skinned from the warm-paper/serif theme (which came
from the demo HTML and was never the intended look) to the light
`dashboard.png` design system the citizen actually provided in
`refrences/`. Done in six reviewed phases. All gateway-wired JS behaviour
was preserved throughout — only styling, markup wrappers, one new view,
and a scoped keyboard-accessibility fix changed.

## What shipped

- **Design tokens (`tokens.css`)** — light system: `#F7F8FA` canvas,
  white cards, hairline borders, whisper shadows, near-black primary
  (`--primary`/legacy `--indigo`), blue accent (`--accent`/legacy
  `--terracotta`), success/warning/danger/info, full spacing/type/radius/
  shadow/z-index/motion scales, `prefers-reduced-motion` block. Source
  Serif 4 removed; Inter only. Legacy token NAMES kept (no rename
  cascade); `--font-serif` deprecated alias → sans.
- **App shell + all inner views (`app.css`)** — restyled to the light
  system; every existing class name reused, zero structural change.
  Underline tabs, white cards, semantic-tint status chips, solid
  near-black buttons, light consent modal + relay chrome.
- **Auth screen** — dark interactive particle backdrop (`particles.js`,
  dependency-free canvas) + centered light card; pill inputs with icons;
  sign-in/sign-up switch. Email+password only (no OAuth). Submit/session
  logic byte-identical.
- **Landing page (`views/landing.js`)** — NEW pre-auth surface; light;
  real-fact content; network-diagram motif; GSAP + IntersectionObserver
  reveals.
- **Relay motion** — GSAP timing/easing re-tuned for the light palette;
  the "in progress" node breathes by scale (no opacity-fade "stall");
  state machine untouched.
- **`netmap.js`** — brand mark + hub-spoke diagram now token-driven.
- **Keyboard access** — dashboard application items + applications table
  rows are now keyboard-operable (`role="button"`, `tabindex`,
  Enter/Space, focus ring).

## Verified at closeout

- Full gateway flow live (register → application → consent → relay verify
  → documents verified → **reuse with no reference → `reused:true`** →
  application detail call history with masked summary) against the real
  gateway + Digital Tax Records mock. Zero behaviour regression.
- `get_diagnostics` clean on all touched files; CSS braces balanced; all
  `var()` references resolve; all assets serve 200; `setu_sih26129_demo`
  palette + Source Serif fully absent from the build.

## Known gaps / wants-a-human-eye (honest list)

- **No in-browser click-through was possible in the build environment**
  (no browser tool). Everything was verified via served assets, live API
  calls, code paths, and static analysis. The following specifically
  still want one manual pass in a real browser:
  - Auth particle field renders + reacts to pointer; reduced-motion shows
    the static frame; navigating away leaves no leaked canvas/rAF.
  - Relay reveal *feel* on the light card, and its reduced-motion path
    landing states instantly and legibly.
  - Keyboard tab order across all screens; Enter/Space on the two
    now-focusable rows behaving exactly like a click.
  - Landing + auth + shell at mobile widths.
- **No real dashboard screenshot in the landing hero** — the hero uses
  the project's own network-diagram motif instead of a product
  screenshot (hero1.txt/lock screen 1.txt show a screenshot). Deliberate:
  a real screenshot is content we don't have; not faked.
- **Minor intentional inconsistencies left as-is:** landing feature-grid
  gap (`--space-5`) is looser than the shell grids (`--space-4`) for
  marketing breathing room; `.lp-preview-card` uses a heavier shadow as
  the hero focal element; `.side-card` uses slightly tighter vertical
  padding. All deliberate, not drift.
- **Deliberately still NOT built** (unchanged scope decisions from the
  original frontend, re-confirmed): no Department/KPI admin tab, no live
  "Connected platforms" health page, no "Ask Setu" chatbot, no raw
  `audit_log` viewer, no automated frontend test suite. Faking any of
  these would violate the project's "never fabricate" rule.
