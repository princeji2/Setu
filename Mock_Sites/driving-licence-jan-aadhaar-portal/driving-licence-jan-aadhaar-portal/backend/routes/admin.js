'use strict';

const express = require('express');
const router  = express.Router();

const {
  adminLogin,
  getAllRegistrations,
  searchRegistrations,
  getDashboardStats,
  getAuditLogs,
} = require('../controllers/adminController');

const { authenticateAdmin }   = require('../middleware/auth');
const { adminLoginValidators, searchValidator } = require('../middleware/validation');
const { authLimiter }         = require('../middleware/rateLimiting');

/**
 * POST /api/v1/admin/login
 * Authenticate admin and receive a JWT.
 */
router.post('/login', authLimiter, adminLoginValidators, adminLogin);

// ── All routes below require a valid JWT ─────────────────────

/**
 * GET /api/v1/admin/registrations/search?q=
 * Must be registered BEFORE /:id-style routes to avoid param collision.
 */
router.get('/registrations/search', authenticateAdmin, searchValidator, searchRegistrations);

/**
 * GET /api/v1/admin/registrations
 * Paginated list of all registrations (masked).
 */
router.get('/registrations', authenticateAdmin, getAllRegistrations);

/**
 * GET /api/v1/admin/stats
 * Dashboard statistics.
 */
router.get('/stats', authenticateAdmin, getDashboardStats);

/**
 * GET /api/v1/admin/audit-logs
 * Paginated audit log viewer.
 */
router.get('/audit-logs', authenticateAdmin, getAuditLogs);

module.exports = router;
