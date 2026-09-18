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

function sendError(res, err) {
  if (err instanceof AuthError) {
    return res.status(STATUS_BY_CODE[err.code] || 400).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  // Unexpected — don't leak internals.
  console.error('[auth] Unexpected error:', err.message);
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
