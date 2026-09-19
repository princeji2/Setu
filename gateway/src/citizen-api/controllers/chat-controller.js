'use strict';

const { ChatError } = require('../services/chat-service');

// ChatError.status is authoritative (set per code in the service); this map
// is just a fallback if a code ever arrives without one.
const STATUS_BY_CODE = {
  VALIDATION: 400,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  TIMEOUT: 504,
  UPSTREAM: 502,
};

function sendError(res, err) {
  if (err instanceof ChatError) {
    const status = err.status || STATUS_BY_CODE[err.code] || 502;
    return res.status(status).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  console.error('[chat] Unexpected error:', err.message);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
}

function createChatController(chatService) {
  return {
    async ask(req, res) {
      try {
        const { message, history } = req.body || {};
        const data = await chatService.ask({ message, history });
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },
  };
}

module.exports = { createChatController };
