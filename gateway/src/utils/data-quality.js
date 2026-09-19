'use strict';

/**
 * Lightweight data-quality checks run at the department-client translate()
 * boundary, on the SUCCESS branch only.
 *
 * These are STRUCTURAL / consistency checks on what a department returned —
 * NOT correctness checks (the gateway can't know whether a name is "right").
 * They flag responses that are internally malformed or inconsistent: a
 * missing reference on a 200, an empty field set, a field claimed verified
 * but returned blank, a normalized field_names count that doesn't match what
 * the department actually returned, or an unknown verification_status.
 *
 * Contract:
 *   - Each helper returns a plain array of short, non-sensitive flag strings.
 *   - An empty array means "nothing looked off" — the honest, common case.
 *   - Flags never carry a raw field VALUE (only field names / counts /
 *     status tokens), so folding them into response_summary or the audit
 *     detail leaks nothing the masked summary wouldn't already show.
 *   - This NEVER decides pass/fail. The relay logs the flags and resolves
 *     status purely from the department outcome + verified flag, exactly as
 *     before. A flagged-but-successful call is still `complete`.
 *
 * Kept intentionally small and dependency-free (same spirit as mask.js).
 */

/**
 * Flag a DTR/NIR-style success payload, which carries a
 * `fields: [{ name, value, verified }]` array.
 *
 * @param {object} p
 * @param {*} p.reference        the normalized reference the client derived
 * @param {Array} p.fields       the RAW department fields array (rawData.fields)
 * @param {Array} [p.fieldNames] the normalized field_names the client produced
 *                               (defaults to fields' names; pass it to also
 *                               catch a translate() name/count mismatch)
 * @returns {string[]}
 */
function flagFieldArray({ reference, fields, fieldNames } = {}) {
  const flags = [];

  if (reference === undefined || reference === null || String(reference).trim() === '') {
    flags.push('missing_reference');
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    flags.push('empty_fields');
    // Nothing more to check if there are no fields.
    return flags;
  }

  // A field the department marked verified:true but returned with no value is
  // internally contradictory — surface it (name only, never the value).
  const emptyVerified = fields
    .filter((f) => f && f.verified === true && (f.value === undefined || f.value === null || String(f.value).trim() === ''))
    .map((f) => f && f.name)
    .filter(Boolean);
  if (emptyVerified.length > 0) {
    flags.push(`empty_verified_value:${emptyVerified.join(',')}`);
  }

  // If the client passed the normalized field_names, confirm the count and
  // membership match the raw fields — catches translate() dropping/duping.
  if (Array.isArray(fieldNames)) {
    const rawNames = fields.map((f) => f && f.name).filter((n) => n !== undefined && n !== null);
    if (fieldNames.length !== rawNames.length) {
      flags.push('field_names_mismatch');
    }
  }

  return flags;
}

// verification_status tokens the DLJA service is documented to emit.
const KNOWN_DLJA_STATUSES = new Set([
  'FORMAT_VALID',
  'VERIFIED',
  'VERIFICATION_PENDING',
  'VERIFICATION_FAILED',
]);

/**
 * Flag a DLJA-style success payload, which has no fields[] array — instead a
 * single `verification_status` plus a curated set of non-sensitive names the
 * client surfaced.
 *
 * @param {object} p
 * @param {*} p.reference            normalized registration reference
 * @param {*} p.verification_status  the raw status token
 * @param {Array} [p.field_names]    the non-sensitive names the client surfaced
 * @returns {string[]}
 */
function flagRegistration({ reference, verification_status, field_names } = {}) {
  const flags = [];

  if (reference === undefined || reference === null || String(reference).trim() === '') {
    flags.push('missing_reference');
  }

  if (verification_status === undefined || verification_status === null || String(verification_status).trim() === '') {
    flags.push('missing_verification_status');
  } else if (!KNOWN_DLJA_STATUSES.has(verification_status)) {
    // An out-of-vocabulary status is exactly the "department returned
    // something we didn't expect" signal — flag it (the token itself is
    // non-sensitive/categorical, safe to include).
    flags.push(`unknown_verification_status:${verification_status}`);
  }

  if (!Array.isArray(field_names) || field_names.length === 0) {
    flags.push('empty_fields');
  }

  return flags;
}

module.exports = { flagFieldArray, flagRegistration, KNOWN_DLJA_STATUSES };
