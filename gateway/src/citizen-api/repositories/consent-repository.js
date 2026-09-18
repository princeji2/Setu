'use strict';

/**
 * Data access for `consent_grants`. The gateway must find a matching row
 * here before making any department call (enforced in Phase 3) — so
 * findMatch is the authorization primitive, not just a write log.
 *
 * fields_requested is stored as JSON text; callers pass/receive arrays.
 */

const crypto = require('crypto');
const { query } = require('../../db/pool');

const pgConsentRepository = {
  async create({ citizenId, applicationId, department, fieldsRequested }) {
    const res = await query(
      `INSERT INTO consent_grants (citizen_id, application_id, department, fields_requested)
       VALUES ($1, $2, $3, $4)
       RETURNING id, citizen_id, application_id, department, fields_requested, granted_at`,
      [citizenId, applicationId, department, JSON.stringify(fieldsRequested)]
    );
    return res.rows[0];
  },

  async findMatch({ applicationId, department }) {
    const res = await query(
      `SELECT id, citizen_id, application_id, department, fields_requested, granted_at
       FROM consent_grants
       WHERE application_id = $1 AND department = $2
       ORDER BY granted_at DESC
       LIMIT 1`,
      [applicationId, department]
    );
    return res.rows[0] || null;
  },
};

function createInMemoryConsentRepository() {
  const grants = [];

  return {
    async create({ citizenId, applicationId, department, fieldsRequested }) {
      const row = {
        id: crypto.randomUUID(),
        citizen_id: citizenId,
        application_id: applicationId,
        department,
        fields_requested: JSON.stringify(fieldsRequested),
        granted_at: new Date().toISOString(),
      };
      grants.push(row);
      return row;
    },

    async findMatch({ applicationId, department }) {
      const matches = grants.filter(
        (g) => g.application_id === applicationId && g.department === department
      );
      return matches.length ? matches[matches.length - 1] : null;
    },

    _reset() {
      grants.length = 0;
    },
  };
}

module.exports = { pgConsentRepository, createInMemoryConsentRepository };
