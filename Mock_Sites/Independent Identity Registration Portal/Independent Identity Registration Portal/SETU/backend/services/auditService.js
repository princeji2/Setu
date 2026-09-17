const { query } = require('../config/database');

/**
 * Service to log security and system events to the PostgreSQL audit_logs table.
 * Strips/masks sensitive fields to ensure privacy compliance.
 */
class AuditService {
  /**
   * Records an audit entry in PostgreSQL
   * @param {string} eventType - The classification of the event (e.g., REGISTRATION_CREATED)
   * @param {Object} metadata - Contextual data associated with the event
   * @param {string} ipAddress - Client IP address
   */
  static async logEvent(eventType, metadata = {}, ipAddress = '127.0.0.1') {
    try {
      // Mask any potential sensitive keys if passed
      const sanitizedMeta = { ...metadata };
      if (sanitizedMeta.password) delete sanitizedMeta.password;
      if (sanitizedMeta.token) delete sanitizedMeta.token;

      const sql = `
        INSERT INTO audit_logs (event_type, metadata, ip_address, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        RETURNING id, event_type, created_at;
      `;

      await query(sql, [eventType, JSON.stringify(sanitizedMeta), ipAddress]);
    } catch (err) {
      // Audit logging errors should not crash main transactions, but should be logged server-side
      console.error('[AUDIT LOGGING ERROR]: Failed to persist audit event:', err.message);
    }
  }

  /**
   * Retrieves recent audit logs for administrative inspection
   * @param {number} limit
   * @param {number} offset
   */
  static async getRecentLogs(limit = 50, offset = 0) {
    const sql = `
      SELECT id, event_type, metadata, ip_address, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const res = await query(sql, [limit, offset]);
    return res.rows;
  }

  /**
   * Total count of audit log entries
   */
  static async getTotalCount() {
    const sql = `SELECT COUNT(*)::int as total FROM audit_logs;`;
    const res = await query(sql, []);
    return res.rows[0].total;
  }
}

module.exports = AuditService;
