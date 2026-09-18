# Setu Gateway — Build Progress (SIH26129)

At-a-glance status of the gateway build. Updated as phases complete.
Authoritative detail lives in `.kiro/specs/certificate-application/tasks.md`.

## Status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Gateway scaffold + `citizens` + register/login | ✅ Done |
| 2 | Tables (linked_references, applications, application_department_calls, consent_grants, audit_log) + JWT middleware + applications/consent/documents endpoints | ✅ Done |
| 3a | Department client: **Digital Tax Records** (pan_verification) end-to-end | ✅ Done |
| 3b | Department client: **National Identity Registry** (identity_verification) end-to-end | ✅ Done |
| 3b | Department client: **Driving Licence & Jan Aadhaar** (driving_licence_registration) end-to-end | ✅ Done |
| — | **Phase 3 complete — all three departments wired, tested, verified live** | ✅ |
| 4 | Cross-cutting consistency pass: relay-consistency audit, parameterized `phase4.test.js`, live 3-services-up stop-one-department failure walkthrough w/ real Postgres proof | ✅ Done |
| 4b | **Reuse path** (verify once → reuse across future applications) — `findVerified` + relay reuse skip, unit + live e2e + real Postgres proof | ✅ Done |
| 5 | Citizen frontend (from `refrences/`) | ✅ Done — see `frontend/OPEN_ITEMS.md` for what's rough |
| 6 | Pitch assets (PPT, backup video, rehearsal) | ⬜ Not started |
| 7 | Demo-day contingency prep | ⬜ Not started |

> Numbering note: the frontend/pitch/contingency phases were renumbered
> (were 4/5/6) to make room for this backend cross-cutting pass as Phase 4.
> The **reuse path** is deliberately broken out as its own step (4b) rather
> than folded into Phase 4 — per `appflow.md` §7 it's the single biggest demo
> moment and earns its own verification pass, not a bullet inside a
> failure-consistency audit.

## Verified facts worth not re-deriving

- **Gateway**: standalone Node/Express in `gateway/`. Hand-rolled auth
  (bcrypt + self-issued JWT). Own PostgreSQL DB `setu_gateway_db`.
- **Two layers**: `src/citizen-api/` (Layer 1) vs `src/department-clients/`
  (Layer 2), never called interchangeably.
- **Tests**: `npm test` (in-memory, no DB), `npm run test:integration`
  and `npm run test:e2e` (need real Postgres + the relevant mock service;
  skip gracefully if unreachable).
- **Relay outcome convention** (locked, api.md Part 1): gateway-side
  problems → 4xx; department-side failure → HTTP 200 with
  `status: "failed"` in the body. All departments follow this.

### Digital Tax Records (3a) — confirmed live
- Service: `Mock_Sites/UIDAI_Backend_Digital_Tax_Records/UIDAI_Backend`,
  FastAPI, **venv is `venv/` (not `.venv/`)**, port **8000**.
- Endpoint `GET /pan/{ref}/fields`, header `X-Gateway-Key`,
  key `setu-demo-gateway-key-dtr-2026`, seeds `SYNPAN-000123`, `DEMO-998877`.
- Invalid-key string aligned to `"...Invalid X-Gateway-Key provided."`
  (client keys off the 401 status, not the string).
- App type `pan_verification`. Start: uvicorn on 8000 (see restart seq).

### National Identity Registry (3b) — confirmed live
- Service: `Mock_Sites/Independent Identity Registration Portal/Independent Identity Registration Portal/SETU`,
  Node/Express, **port 5000**, run with `npm start`.
- Endpoint `GET /api/registration/:identityReference/fields` (NOT the
  earlier guessed path), header `X-Gateway-Key`, key
  `setu_gateway_secret_key_demo_2026` (its own, differs from DTR).
- Own DB `aadhaar_portal_db` (seeds e.g. `TESTAADHAAR0001`,
  `GATEWAY-DEMO-001`). Success field is `identityReference` (not
  `reference`); 400 rejects real 12-digit numbers.
- **No short-lived-token/retry quirk** on the gateway path — that doc
  claim was wrong (corrected in api.md + HOW_GATEWAY_CONNECTS). Static
  key check only; client built identically to DTR.
- App type `identity_verification`.

### Driving Licence & Jan Aadhaar (3b) — confirmed live
- Service: `Mock_Sites/driving-licence-jan-aadhaar-portal/driving-licence-jan-aadhaar-portal`,
  Node/Express, **port 3001**, run with `node backend/server.js`.
- Endpoint `GET /api/v1/gateway/registrations/:reference` (alias
  `/api/gateway/...` also works), header `X-Gateway-Key`, key
  `setu_gateway_secret_key_demo_2026` (coincides in value with NIR but is
  its own secret — `DLJA_GATEWAY_KEY`). api.md's endpoint/port claims were
  correct here (verified).
- Own DB `identity_documents_portal_db` — **had to create it + run the
  service's own `database/migrate.js` and `database/seed.js`**; ships with
  NO registrations. References are `REG-XXXXXXXX`, created only via POST
  `/api/v1/registrations` (licence must match `^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$`,
  holder name letters/spaces only, jan_aadhaar_id exactly 10 digits).
- **Third reference field name**: `registration_reference` (DTR=`reference`,
  NIR=`identityReference`). Success payload has **no `fields[]` array** —
  a single `verification_status` instead. Client derives `verified` from
  `verification_status ∈ {VERIFIED, FORMAT_VALID}` (dev mock only emits
  FORMAT_VALID / VERIFICATION_FAILED). Relay core untouched.
- App type `driving_licence_registration`. e2e creates a real registration
  first, then verifies it through the gateway.

### Phase 4 (cross-cutting consistency) — confirmed
- **Consistency audit (read-first, no edits needed):** the three department
  clients are already behaviorally uniform — same typed `outcome` contract
  (`success|not_found|rejected|auth_error|timeout|unreachable|unexpected`),
  same status→outcome mapping (200+data→success, 404→not_found,
  401→auth_error, 400→rejected, else→unexpected), same `AbortSignal.timeout`
  handling, per-department key + base URL (no shared key). Each `translate()`
  normalises a *different* native reference field (`reference` /
  `identityReference` / `registration_reference`) into the common
  `{reference, source_department, verified, field_names}`, keeping
  `relay-service.js` department-agnostic. No client/relay code changes were
  required — the audit confirmed consistency rather than fixing drift.
- **`tests/phase4.test.js`** — parameterized relay-consistency suite: the
  same 4 assertions (consent-refused 403 / success→complete / unreachable→
  failed / timeout→failed) run over ALL THREE departments from one table.
  Closes the only coverage gap the audit found: the honest-failure invariant
  (`verified` key absent on failure) and the success `status_code=200` check
  were previously asserted for DTR only; now enforced for all three.
  Added to the `npm test` script. **37/37 tests pass** (25 prior + 12 new).
- **Live failure walkthrough** — `gateway/scripts/phase4-failure-walkthrough.js`
  drives real applications through the gateway (real pg repositories) with
  **DLJA stopped** while DTR + NIR stay up. Proven end to end:
  - DTR relay still **completes** (HTTP 200, `complete`, `verified=true`) —
    a sibling department being down does NOT break the healthy path.
  - DLJA relay **fails honestly** (HTTP 200, `status:"failed"`,
    `outcome:"unreachable"`, honest message, **no `verified` key**, no fake
    success) — exactly the api.md relay-outcome convention.
  - **Real Postgres proof:** `application_department_calls` held one
    `succeeded=true` row (DTR `/pan/SYNPAN-000123/fields`, status 200) and one
    `succeeded=false` row (DLJA `/api/v1/gateway/registrations/REG-DOWNTEST`,
    status null); `audit_log` recorded the full sequence including
    `application_status_change → failed`. The script self-asserts and exits
    non-zero if the convention is violated.
  - All 3 live e2e suites (`test:e2e` / `:nir` / `:dlja`) also passed against
    real HTTP + real Postgres in the same session.

### Phase 4b (reuse path, Story 8) — confirmed
- **Masked-but-real `response_summary`** shipped first (the open question that
  gated 4b): decided masked-but-real, NOT metadata-only. Central masking in
  `gateway/src/utils/mask.js`; each client's `translate()` emits `masked_fields`
  (masked at the client boundary — raw values never reach the relay or DB).
  Real Postgres rows confirm e.g.
  `verified=true; fullName=U*** A****, filingStatus=FILED, incomeBracket=5-10L`
  (DTR) and `dob=1980-**-**, address=*** 110001` (NIR). Decision recorded in
  `database-schema.md`.
- **Reuse mechanics:** `linkedReferenceRepository.findVerified({citizenId,
  department})` (pg + in-memory) resolves a prior verified reference.
  `relay-service.verify` now takes `reference` as OPTIONAL — precedence:
  caller-supplied → `findVerified` (reuse) → else `400 VALIDATION`. Reuse skips
  ONLY re-entry: consent still enforced per application (fresh `consent_grants`,
  Story 3 holds every time), fetch still live (never cached), call still logged.
  The `department_call` audit detail carries `reused_reference: true|false` and
  the verify response carries `reused` — the skip is provable, not inferred.
- **Evidence:** `npm test` = **44/44** (added `tests/phase4b.test.js`:
  findVerified behavior, reuse skip with no re-entry, reuse-still-needs-consent,
  first-time-with-nothing-to-reuse → 400). DTR live e2e green after the relay
  refactor. `node scripts/phase4b-reuse-walkthrough.js` proved end to end:
  first app (reference supplied, `reused=false`) then second app (NO reference,
  `reused=true`) both completing live against real DTR, ONE verified
  `linked_references` row reused by both, and `audit_log` showing
  `reused_reference=false` then `true`.

_(Both former standing open items — reuse semantics unproven, and the
`response_summary` metadata-vs-masked question — are now resolved above.)_

## Test commands
- `npm test` — 44 unit tests (in-memory, no services needed); includes
  `phase4.test.js` (parameterized relay-consistency + masking over all 3 depts)
  and `phase4b.test.js` (reuse path)
- `npm run test:integration` — real Postgres, citizens table
- `npm run test:e2e` / `:nir` / `:dlja` — live e2e per department (need
  Postgres + that mock service running)
- `node scripts/phase4-failure-walkthrough.js` — live "one department down"
  walkthrough; needs Postgres + DTR (8000) + NIR (5000) UP and DLJA (3001)
  STOPPED. Leaves proof rows in `setu_gateway_db` for inspection.
- `node scripts/phase4b-reuse-walkthrough.js` — live reuse walkthrough
  (Story 8); needs Postgres + DTR (8000) UP. Verifies once with a reference,
  then a second application with NO reference, and prints the real
  `linked_references` / `application_department_calls` / `audit_log` proof.

## Restart sequence (after a machine/session restart)
1. **Postgres**: `pg_ctl start -D $env:PGDATA`
   (PGDATA = `C:\Users\Prince\scoop\apps\postgresql\current\data`).
2. **Mock service(s)** for the phase being worked (per-service start
   command + port confirmed against that service's own files).
3. **Gateway** (only if serving HTTP): `npm start` in `gateway/`
   (tests don't need it started separately — supertest drives in-process).
4. **Frontend** (only needed for a full demo run): `node server.js` in
   `frontend/` — serves the citizen app on `http://localhost:3000`,
   expects the gateway at `http://localhost:4000`.

For a full three-department demo, all of the following must be running
concurrently:
- Postgres
- Digital Tax Records — `venv\Scripts\python.exe -m uvicorn app.main:app
  --host 127.0.0.1 --port 8000` in
  `Mock_Sites/UIDAI_Backend_Digital_Tax_Records/UIDAI_Backend`
- National Identity Registry — `npm start` in
  `Mock_Sites/Independent Identity Registration Portal/Independent
  Identity Registration Portal/SETU` (port 5000)
- Driving Licence & Jan Aadhaar Portal — `node backend/server.js` in
  `Mock_Sites/driving-licence-jan-aadhaar-portal/driving-licence-jan-
  aadhaar-portal` (port 3001)
- Gateway — `npm start` in `gateway/` (port 4000)
- Frontend — `node server.js` in `frontend/` (port 3000)

## Phase 5 (citizen frontend) — confirmed

- **Stack**: vanilla HTML/CSS/JS, no build tool/bundler/framework —
  decided explicitly for the Sept 30 runway (React+Vite+TS was
  considered and set aside; see `tech.md`'s locked-stack note). Served
  by a ~60-line `http` static file server (`frontend/server.js`) on port
  3000. Talks to the gateway's real API at `http://localhost:4000` —
  hardcoded in `frontend/public/js/api.js` since the two apps are
  deliberately decoupled, not sharing config.
- **Design source**: `refrences/setu_sih26129_demo.html` was the primary
  structural/visual reference (per `HOW_TO_USE_REFRENCES.md`'s 90/10
  rule), adapted rather than copied. Full rationale for what was kept vs.
  cut lives in `.kiro/specs/certificate-application/design.md`'s "Visual
  direction" section. Three reference-mock features were deliberately
  **not** built because nothing in the real gateway backs them (would
  require fabricating data): the admin "Department view" KPI tab, the
  live "Connected platforms" health numbers, and the "Ask Setu" chatbot.
- **Every screen calls the real gateway** — auth, dashboard, find a
  service (consent modal + relay), documents, applications list/detail.
  No mocked data anywhere in the frontend.
- **On-screen reuse + audit visibility**: no new backend read-endpoint
  was added this phase (per the agreed Phase 5 scope). Reuse is proven
  on screen via the gateway's own `reused: true` flag on the verify
  response plus the `linked_references`-backed reuse badge on service
  cards; audit visibility is proven via the EXISTING
  `GET /applications/:id` → `application_department_calls` history
  (endpoint, status code, masked `response_summary`, duration) — the
  DB-level proof for a judge still lives in
  `gateway/scripts/phase4b-reuse-walkthrough.js`, unchanged.
- **Verified live against all three departments**, not just described:
  Digital Tax Records, National Identity Registry, and Driving Licence &
  Jan Aadhaar Portal were each driven through register → consent →
  verify against the real gateway, confirming both the happy path and
  each department's distinct masked `response_summary` shape render
  correctly (including DLJA's longer 7-field summary, at both desktop and
  mobile viewport widths).
- **A real race-condition bug was found and fixed during this phase**:
  navigating away from a view while its data fetch was still in flight
  (e.g. right after a relay completed) crashed with a null-innerHTML
  error. Fixed with `frontend/public/js/render-guard.js` — a render
  generation token every view checks before touching the DOM after an
  await. Re-verified with a deliberate adversarial navigation sequence.
- **GSAP** is used in exactly one place — the relay centerpiece's track
  transitions and result reveal — per `tech.md`'s "reserved... not used
  decoratively" rule. Vendored locally at
  `frontend/public/js/vendor/gsap.min.js` (core build, no plugins, no
  CDN dependency) rather than loaded externally, so the demo has zero
  network dependency on a third party. Fully respects
  `prefers-reduced-motion`.
- **No automated frontend test suite.** Verification for this phase was
  manual: curl against the live gateway, plus a disposable Playwright
  script run against the real running stack and deleted after each use
  — a deliberate speed tradeoff, not an oversight (see
  `frontend/OPEN_ITEMS.md`).
- **Infrastructure-unreachable failure path confirmed live too**: DLJA
  was stopped mid-browser-session and a driving-licence application was
  started against it — rendered the same calm failure state as the
  business-level failure path, no crash, honest `outcome: unreachable`.
- **What's still rough**: see `frontend/OPEN_ITEMS.md` — session-expiry
  UX and toast stacking, both deliberately left as-is per a Sept 18
  review (low risk for a single-fresh-account demo run). The tablet-width
  check on the longest `response_summary` was completed Sept 18 (see
  OPEN_ITEMS.md's "Verified clean" section) — no issues found, no code
  changes needed.

## Phase 5 — closed (Sept 18)

Tablet-width pass was the only open item blocking Phase 5 closure.
Verified clean live against the real stack (see `frontend/OPEN_ITEMS.md`).
Session-expiry UX and toast stacking are explicit scope decisions, not
deferred work — see `frontend/OPEN_ITEMS.md`'s "Rough / needs a pass"
section for the reasoning kept on record. No further frontend work is
planned unless something breaks in rehearsal.
