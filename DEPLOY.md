# Setu — Deployment (new Render account)

This records the live deployment of the full Setu stack on the **new**
Render account (`Prince's workspace`, owner `tea-db66tbijnfac73clipu0`,
princenaruka.business@gmail.com) plus the Neon databases it uses.

> **Secrets:** this file lists env var **names** only. All values are
> placeholders. Never commit real keys, passwords, or connection strings.

---

## Live services

| Service | Render id | URL | Health |
|---|---|---|---|
| setu-dtr (DTR) | `srv-db67g4dckfvc73ce7s20` | https://setu-dtr-8qeb.onrender.com | `GET /` |
| setu-nir (NIR) | `srv-db67g57lot8c7395me4g` | https://setu-nir-qwe9.onrender.com | `GET /health` |
| setu-dlja (DLJA) | `srv-db67g5nlk1mc73c7djf0` | https://setu-dlja-azh1.onrender.com | `GET /api/v1/health` |
| setu-gateway | `srv-db67hpss728c73ffb3g0` | https://setu-gateway-bskg.onrender.com | `GET /api/v1/health` |

- Render project: **Setu** (`prj-db674etckfvc73ccs7dg`), though services
  were created **ungrouped** (the project-grouping create 500'd once;
  grouping is cosmetic and was skipped per plan).
- Region: **Ohio** (US), chosen to sit near Neon's `aws-us-east-2`.
- Plan: **free** on all four. Repo `github.com/princeji2/Setu`, branch
  `main`, autoDeploy on. Gateway requires commit `6bfe6b8` (the
  unavailable-outcome + URL fixes) to be on `origin/main` — it is.

---

## Service build/run settings

| Service | Root dir | Runtime | Build | Start |
|---|---|---|---|---|
| setu-dtr | `Mock_Sites/UIDAI_Backend_Digital_Tax_Records/UIDAI_Backend` | python | `pip install -r requirements.txt` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| setu-nir | `Mock_Sites/Independent Identity Registration Portal/Independent Identity Registration Portal/SETU` | node | `npm install` | `npm start` |
| setu-dlja | `Mock_Sites/driving-licence-jan-aadhaar-portal/driving-licence-jan-aadhaar-portal` | node | `npm install` | `npm start` |
| setu-gateway | `gateway` | node | `npm install` | `npm start` |

---

## Environment variables (names only — set values as Render secrets)

### setu-dtr
- `GATEWAY_API_KEY` = `<DTR gateway key>` (must equal gateway's `DTR_GATEWAY_KEY`)
- `SEED_DEMO_DATA` = `true` (idempotent SQLite demo seed on boot; DTR uses SQLite, no external DB)

### setu-nir
- `GATEWAY_API_KEY` = `<NIR gateway key>` (must equal gateway's `NIR_GATEWAY_KEY`)
- `DB_HOST` = `<neon nir/dlja host>`  ·  `DB_PORT` = `5432`
- `DB_NAME` = `nir_db`  ·  `DB_USER` = `neondb_owner`  ·  `DB_PASSWORD` = `<neon password>`
- `DB_SSL` = `true`

### setu-dlja
- `GATEWAY_API_KEY` = `<DLJA gateway key>` (must equal gateway's `DLJA_GATEWAY_KEY`)
- `DB_HOST` = `<neon nir/dlja host>`  ·  `DB_PORT` = `5432`
- `DB_NAME` = `dlja_db`  ·  `DB_USER` = `neondb_owner`  ·  `DB_PASSWORD` = `<neon password>`
- `DB_SSL` = `true`

### setu-gateway
- `NODE_ENV` = `production`
- `DB_HOST` = `<neon gateway host>`  ·  `DB_PORT` = `5432`
- `DB_NAME` = `neondb`  ·  `DB_USER` = `neondb_owner`  ·  `DB_PASSWORD` = `<neon password>`
- `DB_SSL` = `true`
- `JWT_SECRET` = `<jwt secret>`  ·  `JWT_EXPIRES_IN` = `8h`  ·  `BCRYPT_SALT_ROUNDS` = `10`
- `ADMIN_KEY` = `<admin console key>`
- `CORS_ORIGINS` = `<comma-separated frontend origins>` (currently `https://app.orgs.social,https://orgs.social`)
- `DTR_SERVICE_URL` = `https://setu-dtr-8qeb.onrender.com`  ·  `DTR_GATEWAY_KEY` = `<DTR gateway key>`
- `NIR_SERVICE_URL` = `https://setu-nir-qwe9.onrender.com`  ·  `NIR_GATEWAY_KEY` = `<NIR gateway key>`
- `DLJA_SERVICE_URL` = `https://setu-dlja-azh1.onrender.com`  ·  `DLJA_GATEWAY_KEY` = `<DLJA gateway key>`
- `DEPARTMENT_CALL_TIMEOUT_MS` = `45000`
- `GEMINI_API_KEY` = `<gemini key>` (optional; chat degrades gracefully if unset)  ·  `GEMINI_MODEL` = `gemini-3.6-flash`

> The gateway↔department key pairing is the usual silent-failure trap: a
> mismatch presents as a false "department down". `GATEWAY_API_KEY` on
> each department must equal the gateway's matching `*_GATEWAY_KEY`.

---

## Databases (Neon — existing account, reused as directed)

| Logical DB | Neon project | Database | Notes |
|---|---|---|---|
| Gateway | `setu-gateway-db` (`quiet-smoke-25719836`) | `neondb` | **New** project; migrated fresh (6 tables, empty). |
| NIR | `setu-nir` (`autumn-dust-54329454`) | `nir_db` | Existing data: 70 registrations, 48 audit_logs. |
| DLJA | `setu-nir` (`autumn-dust-54329454`) | `dlja_db` | Existing data: 22 registrations / 22 vehicle_rcs / 22 passports / 64 audit_logs. |

- All Neon DBs: `DB_USER=neondb_owner`, `DB_SSL=true`, port `5432`, region `aws-us-east-2`.
- **Deviation from the "separate projects" steering rule (deliberate, directed):**
  NIR and DLJA share one Neon *project/endpoint* but use **separate databases**
  (`nir_db` vs `dlja_db`). The full DLJA dataset already lived in the
  `setu-nir` project's `dlja_db`; the `setu-dlja` project's `neondb` was
  empty, so per instruction we pointed DLJA at the populated `dlja_db` and
  did **not** seed. The empty `setu-dlja` project (`plain-union-17383227`)
  and the unused new `setu-nir-db` / `setu-dlja-db` projects are left in
  place (not deleted).

### Migration / seed commands

Only the gateway DB was migrated this round (NIR/DLJA data already present):

```bash
# Gateway schema (run once against the new gateway DB). The gateway honors
# DATABASE_URL or discrete DB_* vars; DB_SSL=true for Neon.
cd gateway
DATABASE_URL="postgres://neondb_owner:<pw>@<neon gateway host>/neondb" npm run migrate
```

If NIR/DLJA ever need a fresh DB (not needed now — data exists):

```bash
# NIR (rootDir SETU/), pointed at nir_db via DB_* env vars:
node database/initDb.js && node database/seedRegistrations.js && node database/seedAdmin.js

# DLJA (portal root), pointed at dlja_db via DB_* env vars:
node database/migrate.js && node database/seed.js && node database/seed_documents.js
```

---

## Verification (all PASS, live, over HTTP)

Health: DTR `/` 200 · NIR `/health` 200 (PostgreSQL 18.6, connected) ·
DLJA `/api/v1/health` 200 (db ok) · gateway `/api/v1/health` 200.

8 document types + reuse, against `https://setu-gateway-bskg.onrender.com`:

| Document type | Dept | HTTP | Status | Outcome | Result |
|---|---|---|---|---|---|
| PAN | DTR | 200 | complete | success | PASS |
| Income Certificate | DTR | 200 | complete | success | PASS |
| Identity | NIR | 200 | complete | success | PASS |
| Voter ID | NIR | 200 | complete | success | PASS |
| Birth Certificate | NIR | 200 | complete | success | PASS |
| Driving Licence | DLJA | 200 | complete | success | PASS |
| Vehicle RC | DLJA | 200 | complete | success | PASS |
| Passport | DLJA | 200 | complete | success | PASS |
| **Reuse** (2nd app, no reference) | DTR | 200 | complete | reused=true | PASS |

Reproduce with the in-repo `gateway/scripts/verify_e2e_all.js` logic pointed
at the live gateway URL.

---

## Frontend wiring (changes staged, NOT committed)

Working-tree edits (old `setu-gateway-v2` → new `setu-gateway-bskg`):

- `frontend/public/index.html` — `SETU_API_BASE` production branch → new gateway `/api/v1`.
- `frontend/public/admin.html` — same (the executed line; the comment example above it still shows the old host and can be ignored or tidied).
- `gateway/src/server.js` — keep-alive self-ping now prefers `RENDER_EXTERNAL_URL`
  (Render auto-injects it) and falls back to the new gateway URL, so it won't
  go stale on future renames.

**Not committed or pushed** per instruction — review `git diff`, then commit/push when ready.

### Vercel (frontend host)

If the frontend is deployed on Vercel and reads the gateway URL from an env
var rather than the inline `SETU_API_BASE` in the HTML, update that env var
to `https://setu-gateway-bskg.onrender.com/api/v1` (keep the `/api/v1`
suffix, no trailing slash) and redeploy. If the HTML inline value is the only
source (as it is in this repo today), redeploying the frontend with the edits
above is sufficient — no Vercel dashboard env change needed.

---

## Keep-alive

cron-job.org (or similar) hitting these every ~10–12 min keeps the free
services warm:
- gateway `GET /api/v1/health`
- DTR `GET /`
- NIR `GET /health` (runs a DB query → keeps NIR's Neon compute warm)
- DLJA `GET /api/v1/health`

> NIR's `/health` touches the DB; DLJA's does too (`latencyMs` reported).
> Both keep their Neon compute warm. Neon free compute cold-sleeps when idle,
> so a ping shortly before a demo is still wise.

---

## Keys to rotate afterwards

These values passed through environment/session during setup. Rotate before
or after the SIH window as a hygiene step (none were printed or committed, but
rotate anyway since they now live in a new account's config):

1. **Render API key** (new account) — the `RENDER_API_KEY_NEW` used for provisioning.
2. **Neon API key** — used to read connection details and create projects.
3. **Department gateway keys** — `DTR_GATEWAY_KEY`, `NIR_GATEWAY_KEY`, `DLJA_GATEWAY_KEY`
   (and the matching `GATEWAY_API_KEY` on each department). Rotate all four
   together so the pairs stay equal.
4. **Gateway `JWT_SECRET`** and **`ADMIN_KEY`**.
5. **Neon DB password** (`neondb_owner`) for the gateway/NIR/DLJA projects, if
   you want a clean credential post-demo.
6. **`GEMINI_API_KEY`**, if set.
