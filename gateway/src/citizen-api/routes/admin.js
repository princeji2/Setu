'use strict';

/**
 * Admin/officials read router (Phase A). Mounted at /api/v1/admin and gated
 * by requireAdmin (X-Admin-Key) — a separate credential from the citizen
 * JWT, never require-auth. Every route here is read-only.
 *
 *   GET /stats         -> aggregate numbers for the officials dashboard (200)
 *   GET /stats/trend   -> hourly time-series of calls/failures/success_rate (200)
 *                         filter: ?hours= (default 24, capped 168)
 *   GET /applications  -> all applications across all citizens (200)
 *                         filters: ?status=, ?department=
 *   GET /audit-log     -> the audit trail, newest first (200)
 *                         filters: ?action=, ?citizen_id=, ?limit=
 *
 * Bad filter values -> 400 VALIDATION. Missing key -> 401, wrong key -> 403
 * (handled by requireAdmin before any handler runs).
 */

const express = require('express');
const { requireAdmin } = require('../middleware/require-admin');
const { createAdminController } = require('../controllers/admin-controller');

function createAdminRouter(adminService) {
  const router = express.Router();
  const controller = createAdminController(adminService);

  router.use(requireAdmin);
  router.get('/stats', (req, res) => controller.stats(req, res));
  router.get('/stats/trend', (req, res) => controller.trend(req, res));
  router.get('/applications', (req, res) => controller.listApplications(req, res));
  router.get('/audit-log', (req, res) => controller.listAuditLog(req, res));

  return router;
}

module.exports = { createAdminRouter };
