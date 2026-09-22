'use strict';

/**
 * Documents service — the "My documents" view. Returns the citizen's
 * linked_references: which department each reference belongs to and
 * whether it's been verified. Holds references only, never department
 * source data (see database-schema.md).
 */

function toPublicReference(row) {
  let discrepancy = row.discrepancy;
  if (typeof discrepancy === 'string') {
    try {
      discrepancy = JSON.parse(discrepancy);
    } catch {
      discrepancy = null;
    }
  }
  let demographics = row.demographics;
  if (typeof demographics === 'string') {
    try {
      demographics = JSON.parse(demographics);
    } catch {
      demographics = null;
    }
  }

  return {
    department: row.department,
    department_reference: row.department_reference,
    verified: row.verified,
    linked_at: row.linked_at,
    match_confidence: row.match_confidence !== null && row.match_confidence !== undefined
      ? parseFloat(row.match_confidence)
      : null,
    discrepancy,
    demographics,
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
