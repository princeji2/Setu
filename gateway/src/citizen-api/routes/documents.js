'use strict';

/**
 * Documents route (Layer 1, auth-protected). Mounted at /api/v1/documents.
 *
 *   GET /  -> this citizen's linked_references (200)
 */

const express = require('express');
const { requireAuth } = require('../middleware/require-auth');
const { createDocumentsController } = require('../controllers/documents-controller');

function createDocumentsRouter(documentsService) {
  const router = express.Router();
  const controller = createDocumentsController(documentsService);

  router.use(requireAuth);
  router.get('/', (req, res) => controller.list(req, res));

  return router;
}

module.exports = { createDocumentsRouter };
