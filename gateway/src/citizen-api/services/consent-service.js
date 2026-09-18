'use strict';

/**
 * Consent service. Records a citizen's approval to share specific fields
 * with a specific department for a specific application — BEFORE any
 * department call happens. In Phase 3 the relay logic calls
 * consentRepository.findMatch(...) and refuses the department call if no
 * row exists; this service is what puts that row there.
 *
 * Errors: VALIDATION -> 400, NOT_FOUND -> 404 (application not owned/missing)
 */

const DEPARTMENTS = new Set([
  'digital_tax_records',
  'national_identity_registry',
  'driving_licence_jan_aadhaar',
]);

class ConsentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ConsentError';
    this.code = code;
  }
}

function createConsentService({ consentRepository, applicationRepository, auditRepository }) {
  return {
    async grant({ citizenId, applicationId, department, fieldsRequested }) {
      if (!applicationId) {
        throw new ConsentError('VALIDATION', 'application_id is required.');
      }
      if (!DEPARTMENTS.has(department)) {
        throw new ConsentError(
          'VALIDATION',
          `department must be one of: ${[...DEPARTMENTS].join(', ')}.`
        );
      }
      if (!Array.isArray(fieldsRequested) || fieldsRequested.length === 0) {
        throw new ConsentError('VALIDATION', 'fields_requested must be a non-empty array.');
      }
      if (!fieldsRequested.every((f) => typeof f === 'string' && f.trim())) {
        throw new ConsentError('VALIDATION', 'fields_requested must contain non-empty strings.');
      }

      // The application must exist AND belong to this citizen — a citizen
      // can't grant consent against someone else's application.
      const application = await applicationRepository.findByIdForCitizen(applicationId, citizenId);
      if (!application) {
        throw new ConsentError('NOT_FOUND', 'Application not found for this citizen.');
      }

      const row = await consentRepository.create({
        citizenId,
        applicationId,
        department,
        fieldsRequested,
      });

      await auditRepository.record({
        citizenId,
        action: 'consent_granted',
        detail: { application_id: applicationId, department, fields_requested: fieldsRequested },
      });

      return {
        id: row.id,
        application_id: row.application_id,
        department: row.department,
        fields_requested: JSON.parse(row.fields_requested),
        granted_at: row.granted_at,
      };
    },
  };
}

module.exports = { createConsentService, ConsentError, DEPARTMENTS };
