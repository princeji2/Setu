'use strict';

const { ConsentError } = require('../services/consent-service');

const STATUS_BY_CODE = { VALIDATION: 400, NOT_FOUND: 404 };

function sendError(res, err) {
  if (err instanceof ConsentError) {
    return res.status(STATUS_BY_CODE[err.code] || 400).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  console.error('[consent] Unexpected error:', err.message);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
}

function createConsentController(consentService) {
  return {
    async grant(req, res) {
      try {
        const { application_id: applicationId, department, fields_requested: fieldsRequested } =
          req.body || {};
        const data = await consentService.grant({
          citizenId: req.citizen.id,
          applicationId,
          department,
          fieldsRequested,
        });
        return res.status(201).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },
  };
}

module.exports = { createConsentController };
