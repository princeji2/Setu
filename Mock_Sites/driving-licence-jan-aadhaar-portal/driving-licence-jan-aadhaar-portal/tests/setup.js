'use strict';

/**
 * Jest global test setup.
 * Mocks the database module so tests run without a live PostgreSQL connection.
 * All SQL queries are intercepted and return configurable fake results.
 */

// ── Set test environment variables before any module loads ────
process.env.NODE_ENV              = 'test';
process.env.PORT                  = '3099';
process.env.DB_HOST               = 'localhost';
process.env.DB_NAME               = 'test_db';
process.env.DB_USER               = 'test';
process.env.DB_PASSWORD           = 'test';
process.env.JWT_SECRET            = 'test_jwt_secret_minimum_32_characters_long!!';
process.env.JWT_EXPIRES_IN        = '1h';
process.env.ADMIN_USERNAME        = 'admin';
process.env.ADMIN_PASSWORD        = 'Admin@Test2024!';
process.env.LICENCE_NUMBER_PATTERN = '^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$';
process.env.JAN_AADHAAR_ID_LENGTH  = '10';
process.env.VERIFICATION_PROVIDER  = 'mock';
process.env.CORS_ORIGINS           = 'http://localhost:3099,http://127.0.0.1:3099';
process.env.GATEWAY_API_KEY        = 'test_gateway_secret_key_123';
