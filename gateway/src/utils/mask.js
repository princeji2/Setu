'use strict';

/**
 * Field masking — the single source of truth for how the gateway reduces a
 * department's real field values into a "masked-but-real" form safe to store
 * in application_department_calls.response_summary and to show a judge.
 *
 * Why this exists (decision, Phase 4 → 4b):
 *   response_summary carries masked-but-real values, NOT metadata-only. The
 *   reuse-path demo is stronger when the audit log proves the gateway fetched
 *   ACTUAL data ("fullName: U***", "dob: 1980-**-**") rather than just noting
 *   that a call happened. The masking keeps the same protection we already
 *   apply everywhere sensitive values matter (licence numbers, jan_aadhaar_id
 *   are masked at the DLJA source; names/DOB/address are masked here) while
 *   making the proof far more convincing.
 *
 * Rules (deliberately conservative — mask unless known-safe):
 *   - Known-sensitive fields (names, DOB, address, and any *_number / id-like
 *     field) are masked to a real-but-partial form.
 *   - Known-coarse/categorical fields (filing status, income BRACKET, gender,
 *     assessment year, verification_status, counts) pass through — they are
 *     already non-identifying and are the most demo-legible part of the proof.
 *   - Anything already masked at the source (e.g. "XXXXXX6572") is detected
 *     and passed through unchanged — never "double-mask" or unmask.
 *   - Unknown field names default to masked, not exposed.
 *
 * The gateway NEVER stores the raw sensitive value anywhere — only the masked
 * form produced here reaches Postgres.
 */

// Field names whose values are non-identifying enough to keep verbatim.
// Everything else is treated as sensitive and masked.
const SAFE_FIELDS = new Set([
  'filingStatus',
  'incomeBracket',
  'assessmentYear',
  'gender',
  'verification_status',
  'family_members_count',
  // The reference itself is the public handle the citizen already holds and
  // it appears verbatim in endpoint_called — masking it adds noise, not
  // protection.
  'registration_reference',
  'reference',
  'identityReference',
]);

// Field names we explicitly recognise as sensitive, with a tailored mask.
// (Kept explicit so the mask shape is intentional per type, not guessed.)
const NAME_FIELDS = new Set(['fullName', 'licence_holder_name', 'name']);
const DOB_FIELDS = new Set(['dob', 'dateOfBirth', 'date_of_birth']);
const ADDRESS_FIELDS = new Set(['address']);

/** Already masked at the source? e.g. "XXXXXX6572", "XXXXXXXXXXX6572". */
function isAlreadyMasked(value) {
  return typeof value === 'string' && /[X*]{3,}/.test(value);
}

/** Mask a personal name: keep each token's first letter. "Aarav Sharma" -> "A**** S*****". */
function maskName(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((tok) => (tok.length <= 1 ? tok : tok[0] + '*'.repeat(tok.length - 1)))
    .join(' ');
}

/** Mask a date of birth: keep the year, hide month/day. "1980-12-16" -> "1980-**-**". */
function maskDob(value) {
  const s = String(value);
  const m = s.match(/^(\d{4})[-/]/);
  return m ? `${m[1]}-**-**` : '****';
}

/** Mask an address: keep only the trailing pincode if present, else fully mask. */
function maskAddress(value) {
  const s = String(value);
  const pin = s.match(/(\d{6})\s*$/);
  return pin ? `*** ${pin[1]}` : '***';
}

/** Generic fallback mask: reveal the last 2 chars only. "SOMEVALUE" -> "*******UE". */
function maskGeneric(value) {
  const s = String(value);
  if (s.length <= 2) return '*'.repeat(s.length);
  return '*'.repeat(s.length - 2) + s.slice(-2);
}

/**
 * Produce the masked-but-real value for a single field.
 * @param {string} name  the department's field name
 * @param {*} value       the raw value returned by the department
 * @returns {string}
 */
function maskValue(name, value) {
  if (value === null || value === undefined) return '';
  if (isAlreadyMasked(value)) return String(value); // source already masked it
  if (SAFE_FIELDS.has(name)) return String(value);
  if (NAME_FIELDS.has(name)) return maskName(value);
  if (DOB_FIELDS.has(name)) return maskDob(value);
  if (ADDRESS_FIELDS.has(name)) return maskAddress(value);
  // Dates that aren't DOB (issue/expiry) are non-identifying on their own;
  // keep them. Everything else (numbers, unknown fields) -> generic mask.
  if (/_date$|_from$|_expiry|createdAt|updatedAt/i.test(name)) return String(value);
  return maskGeneric(value);
}

/**
 * Build the response_summary string from a list of {name, value} pairs.
 * Every value is passed through maskValue first. Result looks like:
 *   "verified=true; fullName=U****, filingStatus=FILED, dob=1980-**-**"
 * @param {boolean} verified
 * @param {Array<{name:string,value:*}>} fields
 * @returns {string}
 */
function summarizeFields(verified, fields) {
  const pairs = (fields || []).map((f) => `${f.name}=${maskValue(f.name, f.value)}`);
  return `verified=${verified}; ${pairs.join(', ')}`;
}

module.exports = { maskValue, summarizeFields, isAlreadyMasked, SAFE_FIELDS };
