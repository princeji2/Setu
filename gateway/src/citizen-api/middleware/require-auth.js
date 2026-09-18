'use strict';

/**
 * Auth middleware for Layer 1 (citizen-facing) protected routes.
 * Verifies the gateway-issued JWT from the Authorization: Bearer header
 * and attaches { id, email } to req.citizen.
 *
 * This is the SAME token issued by auth-service.issueToken (sub = citizen
 * id). It has nothing to do with any department's auth.
 *
 * Failure shape matches the rest of the API:
 *   401 { success:false, error:{ code:'UNAUTHENTICATED', message } }
 */

const jwt = require('jsonwebtoken');
const config = require('../../config/env');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Missing or malformed Authorization header.' },
    });
  }

  try {
    const payload = jwt.verify(match[1], config.auth.jwtSecret);
    req.citizen = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token.' },
    });
  }
}

module.exports = { requireAuth };
