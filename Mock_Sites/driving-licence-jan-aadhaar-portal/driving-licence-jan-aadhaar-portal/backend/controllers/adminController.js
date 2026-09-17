'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');
const config = require('../config/env');
const { maskRegistration } = require('../utils/masking');
const { logAuditEvent, getRequestIp, AUDIT_EVENTS } = require('../utils/auditLogger');

// ============================================================
// POST /api/v1/admin/login
// ============================================================
async function adminLogin(req, res, next) {
  const { username, password } = req.body;
  const ip        = getRequestIp(req);
  const userAgent = req.headers['user-agent'] || null;

  try {
    const result = await db.query(
      `SELECT id, username, email, password_hash, is_active
         FROM admins
        WHERE username = $1
        LIMIT 1`,
      [username.trim()]
    );

    // Use constant-time comparison regardless of whether user exists
    const admin         = result.rows[0];
    const dummyHash     = '$2a$12$invalidhashfortimingnormalization00000000000000000000';
    const hashToCompare = admin ? admin.password_hash : dummyHash;
    const passwordMatch = await bcrypt.compare(password, hashToCompare);

    if (!admin || !passwordMatch || !admin.is_active) {
      await logAuditEvent({
        eventType: AUDIT_EVENTS.ADMIN_LOGIN_FAILED,
        ipAddress: ip,
        userAgent,
        details:   { username: username.trim() },
      });

      // Generic error — do not reveal whether username or password was wrong
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // Update last login timestamp
    await db.query(`UPDATE admins SET last_login_at = NOW() WHERE id = $1`, [admin.id]);

    // Issue JWT — payload contains only non-sensitive admin identifiers
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    await logAuditEvent({
      eventType: AUDIT_EVENTS.ADMIN_LOGIN_SUCCESS,
      adminId:   admin.id,
      ipAddress: ip,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      token,
      admin: { id: admin.id, username: admin.username, email: admin.email },
    });

  } catch (err) {
    return next(err);
  }
}

// ============================================================
// GET /api/v1/admin/registrations
// ============================================================
async function getAllRegistrations(req, res, next) {
  const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  try {
    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM registrations ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      db.query(`SELECT COUNT(*) AS total FROM registrations`),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    return res.status(200).json({
      success: true,
      data: {
        registrations: dataResult.rows.map(maskRegistration),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });

  } catch (err) {
    return next(err);
  }
}

// ============================================================
// GET /api/v1/admin/registrations/search?q=
// ============================================================
async function searchRegistrations(req, res, next) {
  const q         = (req.query.q || '').trim();
  const ip        = getRequestIp(req);
  const userAgent = req.headers['user-agent'] || null;

  await logAuditEvent({
    eventType: AUDIT_EVENTS.REGISTRATION_SEARCH,
    adminId:   req.admin?.id,
    ipAddress: ip,
    userAgent,
    // Never log the raw search query — it may contain document numbers
    details:   { queryLength: q.length },
  });

  try {
    if (!q) {
      return res.status(200).json({ success: true, data: { registrations: [] } });
    }

    const likeParam = `%${q}%`;
    const result = await db.query(
      `SELECT * FROM registrations
        WHERE registration_reference ILIKE $1
           OR licence_holder_name    ILIKE $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [likeParam]
    );

    return res.status(200).json({
      success: true,
      data: { registrations: result.rows.map(maskRegistration) },
    });

  } catch (err) {
    return next(err);
  }
}

// ============================================================
// GET /api/v1/admin/stats
// ============================================================
async function getDashboardStats(req, res, next) {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*)                                                            AS total_registrations,
        COUNT(*) FILTER (WHERE verification_status = 'FORMAT_VALID')       AS format_valid,
        COUNT(*) FILTER (WHERE verification_status = 'VERIFICATION_PENDING') AS pending_verification,
        COUNT(*) FILTER (WHERE verification_status = 'VERIFIED')           AS verified,
        COUNT(*) FILTER (WHERE verification_status = 'VERIFICATION_FAILED') AS verification_failed,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')  AS registrations_last_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')    AS registrations_last_7d
      FROM registrations
    `);

    const recentResult = await db.query(
      `SELECT registration_reference, licence_holder_name,
              licence_number, licence_issue_date,
              licence_valid_from, licence_expiry_date,
              jan_aadhaar_id, family_members_count,
              verification_status, created_at
         FROM registrations
        ORDER BY created_at DESC
        LIMIT 5`
    );

    const stats = result.rows[0];

    return res.status(200).json({
      success: true,
      data: {
        total_registrations:      parseInt(stats.total_registrations, 10),
        format_valid:             parseInt(stats.format_valid, 10),
        pending_verification:     parseInt(stats.pending_verification, 10),
        verified:                 parseInt(stats.verified, 10),
        verification_failed:      parseInt(stats.verification_failed, 10),
        registrations_last_24h:   parseInt(stats.registrations_last_24h, 10),
        registrations_last_7d:    parseInt(stats.registrations_last_7d, 10),
        recent_registrations:     recentResult.rows.map(maskRegistration),
      },
    });

  } catch (err) {
    return next(err);
  }
}

// ============================================================
// GET /api/v1/admin/audit-logs
// ============================================================
async function getAuditLogs(req, res, next) {
  const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  try {
    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT id, event_type, registration_ref, masked_identifier,
                admin_id, ip_address, details, created_at
           FROM audit_logs
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      db.query(`SELECT COUNT(*) AS total FROM audit_logs`),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    return res.status(200).json({
      success: true,
      data: {
        audit_logs: dataResult.rows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });

  } catch (err) {
    return next(err);
  }
}

module.exports = {
  adminLogin,
  getAllRegistrations,
  searchRegistrations,
  getDashboardStats,
  getAuditLogs,
};
