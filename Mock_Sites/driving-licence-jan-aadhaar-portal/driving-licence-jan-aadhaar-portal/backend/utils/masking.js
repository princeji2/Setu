'use strict';

/**
 * Masking utilities for sensitive identifiers.
 * Use these whenever displaying or logging document numbers.
 *
 * IMPORTANT: Never log or display raw licence numbers or Jan Aadhaar IDs
 * unless explicitly required by an authorised action.
 */

/**
 * Masks all but the last `visibleChars` characters with 'X'.
 * e.g. maskValue('MH0120231234567', 4) → 'XXXXXXXXXXX4567'
 */
function maskValue(value, visibleChars = 4) {
  if (!value || typeof value !== 'string') return 'XXXXXXXX';
  const str = value.trim();
  if (str.length <= visibleChars) return 'X'.repeat(str.length);
  return 'X'.repeat(str.length - visibleChars) + str.slice(-visibleChars);
}

/**
 * Mask a driving licence number — show last 4 chars.
 * e.g. 'MH0120231234567' → 'XXXXXXXXXXX4567'
 */
function maskLicenceNumber(licenceNumber) {
  return maskValue(licenceNumber, 4);
}

/**
 * Mask a Jan Aadhaar ID — show last 4 digits.
 * e.g. '1234567890' → 'XXXXXX7890'
 */
function maskJanAadhaarId(janAadhaarId) {
  return maskValue(String(janAadhaarId), 4);
}

/**
 * Returns a safe registration object for API responses and admin listings.
 * Raw sensitive fields are replaced with masked equivalents.
 */
function maskRegistration(reg) {
  if (!reg) return null;
  return {
    id:                     reg.id,
    registration_reference: reg.registration_reference,
    licence_number:         maskLicenceNumber(reg.licence_number),
    licence_holder_name:    reg.licence_holder_name,
    licence_issue_date:     reg.licence_issue_date,
    licence_valid_from:     reg.licence_valid_from,
    licence_expiry_date:    reg.licence_expiry_date,
    jan_aadhaar_id:         maskJanAadhaarId(reg.jan_aadhaar_id),
    family_members_count:   reg.family_members_count,
    verification_status:    reg.verification_status,
    verification_provider:  reg.verification_provider,
    created_at:             reg.created_at,
    updated_at:             reg.updated_at,
  };
}

module.exports = { maskLicenceNumber, maskJanAadhaarId, maskRegistration, maskValue };
