-- ==========================================================
-- National Identity Registry — Demo Department Database
-- Target Database: aadhaar_portal_db
-- Synthetic / Educational Prototype Schema
-- ==========================================================

-- 1. Main Registrations Table
-- Enforces uniqueness on synthetic identity reference
CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    identity_reference VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'REGISTERED',
    fields JSONB DEFAULT '[]'::jsonb,
    -- Personal information fields added in v2
    name VARCHAR(120),
    mobile_number VARCHAR(15),
    address TEXT,
    father_name VARCHAR(120),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_registrations_identity_ref UNIQUE (identity_reference)
);

-- Migration support: add fields column if table already exists
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[]'::jsonb;

-- Migration support: add personal information columns if table already exists (v2 upgrade)
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS name VARCHAR(120);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(15);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS father_name VARCHAR(120);

-- Index for high-performance lookup of identity references
CREATE INDEX IF NOT EXISTS idx_registrations_identity_ref ON registrations(identity_reference);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at DESC);

-- 2. Administrators Table
-- Stores bcrypt hashed passwords, strictly no plaintext
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_admins_username UNIQUE (username)
);

-- 3. Audit Logs Table
-- Records security & business events without exposing sensitive identity data
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
