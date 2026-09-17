'use strict';

const db = require('../config/db');

/**
 * Permitted audit event types — must match the CHECK constraint in schema.sql.
 */
const AUDIT_EVENTS = {
  ADMIN_LOGIN_SUCCESS:   'ADMIN_LOGIN_SUCCESS',
  ADMIN_LOGIN_FAILED:    'ADMIN_LOGIN_FAILED',
  REGISTRATION_CREATED:  'REGISTRATION_CREATED',
  REGISTRATION_DUPLICATE:'REGISTRATION_DUPLICATE',
  REGISTRATION_FETCHED:  'REGISTRATION_FETCHED',
  REGISTRATION_SEARCH:   'REGISTRATION_SEARCH',
  VERIFICATION_REQUESTED:'VERIFICATION_REQUESTED',
  VERIFICATION_RESULT:   'VERIFICATION_RESULT',
  UNAUTHORIZED_ACCESS:   'UNAUTHORIZED_ACCESS',
  RATE_LIMIT_EXCEEDED:   'RATE_LIMIT_EXCEEDED',
  VALIDATION_FAILED:     'VALIDATION_FAILED',
};

/**
 * Write an audit log entry to the database.
 *
 * IMPORTANT: Never pass raw licence numbers or Jan Aadhaar IDs into this function.
 * Use masked identifiers and registration references only.
 *
 * @param {object} opts
 * @param {string}  opts.eventType        - One of AUDIT_EVENTS values
 * @param {string}  [opts.registrationRef] - Registration reference (REG-XXXXXXXX)
 * @param {string}  [opts.maskedIdentifier]- Masked sensitive identifier for context
 * @param {number}  [opts.adminId]         - Admin ID if action is by an admin
 * @param {string}  [opts.ipAddress]       - Requester IP (log for security; not PII-critical)
 * @param {string}  [opts.userAgent]       - User-agent string
 * @param {object}  [opts.details]         - Additional safe JSONB details
 */
async function logAuditEvent({
  eventType,
  registrationRef = null,
  maskedIdentifier = null,
  adminId = null,
  ipAddress = null,
  userAgent = null,
  details = null,
}) {
  if (!AUDIT_EVENTS[eventType]) {
    console.error(`[audit] Unknown event type attempted: ${eventType}`);
    return;
  }

  try {
    await db.query(
      `INSERT INTO audit_logs
         (event_type, registration_ref, masked_identifier, admin_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        eventType,
        registrationRef,
        maskedIdentifier,
        adminId,
        ipAddress,
        userAgent ? userAgent.slice(0, 500) : null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    // Audit log failure must never crash the main request
    console.error('[audit] Failed to write audit log:', err.message);
  }
}

/**
 * Helper to extract IP from express request.
 * Respects X-Forwarded-For only if you trust the proxy chain.
 */
function getRequestIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

module.exports = { logAuditEvent, getRequestIp, AUDIT_EVENTS };
