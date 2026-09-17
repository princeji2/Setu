'use strict';

/**
 * Centralised environment configuration.
 * All process.env reads happen here — nowhere else in the app.
 */

require('dotenv').config();

function required(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  db: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    name:     process.env.DB_NAME     || 'identity_documents_portal_db',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl:      process.env.DB_SSL === 'true',
  },

  jwt: {
    secret:    process.env.JWT_SECRET    || 'dev_jwt_secret_change_in_production_min32chars!!',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },

  rateLimit: {
    windowMs:    parseInt(process.env.RATE_LIMIT_WINDOW_MS      || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS   || '100',    10),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3001,http://127.0.0.1:3001').split(',').map(o => o.trim()),
  },

  gatewayApiKey: process.env.GATEWAY_API_KEY || 'setu_gateway_secret_key_demo_2026',

  validation: {
    licenceNumberPattern: process.env.LICENCE_NUMBER_PATTERN || '^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$',
    janAadhaarIdLength:   parseInt(process.env.JAN_AADHAAR_ID_LENGTH || '10', 10),
  },

  verificationProvider: process.env.VERIFICATION_PROVIDER || 'mock',
};

module.exports = config;
