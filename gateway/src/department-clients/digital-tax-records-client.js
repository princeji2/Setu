'use strict';

/**
 * Digital Tax Records (UIDAI) department client — Layer 2.
 *
 * Calls the REAL service over HTTP:
 *   GET {baseUrl}/pan/{reference}/fields
 *   header: X-Gateway-Key: <DTR_GATEWAY_KEY>
 *
 * Contract verified live against the running mock service
 * (see api.md Part 2 / HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md):
 *   200 -> { success:true, data:{ reference, fields:[...], sourceDepartment }, error:null }
 *   401 -> missing/invalid X-Gateway-Key
 *   404 -> reference not found
 *   400 -> real-PAN / bad synthetic format
 *
 * This client NEVER throws for an expected outcome. Everything —
 * including network failure and timeout — is returned as a typed
 * `outcome` so the relay service can log + set status deterministically.
 *
 * Outcome shape:
 *   {
 *     outcome: 'success' | 'not_found' | 'rejected' | 'auth_error' | 'timeout' | 'unreachable' | 'unexpected',
 *     statusCode: number | null,   // HTTP status, null if no response
 *     endpoint: string,            // e.g. 'GET /pan/SYNPAN-000123/fields' (for audit)
 *     durationMs: number,
 *     data: object | null,         // translated payload on success
 *     error: string | null,        // honest, non-sensitive message
 *   }
 */

const config = require('../config/env');
const { maskValue } = require('../utils/mask');
const { flagFieldArray } = require('../utils/data-quality');

const DEPARTMENT = 'digital_tax_records';

/**
 * Translate the DTR-native success payload into the small internal shape
 * the gateway cares about: the reference, whether it verified, the field
 * NAMES, and MASKED-but-real field values (masked-but-real response_summary
 * decision — see src/utils/mask.js and database-schema.md). The gateway
 * never keeps the raw sensitive value; masking happens here before the
 * value leaves the client. The relay decides what, if anything, to persist.
 */
function translate(rawData) {
  const fields = Array.isArray(rawData.fields) ? rawData.fields : [];
  const fieldNames = fields.map((f) => f.name);
  return {
    reference: rawData.reference,
    source_department: rawData.sourceDepartment,
    // "verified" at the gateway level = the department returned fields and
    // marked them verified. DTR sets verified:true per field on a match.
    verified: fields.length > 0 && fields.every((f) => f.verified === true),
    field_names: fieldNames,
    // Masked-but-real pairs for the audit summary. Raw values never stored.
    masked_fields: fields.map((f) => ({ name: f.name, value: maskValue(f.name, f.value) })),
    // Structural data-quality flags (never blocks; logged for accountability).
    data_quality_flags: flagFieldArray({ reference: rawData.reference, fields, fieldNames }),
  };
}

function createDigitalTaxRecordsClient({
  baseUrl = config.departments.digital_tax_records.baseUrl,
  gatewayKey = config.departments.digital_tax_records.gatewayKey,
  timeoutMs = config.departmentCallTimeoutMs,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    department: DEPARTMENT,

    /**
     * Fetch verified fields for a synthetic PAN reference.
     * @param {string} reference e.g. 'SYNPAN-000123'
     */
    async fetchFields(reference) {
      const endpoint = `GET /pan/${reference}/fields`;
      const url = `${baseUrl.replace(/\/$/, '')}/pan/${encodeURIComponent(reference)}/fields`;
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
        // AbortSignal.timeout aborts with a TimeoutError; other network
        // errors (ECONNREFUSED, DNS, etc.) mean the service is unreachable.
        const isTimeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
        return {
          outcome: isTimeout ? 'timeout' : 'unreachable',
          statusCode: null,
          endpoint,
          durationMs,
          data: null,
          error: isTimeout
            ? 'Digital Tax Records did not respond in time.'
            : 'Could not reach Digital Tax Records.',
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
          error: 'Reference not found in Digital Tax Records.',
        };
      }

      if (res.status === 401) {
        return {
          outcome: 'auth_error',
          statusCode: 401,
          endpoint,
          durationMs,
          data: null,
          // This is a gateway misconfiguration (bad/missing key), not a
          // citizen error. Surface honestly without leaking the key.
          error: 'Digital Tax Records rejected the gateway credentials.',
        };
      }

      if (res.status === 400) {
        return {
          outcome: 'rejected',
          statusCode: 400,
          endpoint,
          durationMs,
          data: null,
          error: 'Digital Tax Records rejected the reference format.',
        };
      }

      return {
        outcome: 'unexpected',
        statusCode: res.status,
        endpoint,
        durationMs,
        data: null,
        error: `Digital Tax Records returned an unexpected status (${res.status}).`,
      };
    },
  };
}

module.exports = { createDigitalTaxRecordsClient, translate, DEPARTMENT };
