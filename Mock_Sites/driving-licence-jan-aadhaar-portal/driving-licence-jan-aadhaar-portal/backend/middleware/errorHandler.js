'use strict';

const config = require('../config/env');

/**
 * Centralised error handler.
 * In production, never expose stack traces or internal error details to clients.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isDev = config.env === 'development';

  // Log internally — but mask any PII-like values in the message
  const safeMessage = err.message ? err.message.replace(/\d{8,}/g, '[REDACTED]') : 'Internal error';
  console.error(`[error] ${req.method} ${req.path} — ${safeMessage}`);

  if (isDev) {
    console.error(err.stack);
  }

  // Handle known error types
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, error: 'Unauthorised.' });
  }

  if (err.code === '23505') {
    // PostgreSQL unique violation
    return res.status(409).json({
      success: false,
      error:   'This document information is already registered.',
    });
  }

  // Default 500
  return res.status(500).json({
    success: false,
    error:   isDev ? safeMessage : 'An internal server error occurred.',
  });
}

/**
 * 404 handler — must be registered after all routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
}

module.exports = { errorHandler, notFoundHandler };
