'use strict';

const express = require('express');
const router  = express.Router();

const { getRegistration, getVehicleRc, getPassport } = require('../controllers/registrationController');
const { referenceParamValidator } = require('../middleware/validation');
const gatewayAuthMiddleware = require('../middleware/gatewayAuthMiddleware');

/**
 * GET /api/v1/gateway/registrations/:reference
 * Service-to-service lookup for Setu Gateway (Driving Licence).
 * Protected by X-Gateway-Key header.
 */
router.get(
  '/registrations/:reference',
  gatewayAuthMiddleware,
  referenceParamValidator,
  getRegistration
);

/**
 * GET /api/v1/gateway/vehicle-rc/:reference
 * Service-to-service lookup for Vehicle Registration Certificate.
 * Protected by X-Gateway-Key header.
 */
router.get(
  '/vehicle-rc/:reference',
  gatewayAuthMiddleware,
  referenceParamValidator,
  getVehicleRc
);

/**
 * GET /api/v1/gateway/passport/:reference
 * Service-to-service lookup for Passport.
 * Protected by X-Gateway-Key header.
 */
router.get(
  '/passport/:reference',
  gatewayAuthMiddleware,
  referenceParamValidator,
  getPassport
);

module.exports = router;

