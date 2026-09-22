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

function parseCorsOrigins(raw) {
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'https://app.orgs.social',
    'http://app.orgs.social',
    'https://orgs.social',
    'http://orgs.social',
    'https://www.orgs.social',
    'http://www.orgs.social',
  ];
  if (!raw) return defaults;
  const parsed = raw
    .split(',')
    .map((o) => o.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, ''))
    .filter(Boolean);
  return Array.from(new Set([...defaults, ...parsed]));
}

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isTest: env === 'test',
  port: parseInt(process.env.PORT, 10) || 4000,

  db: {
    connectionString: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'setu_gateway_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' || Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET
      || (env === 'test' ? 'test-only-insecure-secret-do-not-use-in-prod' : 'setu-default-jwt-secret-key-32-chars-min-prod-demo'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,
  },

  // Officials/admin read-only console (Phase A). A single shared secret,
  // NOT a citizen JWT and NOT a department gateway key — it gates the
  // cross-citizen read endpoints under /api/v1/admin only. Deliberately a
  // separate credential so the officials surface never rides on citizen
  // auth (require-auth.js) and stays a clean, isolated layer. Prototype-
  // grade per product.md (real enough to demo, not hardened).
  admin: {
    key: process.env.ADMIN_KEY
      || (env === 'test' ? 'test-only-admin-key' : ''),
  },

  cors: {
    origins: parseCorsOrigins(process.env.CORS_ORIGINS),
  },

  // Per-department integration config (Layer 2). One entry per department;
  // each has its OWN gateway key — never a single shared key (see api.md).
  // Step 3a wires only digital_tax_records; the other two land in 3b.
  departments: {
    digital_tax_records: {
      baseUrl: process.env.DTR_SERVICE_URL || 'http://127.0.0.1:8000',
      gatewayKey: process.env.DTR_GATEWAY_KEY || '',
    },
    national_identity_registry: {
      baseUrl: process.env.NIR_SERVICE_URL || 'http://127.0.0.1:5000',
      gatewayKey: process.env.NIR_GATEWAY_KEY || '',
    },
    driving_licence_jan_aadhaar: {
      baseUrl: process.env.DLJA_SERVICE_URL || 'http://127.0.0.1:3001',
      gatewayKey: process.env.DLJA_GATEWAY_KEY || '',
    },
  },

  departmentCallTimeoutMs: parseInt(process.env.DEPARTMENT_CALL_TIMEOUT_MS, 10) || 5000,

  // Chatbot proxy (Gemini). The key lives ONLY here, server-side — it is
  // never sent to the browser. The frontend chat widget calls the gateway's
  // own POST /api/v1/chat, which forwards to Gemini using this key. Keeping
  // it out of the client bundle is the whole reason the call is proxied.
  // If unset, the /api/v1/chat endpoint reports an honest "chat unavailable"
  // rather than crashing — the widget's canned answers still work offline.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    // Fast, cheap model that suits short grounded Q&A for a demo.
    // (gemini-2.0-flash was retired upstream; 3.6-flash is the current fast tier.)
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 12000,
  },
};

module.exports = config;
