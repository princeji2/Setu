-- ============================================================
-- Driving Licence & Jan Aadhaar Registration Portal
-- Database Schema
-- Database: identity_documents_portal_db
-- ============================================================

-- Create database (run manually if needed):
-- CREATE DATABASE identity_documents_portal_db;

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: admins
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admins_email    ON admins(email);
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);

-- ============================================================
-- TABLE: registrations
-- ============================================================
CREATE TABLE IF NOT EXISTS registrations (
    id                      SERIAL PRIMARY KEY,

    -- Reference
    registration_reference  VARCHAR(20) NOT NULL UNIQUE,

    -- Driving Licence Fields
    licence_number          VARCHAR(20) NOT NULL UNIQUE,
    licence_holder_name     VARCHAR(255) NOT NULL,
    licence_issue_date      DATE NOT NULL,
    licence_valid_from      DATE NOT NULL,
    licence_expiry_date     DATE NOT NULL,

    -- Jan Aadhaar Fields
    jan_aadhaar_id          VARCHAR(20) NOT NULL UNIQUE,
    family_members_count    INTEGER NOT NULL CHECK (family_members_count >= 1 AND family_members_count <= 50),

    -- Verification & Status
    verification_status     VARCHAR(50) NOT NULL DEFAULT 'VERIFICATION_PENDING',
    verification_provider   VARCHAR(100) NOT NULL DEFAULT 'MockVerificationProvider',
    verification_notes      TEXT,

    -- Metadata
    submitted_ip            VARCHAR(45),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Date integrity constraints
    CONSTRAINT chk_issue_before_valid_from
        CHECK (licence_issue_date <= licence_valid_from),
    CONSTRAINT chk_expiry_after_valid_from
        CHECK (licence_expiry_date >= licence_valid_from),
    CONSTRAINT chk_verification_status
        CHECK (verification_status IN (
            'VERIFICATION_PENDING',
            'FORMAT_VALID',
            'VERIFIED',
            'VERIFICATION_FAILED'
        ))
);

CREATE INDEX IF NOT EXISTS idx_reg_reference       ON registrations(registration_reference);
CREATE INDEX IF NOT EXISTS idx_reg_licence_number  ON registrations(licence_number);
CREATE INDEX IF NOT EXISTS idx_reg_jan_aadhaar_id  ON registrations(jan_aadhaar_id);
CREATE INDEX IF NOT EXISTS idx_reg_holder_name     ON registrations(licence_holder_name);
CREATE INDEX IF NOT EXISTS idx_reg_created_at      ON registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reg_status          ON registrations(verification_status);

-- ============================================================
-- TABLE: audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              SERIAL PRIMARY KEY,
    event_type      VARCHAR(100) NOT NULL,
    -- Use masked identifiers only — never store raw sensitive values here
    registration_ref VARCHAR(20),
    masked_identifier TEXT,
    admin_id        INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_audit_event_type CHECK (event_type IN (
        'ADMIN_LOGIN_SUCCESS',
        'ADMIN_LOGIN_FAILED',
        'REGISTRATION_CREATED',
        'REGISTRATION_DUPLICATE',
        'REGISTRATION_FETCHED',
        'REGISTRATION_SEARCH',
        'VERIFICATION_REQUESTED',
        'VERIFICATION_RESULT',
        'UNAUTHORIZED_ACCESS',
        'RATE_LIMIT_EXCEEDED',
        'VALIDATION_FAILED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type     ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_reg_ref        ON audit_logs(registration_ref);
CREATE INDEX IF NOT EXISTS idx_audit_admin_id       ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at     ON audit_logs(created_at DESC);

-- ============================================================
-- FUNCTION: auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_registrations_updated_at
    BEFORE UPDATE ON registrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_admins_updated_at
    BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
