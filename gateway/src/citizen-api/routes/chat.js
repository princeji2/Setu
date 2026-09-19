'use strict';

/**
 * Chat route (Layer 1). Mounted at /api/v1/chat.
 *
 *   POST /  -> proxy a visitor question to Gemini, return a grounded answer.
 *
 * PUBLIC — intentionally NOT behind requireAuth. The "Ask about Setu" widget
 * appears on the landing/auth screens before a citizen has logged in, so the
 * endpoint must answer without a token. It exposes no citizen data: it only
 * forwards a free-text question plus in-memory history to Gemini and returns
 * the reply. The Gemini key stays server-side (see chat-service.js).
 */

const express = require('express');
const { createChatController } = require('../controllers/chat-controller');

function createChatRouter(chatService) {
  const router = express.Router();
  const controller = createChatController(chatService);

  router.post('/', (req, res) => controller.ask(req, res));

  return router;
}

module.exports = { createChatRouter };
