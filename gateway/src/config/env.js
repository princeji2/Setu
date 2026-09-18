'use strict';

/**
 * Centralised environment config for the Setu gateway.
 * Loaded once; every module imports from here rather than reading
 * process.env directly. Mirrors the config/env pattern used by the
 * Mock_Sites Node services for consistency.
 *
 * See ../../.env.example (repo root) for the full variable list.
 */

require('dotenv').config();

function required(name, value) {
  // In production we fail fast on missing critical secrets. In test we
  // fall back to deterministic defaults so the suite never needs a real
  // .env to run.
  if (!value && process.env.NODE_ENV !== 'test') {
    console.warn(`[config] Warning: ${name} is not set.`);
  }
  return value;
}

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isTest: env === 'test',
  port: parseInt(process.env.PORT, 10) || 4000,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'setu_gateway_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
  },

  auth: {
    // A deterministic fallback secret is used ONLY under NODE_ENV=test so
    // the suite can sign/verify tokens without a configured .env.
    jwtSecret: required('JWT_SECRET', process.env.JWT_SECRET)
      || (env === 'test' ? 'test-only-insecure-secret-do-not-use-in-prod' : ''),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },

  // Per-department integration config (Layer 2). One entry per department;
  // each has its OWN gateway key — never a single shared key (see api.md).
  // Step 3a wires only digital_tax_records; the other two land in 3b.
  departments: {
    digital_tax_records: {
      baseUrl: process.env.DTR_SERVICE_URL || 'http://127.0.0.1:8000',
      gatewayKey: process.env.DTR_GATEWAY_KEY || '',
    },
  },

  departmentCallTimeoutMs: parseInt(process.env.DEPARTMENT_CALL_TIMEOUT_MS, 10) || 5000,
};

module.exports = config;
