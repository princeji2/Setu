# Setu Gateway

Standalone Node/Express interoperability gateway for SIH26129. Owns the
citizen identity and (in later phases) orchestrates calls to the three
department services in `../Mock_Sites/`.

See `.kiro/steering/` (tech.md, structure.md, api.md, database-schema.md,
appflow.md) for the authoritative contracts.

## Layers
- `src/citizen-api/` — Layer 1: the citizen-facing API (auth so far).
- `src/department-clients/` — Layer 2: per-department HTTP clients (later).

These two layers are never called interchangeably.

## Setup
```bash
cd gateway
npm install
cp ../.env.example .env    # then fill in DB_* and JWT_SECRET
npm run migrate            # applies src/db/schema.sql (needs a running Postgres)
npm start
```

## Current status (Step 1)
Implemented:
- `citizens` table migration (`src/db/schema.sql`)
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/health`

Not yet built: applications, consent, documents, department clients.

## Tests
```bash
npm test
```
The auth tests run against an in-memory citizen repository, so they do
**not** require a running PostgreSQL instance.
