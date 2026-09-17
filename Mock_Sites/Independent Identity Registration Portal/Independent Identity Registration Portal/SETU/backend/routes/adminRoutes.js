const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  adminLogin,
  getDashboardStats,
  getRegistrations,
  getAuditLogs,
} = require('../controllers/adminController');
const { validateAdminLogin } = require('../middleware/validationMiddleware');
const { authenticateAdminToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Strict rate limiter for admin login attempts: 10 attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  },
});

/**
 * @route   POST /api/admin/login
 * @desc    Authenticate admin and return JWT
 * @access  Public (Rate limited)
 */
router.post('/login', loginLimiter, validateAdminLogin, adminLogin);

/**
 * @route   GET /api/admin/dashboard-stats
 * @desc    Retrieve counts and status metrics
 * @access  Protected (Admin JWT required)
 */
router.get('/dashboard-stats', authenticateAdminToken, getDashboardStats);

/**
 * @route   GET /api/admin/registrations
 * @desc    List & search registrations
 * @access  Protected (Admin JWT required)
 */
router.get('/registrations', authenticateAdminToken, getRegistrations);

/**
 * @route   GET /api/admin/audit-logs
 * @desc    List system and security audit entries
 * @access  Protected (Admin JWT required)
 */
router.get('/audit-logs', authenticateAdminToken, getAuditLogs);

module.exports = router;
