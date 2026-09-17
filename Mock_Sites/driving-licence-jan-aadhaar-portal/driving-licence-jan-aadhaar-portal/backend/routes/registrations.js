'use strict';

const express  = require('express');
const router   = express.Router();

const { createRegistration, getRegistration } = require('../controllers/registrationController');
const { registrationValidators, referenceParamValidator } = require('../middleware/validation');
const { registrationLimiter } = require('../middleware/rateLimiting');

/**
 * POST /api/v1/registrations
 * Submit a new Driving Licence + Jan Aadhaar registration.
 */
router.post(
  '/',
  registrationLimiter,
  registrationValidators,
  createRegistration
);

/**
 * GET /api/v1/registrations/:reference
 * Look up a registration by its reference ID.
 * Returns masked sensitive fields.
 */
router.get(
  '/:reference',
  referenceParamValidator,
  getRegistration
);

module.exports = router;
