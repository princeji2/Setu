'use strict';

/**
 * Relay / verification service — the orchestration Phase 3 is about.
 *
 * For an application, given the department it needs, this service:
 *   1. Loads the application (must belong to the citizen).
 *   2. ENFORCES CONSENT — refuses if no matching consent_grants row exists.
 *      This is the real backend authorization check (appflow §3), not a UI gate.
 *   3. Moves status: submitted/... -> gateway_relay -> department_verifying.
 *   4. Calls the department client over real HTTP.
 *   5. Writes an application_department_calls row + an audit_log entry for
 *      EVERY call, success or failure (structure.md rule 2).
 *   6. On success: marks linked_references verified, status -> complete.
 *      On failure: status -> failed, with an honest citizen-facing message.
 *      Never substitutes fake data on failure (requirements Story 7).
 *
 * Step 3a wires only the digital_tax_records client. The `clients` map is
 * a registry so 3b adds the other two without touching this logic.
 *
 * Errors thrown (mapped to HTTP by the controller):
 *   NOT_FOUND        -> 404 (application not owned / missing)
 *   CONSENT_REQUIRED -> 403 (no matching consent row)
 *   NO_CLIENT        -> 400 (unsupported department for this step)
 *   VALIDATION       -> 400
 */

class RelayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RelayError';
    this.code = code;
  }
}

// Which application type maps to which department + how to derive the
// reference from the citizen's consent/application input.
const TYPE_TO_DEPARTMENT = {
  pan_verification: 'digital_tax_records',
};

function createRelayService({
  clients,                 // { [department]: client }
  applicationRepository,
  consentRepository,
  linkedReferenceRepository,
  auditRepository,
}) {
  /**
   * @param {object} p
   * @param {string} p.citizenId
   * @param {string} p.applicationId
   * @param {string} p.reference  the department reference to look up (e.g. SYNPAN-000123)
   */
  async function verify({ citizenId, applicationId, reference }) {
    if (!reference || !String(reference).trim()) {
      throw new RelayError('VALIDATION', 'reference is required.');
    }

    const application = await applicationRepository.findByIdForCitizen(applicationId, citizenId);
    if (!application) {
      throw new RelayError('NOT_FOUND', 'Application not found for this citizen.');
    }

    const department = TYPE_TO_DEPARTMENT[application.type];
    if (!department) {
      throw new RelayError('VALIDATION', `Application type "${application.type}" has no department mapping.`);
    }

    const client = clients[department];
    if (!client) {
      throw new RelayError('NO_CLIENT', `No client wired for department "${department}" yet.`);
    }

    // --- Consent enforcement (the whole point of this check) ---
    const consent = await consentRepository.findMatch({ applicationId, department });
    if (!consent) {
      // No department call is made. Record the refusal in the audit trail.
      await auditRepository.record({
        citizenId,
        action: 'department_call_refused',
        detail: { application_id: applicationId, department, reason: 'no_consent' },
      });
      throw new RelayError('CONSENT_REQUIRED', 'Consent is required before contacting this department.');
    }

    // --- Relay ---
    await applicationRepository.updateStatus(applicationId, 'gateway_relay');
    await applicationRepository.updateStatus(applicationId, 'department_verifying');

    const result = await client.fetchFields(reference);
    const succeeded = result.outcome === 'success';

    // --- Log the call (always) ---
    await applicationRepository.recordCall({
      applicationId,
      department,
      endpointCalled: result.endpoint,
      statusCode: result.statusCode,
      succeeded,
      responseSummary: succeeded
        // Metadata + non-sensitive summary only — field names, not values.
        ? `verified=${result.data.verified}; fields=${(result.data.field_names || []).join(',')}`
        : result.error,
      durationMs: result.durationMs,
    });

    await auditRepository.record({
      citizenId,
      action: 'department_call',
      detail: {
        application_id: applicationId,
        department,
        endpoint: result.endpoint,
        outcome: result.outcome,
        status_code: result.statusCode,
        duration_ms: result.durationMs,
      },
    });

    // --- Resolve ---
    if (succeeded) {
      await linkedReferenceRepository.markVerified({
        citizenId,
        department,
        departmentReference: result.data.reference,
      });
      const updated = await applicationRepository.updateStatus(applicationId, 'complete');
      await auditRepository.record({
        citizenId,
        action: 'application_status_change',
        detail: { application_id: applicationId, status: 'complete' },
      });
      return {
        status: updated.status,
        department,
        reference: result.data.reference,
        verified: result.data.verified,
        field_names: result.data.field_names,
      };
    }

    // Failure of any kind (not_found / auth_error / timeout / unreachable / rejected / unexpected)
    const updated = await applicationRepository.updateStatus(applicationId, 'failed');
    await auditRepository.record({
      citizenId,
      action: 'application_status_change',
      detail: { application_id: applicationId, status: 'failed', outcome: result.outcome },
    });
    return {
      status: updated.status,
      department,
      outcome: result.outcome,
      // Honest, citizen-facing message. Never fake success.
      message: result.error,
    };
  }

  return { verify };
}

module.exports = { createRelayService, RelayError, TYPE_TO_DEPARTMENT };
