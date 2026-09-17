'use strict';

const jwt    = require('jsonwebtoken');
const config = require('../config/env');

/**
 * JWT authentication middleware for protected admin routes.
 * Attaches decoded payload to req.admin on success.
 */
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error:   'Authentication required.',
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret);

    // Only attach safe, non-sensitive fields to req.admin
    req.admin = {
      id:       payload.id,
      username: payload.username,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, error: 'Invalid authentication token.' });
  }
}

const gatewayAuthMiddleware = require('./gatewayAuthMiddleware');

module.exports = { authenticateAdmin, gatewayAuthMiddleware };
