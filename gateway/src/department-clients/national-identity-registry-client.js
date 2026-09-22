'use strict';

/**
 * National Identity Registry (NIR) department client — Layer 2.
 *
 * Calls the REAL service over HTTP:
 *   GET {baseUrl}/api/registration/{identityReference}/fields
 *   header: X-Gateway-Key: <NIR_GATEWAY_KEY>
 *
 * Contract verified live against the running service in Step 3b
 * (see api.md Part 2 / HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md):
 *   200 -> { success:true, data:{ identityReference, fields:[...], sourceDepartment }, error:null }
 *   401 -> missing/invalid X-Gateway-Key (plain static compare; NO token expiry)
 *   404 -> reference not found
 *   400 -> real 12-digit numeric / bad synthetic format
 *
 * NOTE: unlike what earlier docs guessed, there is NO short-lived-token /
 * retry-on-expiry behavior on this endpoint. It is a static key check, so
 * this client is identical in shape to the DTR client — single call, typed
 * outcome, timeout. (Corrected in api.md, Step 3b.)
 *
 * Same typed `outcome` contract as the DTR client so the relay service is
 * department-agnostic.
 */

const config = require('../config/env');
const { maskValue } = require('../utils/mask');
const { flagFieldArray } = require('../utils/data-quality');

const DEPARTMENT = 'national_identity_registry';

/**
 * Translate the NIR-native success payload into the minimal internal shape.
 * NIR uses `identityReference` (DTR uses `reference`) — normalise to a
 * common `reference` so the relay treats every department the same. We keep
 * the reference, a verified flag, field NAMES, and MASKED-but-real field
 * values (masked here before leaving the client — the gateway never stores
 * NIR's raw names/DOB/address). See src/utils/mask.js.
 */
function translate(rawData) {
  const fields = Array.isArray(rawData.fields) ? rawData.fields : [];
  const fieldNames = fields.map((f) => f.name);
  return {
    reference: rawData.identityReference,
    source_department: rawData.sourceDepartment,
    verified: fields.length > 0 && fields.every((f) => f.verified === true),
    field_names: fieldNames,
    masked_fields: fields.map((f) => ({ name: f.name, value: maskValue(f.name, f.value) })),
    // Structural data-quality flags (never blocks; logged for accountability).
    data_quality_flags: flagFieldArray({ reference: rawData.identityReference, fields, fieldNames }),
    // Demographic data for cross-registry identity matching
    demographics: {
      fullName: fields.find((f) => f.name === 'fullName' || f.name === 'name')?.value || null,
      dob: fields.find((f) => f.name === 'dob' || f.name === 'dateOfBirth')?.value || null,
    },
  };
}

function createNationalIdentityRegistryClient({
  baseUrl = config.departments.national_identity_registry.baseUrl,
  gatewayKey = config.departments.national_identity_registry.gatewayKey,
  timeoutMs = config.departmentCallTimeoutMs,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    department: DEPARTMENT,

    /**
     * Fetch verified demographic fields for a synthetic identity reference.
     * @param {string} reference e.g. 'TESTAADHAAR0001'
     */
    async fetchFields(reference) {
      let endpoint = `GET /api/registration/${reference}/fields`;
      let path = `/api/registration/${encodeURIComponent(reference)}/fields`;

      if (reference.startsWith('VOTER-') || reference.startsWith('EPIC-')) {
        endpoint = `GET /api/voter-id/${reference}/fields`;
        path = `/api/voter-id/${encodeURIComponent(reference)}/fields`;
      } else if (reference.startsWith('BIRTH-') || reference.startsWith('BC-')) {
        endpoint = `GET /api/birth-certificate/${reference}/fields`;
        path = `/api/birth-certificate/${encodeURIComponent(reference)}/fields`;
      }

      const url = `${baseUrl.replace(/\/$/, '')}${path}`;
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
            ? 'National Identity Registry did not respond in time.'
            : 'Could not reach National Identity Registry.',
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
          error: 'Reference not found in National Identity Registry.',
        };
      }

      if (res.status === 401) {
        return {
          outcome: 'auth_error',
          statusCode: 401,
          endpoint,
          durationMs,
          data: null,
          error: 'National Identity Registry rejected the gateway credentials.',
        };
      }

      if (res.status === 400) {
        return {
          outcome: 'rejected',
          statusCode: 400,
          endpoint,
          durationMs,
          data: null,
          error: 'National Identity Registry rejected the reference format.',
        };
      }

      return {
        outcome: 'unexpected',
        statusCode: res.status,
        endpoint,
        durationMs,
        data: null,
        error: `National Identity Registry returned an unexpected status (${res.status}).`,
      };
    },
  };
}

module.exports = { createNationalIdentityRegistryClient, translate, DEPARTMENT };
