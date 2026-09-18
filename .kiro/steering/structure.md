# Structure — SIH26129 (Setu Gateway)

## Repo layout
```
/Mock_Sites                    — the 3 real department services (already built, do NOT edit)
  /UIDAI_Backend_Digital_Tax_Records          — FastAPI + SQLite
  /Independent Identity Registration Portal    — Node/Express + PostgreSQL
  /driving-licence-jan-aadhaar-portal          — Node/Express + PostgreSQL
  HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md         — per-site connection contract

/gateway                       — the Setu gateway backend (Node/Express, standalone) — TO BE BUILT
  /src
    /citizen-api              — Layer 1: citizen-facing API (auth, applications, consent, documents)
      /routes                 — auth.js, applications.js, consent.js, documents.js
      /controllers
      /middleware             — auth (verify Setu JWT), validation
    /department-clients       — Layer 2: one HTTP client per department, each with its own
                                base URL / gateway key / response+error shape
      digital-tax-records-client.js
      national-identity-registry-client.js       — includes retry-once-on-token-expiry
      driving-licence-jan-aadhaar-client.js
    /db                       — connection, migrations, models for the gateway's own tables
    /services                 — orchestration (relay, consent checks, audit writes)
    /utils                    — jwt, password hashing, audit logging
    server.js                 — Express app entrypoint
  /tests                      — gateway backend tests
  package.json
  .env.example

/frontend                      — citizen-facing app (separate; calls the gateway's citizen-api) — LATER
.kiro
  /steering                   — product.md, tech.md, structure.md, api.md, appflow.md, database-schema.md
  /specs
    /certificate-application  — requirements.md, design.md, tasks.md
README.md
```

Note: `citizen-api/` (Layer 1) and `department-clients/` (Layer 2) must
stay clearly separated in code and are never called interchangeably —
see `api.md`.

## Naming conventions
- Department client files: `<department>-client.js`, one file per
  department, each knowing only its own base URL, gateway key env var,
  and response/error shape. No shared "generic department client" that
  assumes all three look alike.
- Database `department` values use the enum from `database-schema.md`:
  `digital_tax_records`, `national_identity_registry`,
  `driving_licence_jan_aadhaar`. Use these exact strings everywhere
  (columns, logs, client routing).
- Citizen-facing API routes live under `/api/v1/...` and must match the
  contracts in `api.md` Part 1 exactly — do not rename fields or
  endpoints without updating `api.md` first.
- Department-facing calls must match `api.md` Part 2 / the per-site
  contract — do not invent endpoints; confirm against each site's route
  file (the National Identity Registry path in particular is unconfirmed).

## Hard rules (do not deviate without updating steering docs first)
1. **The gateway does not share a database, schema, or auth system with
   any department.** It owns only its own tables (see
   `database-schema.md`) and holds *references*, never the departments'
   raw source-of-truth data.
2. **Every gateway call to a department must be recorded** — a row in
   `application_department_calls` and a summary in `audit_log`, success
   or failure. No silent calls — the audit log is a judged feature, not
   an afterthought.
3. **Consent is a real backend check.** The gateway must verify a
   matching `consent_grants` row exists before making a department call
   on the citizen's behalf — not just a frontend confirmation dialog.
4. **Fail honestly.** If a department is unreachable, times out, or
   rejects the request (after any built-in retry), surface a clear error
   and mark the application `failed` — never silently substitute fake
   data.
5. **No department service is aware of the others.** Each is codeable
   and testable in total isolation; the gateway is the only party that
   holds more than one department's reference for a citizen.
6. **Build only what the current step needs.** If a new screen,
   endpoint, or table starts to feel necessary, stop and update
   `product.md`'s scope section (and the relevant contract doc) first —
   don't let scope grow silently mid-build.

## When something isn't covered here
Add a short note under the relevant steering file rather than solving it
silently — these files should stay an accurate reflection of what the
codebase actually does, not a plan frozen from day one.

## Keeping docs truthful (drift discipline)
These files describe a system before most of it exists. The moment code
diverges from a contract in `api.md`, `database-schema.md`, or a
sequence in `appflow.md`/`design.md`, that file becomes actively
misleading rather than just stale — worse than no doc at all. Rule: if
you change an endpoint, field name, table, or the call sequence while
coding, update the relevant steering/spec file in the SAME sitting, not
"later." Use the `tasks.md` checkboxes as the forcing function — don't
check a task off until the doc it touches matches what you actually
built.
