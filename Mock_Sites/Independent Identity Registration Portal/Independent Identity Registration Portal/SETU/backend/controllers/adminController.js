const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const RegistrationService = require('../services/registrationService');
const AuditService = require('../services/auditService');

/**
 * Handles admin authentication
 * Route: POST /api/admin/login
 */
async function adminLogin(req, res, next) {
  try {
    const { username, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

    // 1. Look up admin in PostgreSQL
    const sql = 'SELECT id, username, password_hash FROM admins WHERE username = $1';
    const result = await query(sql, [username]);

    if (result.rowCount === 0) {
      await AuditService.logEvent('ADMIN_LOGIN_FAILED', { username, reason: 'user_not_found' }, clientIp);
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials.',
      });
    }

    const admin = result.rows[0];

    // 2. Verify bcrypt password hash
    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      await AuditService.logEvent('ADMIN_LOGIN_FAILED', { username, reason: 'invalid_password' }, clientIp);
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials.',
      });
    }

    // 3. Generate JWT token
    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // 4. Log successful login
    await AuditService.logEvent('ADMIN_LOGIN', { adminId: admin.id, username: admin.username }, clientIp);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      token,
      admin: {
        username: admin.username,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves metrics for Admin Dashboard
 * Route: GET /api/admin/dashboard-stats
 */
async function getDashboardStats(req, res, next) {
  try {
    const [regStats, auditTotal] = await Promise.all([
      RegistrationService.getStats(),
      AuditService.getTotalCount(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalRegistrations: regStats.totalRegistrations,
        registrationsToday: regStats.registrationsToday,
        totalAuditEvents: auditTotal,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves paginated registrations list with search
 * Route: GET /api/admin/registrations
 */
async function getRegistrations(req, res, next) {
  try {
    const searchTerm = req.query.search || '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const registrations = await RegistrationService.searchRegistrations({
      searchTerm,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      data: registrations,
      pagination: {
        limit,
        offset,
        count: registrations.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves audit log entries
 * Route: GET /api/admin/audit-logs
 */
async function getAuditLogs(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const logs = await AuditService.getRecentLogs(limit, offset);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        limit,
        offset,
        count: logs.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminLogin,
  getDashboardStats,
  getRegistrations,
  getAuditLogs,
};
