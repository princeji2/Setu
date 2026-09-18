# Tasks — Setu Gateway

Deadline: **30 September 2026**. Each task references the requirement(s)
it satisfies (see `requirements.md`). Built in verifiable stages — one
piece confirmed building/passing before the next.

> The three department backends already exist in `Mock_Sites/` and are
> NOT built here — Phases below are about the gateway that calls them.

## Phase 0 — Design (complete)
- [x] Define the journey + scope → `product.md`
- [x] Lock the stack (Node/Express, hand-rolled auth) → `tech.md`
- [x] Gateway DB tables → `database-schema.md`
- [x] Citizen + department API contracts → `api.md`
- [x] End-to-end sequence → `appflow.md`
- [x] User stories + acceptance criteria → `requirements.md`
- [x] Architecture + sequences + states → `design.md`

## Phase 1 — Gateway scaffold + citizen auth (complete)
- [x] Scaffold the standalone Node/Express gateway (`/gateway`), matching
      the conventions of the existing Mock_Sites Node services (config/env,
      pg pool with parameterised queries, versioned `/api/v1` routes,
      helmet+cors, app exported for supertest)
- [x] Create the `citizens` table migration (per `database-schema.md`)
- [x] `POST /api/v1/auth/register`: create citizen, bcrypt hash, reject
      duplicate email (Story 1)
- [x] `POST /api/v1/auth/login`: verify credentials, return gateway JWT;
      reject wrong password (Story 1)
- [x] Tests: successful registration, duplicate email rejected, login
      with correct credentials, login with wrong password rejected
- [x] Run tests, show pass/fail — STOP for review before Phase 2

## Phase 2 — Applications + consent (gateway-owned, no department calls yet) (complete)
- [x] Remaining gateway tables: `linked_references`, `applications`,
      `application_department_calls`, `consent_grants`, `audit_log`
- [x] Auth middleware: verify the gateway JWT on protected routes
- [x] `POST /api/v1/applications` + `GET /api/v1/applications` +
      `GET /api/v1/applications/:id` (Stories 2, 5)
- [x] `POST /api/v1/consent` writes a `consent_grants` row (Story 3)
- [x] `GET /api/v1/documents` returns `linked_references` (Story 6, 8)
- [x] Audit logging helper used by every state change

## Phase 3 — Department clients (Layer 2) + orchestration (complete)
- [x] `department-clients/`: one client per department, each with its own
      base URL + `X-Gateway-Key` env var + response/error shape
      (`api.md` Part 2; HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md)
- [x] Confirm the National Identity Registry endpoint path against its
      route file before wiring (open question in `tech.md`) — resolved,
      see `api.md` Part 2's Step 3b correction (path param is
      `identityReference`, mounted under `/api/registration`)
- [x] National Identity Registry client: retry once on token expiry —
      resolved as NOT NEEDED after reading `gatewayAuthMiddleware.js`; the
      `/fields` route uses a plain static key compare, no expiry (see
      `api.md` Part 2's Step 3b correction)
- [x] Consent check enforced before any department call (Story 3)
- [x] Relay orchestration: submitted → gateway_relay →
      department_verifying → complete/failed (Story 4)
- [x] Every call writes `application_department_calls` + `audit_log`,
      success or failure (Story 6; structure.md rule 2)
- [x] Failure path: department stopped → `failed` row + honest error,
      no fake data (Story 7)
- [x] Reuse path: verified `linked_references` skips re-entry (Story 8) —
      see `appflow.md`'s "Reuse" section, Phase 4b

## Phase 4 — Frontend (separate app) (complete)
- [x] Build citizen frontend against the gateway API, using `refrences/`
      as the design guide (HOW_TO_USE_REFRENCES.md, 90/10 rule)
- [x] Login/register, application start, consent modal, live status
      view (GSAP relay reveal), documents view, audit view — audit view
      implemented as the existing `GET /applications/:id` call-history
      read rather than a new raw `audit_log` endpoint (deliberate scope
      decision, see `PROGRESS.md`'s Phase 5 section)
- [x] Distinguish business-level rejection from network failure on screen

## Phase 5 — Frontend polish (complete, closed Sept 18)
- [x] Verify live against all three departments (masking, reuse, failure
      paths — business-level AND infrastructure-unreachable)
- [x] Fix the render-guard race condition found during the NIR/DLJA pass
- [x] Tablet-width check (768–900px) on the longest `response_summary` —
      verified clean, no code changes needed (see `frontend/OPEN_ITEMS.md`)
- [x] Auth-screen collapse watch at the 900px breakpoint — verified clean
- [ ] Session-expiry UX, toast stacking — explicit scope decisions to
      leave as-is for the Sept 30 demo, not deferred work (see
      `frontend/OPEN_ITEMS.md`'s "Rough / needs a pass" section for the
      reasoning kept on record)

## Phase 6 — Pitch assets
- [ ] PPT: problem → before/after → architecture → live demo →
      scalability note (attaches to real systems without touching their
      backends)
- [ ] Record a 2–3 min backup demo video, happy + failure paths
- [ ] Full rehearsal, timed against the 60-second success criterion

## Demo-day contingency (do not skip)
- [ ] Decide now: are the 3 department services + gateway deployed or run
      locally? Test on the actual venue network beforehand if possible.
- [ ] All 3 department services must run concurrently on distinct ports
      for any end-to-end test — confirm ports don't collide.
- [ ] If a service becomes unreachable mid-demo, the fallback is the
      backup video — not live debugging in front of judges.
- [ ] Keep a terminal open with all 3 services + gateway already running
      before you're called up — do not cold-start during your slot.
- [ ] Have one screenshot of a populated audit log saved locally as a
      last-resort fallback.
