'use strict';

/**
 * Data access for `audit_log` — the append-only trail. Every notable
 * gateway action lands here. In Phase 2 we record application creation,
 * consent grants, and (later) status changes. Department calls are
 * summarised here in Phase 3.
 */

const crypto = require('crypto');
const { query } = require('../../db/pool');

const pgAuditRepository = {
  async record({ citizenId = null, action, detail = null }) {
    const res = await query(
      `INSERT INTO audit_log (citizen_id, action, detail)
       VALUES ($1, $2, $3)
       RETURNING id, citizen_id, action, detail, occurred_at`,
      [citizenId, action, detail == null ? null : JSON.stringify(detail)]
    );
    return res.rows[0];
  },
};

function createInMemoryAuditRepository() {
  const entries = [];

  return {
    async record({ citizenId = null, action, detail = null }) {
      const row = {
        id: crypto.randomUUID(),
        citizen_id: citizenId,
        action,
        detail: detail == null ? null : JSON.stringify(detail),
        occurred_at: new Date().toISOString(),
      };
      entries.push(row);
      return row;
    },

    // test helper
    _all() {
      return entries;
    },
    _reset() {
      entries.length = 0;
    },
  };
}

module.exports = { pgAuditRepository, createInMemoryAuditRepository };
