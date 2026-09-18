'use strict';

/**
 * Documents service — the "My documents" view. Returns the citizen's
 * linked_references: which department each reference belongs to and
 * whether it's been verified. Holds references only, never department
 * source data (see database-schema.md).
 */

function toPublicReference(row) {
  return {
    department: row.department,
    department_reference: row.department_reference,
    verified: row.verified,
    linked_at: row.linked_at,
  };
}

function createDocumentsService({ linkedReferenceRepository }) {
  return {
    async list({ citizenId }) {
      const rows = await linkedReferenceRepository.listByCitizen(citizenId);
      return rows.map(toPublicReference);
    },
  };
}

module.exports = { createDocumentsService, toPublicReference };
