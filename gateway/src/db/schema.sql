-- ============================================================
-- Setu Gateway — database schema (gateway-owned tables only)
-- Authoritative source: .kiro/steering/database-schema.md
--
-- Step 1 ships ONLY the `citizens` table. The remaining tables
-- (linked_references, applications, application_department_calls,
-- consent_grants, audit_log) are added in later phases — see
-- .kiro/specs/certificate-application/tasks.md.
-- ============================================================

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
    -- In PostgreSQL 13+, gen_random_uuid() is built-in; ignore extension error if non-superuser
    NULL;
END $$;

-- ------------------------------------------------------------
-- citizens — the Setu-ID. One row per citizen using the gateway.
-- Stores ONLY what's needed to authenticate the citizen to Setu itself.
-- Never store PAN / Aadhaar-style / driving-licence numbers here — those
-- live only in the department that issued them (see database-schema.md).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citizens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,             -- bcrypt; never plaintext
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on email so "A@x.com" and "a@x.com" collide.
CREATE UNIQUE INDEX IF NOT EXISTS citizens_email_lower_uidx
    ON citizens (lower(email));

-- ------------------------------------------------------------
-- Department enum (shared by linked_references + application_department_calls)
-- Kept as a CHECK rather than a native ENUM so adding a department later
-- is a one-line change, not an ALTER TYPE dance.
-- Values are the canonical strings from database-schema.md / structure.md.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- linked_references — maps a citizen to their reference at each department.
-- Holds references only, never the department's underlying data.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linked_references (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id           UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
    department           TEXT NOT NULL
                         CHECK (department IN (
                            'digital_tax_records',
                            'national_identity_registry',
                            'driving_licence_jan_aadhaar')),
    department_reference TEXT NOT NULL,
    linked_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified             BOOLEAN NOT NULL DEFAULT false,
    demographics         JSONB DEFAULT NULL,
    match_confidence     NUMERIC(5,2) DEFAULT NULL,
    discrepancy          JSONB DEFAULT NULL,
    -- One citizen has at most one row per department.
    CONSTRAINT linked_references_citizen_department_uniq
        UNIQUE (citizen_id, department)
);

CREATE INDEX IF NOT EXISTS linked_references_citizen_idx
    ON linked_references (citizen_id);

-- ------------------------------------------------------------
-- applications — a citizen request that needs data from a department.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'submitted'
               CHECK (status IN (
                  'submitted',
                  'gateway_relay',
                  'department_verifying',
                  'complete',
                  'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    composite_workflow_id UUID DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS applications_citizen_idx
    ON applications (citizen_id);
CREATE INDEX IF NOT EXISTS applications_composite_workflow_idx
    ON applications (composite_workflow_id);

-- ------------------------------------------------------------
-- application_department_calls — one row per outbound department call.
-- Created now so GET /applications/:id can return an (empty) history;
-- rows are only WRITTEN starting in Phase 3 (department clients).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS application_department_calls (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id   UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    department       TEXT NOT NULL
                     CHECK (department IN (
                        'digital_tax_records',
                        'national_identity_registry',
                        'driving_licence_jan_aadhaar')),
    endpoint_called  TEXT NOT NULL,
    status_code      INTEGER,
    succeeded        BOOLEAN NOT NULL,
    response_summary TEXT,
    called_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_ms      INTEGER,
    composite_workflow_id UUID DEFAULT NULL,
    match_confidence NUMERIC(5,2) DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS application_department_calls_application_idx
    ON application_department_calls (application_id);
CREATE INDEX IF NOT EXISTS application_department_calls_composite_workflow_idx
    ON application_department_calls (composite_workflow_id);

-- ------------------------------------------------------------
-- consent_grants — the citizen approved a specific data share before it
-- happened. The gateway MUST find a matching row before a department call.
-- fields_requested stored as JSON text (an array of field-name strings).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_grants (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id       UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
    application_id   UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    department       TEXT NOT NULL
                     CHECK (department IN (
                        'digital_tax_records',
                        'national_identity_registry',
                        'driving_licence_jan_aadhaar')),
    fields_requested TEXT NOT NULL,   -- JSON array, e.g. ["PAN number","identity match"]
    granted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_grants_application_idx
    ON consent_grants (application_id);
CREATE INDEX IF NOT EXISTS consent_grants_lookup_idx
    ON consent_grants (application_id, department);

-- ------------------------------------------------------------
-- audit_log — append-only trail of every notable gateway action.
-- The table a judge is pointed at. citizen_id nullable for system events.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id  UUID REFERENCES citizens(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    detail      TEXT,             -- JSON text
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_citizen_idx
    ON audit_log (citizen_id);

-- ------------------------------------------------------------
-- Backward-compatible migrations for existing databases
-- ------------------------------------------------------------
ALTER TABLE applications ADD COLUMN IF NOT EXISTS composite_workflow_id UUID DEFAULT NULL;
ALTER TABLE application_department_calls ADD COLUMN IF NOT EXISTS composite_workflow_id UUID DEFAULT NULL;
ALTER TABLE application_department_calls ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE linked_references ADD COLUMN IF NOT EXISTS demographics JSONB DEFAULT NULL;
ALTER TABLE linked_references ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE linked_references ADD COLUMN IF NOT EXISTS discrepancy JSONB DEFAULT NULL;
