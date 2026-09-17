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

- **Gateway-facing endpoint:** confirm exact path before wiring — referenced elsewhere as something like `/api/registration/{reference}/fields`. Don't assume; check this service's actual route file.
- **Auth header:** `X-Gateway-Key`
- **Auth failure responses:**
  - Missing key → `401` — `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
  - Invalid key → `401` — `"Access denied: Invalid X-Gateway-Key provided."`
- **Known quirk:** this service uses short-lived tokens for some flows — token can expire mid-request, so the gateway needs a refresh/retry path here, not just a single fire-and-forget call
- **Base URL:** configurable via env (e.g. `NIR_SERVICE_URL`)

### 3. `driving-licence-jan-aadhaar-portal` (Node/Express + PostgreSQL)

- **Gateway-facing endpoint:** `GET /api/v1/gateway/registrations/:reference` (alias: `/api/gateway/registrations/:reference`)
- **Auth header:** `X-Gateway-Key`
- **Auth failure responses:**
  - Missing key → `401` — `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
  - Invalid key → `401` — `"Access denied: Invalid X-Gateway-Key provided."`
- **Success shape:** `{ "success": true, "data": <masked registration>, "error": null }`
- **Not found:** `404` — `{ "success": false, "data": null, "error": "Registration not found." }`
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
