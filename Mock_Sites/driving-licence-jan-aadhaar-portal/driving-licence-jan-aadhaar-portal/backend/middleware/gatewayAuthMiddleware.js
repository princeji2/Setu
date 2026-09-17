'use strict';

require('dotenv').config();
const config = require('../config/env');

/**
 * Service-to-service authentication middleware for Setu Gateway integration.
 * Verifies the static API key passed in the X-Gateway-Key header against GATEWAY_API_KEY.
 * Returns standardized error response shape: { success: false, data: null, error: string }
 */
function gatewayAuthMiddleware(req, res, next) {
  const configuredApiKey = config.gatewayApiKey || process.env.GATEWAY_API_KEY;
  const incomingApiKey = req.headers['x-gateway-key'];

  if (!incomingApiKey) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Access denied: Missing X-Gateway-Key header for gateway service authentication.',
    });
  }

  if (!configuredApiKey || incomingApiKey !== configuredApiKey) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Access denied: Invalid X-Gateway-Key provided.',
    });
  }

  // Record authenticated gateway client info for audit logging
  req.gateway = {
    authenticated: true,
    client: req.headers['x-gateway-client'] || 'Setu-Gateway',
  };

  next();
}

module.exports = gatewayAuthMiddleware;
