'use strict';

/**
 * Officials/admin read controller (Phase A). Thin HTTP layer over
 * adminService: pulls filters off the query string, returns the standard
 * { success, data, error } envelope, and maps typed errors to status codes
 * (same pattern as consent-controller). All routes here sit behind
 * requireAdmin, so authorisation is already handled by the time we're here.
 */

const { AdminError } = require('../services/admin-service');

const STATUS_BY_CODE = { VALIDATION: 400 };

function sendError(res, err) {
  if (err instanceof AdminError) {
    return res.status(STATUS_BY_CODE[err.code] || 400).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  console.error('[admin] Unexpected error:', err.message);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
}

function createAdminController(adminService) {
  return {
    async stats(req, res) {
      try {
        const data = await adminService.getStats();
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },

    async trend(req, res) {
      try {
        const data = await adminService.getTrend({ hours: req.query.hours });
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },

    async listApplications(req, res) {
      try {
        const data = await adminService.listApplications({
          status: req.query.status,
          department: req.query.department,
        });
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },

    async listAuditLog(req, res) {
      try {
        const data = await adminService.listAuditLog({
          action: req.query.action,
          citizenId: req.query.citizen_id,
          limit: req.query.limit,
        });
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },

    async deleteTestCitizens(req, res) {
      try {
        const data = await adminService.deleteTestCitizens({
          emailPrefix: req.query.email_prefix,
        });
        return res.status(200).json({ success: true, data: { deleted: data, count: data.length }, error: null });
      } catch (err) {
        return sendError(res, err);
      }
    },
  };
}

module.exports = { createAdminController };
