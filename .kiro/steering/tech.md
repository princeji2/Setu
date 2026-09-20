# Tech — SIH26129 (Setu Gateway)

## Stack (locked — do not suggest alternatives mid-build)
- **Gateway backend**: standalone **Node.js + Express** service. This is
  the project's core deliverable. It is NOT a Next.js app and is not
  coupled to the frontend.
- **Citizen auth**: **hand-rolled**, gateway-owned. A `citizens` table
  with `password_hash` (bcrypt), and a self-issued **JWT** returned on
  login/register. NOT Supabase Auth — the gateway needs its own citizen
  identity to join against `linked_references`, `applications`, etc.
- **Gateway database**: PostgreSQL (the gateway's own tables only — see
  `database-schema.md`). It shares no storage with any department.
- **Department services**: the three already exist in `Mock_Sites/` and
  are not built here (FastAPI+SQLite for Digital Tax Records;
  Node/Express+PostgreSQL for the other two). Each runs independently on
  its own port with its own database.
- **Frontend**: a separate citizen-facing app that calls the gateway's
  citizen-facing API over HTTP. Framework TBD when frontend work starts;
  keep it decoupled from the backend.
- **Animation**: GSAP, reserved for a live status/relay reveal on the
  result screen when the frontend is built — not used decoratively.

## Why this stack
Node/Express keeps the gateway consistent with two of the three mock
services and keeps a clean seam between backend and frontend. Hand-rolled
auth is chosen deliberately over Supabase because the gateway must own
the `citizens` row that every other gateway table joins against — a
managed auth provider would put that identity outside our own schema.
The one non-negotiable constraint is service separation: the three mock
services run and store data independently, because proving the gateway
can reconcile *genuinely* different systems is the whole point of an
"interoperability" problem statement.

---

## 1. Department Services (Layer 2 — already built, gateway calls these)

Do not edit these; the gateway calls them over real HTTP. Full,
authoritative contracts are in **`api.md` Part 2** and
**`Mock_Sites/HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md`** — this section is
only a pointer so contracts live in exactly one place.

- **Digital Tax Records** (FastAPI + SQLite) — `GET /pan/{pan_reference}/fields`,
  header `X-Gateway-Key`, synthetic refs like `SYNPAN-000123`.
- **National Identity Registry** (Node/Express + PostgreSQL) — endpoint
  path **unconfirmed** (referenced as ~`/api/registration/{reference}/fields`;
  confirm against its route file before wiring), header `X-Gateway-Key`,
  **short-lived-token quirk → retry once on expiry**.
- **Driving Licence & Jan Aadhaar Portal** (Node/Express + PostgreSQL) —
  `GET /api/v1/gateway/registrations/:reference` (alias
  `/api/gateway/registrations/:reference`), header `X-Gateway-Key`.

Each department has its own gateway key. Store one env var per
department (`DTR_GATEWAY_KEY`, `NIR_GATEWAY_KEY`, `DLJA_GATEWAY_KEY`) —
never a single shared key, even if they currently coincide in value.

---

## 2. Canonical / translated shape (gateway-side only)
Each department returns a different response shape. A per-department
client/adapter translates that into a consistent internal shape before
it reaches the citizen API response or the audit summary — the frontend
and audit log never need to know a department's native field names. The
gateway stores only *references* and short non-sensitive summaries, never
a department's raw source-of-truth payload (see `database-schema.md`
"What's deliberately NOT in this schema").

---

## 3. Gateway API (Layer 1 — the citizen-facing API, to be built)
Authoritative contract lives in **`api.md` Part 1**. Summary:
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login` — citizen
  account against the `citizens` table; returns a gateway-scoped JWT.
- `GET /api/v1/applications`, `POST /api/v1/applications`,
  `GET /api/v1/applications/:id` — application lifecycle + per-call history.
- `POST /api/v1/consent` — records a `consent_grants` row; the gateway
  refuses a department call without a matching consent record.
- `GET /api/v1/documents` — the citizen's `linked_references`.

Do not add or rename endpoints without updating `api.md` in the same
sitting.

---

## 4. Auth: two independent layers (don't conflate them)
- **Citizen ↔ Setu (Layer 1):** hand-rolled. Register/login against the
  `citizens` table, bcrypt password hashing, a self-issued JWT scoped to
  the gateway only. This credential has nothing to do with any
  department's own login.
- **Setu ↔ Department (Layer 2, "auth federation"):** the gateway holds
  each department's `X-Gateway-Key` in its own env config and attaches
  the correct one per outbound call. The citizen never sees or handles
  these. For the prototype these are static service-level keys — what's
  demonstrated is that the gateway handles the translation/attachment,
  not that each citizen has a real account on each legacy system.

---

## 5. Persistence
The gateway's own tables (`citizens`, `linked_references`,
`applications`, `application_department_calls`, `consent_grants`,
`audit_log`) are defined authoritatively in **`database-schema.md`** —
that file is the single source of truth for columns and types. Every
department call writes to `application_department_calls` and is
summarized in `audit_log`, success or failure.

## Open questions to resolve during build
- [ ] Confirm the National Identity Registry endpoint path against its
      actual route file before wiring the client.
- [ ] Confirm the exact current 401 wording on Digital Tax Records
      (recently aligned with the other two) before hardcoding any match.
- [ ] `application_department_calls.response_summary`: metadata-only vs.
      masked-but-real field values — decide deliberately (see the open
      question in `database-schema.md`).
- [ ] Whether department services are deployed separately or run as
      local processes for the demo — decide based on demo-day network
      reliability; either way all three must run concurrently on distinct
      ports for any end-to-end test to be meaningful.

---

## Deployment (free-tier: Render + Vercel) — scoped, not yet deployed

Target topology (decided): 4 separate Render web services — the gateway
plus each of the 3 department mocks (DTR, NIR, DLJA), kept independent to
preserve the service-separation constraint — with the static frontend on
Vercel and the gateway's Postgres on Render's free tier. A cron-job.org
ping every ~10-12 min keeps the free services warm (health/root endpoints
below). Config-only for most services; three small code changes were
required and are now in place:

1. **DTR demo seed (code).** DTR's SQLite file is gitignored and Render's
   filesystem is ephemeral, so a fresh boot had an empty `pan_records`
   table and every gateway PAN lookup 404'd. `app/seed_demo_records.py`
   now idempotently seeds the synthetic demo records (`SYNPAN-000123`,
   `SYNPAN-000456`, `DEMO-000789`) into `pan_records` if absent; it is
   called from `app/main.py` at startup, guarded by `SEED_DEMO_DATA`
   (default on) and wrapped so a seed failure never blocks boot. Keep the
   seeded reference set in sync with `gateway/scripts/demo-dtr-run.js`.
2. **NIR SSL (code).** `SETU/backend/config/database.js` now enables
   `ssl: { rejectUnauthorized: false }` when `DB_SSL === 'true'`, matching
   the DLJA portal and the gateway. Required for Render managed Postgres;
   local dev is unchanged when `DB_SSL` is unset/false.
3. **Frontend API base (code).** `frontend/public/js/api.js` and
   `admin-api.js` no longer hardcode `http://localhost:4000/api/v1`; they
   read `window.SETU_API_BASE` (set inline in `index.html` / `admin.html`)
   and fall back to the localhost default when it's blank. Local dev is
   unchanged; a deployed frontend sets the global to the deployed gateway
   URL (keep the trailing `/api/v1`, no trailing slash).

Per-service env at deploy time (values as Render secrets, never committed):
gateway — `DB_*` from Render PG + `DB_SSL=true`, `JWT_SECRET`, `ADMIN_KEY`,
`CORS_ORIGINS`=Vercel URL, `DTR/NIR/DLJA_SERVICE_URL`=deployed URLs,
`DTR/NIR/DLJA_GATEWAY_KEY` each matching that department's own
`GATEWAY_API_KEY`; DTR — `GATEWAY_API_KEY`, `SEED_DEMO_DATA`; NIR/DLJA —
`DB_*` + `DB_SSL=true`, `GATEWAY_API_KEY`. Run each service's
migrate/seed once against its deployed DB (`npm run migrate` for the
gateway; NIR `db:init`/`db:seed*`; DLJA `db:migrate`).

Keep-alive endpoints (already exist, no new code): gateway
`GET /api/v1/health`; DTR `GET /`; NIR `GET /health` (also `/`); DLJA
`GET /api/v1/health` (also `/`).

Deploy order: create the gateway Postgres → deploy the 3 departments
(apply NIR SSL + DTR seed first) and capture their URLs → deploy the
gateway with those URLs + run migrate → deploy the frontend with
`SETU_API_BASE` = gateway URL → set the gateway's `CORS_ORIGINS` to the
Vercel URL and restart. A gateway↔department key mismatch presents as a
false "department down" — verify all three pairs after setting secrets.

Note: Render free Postgres is deleted ~90 days after creation and only one
is allowed per account — fine for the SIH window, but not a durable store.

### Database hosting (decided)

Each department keeps its own independent database — the service-separation
constraint holds through to deployment. NIR and DLJA must NOT share one
Postgres: both define `registrations`, `admins`, and `audit_logs` with
different columns, and both create tables via `CREATE TABLE IF NOT EXISTS`
against the default `public` schema (no `search_path`, no qualified names),
so the second to migrate would silently inherit the first's schema and fail
at query time. Postgres schemas/prefixes could isolate them but would need
per-service code changes and undercut the "genuinely separate systems"
pitch — rejected.

- **Gateway → Render free Postgres** (one per account; the gateway takes it).
- **NIR → Neon database #1.**
- **DLJA → Neon database #2** (same Neon account, separate project/db —
  Neon free allows multiple databases; Supabase free gives only one per
  account, hence Neon for both).
- **DTR → SQLite**, no external DB; the idempotent startup seed above keeps
  it working on the ephemeral filesystem.

Neon changes are **env-vars only, no code** — NIR and DLJA already read
discrete `DB_*` and honor `DB_SSL` (the SSL fix above). Per service set
`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` from Neon and
`DB_SSL=true` (Neon requires SSL), then run that service's existing
migrate/seed once against its Neon DB (NIR `db:init` + `db:seed*`, DLJA
`db:migrate` + `db:seed`). Note: Neon free computes cold-sleep like Render;
the NIR `/health` ping runs a DB query so it keeps NIR's compute warm, but
DLJA's health check doesn't touch the DB — hit a DB-backed endpoint shortly
before demoing to wake it.
