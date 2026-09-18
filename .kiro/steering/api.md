# Setu Gateway — API Reference

Two layers of API live in this project:

1. **The citizen-facing API** — what the Setu frontend calls. This is
   new; it doesn't exist yet and needs to be built as part of the
   gateway.
2. **The department-facing APIs** — what the gateway calls on each of
   the three mock sites. These already exist (built and tested
   independently) — this doc records their contracts as established,
   it does not invent new ones.

Keep these clearly separated in code (e.g. a `citizen-api/` layer and
a `department-clients/` layer) — they should never be called
interchangeably.

---

## Part 1 — Citizen-facing API (gateway's own, to be built)

Base path suggestion: `/api/v1/...` — adjust to match whatever
convention the gateway project ends up using, but be consistent.

### `POST /api/v1/auth/register` / `POST /api/v1/auth/login`
Standard citizen account creation/login against the `citizens` table.
Returns a session token (JWT or similar) scoped to the gateway only —
this is not the same credential as any department's own login.

### `GET /api/v1/applications`
List the logged-in citizen's applications, with current status per
application (`submitted`, `gateway_relay`, `department_verifying`,
`complete`, `failed`).

### `POST /api/v1/applications`
Create a new application. Body includes `type` (e.g.
`pan_verification`) and any citizen-supplied input the relevant
department needs (e.g. a PAN reference, if the citizen already has
one, or enough identity info for the gateway to look one up).

### `GET /api/v1/applications/:id`
Full detail on one application, including its
`application_department_calls` history — this powers the tracker UI
(Submitted → Gateway relay → Dept. verifying → Complete).

### `POST /api/v1/consent`
Records a `consent_grants` row before the gateway is allowed to make
a department call on the citizen's behalf for a given application.
The gateway should refuse to make the department call if no matching
consent record exists — this is a real check, not just a UI gate.

### `GET /api/v1/documents`
Returns the citizen's `linked_references`, i.e. what's currently
verified with which department, for the "My documents" view.

### `POST /api/v1/applications/:id/verify`
Runs the relay for one application: consent check → live department fetch →
log → resolve `complete`/`failed`.

Request body: `{ "reference": "<department reference>" }`.
- **`reference` is OPTIONAL** (Phase 4b, reuse — Story 8). If omitted, the
  gateway reuses the citizen's already-verified reference for that
  application's department (from `linked_references`). If none is supplied
  **and** none is verified yet, the call is rejected `400 VALIDATION`
  (genuinely first-time — there's nothing to reuse).
- Reuse skips only the re-entry. Consent is still required for this
  application (a matching `consent_grants` row), the department is still
  fetched live (never cached), and the call is still logged.
- On success the response `data` includes `reused: true|false`; the
  corresponding `audit_log` `department_call` entry carries
  `reused_reference: true|false`, so the reuse is provable, not inferred.

### Relay outcome convention (applies to EVERY department, all of 3a/3b)
The relay endpoint (`POST /api/v1/applications/:id/verify`) distinguishes
two kinds of "it didn't work", and they use different HTTP statuses on
purpose:

- **Gateway-side authorization / request problems → 4xx.** No department
  call is attempted. Examples: missing/invalid citizen token (401),
  application not owned or not found (404), missing consent (403),
  unsupported department/type or invalid input (400).
- **Department-side failure → HTTP 200 with `status: "failed"` in the
  body.** Once a department call is actually attempted and it fails —
  the department is down, times out, returns not-found, or rejects the
  request — the gateway responds **200**, and the body carries the
  outcome:
  ```json
  { "success": true,
    "data": { "status": "failed", "department": "...", "outcome": "unreachable|timeout|not_found|rejected|auth_error|unexpected", "message": "<honest, non-sensitive>" },
    "error": null }
  ```
  A department failure is a **normal, expected result of a completed
  request**, not a transport error — so it is NOT a 4xx/5xx. The
  frontend renders it as a calm "couldn't verify / try again" state, and
  the failure is still written to `application_department_calls` +
  `audit_log`. The gateway never substitutes fake success on failure.

This convention is locked as of Step 3a (Digital Tax Records). National
Identity Registry and Driving Licence relay paths MUST follow it exactly
— do not invent a per-department status scheme.

---

## Part 2 — Department-facing APIs (already built, gateway calls these)

### Digital Tax Records (UIDAI Backend — FastAPI + SQLite)

- `GET /pan/{pan_reference}/fields`
- Header required: `X-Gateway-Key`
- **401** missing key → `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
- **401** invalid key → `"Access denied: Invalid X-Gateway-Key provided."` (aligned with the other two sites as of Step 3a; the gateway client keys off the 401 status, not this exact string)
- **400** if given a real 10-character PAN format instead of a synthetic reference
- **200** success shape:
  ```json
  {
    "success": true,
    "data": {
      "reference": "SYNPAN-000123",
      "sourceDepartment": "Digital Tax Records — Demo Department",
      "fields": [
        { "name": "fullName", "value": "...", "verified": true, "lastUpdated": "..." }
      ]
    },
    "error": null
  }
  ```

### National Identity Registry (Node/Express + PostgreSQL)

- **Endpoint**: `GET /api/registration/:identityReference/fields`
  (confirmed against the real route file + live probe in Step 3b — the
  earlier `/api/registration/{reference}/fields` guess was close but the
  path param is `identityReference` and it is mounted under
  `/api/registration`).
- **Port**: `5000`. Own DB `aadhaar_portal_db` (seeded refs e.g.
  `TESTAADHAAR0001`, `GATEWAY-DEMO-001`). Run with `npm start`.
- **Gateway key**: `setu_gateway_secret_key_demo_2026` (its OWN key —
  different value from Digital Tax Records; store as `NIR_GATEWAY_KEY`).
- Header required: `X-Gateway-Key` (static string compare — see the
  correction below).
- **401** missing key → `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
- **401** invalid key → `"Access denied: Invalid X-Gateway-Key provided."`
- **404** unknown reference → `"Identity reference '<ref>' not found in registration database."`
- **400** real 12-digit numeric reference rejected (synthetic-only,
  `^[A-Z0-9_-]{4,32}$`). This is NIR's equivalent of DTR's real-PAN check.
- **200** success shape (note the field is `identityReference`, NOT
  `reference` like DTR):
  ```json
  {
    "success": true,
    "data": {
      "identityReference": "TESTAADHAAR0001",
      "fields": [ { "name": "fullName", "value": "...", "verified": true, "lastUpdated": "..." } ],
      "sourceDepartment": "National Identity Registry — Demo Department"
    },
    "error": null
  }
  ```
- **CORRECTION (Step 3b):** the previously-documented "short-lived
  token / retry-on-expiry quirk" does **not** apply to this endpoint.
  The gateway-facing `/fields` route is protected by a plain static
  `X-Gateway-Key` comparison — no JWT, no expiry, no mid-request token
  refresh. (Short-lived JWTs exist only on the public captcha flow and
  admin login, neither of which the gateway calls.) The NIR client is
  therefore built identically to the DTR client, with no retry-on-expiry
  path. Verified by reading `gatewayAuthMiddleware.js` + live probes.

### Driving Licence & Jan Aadhaar Portal (Node/Express + PostgreSQL)

- `GET /api/v1/gateway/registrations/:reference`
  (alias: `GET /api/gateway/registrations/:reference`)
- Header required: `X-Gateway-Key`
- **401** missing key → `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
- **401** invalid key → `"Access denied: Invalid X-Gateway-Key provided."`
- **404** unknown reference → `{ "success": false, "data": null, "error": "Registration not found." }`
- **200** success shape: `{ "success": true, "data": <masked registration>, "error": null }`

---

## Cross-cutting rules for every department call

- Every call must be logged to `application_department_calls` and, at
  a summary level, to `audit_log` — success and failure both.
- Timeouts on every outbound call — these are demo services, not
  production SLAs.
- Gateway keys are per-department secrets, stored in the gateway's own
  env config, one variable per department (e.g. `DTR_GATEWAY_KEY`,
  `NIR_GATEWAY_KEY`, `DLJA_GATEWAY_KEY`) — never a single shared key
  reused across all three, even though in the current demo setup they
  may coincidentally be configured to the same value.
