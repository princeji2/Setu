'use strict';

/**
 * Applications routes (Layer 1, auth-protected). Mounted at
 * /api/v1/applications.
 *
 *   POST /            -> create application (201)
 *   GET  /            -> list this citizen's applications (200)
 *   GET  /:id         -> one application + its department-call history (200/404)
 *   POST /:id/verify  -> relay to the department, enforcing consent (200/403/404)
 */

const express = require('express');
const { requireAuth } = require('../middleware/require-auth');
const { createApplicationController } = require('../controllers/application-controller');
const { createRelayController } = require('../controllers/relay-controller');

function createApplicationsRouter(applicationService, relayService) {
  const router = express.Router();
  const controller = createApplicationController(applicationService);
  const relayController = createRelayController(relayService);

  router.use(requireAuth);
  router.post('/', (req, res) => controller.create(req, res));
  router.get('/', (req, res) => controller.list(req, res));
  router.get('/:id', (req, res) => controller.getById(req, res));
  router.post('/:id/verify', (req, res) => relayController.verify(req, res));

  return router;
}

module.exports = { createApplicationsRouter };
