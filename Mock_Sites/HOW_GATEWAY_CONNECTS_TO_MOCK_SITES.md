# How the real Setu gateway should connect to Mock_Sites

This file is for whoever (Antigravity) builds the actual gateway
orchestration layer. It describes how the gateway must talk to each of
the three department sites in `Mock_Sites/` — **individually, over
real HTTP, using each site's own auth contract** — not as one unified
API, and not as hardcoded/stubbed data inside the gateway itself.

## The core rule

Each site in `Mock_Sites/` is a **separately running, independently
deployed backend** with its own port, its own database, and its own
auth method. The gateway does not share a database or a login system
with any of them. Every time the gateway needs a citizen's data from a
department, it makes a real outbound HTTP request to that department's
service, authenticated the way that department expects, and logs the
call (success or failure) to the gateway's audit log.

If a site isn't running, the gateway should fail that one lookup
gracefully (timeout + clear error surfaced to the citizen — "couldn't
reach X department, try again shortly") — not silently substitute fake
data, and not crash the whole request.

## Per-site connection contract

### 1. `UIDAI_Backend_Digital_Tax_Records` (FastAPI + SQLite)

- **Gateway-facing endpoint:** `GET /pan/{pan_reference}/fields`
- **Auth header:** `X-Gateway-Key`
- **Auth failure responses:**
  - Missing key → `401` — `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
  - Invalid key → `401` — `"Access denied: Invalid X-Gateway-Key ..."` (confirm exact current wording — this was flagged earlier for a small inconsistency with the other two sites and may have since been aligned)
- **Validation:** rejects real 10-character PAN formats — only accepts synthetic references like `SYNPAN-000123`
- **Success shape:** `{ "success": true, "data": { "reference", "sourceDepartment", "fields": [...] }, "error": null }`
- **Base URL:** configurable via env (e.g. `DTR_SERVICE_URL`), not hardcoded — this service runs on its own port

### 2. `National_Identity_Registry` (Node/Express + PostgreSQL)

- **Gateway-facing endpoint:** `GET /api/registration/:identityReference/fields`
  (confirmed against the real route file + live probe in Step 3b; the
  path param is `identityReference` and it is mounted under
  `/api/registration`).
- **Port:** `5000`. Own DB `aadhaar_portal_db`. Run with `npm start`.
- **Auth header:** `X-Gateway-Key` (static string compare)
- **Gateway key:** `setu_gateway_secret_key_demo_2026` (its own value;
  different from the other departments — store as `NIR_GATEWAY_KEY`)
- **Auth failure responses:**
  - Missing key → `401` — `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
  - Invalid key → `401` — `"Access denied: Invalid X-Gateway-Key provided."`
- **Not found:** `404` — `"Identity reference '<ref>' not found in registration database."`
- **Format rejection:** `400` for real 12-digit numeric refs (synthetic-only).
- **Success shape:** `{ "success": true, "data": { "identityReference", "fields": [...], "sourceDepartment" }, "error": null }` — note `identityReference`, not `reference`.
- **CORRECTION (Step 3b):** the earlier "short-lived token / retry-on-expiry"
  note was wrong for the integration path. The `/fields` endpoint uses a
  plain static `X-Gateway-Key` check — no token expiry, no retry needed.
  Short-lived JWTs exist only on the public captcha and admin-login flows,
  which the gateway never calls. Build the client like DTR's: single call,
  no expiry-retry.
- **Base URL:** configurable via env (e.g. `NIR_SERVICE_URL`)

### 3. `driving-licence-jan-aadhaar-portal` (Node/Express + PostgreSQL)

- **Gateway-facing endpoint:** `GET /api/v1/gateway/registrations/:reference` (alias: `/api/gateway/registrations/:reference`)
- **Auth header:** `X-Gateway-Key`
- **Auth failure responses:**
  - Missing key → `401` — `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
  - Invalid key → `401` — `"Access denied: Invalid X-Gateway-Key provided."`
- **Success shape:** `{ "success": true, "data": <masked registration>, "error": null }`
- **Not found:** `404` — `{ "success": false, "data": null, "error": "Registration not found." }`
- **CONFIRMED (Step 3b):** port **3001**, both `/api/v1/gateway/...` and
  `/api/gateway/...` aliases work, key `setu_gateway_secret_key_demo_2026`
  (coincides in value with NIR but is its own department secret —
  `DLJA_GATEWAY_KEY`). The masked `data` object's reference field is
  `registration_reference` (a THIRD distinct name vs DTR `reference` /
  NIR `identityReference`) and has **no `fields[]` array** — it carries a
  single `verification_status` (dev mock emits `FORMAT_VALID` or
  `VERIFICATION_FAILED`; `VERIFIED` is reserved for a future real
  provider). References are `REG-XXXXXXXX` and are created only via POST
  `/api/v1/registrations` — the DB ships with none seeded. Gateway client
  treats `verification_status ∈ {VERIFIED, FORMAT_VALID}` as verified.
- **Base URL:** configurable via env (e.g. `DLJA_SERVICE_URL`)

## What the gateway needs to do, concretely

1. **Three separate lightweight HTTP client adapters** (or one generic
   client parameterized per-site) — one per department — each knowing
   its own base URL, its own gateway key (these may differ per site;
   don't assume one key works everywhere unless you've deliberately
   configured them to match), and its own response/error shape.
2. **A per-site `GATEWAY_API_KEY` value that matches what's configured
   in that department's own `.env`.** These are independent secrets —
   confirm the gateway's stored key for each site actually equals that
   site's `GATEWAY_API_KEY` before wiring the call. A mismatch here
   will silently look like the department is "down" when it's really
   just rejecting the key.
3. **Timeouts on every outbound call** — these are demo services on
   probably-localhost ports; a hung request shouldn't hang the whole
   citizen-facing flow.
4. **Audit log entry per call** — record which department was called,
   for which reference, whether it succeeded, and how long it took.
   This is the "notebook" the whole project's pitch depends on — every
   claim of "the gateway actually talked to 3 independent systems" has
   to be provable from this log, not just asserted.
5. **All three services need to be running concurrently** for any
   end-to-end gateway test to mean anything — confirm ports don't
   collide (they're likely all defaulting to different ports already,
   but verify: UIDAI's FastAPI service, and the two Node services,
   should each have a distinct `PORT` in their respective `.env`
   files).

## What NOT to do

- Don't build one shared "mock department client" that assumes all
  three use the same request/response shape — they don't (FastAPI vs.
  Express, different field names, different error message wording).
- Don't hardcode any department's gateway key into the gateway's
  source code — pull from env, one variable per department.
- Don't skip the audit log "on the happy path only" — failed and
  rejected calls need to be logged too, since a judge asking "what
  happens when a department is unreachable" is a realistic question.
