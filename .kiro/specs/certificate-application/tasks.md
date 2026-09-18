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

## Phase 1 — Gateway scaffold + citizen auth  ← CURRENT STEP
- [ ] Scaffold the standalone Node/Express gateway (`/gateway`), matching
      the conventions of the existing Mock_Sites Node services (config/env,
      pg pool with parameterised queries, versioned `/api/v1` routes,
      helmet+cors, app exported for supertest)
- [ ] Create the `citizens` table migration (per `database-schema.md`)
- [ ] `POST /api/v1/auth/register`: create citizen, bcrypt hash, reject
      duplicate email (Story 1)
- [ ] `POST /api/v1/auth/login`: verify credentials, return gateway JWT;
      reject wrong password (Story 1)
- [ ] Tests: successful registration, duplicate email rejected, login
      with correct credentials, login with wrong password rejected
- [ ] Run tests, show pass/fail — STOP for review before Phase 2

## Phase 2 — Applications + consent (gateway-owned, no department calls yet)
- [ ] Remaining gateway tables: `linked_references`, `applications`,
      `application_department_calls`, `consent_grants`, `audit_log`
- [ ] Auth middleware: verify the gateway JWT on protected routes
- [ ] `POST /api/v1/applications` + `GET /api/v1/applications` +
      `GET /api/v1/applications/:id` (Stories 2, 5)
- [ ] `POST /api/v1/consent` writes a `consent_grants` row (Story 3)
- [ ] `GET /api/v1/documents` returns `linked_references` (Story 6, 8)
- [ ] Audit logging helper used by every state change

## Phase 3 — Department clients (Layer 2) + orchestration
- [ ] `department-clients/`: one client per department, each with its own
      base URL + `X-Gateway-Key` env var + response/error shape
      (`api.md` Part 2; HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md)
- [ ] Confirm the National Identity Registry endpoint path against its
      route file before wiring (open question in `tech.md`)
- [ ] National Identity Registry client: retry once on token expiry
- [ ] Consent check enforced before any department call (Story 3)
- [ ] Relay orchestration: submitted → gateway_relay →
      department_verifying → complete/failed (Story 4)
- [ ] Every call writes `application_department_calls` + `audit_log`,
      success or failure (Story 6; structure.md rule 2)
- [ ] Failure path: department stopped → `failed` row + honest error,
      no fake data (Story 7)
- [ ] Reuse path: verified `linked_references` skips re-entry (Story 8)

## Phase 4 — Frontend (separate app)
- [ ] Build citizen frontend against the gateway API, using `refrences/`
      as the design guide (HOW_TO_USE_REFRENCES.md, 90/10 rule)
- [ ] Login/register, application start, consent modal, live status
      view (GSAP relay reveal), documents view, audit view
- [ ] Distinguish business-level rejection from network failure on screen

## Phase 5 — Pitch assets
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
