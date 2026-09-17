'use strict';

const express = require('express');
const router  = express.Router();

const { getRegistration } = require('../controllers/registrationController');
const { referenceParamValidator } = require('../middleware/validation');
const gatewayAuthMiddleware = require('../middleware/gatewayAuthMiddleware');

/**
 * GET /api/v1/gateway/registrations/:reference
 * Service-to-service lookup for Setu Gateway.
 * Protected by X-Gateway-Key header.
 * Returns masked registration data.
 */
router.get(
  '/registrations/:reference',
  gatewayAuthMiddleware,
  referenceParamValidator,
  getRegistration
);

module.exports = router;
