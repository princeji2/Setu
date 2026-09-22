'use strict';

/**
 * Data access for `applications` and their `application_department_calls`
 * history. pg + in-memory implementations behind one interface (same
 * pattern as citizen-repository).
 *
 * Phase 2 note: application_department_calls is NOT written here yet —
 * that begins in Phase 3 (department clients). findCallsByApplication is
 * provided now so GET /applications/:id can return an (empty) history.
 */

const crypto = require('crypto');
const { query } = require('../../db/pool');

// ------------------------------------------------------------
// PostgreSQL-backed
// ------------------------------------------------------------
const pgApplicationRepository = {
  async create({ citizenId, type, compositeWorkflowId = null }) {
    const res = await query(
      `INSERT INTO applications (citizen_id, type, composite_workflow_id)
       VALUES ($1, $2, $3)
       RETURNING id, citizen_id, type, status, composite_workflow_id, created_at, updated_at`,
      [citizenId, type, compositeWorkflowId]
    );
    return res.rows[0];
  },

  async listByCitizen(citizenId) {
    const res = await query(
      `SELECT id, citizen_id, type, status, composite_workflow_id, created_at, updated_at
       FROM applications
       WHERE citizen_id = $1
       ORDER BY created_at DESC`,
      [citizenId]
    );
    return res.rows;
  },

  async findByIdForCitizen(id, citizenId) {
    const res = await query(
      `SELECT id, citizen_id, type, status, composite_workflow_id, created_at, updated_at
       FROM applications
       WHERE id = $1 AND citizen_id = $2`,
      [id, citizenId]
    );
    return res.rows[0] || null;
  },

  async updateStatus(id, status) {
    const res = await query(
      `UPDATE applications SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, citizen_id, type, status, composite_workflow_id, created_at, updated_at`,
      [id, status]
    );
    return res.rows[0] || null;
  },

  async recordCall({
    applicationId, department, endpointCalled, statusCode,
    succeeded, responseSummary, durationMs, compositeWorkflowId = null,
    matchConfidence = null,
  }) {
    const res = await query(
      `INSERT INTO application_department_calls
         (application_id, department, endpoint_called, status_code, succeeded, response_summary, duration_ms, composite_workflow_id, match_confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, application_id, department, endpoint_called, status_code,
                 succeeded, response_summary, called_at, duration_ms, composite_workflow_id, match_confidence`,
      [applicationId, department, endpointCalled, statusCode ?? null,
       succeeded, responseSummary ?? null, durationMs ?? null, compositeWorkflowId, matchConfidence]
    );
    return res.rows[0];
  },

  async findCallsByApplication(applicationId) {
    const res = await query(
      `SELECT id, application_id, department, endpoint_called, status_code,
              succeeded, response_summary, called_at, duration_ms, composite_workflow_id, match_confidence
       FROM application_department_calls
       WHERE application_id = $1
       ORDER BY called_at ASC`,
      [applicationId]
    );
    return res.rows;
  },
};

// ------------------------------------------------------------
// In-memory (tests)
// ------------------------------------------------------------
function createInMemoryApplicationRepository() {
  const applications = new Map();          // id -> row
  const calls = [];                        // department-call rows

  return {
    async create({ citizenId, type, compositeWorkflowId = null }) {
      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        citizen_id: citizenId,
        type,
        status: 'submitted',
        composite_workflow_id: compositeWorkflowId,
        created_at: now,
        updated_at: now,
      };
      applications.set(row.id, row);
      return row;
    },

    async listByCitizen(citizenId) {
      return [...applications.values()]
        .filter((a) => a.citizen_id === citizenId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },

    async findByIdForCitizen(id, citizenId) {
      const row = applications.get(id);
      return row && row.citizen_id === citizenId ? row : null;
    },

    async updateStatus(id, status) {
      const row = applications.get(id);
      if (!row) return null;
      row.status = status;
      row.updated_at = new Date().toISOString();
      return row;
    },

    async recordCall({
      applicationId, department, endpointCalled, statusCode,
      succeeded, responseSummary, durationMs, compositeWorkflowId = null,
      matchConfidence = null,
    }) {
      const row = {
        id: crypto.randomUUID(),
        application_id: applicationId,
        department,
        endpoint_called: endpointCalled,
        status_code: statusCode ?? null,
        succeeded,
        response_summary: responseSummary ?? null,
        called_at: new Date().toISOString(),
        duration_ms: durationMs ?? null,
        composite_workflow_id: compositeWorkflowId,
        match_confidence: matchConfidence ?? null,
      };
      calls.push(row);
      return row;
    },

    async findCallsByApplication(applicationId) {
      return calls.filter((c) => c.application_id === applicationId);
    },

    _reset() {
      applications.clear();
      calls.length = 0;
    },
  };
}

module.exports = { pgApplicationRepository, createInMemoryApplicationRepository };
