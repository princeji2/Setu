-- ============================================================
-- Driving Licence & Jan Aadhaar Registration Portal
-- Seed Data — Development Only
-- ============================================================
-- NOTE: Admin password is set via the application seed script (database/seed.js)
-- which hashes the password with bcrypt before inserting.
-- This file contains only static reference/lookup seed data.

-- Sample verification status reference (informational — not a table):
-- VERIFICATION_PENDING  → Submitted, awaiting verification
-- FORMAT_VALID          → Format checks passed (DEVELOPMENT MOCK — NOT GOVERNMENT VERIFICATION)
-- VERIFIED              → Verified by authorized provider (future)
-- VERIFICATION_FAILED   → Verification could not be completed

-- ============================================================
-- Clear development test data if re-seeding
-- ============================================================
-- DELETE FROM audit_logs;
-- DELETE FROM registrations;
-- DELETE FROM admins;
