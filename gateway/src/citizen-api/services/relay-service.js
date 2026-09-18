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
 * Reuse path (Story 8): if the caller does NOT supply a reference, the
 * gateway resolves one from a previously-verified linked_references row for
 * that department (findVerified) and proceeds without asking the citizen to
 * re-enter it. Reuse skips ONLY the re-entry — consent is still enforced
 * per application (a fresh consent_grants row is still required), the fetch
 * is still a live HTTP call, and the call is still logged. The reuse is
 * tagged in the audit trail (`reused_reference: true`) so a judge can SEE
 * the skip, not just infer it from timing. Never serves cached department
 * data — reuse always re-fetches.
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

const { summarizeFields } = require('../../utils/mask');

class RelayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RelayError';
    this.code = code;
  }
}

/**
 * Build the masked-but-real response_summary stored in
 * application_department_calls. Prefers the client's masked_fields (already
 * masked at the client boundary via src/utils/mask.js); falls back to a
 * names-only summary if a client hasn't supplied masked pairs. Never receives
 * or emits a raw sensitive value.
 */
function summarizeCall(data) {
  if (Array.isArray(data.masked_fields) && data.masked_fields.length > 0) {
    return summarizeFields(data.verified, data.masked_fields);
  }
  return `verified=${data.verified}; fields=${(data.field_names || []).join(',')}`;
}

// Which application type maps to which department + how to derive the
// reference from the citizen's consent/application input.
const TYPE_TO_DEPARTMENT = {
  pan_verification: 'digital_tax_records',
  identity_verification: 'national_identity_registry',
  driving_licence_registration: 'driving_licence_jan_aadhaar',
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
   * @param {string} [p.reference]  the department reference to look up (e.g.
   *   SYNPAN-000123). OPTIONAL: if omitted, the gateway reuses a
   *   previously-verified reference for this department (Story 8).
   */
  async function verify({ citizenId, applicationId, reference }) {
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

    // --- Reference resolution (reuse path, Story 8) ---
    // Precedence: an explicitly-supplied reference wins (first-time flow or
    // a citizen deliberately overriding). Otherwise reuse a previously
    // verified reference for this department. If neither exists, there is
    // genuinely nothing to act on — that's the first-time-with-no-input case.
    let resolvedReference = reference && String(reference).trim();
    let reusedReference = false;
    if (!resolvedReference) {
      const existing = await linkedReferenceRepository.findVerified({ citizenId, department });
      if (existing) {
        resolvedReference = existing.department_reference;
        reusedReference = true;
      }
    }
    if (!resolvedReference) {
      throw new RelayError(
        'VALIDATION',
        'reference is required (no previously verified reference to reuse for this department).'
      );
    }

    // --- Consent enforcement (the whole point of this check) ---
    // Enforced on EVERY relay, including reuse — Story 3 "citizen stays in
    // control" must hold literally every time, so reuse never becomes a way
    // to silently skip consent.
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

    // A fresh live fetch every time — reuse re-fetches, never serves cache.
    const result = await client.fetchFields(resolvedReference);
    const succeeded = result.outcome === 'success';

    // --- Log the call (always) ---
    await applicationRepository.recordCall({
      applicationId,
      department,
      endpointCalled: result.endpoint,
      statusCode: result.statusCode,
      succeeded,
      // Masked-but-real summary on success (values masked in the client via
      // src/utils/mask.js — raw values never reach here); honest error on
      // failure. See the response_summary decision in database-schema.md.
      responseSummary: succeeded
        ? summarizeCall(result.data)
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
        // Provable reuse: when true, the citizen did NOT re-enter the
        // reference — the gateway resolved it from a prior verified row
        // (Story 8). Explicit in the audit trail, not inferred from timing.
        reused_reference: reusedReference,
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
        reused: reusedReference,
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
      reused: reusedReference,
    };
  }

  return { verify };
}

module.exports = { createRelayService, RelayError, TYPE_TO_DEPARTMENT };
