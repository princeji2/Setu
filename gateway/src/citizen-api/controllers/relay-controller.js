'use strict';

const { RelayError } = require('../services/relay-service');

const STATUS_BY_CODE = {
  VALIDATION: 400,
  NO_CLIENT: 400,
  CONSENT_REQUIRED: 403,
  NOT_FOUND: 404,
};

function sendError(res, err) {
  if (err instanceof RelayError) {
    return res.status(STATUS_BY_CODE[err.code] || 400).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  console.error('[relay] Unexpected error:', err.message);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
}

function createRelayController(relayService) {
  return {
    async verify(req, res) {
      try {
        const { reference, references } = req.body || {};
        const data = await relayService.verify({
          citizenId: req.citizen.id,
          applicationId: req.params.id,
          reference,
          references,
        });
        // 200 whether the department verified or honestly failed — a
        // business-level failure is a normal outcome, not an HTTP error.
        // (Consent/ownership problems are the thrown 4xx cases above.)
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },
  };
}

module.exports = { createRelayController };
