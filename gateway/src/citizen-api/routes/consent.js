'use strict';

/**
 * Consent route (Layer 1, auth-protected). Mounted at /api/v1/consent.
 *
 *   POST /  -> record a consent_grants row (201) | invalid (400) | app not found (404)
 */

const express = require('express');
const { requireAuth } = require('../middleware/require-auth');
const { createConsentController } = require('../controllers/consent-controller');

function createConsentRouter(consentService) {
  const router = express.Router();
  const controller = createConsentController(consentService);

  router.use(requireAuth);
  router.post('/', (req, res) => controller.grant(req, res));

  return router;
}

module.exports = { createConsentRouter };
