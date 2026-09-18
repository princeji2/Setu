'use strict';

/**
 * Citizen-facing auth routes (Layer 1).
 * Mounted at /api/v1/auth by the app factory.
 *
 *   POST /register  -> create citizen (201) | duplicate (409) | invalid (400)
 *   POST /login     -> issue gateway JWT (200) | bad creds (401) | invalid (400)
 */

const express = require('express');
const { createAuthController } = require('../controllers/auth-controller');

function createAuthRouter(authService) {
  const router = express.Router();
  const controller = createAuthController(authService);

  router.post('/register', (req, res) => controller.register(req, res));
  router.post('/login', (req, res) => controller.login(req, res));

  return router;
}

module.exports = { createAuthRouter };
