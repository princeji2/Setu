'use strict';

/**
 * Application lifecycle service (Phase 2 scope: create / list / read).
 * No department calls yet — an application is created as `submitted` and
 * stays there until Phase 3 relay logic moves it forward.
 *
 * Errors thrown with a `.code` mapped to HTTP status by the controller:
 *   VALIDATION -> 400, NOT_FOUND -> 404
 */

class ApplicationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

const crypto = require('crypto');

// Known application types (from database-schema.md examples). Kept as a
// permissive allow-list so adding a type is a one-line change.
const KNOWN_TYPES = new Set([
  'pan_verification',
  'pan_card_verification',
  'income_certificate_verification',
  'identity_verification',
  'voter_id_verification',
  'birth_certificate_verification',
  'driving_licence_registration',
  'vehicle_rc_verification',
  'passport_verification',
  'senior_citizen_transport_concession',
]);

const COMPOSITE_APPLICATION_TYPES = new Set([
  'senior_citizen_transport_concession',
]);

function toPublicApplication(row, calls = []) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    composite_workflow_id: row.composite_workflow_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    department_calls: calls.map((c) => ({
      department: c.department,
      endpoint_called: c.endpoint_called,
      status_code: c.status_code,
      succeeded: c.succeeded,
      response_summary: c.response_summary,
      called_at: c.called_at,
      duration_ms: c.duration_ms,
      composite_workflow_id: c.composite_workflow_id || null,
    })),
  };
}

function createApplicationService({ applicationRepository, auditRepository }) {
  return {
    async create({ citizenId, type }) {
      if (!type || !String(type).trim()) {
        throw new ApplicationError('VALIDATION', 'type is required.');
      }
      if (!KNOWN_TYPES.has(type)) {
        throw new ApplicationError(
          'VALIDATION',
          `Unknown application type "${type}". Expected one of: ${[...KNOWN_TYPES].join(', ')}.`
        );
      }

      const compositeWorkflowId = COMPOSITE_APPLICATION_TYPES.has(type)
        ? crypto.randomUUID()
        : null;

      const row = await applicationRepository.create({
        citizenId,
        type,
        compositeWorkflowId,
      });

      const auditDetail = { application_id: row.id, type };
      if (compositeWorkflowId) {
        auditDetail.composite_workflow_id = compositeWorkflowId;
      }

      await auditRepository.record({
        citizenId,
        action: 'application_created',
        detail: auditDetail,
      });
      return toPublicApplication(row);
    },

    async list({ citizenId }) {
      const rows = await applicationRepository.listByCitizen(citizenId);
      return rows.map((r) => toPublicApplication(r));
    },

    async getById({ citizenId, id }) {
      const row = await applicationRepository.findByIdForCitizen(id, citizenId);
      if (!row) {
        throw new ApplicationError('NOT_FOUND', 'Application not found.');
      }
      const calls = await applicationRepository.findCallsByApplication(id);
      return toPublicApplication(row, calls);
    },
  };
}

module.exports = { createApplicationService, ApplicationError, toPublicApplication, KNOWN_TYPES };
