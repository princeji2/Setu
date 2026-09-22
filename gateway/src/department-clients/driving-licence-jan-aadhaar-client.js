'use strict';

/**
 * Driving Licence & Jan Aadhaar (DLJA) department client — Layer 2.
 *
 * Calls the REAL service over HTTP:
 *   GET {baseUrl}/api/v1/gateway/registrations/{reference}
 *   header: X-Gateway-Key: <DLJA_GATEWAY_KEY>
 *
 * Contract verified live against the running service in Step 3b
 * (see api.md Part 2 / HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md):
 *   200 -> { success:true, data:{ registration_reference, verification_status, ...masked }, error:null }
 *   401 -> missing/invalid X-Gateway-Key
 *   404 -> "Registration not found."
 *   400 -> reference param fails length validation (5..20)
 *
 * IMPORTANT — this department's success payload is SHAPED DIFFERENTLY from
 * Digital Tax Records and National Identity Registry:
 *   - Its reference field is `registration_reference` (a THIRD distinct
 *     name; DTR=`reference`, NIR=`identityReference`).
 *   - There is NO `fields:[{name,verified}]` array. Instead the masked
 *     registration carries a single `verification_status`
 *     (FORMAT_VALID | VERIFIED | VERIFICATION_PENDING | VERIFICATION_FAILED —
 *     the dev MockVerificationProvider only ever emits FORMAT_VALID or
 *     VERIFICATION_FAILED; VERIFIED is reserved for a future real provider).
 *
 * translate() (success branch only) normalises all of that into the SAME
 * internal shape the relay already consumes: { reference, source_department,
 * verified, field_names }. This keeps relay-service.js department-agnostic —
 * no relay changes needed for the differing payload shape.
 */

const config = require('../config/env');
const { maskValue } = require('../utils/mask');
const { flagRegistration } = require('../utils/data-quality');

const DEPARTMENT = 'driving_licence_jan_aadhaar';

// verification_status values that count as "verified" at the gateway level,
// i.e. the department confirmed the reference exists and passed its checks.
const VERIFIED_STATUSES = new Set(['VERIFIED', 'FORMAT_VALID']);

// Non-sensitive field names the department returned for this reference.
// We surface names only (never masked/raw values) to keep parity with the
// other clients' `field_names` and honour the response_summary decision.
const NON_SENSITIVE_FIELD_NAMES = [
  'registration_reference',
  'licence_holder_name',
  'licence_issue_date',
  'licence_valid_from',
  'licence_expiry_date',
  'family_members_count',
  'verification_status',
];

function translate(rawData) {
  const presentFields = NON_SENSITIVE_FIELD_NAMES.filter((k) => k in rawData);
  return {
    reference: rawData.registration_reference,
    source_department: 'Driving Licence & Jan Aadhaar Portal',
    // No per-field verified flags here — derive from verification_status.
    verified: VERIFIED_STATUSES.has(rawData.verification_status),
    verification_status: rawData.verification_status,
    field_names: presentFields,
    // Masked-but-real pairs. DLJA already masks licence_number/jan_aadhaar_id
    // at source (they pass through mask() unchanged); licence_holder_name is
    // masked here. Dates/counts/verification_status are non-identifying.
    masked_fields: presentFields.map((k) => ({ name: k, value: maskValue(k, rawData[k]) })),
    // Structural data-quality flags (never blocks; logged for accountability).
    data_quality_flags: flagRegistration({
      reference: rawData.registration_reference,
      verification_status: rawData.verification_status,
      field_names: presentFields,
    }),
    // Demographic data for cross-registry identity matching
    demographics: {
      fullName: rawData.licence_holder_name || null,
      dob: rawData.dob || null,
    },
  };
}

function createDrivingLicenceJanAadhaarClient({
  baseUrl = config.departments.driving_licence_jan_aadhaar.baseUrl,
  gatewayKey = config.departments.driving_licence_jan_aadhaar.gatewayKey,
  timeoutMs = config.departmentCallTimeoutMs,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    department: DEPARTMENT,

    /**
     * Fetch masked registration data for a registration reference.
     * @param {string} reference e.g. 'REG-4C3978A0'
     */
    async fetchFields(reference) {
      const endpoint = `GET /api/v1/gateway/registrations/${reference}`;
      const url = `${baseUrl.replace(/\/$/, '')}/api/v1/gateway/registrations/${encodeURIComponent(reference)}`;
      const start = Date.now();

      let res;
      try {
        res = await fetchImpl(url, {
          method: 'GET',
          headers: { 'X-Gateway-Key': gatewayKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const durationMs = Date.now() - start;
        const isTimeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
        return {
          outcome: isTimeout ? 'timeout' : 'unreachable',
          statusCode: null,
          endpoint,
          durationMs,
          data: null,
          error: isTimeout
            ? 'Driving Licence & Jan Aadhaar Portal did not respond in time.'
            : 'Could not reach Driving Licence & Jan Aadhaar Portal.',
        };
      }

      const durationMs = Date.now() - start;
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (res.status === 200 && body && body.data) {
        return {
          outcome: 'success',
          statusCode: 200,
          endpoint,
          durationMs,
          data: translate(body.data),
          error: null,
        };
      }

      if (res.status === 404) {
        return {
          outcome: 'not_found',
          statusCode: 404,
          endpoint,
          durationMs,
          data: null,
          error: 'Reference not found in Driving Licence & Jan Aadhaar Portal.',
        };
      }

      if (res.status === 401) {
        return {
          outcome: 'auth_error',
          statusCode: 401,
          endpoint,
          durationMs,
          data: null,
          error: 'Driving Licence & Jan Aadhaar Portal rejected the gateway credentials.',
        };
      }

      if (res.status === 400) {
        return {
          outcome: 'rejected',
          statusCode: 400,
          endpoint,
          durationMs,
          data: null,
          error: 'Driving Licence & Jan Aadhaar Portal rejected the reference format.',
        };
      }

      return {
        outcome: 'unexpected',
        statusCode: res.status,
        endpoint,
        durationMs,
        data: null,
        error: `Driving Licence & Jan Aadhaar Portal returned an unexpected status (${res.status}).`,
      };
    },
  };
}

module.exports = { createDrivingLicenceJanAadhaarClient, translate, DEPARTMENT };
