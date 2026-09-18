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
Clean, trustworthy, govtech — muted palette, generous whitespace, no
gradients or glow. Restraint reads as credibility for a government-facing
tool. GSAP reserved for the live relay/status reveal, not decoration.

## Error handling design
- Business-level response (e.g. reference not found) is a normal
  expected outcome — render it calmly, still log it.
- Network/infrastructure failure (a department is down) is a distinct
  state — "couldn't reach <department>, try again shortly" — and must be
  logged to `application_department_calls` + `audit_log` as `failed`.
