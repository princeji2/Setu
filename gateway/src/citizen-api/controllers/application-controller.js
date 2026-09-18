'use strict';

const { ApplicationError } = require('../services/application-service');

const STATUS_BY_CODE = { VALIDATION: 400, NOT_FOUND: 404 };

function sendError(res, err) {
  if (err instanceof ApplicationError) {
    return res.status(STATUS_BY_CODE[err.code] || 400).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  console.error('[applications] Unexpected error:', err.message);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
}

function createApplicationController(applicationService) {
  return {
    async create(req, res) {
      try {
        const { type } = req.body || {};
        const data = await applicationService.create({ citizenId: req.citizen.id, type });
        return res.status(201).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },

    async list(req, res) {
      try {
        const data = await applicationService.list({ citizenId: req.citizen.id });
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },

    async getById(req, res) {
      try {
        const data = await applicationService.getById({
          citizenId: req.citizen.id,
          id: req.params.id,
        });
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },
  };
}

module.exports = { createApplicationController };
