'use strict';

/**
 * HTTP layer for citizen auth. Maps AuthError codes to status codes and
 * keeps the service free of Express specifics.
 */

const { AuthError } = require('../services/auth-service');

const STATUS_BY_CODE = {
  VALIDATION: 400,
  INVALID_CREDENTIALS: 401,
  EMAIL_TAKEN: 409,
};

// Postgres / socket-level failure codes that mean "the database itself is
// unreachable or not ready" — as opposed to a bug in our own logic. These
// are operational, not programming, errors: the honest thing to tell the
// citizen is "the service is temporarily unavailable", not a generic
// "something went wrong" that hides whether Postgres is even running.
const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',    // nothing listening on the DB port (Postgres not running)
  'ENOTFOUND',       // DB host doesn't resolve
  'ETIMEDOUT',       // DB host reachable but not answering
  'ECONNRESET',      // connection dropped mid-query
  '57P03',           // postgres: cannot_connect_now (still starting up)
  '3D000',           // postgres: invalid_catalog_name (database does not exist)
  '28P01',           // postgres: invalid_password
  '28000',           // postgres: invalid_authorization_specification
]);

/**
 * Node's pg driver surfaces multi-address connect failures as an
 * AggregateError whose own `.message` is an empty string, with the real
 * codes buried in `.errors[]`. Dig the first meaningful code out so logs
 * and classification aren't blank. Falls back to the top-level code.
 */
function extractDbCode(err) {
  if (err && err.code) return err.code;
  if (err && Array.isArray(err.errors)) {
    const withCode = err.errors.find((e) => e && e.code);
    if (withCode) return withCode.code;
  }
  return undefined;
}

function sendError(res, err) {
  if (err instanceof AuthError) {
    return res.status(STATUS_BY_CODE[err.code] || 400).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  const dbCode = extractDbCode(err);

  // Database unreachable → 503, with a code the frontend can render as a
  // calm "try again shortly". We name the cause in the SERVER log (safe —
  // it never goes to the client) so the next signup failure shows the real
  // reason (e.g. ECONNREFUSED = Postgres not running) at a glance.
  if (dbCode && DB_UNAVAILABLE_CODES.has(dbCode)) {
    console.error(
      `[auth] Database unavailable during request (code=${dbCode}). ` +
      'Is PostgreSQL running and migrated? See gateway/.env DB_* settings.'
    );
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable. Please try again shortly.',
      },
    });
  }

  // Genuinely unexpected — log the full error (stack + code) server-side so
  // it's never silently swallowed again, but don't leak internals to the
  // client. `err.message` alone was empty for AggregateErrors, which is why
  // earlier logs were blank; log the whole object.
  console.error('[auth] Unexpected error:', err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
}

function createAuthController(authService) {
  return {
    async register(req, res) {
      try {
        const { full_name: fullName, email, password } = req.body || {};
        const result = await authService.register({ fullName, email, password });
        return res.status(201).json({ success: true, data: result, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },

    async login(req, res) {
      try {
        const { email, password } = req.body || {};
        const result = await authService.login({ email, password });
        return res.status(200).json({ success: true, data: result, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },
  };
}

module.exports = { createAuthController };
