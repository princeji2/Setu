# SIH26129 — Unified Interoperability Layer for Government Digital Platforms

> Govt of Maharashtra · Category: Software · Theme: Miscellaneous

## The problem
State and central government services — land records, certificates,
ration cards, grievance redressal, tax portals — live on separate
digital platforms, each built by a different department at a different
time with a different tech stack, login system, and data format. A
citizen whose task touches two departments has to manually fetch a
document from one portal and re-upload it to another.

## What this prototype demonstrates
A gateway layer that lets independently-built, schema-incompatible
department systems behave as one coherent system to the citizen —
**without rewriting the underlying department systems**, mirroring how
real government IT modernization actually happens: integration around
legacy systems, not replacement of them.

The demoed journey: a citizen applies for a certificate (caste / income
/ residence) that requires a verified land record. Today that's two
portals and a manual upload. Here, it's one form — the gateway silently
verifies the land record and issues the certificate, and every backend
call is logged for accountability.

Full spec: [`.kiro/specs/certificate-application/`](.kiro/specs/certificate-application)

## Architecture
```
Citizen Dashboard (Next.js + Supabase Auth)
        │
        ▼
   Gateway Layer  ──►  Land Records service        (API-key auth)
   (orchestration, ──►  Certificate Issuance service (JWT auth)
    schema         ──►  Grievance service            (session-cookie auth, stub)
    translation,
    audit log)
```

Each department service is deliberately built with a different data
shape and a different authentication method — that heterogeneity is
what the gateway is proving it can reconcile. See
[`.kiro/steering/tech.md`](.kiro/steering/tech.md) for full schemas and
API contracts.

## Why this approach
Rather than attempt a generic platform for "all government services" —
an unrealistic scope for a hackathon and a poor demo of depth — this
prototype builds one citizen journey end to end, including its failure
path, so the integration claim is verifiable rather than asserted. The
audit log lets anyone confirm that multiple, genuinely different backend
systems were actually called for a given request.

## Project docs
- [`.kiro/steering/product.md`](.kiro/steering/product.md) — problem, scope, success criteria
- [`.kiro/steering/tech.md`](.kiro/steering/tech.md) — stack, schemas, API contracts
- [`.kiro/steering/structure.md`](.kiro/steering/structure.md) — repo layout and build rules
- [`.kiro/specs/certificate-application/requirements.md`](.kiro/specs/certificate-application/requirements.md) — user stories & acceptance criteria
- [`.kiro/specs/certificate-application/design.md`](.kiro/specs/certificate-application/design.md) — architecture & UI design
- [`.kiro/specs/certificate-application/tasks.md`](.kiro/specs/certificate-application/tasks.md) — build checklist

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

### First-time / environment notes
- **PostgreSQL** is a Scoop install with no Windows service, so it does not
  auto-start on boot — `start-all.ps1` starts it manually each time. The
  gateway's own database (`setu_gateway_db`) is created and migrated with
  `npm run migrate` from `gateway/`.
- **Dependencies** must be installed once per Node service (`npm install` in
  `gateway/`, `frontend/`, and each Node department folder) and the Python
  venv must exist for Digital Tax Records (`pip install -r requirements.txt`).
- **Paths** for the Scoop Postgres install are hardcoded at the top of
  `start-all.ps1`; update them there if Postgres moves or is reinstalled.

### Demo references
- Digital Tax Records: `SYNPAN-000123`
- National Identity Registry: `TESTAADHAAR0001`
- Driving Licence & Jan Aadhaar ships with no seeded references — they're
  created via `POST /api/v1/registrations`.

## Team
_(fill in)_
