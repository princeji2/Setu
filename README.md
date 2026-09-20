# SIH26129 — Unified Interoperability Layer for Government Digital Platforms

> Govt of Maharashtra · Category: Software · Theme: Miscellaneous

## The problem
State and central government services — tax records, identity
registries, driving licence and Jan Aadhaar portals, and many more —
live on separate digital platforms, each built by a different department
at a different time with a different tech stack, login system, and data
format. A citizen whose task touches two departments has to manually
fetch a document from one portal and re-upload it to another. Nothing
talks to anything else.

## What Setu is
**Setu is a consent-based interoperability gateway.** It sits in front of
independently-built, schema-incompatible department services and lets
them behave as one coherent system to the citizen — **without rewriting
the underlying department systems**. That mirrors how real government IT
modernization actually happens: integration around legacy systems, not
replacement of them.

The gateway integrates three genuinely heterogeneous department services,
each with its own data shape, its own database, and its own gateway
credential:

1. **Digital Tax Records** — FastAPI + SQLite, PAN-style references (e.g. `SYNPAN-000123`).
2. **National Identity Registry** — Node/Express + PostgreSQL, identity references (e.g. `TESTAADHAAR0001`).
3. **Driving Licence & Jan Aadhaar Portal** — Node/Express + PostgreSQL, registration references.

That heterogeneity is the point — reconciling three genuinely different
systems is what proves this is interoperability, not a single API dressed
up three ways.

## The journey this prototype proves
1. **Register / log in** — a citizen creates a Setu account (one login, gateway-owned).
2. **Start an application** — e.g. PAN verification, identity verification, or driving licence registration.
3. **Consent** — the citizen approves exactly which fields are shared, from which department. This is a **real backend authorization check**: the gateway refuses to call a department unless a matching consent record exists — not just a frontend dialog.
4. **Gateway relay** — the gateway attaches the correct per-department credential, calls the real department over HTTP, and translates its response into a consistent internal shape.
5. **Complete or fail honestly** — on success the citizen sees their verified (masked) fields; if a department is down, times out, or rejects the request, the application is marked `failed` with a clear message. Fake data is never substituted.
6. **Reuse** — the real payoff. Once a reference is verified, a *later* application needing the same department skips re-entry: the gateway reuses the stored reference (still consented per application, still fetched live, still logged). The reuse is tagged in the audit trail so it's provable, not inferred.

Every department call — success or failure — is recorded in
`application_department_calls` and summarized in an append-only
`audit_log`. The audit trail is a first-class feature: anyone can confirm
that multiple, genuinely different backend systems were actually called
for a given request.

## Officials console
A separate, **read-only, cross-citizen** view at
[`frontend/public/admin.html`](frontend/public/admin.html), gated by a
shared `X-Admin-Key` (independent from citizen auth). It answers the
problem statement's call for officials who "lack a consolidated view."
Three views over the gateway's own tables:

- **Activity** — the latest gateway actions across all citizens as a live feed (verifications, consent grants, reused references, failures).
- **Applications** — every application across all citizens, filterable by status and department, plus a stats strip: totals, success rate, reuse count, and a rolling **last-24h calls / failures** pulse.
- **Audit log** — the full append-only trail, newest first, with reuse and failure states highlighted.

## Architecture
```
Citizen frontend (vanilla HTML/CSS/JS)        Officials console (admin.html)
        │  citizen JWT (Authorization: Bearer)         │  X-Admin-Key (read-only)
        ▼                                              ▼
                    Setu Gateway  (Node/Express)
        ┌───────────────────────────────────────────────────────┐
        │  Layer 1  citizen-api/     auth · applications ·        │
        │                            consent · documents · admin  │
        │  Layer 2  department-clients/  one HTTP client per dept, │
        │                            each with its own base URL,   │
        │                            gateway key, response shape    │
        │  own Postgres DB (citizens, linked_references,           │
        │  applications, application_department_calls,             │
        │  consent_grants, audit_log)                              │
        └───────────────────────────────────────────────────────┘
              │ X-Gateway-Key (per department)   │                 │
              ▼                                   ▼                 ▼
       Digital Tax Records          National Identity      Driving Licence &
       (FastAPI + SQLite :8000)     Registry               Jan Aadhaar Portal
                                    (Node/Express + PG      (Node/Express + PG
                                     :5000)                  :3001)
```

Key design decisions (full detail in [`.kiro/steering/tech.md`](.kiro/steering/tech.md)):

- **Hand-rolled citizen auth.** The gateway owns its own `citizens` table (bcrypt password hashing) and issues its own JWT. This is deliberate over a managed auth provider — the gateway needs to own the `citizens` row that every other gateway table joins against.
- **Two independent auth layers.** Citizen ↔ Setu is the JWT above. Setu ↔ department is a per-department `X-Gateway-Key` the gateway holds in its own env config and attaches per outbound call. One env var per department, never a single shared key.
- **Service separation is non-negotiable.** The gateway shares no database, schema, or auth system with any department. It stores only *references* and short masked summaries — never a department's raw source-of-truth payload.
- **Vanilla JS frontend, static-served.** No build tool or bundler, kept lean for the deadline; it calls the gateway's citizen-facing API over HTTP and stays decoupled from the backend.

## Why this approach
Rather than attempt a generic platform for "all government services" —
an unrealistic scope for a hackathon and a poor demo of depth — this
prototype builds one citizen journey end to end, including its failure
path, so the integration claim is verifiable rather than asserted. The
architecture (gateway + schema translation + auth federation + consent +
audit) is what generalizes, not the number of services wired up.

## Project docs
- [`.kiro/steering/product.md`](.kiro/steering/product.md) — problem, scope, success criteria
- [`.kiro/steering/tech.md`](.kiro/steering/tech.md) — stack, auth layers, integration contracts
- [`.kiro/steering/structure.md`](.kiro/steering/structure.md) — repo layout and build rules
- [`.kiro/steering/api.md`](.kiro/steering/api.md) — citizen-facing + department-facing API contracts
- [`.kiro/steering/database-schema.md`](.kiro/steering/database-schema.md) — the gateway's own tables
- [`.kiro/steering/appflow.md`](.kiro/steering/appflow.md) — end-to-end journey, step by step

## Running locally

The stack is six processes that must run together: PostgreSQL, the three
department services, the gateway API, and the frontend. Two scripts at the
repo root bring the whole thing up and down.

### One-command startup
```powershell
# from the repo root (c:\Users\Prince\OneDrive\Desktop\Setu)
.\start-all.ps1     # starts everything, then prints a port health check
.\stop-all.ps1      # stops everything, Postgres last
```
If PowerShell blocks the script on execution policy, run it as
`pwsh -File .\start-all.ps1` (bypasses the policy without changing it).

`start-all.ps1` starts services in dependency order — PostgreSQL first,
then the departments, then the gateway, then the frontend — and opens each
service in its own titled PowerShell window (e.g. `Setu Gateway :4000`) so
you can watch its logs or Ctrl+C it individually. It skips PostgreSQL if
it's already running.

Once it reports all ports up, open the app:

**http://localhost:3000**

### What runs where
| Service | Port | Stack | Start command (run by the script) |
|---|---|---|---|
| Frontend (citizen app) | 3000 | static Node server | `node server.js` |
| Gateway API | 4000 | Node/Express | `npm start` |
| Digital Tax Records | 8000 | FastAPI (Python venv) | `.\venv\Scripts\python.exe -m uvicorn app.main:app --port 8000` |
| National Identity Registry | 5000 | Node/Express + PostgreSQL | `npm start` |
| Driving Licence & Jan Aadhaar | 3001 | Node/Express + PostgreSQL | `npm start` |
| PostgreSQL | 5432 | Scoop install (no service) | `pg_ctl -D <data dir> start` |

### PostgreSQL auto-start (one-time setup)
PostgreSQL is a Scoop install with **no Windows service**, so on its own it
does not come up on boot - which is what caused the gateway's ECONNREFUSED /
"service unavailable" on signup. To make it reliable, run this **once**:

```powershell
pwsh -File .\scripts\install-postgres-autostart.ps1
```

That registers a per-user logon Scheduled Task (`SetuPostgresAutostart`)
which runs `scripts\ensure-postgres.ps1` at every login, starting Postgres
on port 5432 before you touch anything. No admin rights needed; idempotent
(re-running just updates the task). After a reboot Postgres is already up -
you do **not** start it by hand.

- Trigger without rebooting: `Start-ScheduledTask -TaskName 'SetuPostgresAutostart'`
- Remove it: `Unregister-ScheduledTask -TaskName 'SetuPostgresAutostart' -Confirm:$false`
- `ensure-postgres.ps1` is the single source of truth for the Scoop paths
  and the readiness-wait; both the logon task and `start-all.ps1` call it,
  and it no-ops if 5432 is already listening.

### After a reboot - start the gateway
With the auto-start task in place, bringing the gateway up is just:

```powershell
cd gateway
npm run migrate   # ONLY the first time, or after a schema change
npm start         # gateway API on :4000
```

Postgres is already running (logon task), so `npm start` connects cleanly
with no manual DB step. For the whole stack (departments + frontend too), use
`.\start-all.ps1` from the repo root - it also calls `ensure-postgres.ps1`,
so it works whether or not the logon task already started Postgres.

### First-time / environment notes
- The gateway's own database (`setu_gateway_db`) is created and migrated
  with `npm run migrate` from `gateway/`. Run it once (and again only
  after a schema change).
- **Dependencies** must be installed once per Node service (`npm install` in
  `gateway/`, `frontend/`, and each Node department folder) and the Python
  venv must exist for Digital Tax Records (`pip install -r requirements.txt`).
- **Paths** for the Scoop Postgres install live in
  `scripts\ensure-postgres.ps1` (and, for shutdown only, `stop-all.ps1`);
  update them there if Postgres moves or is reinstalled.

### Demo references
- Digital Tax Records: `SYNPAN-000123`
- National Identity Registry: `TESTAADHAAR0001`
- Driving Licence & Jan Aadhaar ships with no seeded references — they're
  created via `POST /api/v1/registrations`.

## Team
_(fill in)_


