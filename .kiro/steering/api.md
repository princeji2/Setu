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

- **Endpoint path: not yet confirmed.** Referenced elsewhere as
  something like `/api/registration/{reference}/fields`, but this was
  secondhand, not verified directly against that service's route
  file. **Confirm this before wiring the gateway client** — don't
  build against a guess.
- Header required: `X-Gateway-Key`
- **401** missing key → `"Access denied: Missing X-Gateway-Key header for gateway service authentication."`
- **401** invalid key → `"Access denied: Invalid X-Gateway-Key provided."`
- **Known quirk:** uses short-lived tokens for some flows — a token
  can expire mid-request. The gateway client for this department needs
  a retry-once-on-expiry path, not just a single call.

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
