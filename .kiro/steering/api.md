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

### `GET /api/v1/health`
Unauthenticated liveness probe. Returns
`{ "success": true, "data": { "service": "setu-gateway", "status": "ok" }, "error": null }`.
Used by `start-all.ps1` / manual checks to confirm the gateway booted; takes
no auth and touches no database.

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

## Part 1b — Officials/admin read console (gateway's own, Phase A)

A small, **read-only**, **cross-citizen** surface for the officials view
the problem statement calls for ("officials may lack a consolidated view
of beneficiaries, applications, approvals, grievances and service
outcomes"). It reads existing gateway tables only — Phase A records no new
data. Kept clearly separate from the citizen-facing API above.

**Auth — separate credential, NOT the citizen JWT.** Every route here is
gated by a single shared secret sent as the `X-Admin-Key` header, compared
against the gateway's `ADMIN_KEY` env var (see `.env.example`). This is
deliberately independent from `require-auth.js` (which scopes queries to
one citizen) — the officials surface never rides on citizen auth. This is
prototype-grade per `product.md` (real enough to demo, not hardened); a
real `official` role on `citizens` is the documented later upgrade.
- Missing `X-Admin-Key` → **401** `{ code: "UNAUTHENTICATED" }`
- Wrong key (or `ADMIN_KEY` unset) → **403** `{ code: "FORBIDDEN" }`
- Bad filter value → **400** `{ code: "VALIDATION" }`

### `GET /api/v1/admin/stats`
Aggregate numbers for the dashboard, computed server-side. Shape:
```json
{ "success": true, "data": {
    "total_citizens": 3,
    "total_applications": 5,
    "applications_by_status": { "submitted": 1, "gateway_relay": 0, "department_verifying": 0, "complete": 3, "failed": 1 },
    "success_rate": 75.0,
    "consent_grants": 4,
    "reuse_count": 1,
    "last_24h": { "calls": 2, "failures": 1 },
    "departments": [
      { "department": "digital_tax_records", "calls": 3, "succeeded": 3, "failed": 0, "success_rate": 100.0, "avg_duration_ms": 42, "degraded": false },
      { "department": "national_identity_registry", "calls": 1, "succeeded": 0, "failed": 1, "success_rate": 0.0, "avg_duration_ms": 5001, "degraded": true },
      { "department": "driving_licence_jan_aadhaar", "calls": 0, "succeeded": 0, "failed": 0, "success_rate": null, "avg_duration_ms": 0, "degraded": false }
    ]
  }, "error": null }
```
- `success_rate` is over **resolved** applications only (`complete + failed`);
  `null` when nothing has resolved yet (render as "—", not 0%).
- Per-department `success_rate` is `null` when that department has 0 calls.
- All five statuses and all three departments are always present (0 when absent).
- `reuse_count` = `audit_log` rows with `action='department_call'` and
  `detail.reused_reference = true` — the provable reuse count (Story 8).
- `last_24h` = a rolling-window pulse over `application_department_calls`
  where `called_at > now() - 24h`: `calls` is all outbound department calls
  in that window, `failures` is the subset where `succeeded = false`. It is
  **purely additive** — it sits alongside, and never replaces, the all-time
  totals (`departments[]`, `total_applications`, etc.). Both counts are
  always present (`0` when the window is empty); this is a snapshot the UI
  can poll, not a stored time-series.
- Per-department `degraded` (boolean, always present) is a **windowed**
  health flag: `true` when that department's success rate over the **last 24h**
  drops below 50%, `false` otherwise. It keys off the last-24h window, NOT the
  all-time `success_rate` on the same object — an all-time rate is slow to trip
  and slow to clear, so it wouldn't reflect "degraded right now". A department
  with **zero** calls in the window is `false` (no recent activity is not a
  failure signal). Non-blocking and purely visible — same spirit as the
  data-quality flags; the gateway shows it watches, it doesn't act/page.

### `GET /api/v1/admin/stats/trend`
Hourly time-series of department calls, **computed on-the-fly** from
`application_department_calls.called_at` (a `GROUP BY date_trunc('hour', …)`) —
**no new table, no scheduled sampler, no migration**. Every individual call is
already stored with a timestamp, so buckets are reconstructed after the fact.
Filter:
- `?hours=` — how many trailing hours to return (default 24, capped 168 = 7
  days). Non-integer / `< 1` → **400** `{ code: "VALIDATION" }`.

Shape:
```json
{ "success": true, "data": {
    "window_hours": 24,
    "buckets": [
      { "hour": "2026-09-20T09:00:00.000Z", "calls": 0, "failures": 0, "success_rate": null },
      { "hour": "2026-09-20T10:00:00.000Z", "calls": 4, "failures": 1, "success_rate": 75.0 }
    ]
  }, "error": null }
```
- Buckets are **contiguous and zero-filled**, oldest→newest, exactly
  `window_hours` of them, ending at the current clock hour. An empty hour is a
  real `0`-bar, never omitted — so the spacing can't lie about the trend.
- `hour` is the UTC start-of-hour the bucket covers.
- `success_rate` is `null` (not `0`) on hours with zero calls (render "—"); a
  percentage (`succeeded/calls`) otherwise.
- Hourly (not daily) on purpose: it populates **live during a demo** off the
  current session's own calls, with no backdated seed data.

### `GET /api/v1/admin/applications`
All applications across all citizens, joined to the owning citizen's
display name + email, newest first. Filters:
- `?status=` — one of `submitted|gateway_relay|department_verifying|complete|failed`
- `?department=` — one of the three department enum values; matches
  applications that made at least one call to that department (applications
  have no department column — the department lives on the calls).

Row shape: `{ id, type, status, created_at, updated_at, citizen_id, citizen_name, citizen_email }`.

### `GET /api/v1/admin/audit-log`
The `audit_log` trail, newest first, `detail` parsed to an object. Filters:
- `?action=` — e.g. `department_call`, `consent_granted`, `application_status_change`, `department_call_refused`
- `?citizen_id=` — restrict to one citizen
- `?limit=` — default 100, capped at 500

Row shape: `{ id, citizen_id, action, detail, occurred_at }`.

No PII beyond what the citizen tables already hold (name/email); no raw
department payloads — `detail` carries only what the citizen flow already
wrote (masked summaries live in `application_department_calls`, not here).

For `action='department_call'`, `detail` includes a `data_quality_flags`
array — structural checks the department client ran at `translate()`
(empty array when the response looked clean). It's non-blocking (never
affects `outcome`/status) and non-sensitive (field names / counts /
status tokens only, never raw values). See `database-schema.md`
"Data-quality flags". The same flags are also folded onto the end of the
matching `application_department_calls.response_summary` text.

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
