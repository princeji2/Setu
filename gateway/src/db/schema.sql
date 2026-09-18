-- ============================================================
-- Setu Gateway — database schema (gateway-owned tables only)
-- Authoritative source: .kiro/steering/database-schema.md
--
-- Step 1 ships ONLY the `citizens` table. The remaining tables
-- (linked_references, applications, application_department_calls,
-- consent_grants, audit_log) are added in later phases — see
-- .kiro/specs/certificate-application/tasks.md.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- provides gen_random_uuid()

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
