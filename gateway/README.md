# Setu Gateway

Standalone Node/Express interoperability gateway for SIH26129. Owns the
citizen identity and orchestrates consented calls to the three department
services in `../Mock_Sites/`, translating each department's response into
a consistent internal shape and recording every call in an audit trail.

See `.kiro/steering/` (tech.md, structure.md, api.md, database-schema.md,
appflow.md) for the authoritative contracts.

## Layers
- `src/citizen-api/` — Layer 1: the citizen-facing API (auth, applications, consent, documents, and the read-only officials/admin console).
- `src/department-clients/` — Layer 2: one HTTP client per department, each knowing only its own base URL, gateway key, and response/error shape.

These two layers are never called interchangeably. Citizen auth (a
gateway-issued JWT) and department auth (a per-department `X-Gateway-Key`)
are also kept strictly separate.

## Setup
```bash
cd gateway
npm install
cp ../.env.example .env    # then fill in DB_*, JWT_SECRET, ADMIN_KEY, and the per-department keys/URLs
npm run migrate            # applies src/db/schema.sql (needs a running Postgres)
npm start                  # serves on http://localhost:4000
```

## Implemented endpoints
All built and covered by the test suite. Full contracts in `.kiro/steering/api.md`.

**Citizen-facing (Layer 1), under `/api/v1`:**
- `GET  /health` — unauthenticated liveness probe.
- `POST /auth/register`, `POST /auth/login` — citizen account against the `citizens` table; returns a gateway-scoped JWT (bcrypt password hashing).
- `GET  /applications`, `POST /applications`, `GET /applications/:id` — application lifecycle + per-call history.
- `POST /applications/:id/verify` — the relay: consent check → live department fetch → log → resolve `complete`/`failed`. `reference` is optional; when omitted the gateway reuses a previously-verified reference for that department (reuse path), still enforcing consent and still fetching live.
- `POST /consent` — records a `consent_grants` row; the relay refuses a department call without a matching one.
- `GET  /documents` — the citizen's `linked_references` (what's verified, with which department).

**Officials/admin read console (Phase A), under `/api/v1/admin`** — read-only, cross-citizen, gated by a shared `X-Admin-Key` (a separate credential from the citizen JWT):
- `GET /admin/stats` — aggregate dashboard numbers, including a rolling last-24h calls/failures pulse.
- `GET /admin/applications` — all applications across all citizens, filterable by status/department.
- `GET /admin/audit-log` — the append-only audit trail, newest first, filterable.

## Department clients (Layer 2)
One client per department, each translating that department's native
response into the gateway's internal shape and masking sensitive values
at the client boundary (see `src/utils/mask.js`) before anything is
persisted:
- `digital-tax-records-client.js`
- `national-identity-registry-client.js`
- `driving-licence-jan-aadhaar-client.js`

Each client returns a typed outcome (`success` / `not_found` / `rejected`
/ `auth_error` / `timeout` / `unreachable` / `unexpected`) rather than
throwing, so the relay can log and resolve status deterministically. A
department failure surfaces honestly — never a substituted fake success.

## Persistence
The gateway owns its own PostgreSQL database (`setu_gateway_db`) with
tables `citizens`, `linked_references`, `applications`,
`application_department_calls`, `consent_grants`, and `audit_log`. It
shares no storage with any department and holds only *references* and
short masked summaries — never a department's raw source-of-truth payload.
Schema is in `src/db/schema.sql`; see `.kiro/steering/database-schema.md`.

## Tests
```bash
npm test        # 44 tests, all passing
```
The suite runs against in-memory repositories and injectable fake
department clients, so it does **not** require a running PostgreSQL
instance or the live department services. It covers auth, applications,
consent enforcement, documents, the relay success/failure/timeout paths
for all three departments, the reuse path, and value masking.

There are also live end-to-end scripts under `scripts/` (e.g.
`phase4b-reuse-walkthrough.js`, `phase4-failure-walkthrough.js`) that run
against real Postgres and the real department services for demo proof.
