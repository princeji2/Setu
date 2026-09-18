'use strict';

/**
 * Data access for `linked_references` — which department reference belongs
 * to which citizen, and whether it's been verified at least once.
 * Powers GET /api/v1/documents. Verification flips to true in Phase 3.
 */

const crypto = require('crypto');
const { query } = require('../../db/pool');

const pgLinkedReferenceRepository = {
  async listByCitizen(citizenId) {
    const res = await query(
      `SELECT id, citizen_id, department, department_reference, linked_at, verified
       FROM linked_references
       WHERE citizen_id = $1
       ORDER BY linked_at DESC`,
      [citizenId]
    );
    return res.rows;
  },

  /**
   * Find a citizen's already-verified reference for a department, if any.
   * Powers the reuse path (Story 8): when this returns a row, the gateway
   * can go straight to a fresh (still consented, still logged) fetch using
   * the stored `department_reference` instead of asking the citizen to
   * re-enter it. Returns null when there's nothing to reuse.
   */
  async findVerified({ citizenId, department }) {
    const res = await query(
      `SELECT id, citizen_id, department, department_reference, linked_at, verified
       FROM linked_references
       WHERE citizen_id = $1 AND department = $2 AND verified = true
       LIMIT 1`,
      [citizenId, department]
    );
    return res.rows[0] || null;
  },

  /**
   * Record (or update) a citizen's reference at a department and mark it
   * verified. One row per (citizen, department) — see the unique
   * constraint — so we upsert on conflict.
   */
  async markVerified({ citizenId, department, departmentReference }) {
    const res = await query(
      `INSERT INTO linked_references (citizen_id, department, department_reference, verified)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (citizen_id, department)
       DO UPDATE SET department_reference = EXCLUDED.department_reference,
                     verified = true
       RETURNING id, citizen_id, department, department_reference, linked_at, verified`,
      [citizenId, department, departmentReference]
    );
    return res.rows[0];
  },
};

function createInMemoryLinkedReferenceRepository(seed = []) {
  const rows = seed.map((r) => ({
    id: r.id || crypto.randomUUID(),
    citizen_id: r.citizen_id,
    department: r.department,
    department_reference: r.department_reference,
    linked_at: r.linked_at || new Date().toISOString(),
    verified: r.verified ?? false,
  }));

  return {
    async listByCitizen(citizenId) {
      return rows.filter((r) => r.citizen_id === citizenId);
    },

    async findVerified({ citizenId, department }) {
      return (
        rows.find(
          (r) => r.citizen_id === citizenId && r.department === department && r.verified === true
        ) || null
      );
    },

    async markVerified({ citizenId, department, departmentReference }) {
      let row = rows.find((r) => r.citizen_id === citizenId && r.department === department);
      if (row) {
        row.department_reference = departmentReference;
        row.verified = true;
        return row;
      }
      row = {
        id: crypto.randomUUID(),
        citizen_id: citizenId,
        department,
        department_reference: departmentReference,
        linked_at: new Date().toISOString(),
        verified: true,
      };
      rows.push(row);
      return row;
    },

    _reset() {
      rows.length = 0;
    },
  };
}

module.exports = { pgLinkedReferenceRepository, createInMemoryLinkedReferenceRepository };
