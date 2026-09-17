/**
 * Validation utilities for synthetic identity references and registration personal data.
 * Strictly enforces that only synthetic/test identifiers are processed,
 * and rejects any potential real identity numbers or malformed inputs.
 */

// Synthetic identity reference pattern: e.g. TESTAADHAAR0001, TEST_ID_1234, DEMO9999
// Accepts uppercase alphanumeric and underscores, length 4 to 32 characters.
const SYNTHETIC_ID_REGEX = /^[A-Z0-9_-]{4,32}$/;

// Pure 12-digit numeric pattern typical of real national IDs - STRICTLY PROHIBITED
const REAL_AADHAAR_REGEX = /^\d{12}$/;

// Valid person name: letters (including Indian scripts via unicode), spaces, dots, hyphens, apostrophes
// Minimum 2 chars, maximum 120 chars — no digits or special characters
const PERSON_NAME_REGEX = /^[a-zA-Z\u0900-\u097F]+([\s.\-''][a-zA-Z\u0900-\u097F]+)*$/;

// Indian mobile number: starts with 6, 7, 8, or 9 followed by exactly 9 more digits
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * Validates whether an input is a valid synthetic test identity reference.
 * @param {string} value - Raw input string
 * @returns {{ isValid: boolean, normalized: string, error?: string }}
 */
function validateSyntheticIdentity(value) {
  if (!value || typeof value !== 'string') {
    return {
      isValid: false,
      normalized: '',
      error: 'Identity reference is required and must be text.',
    };
  }

  const trimmed = value.trim().toUpperCase();

  if (trimmed.length === 0) {
    return {
      isValid: false,
      normalized: '',
      error: 'Identity reference cannot be empty or only spaces.',
    };
  }

  // Reject real 12-digit numeric patterns explicitly
  if (REAL_AADHAAR_REGEX.test(trimmed)) {
    return {
      isValid: false,
      normalized: '',
      error: 'Real 12-digit numbers are strictly forbidden. Please use synthetic test identifiers (e.g., TESTAADHAAR0001).',
    };
  }

  if (trimmed.length < 4) {
    return {
      isValid: false,
      normalized: '',
      error: 'Identity reference must be at least 4 characters long.',
    };
  }

  if (trimmed.length > 32) {
    return {
      isValid: false,
      normalized: '',
      error: 'Identity reference cannot exceed 32 characters.',
    };
  }

  if (!SYNTHETIC_ID_REGEX.test(trimmed)) {
    return {
      isValid: false,
      normalized: '',
      error: 'Identity reference may only contain alphanumeric characters, hyphens, and underscores (e.g., TESTAADHAAR0001).',
    };
  }

  return {
    isValid: true,
    normalized: trimmed,
  };
}

/**
 * Validates a person's full name or father's name.
 * @param {string} value
 * @param {string} fieldLabel - Used in error messages, e.g. "Full Name"
 * @returns {{ isValid: boolean, normalized: string, error?: string }}
 */
function validatePersonName(value, fieldLabel = 'Name') {
  if (!value || typeof value !== 'string') {
    return { isValid: false, normalized: '', error: `${fieldLabel} is required.` };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { isValid: false, normalized: '', error: `${fieldLabel} cannot be empty.` };
  }

  if (trimmed.length < 2) {
    return { isValid: false, normalized: '', error: `${fieldLabel} must be at least 2 characters.` };
  }

  if (trimmed.length > 120) {
    return { isValid: false, normalized: '', error: `${fieldLabel} cannot exceed 120 characters.` };
  }

  if (!PERSON_NAME_REGEX.test(trimmed)) {
    return {
      isValid: false,
      normalized: '',
      error: `${fieldLabel} may only contain letters, spaces, dots, hyphens, and apostrophes.`,
    };
  }

  return { isValid: true, normalized: trimmed };
}

/**
 * Validates an Indian mobile number (10 digits, starts with 6-9).
 * Strips optional leading +91 or 0 before validation.
 * @param {string} value
 * @returns {{ isValid: boolean, normalized: string, error?: string }}
 */
function validateIndianMobile(value) {
  if (!value || typeof value !== 'string') {
    return { isValid: false, normalized: '', error: 'Mobile number is required.' };
  }

  // Strip spaces, dashes
  let stripped = value.replace(/[\s\-]/g, '');

  // Strip optional country code prefix (+91, 0091) or leading 0 only when full country code is provided
  if (stripped.startsWith('+91')) {
    stripped = stripped.slice(3);
  } else if (stripped.startsWith('0091')) {
    stripped = stripped.slice(4);
  } else if (stripped.length === 12 && stripped.startsWith('91')) {
    stripped = stripped.slice(2);
  } else if (stripped.length === 11 && stripped.startsWith('0')) {
    stripped = stripped.slice(1);
  }

  if (stripped.length === 0) {
    return { isValid: false, normalized: '', error: 'Mobile number cannot be empty.' };
  }

  if (!/^\d+$/.test(stripped)) {
    return { isValid: false, normalized: '', error: 'Mobile number must contain digits only.' };
  }

  if (stripped.length !== 10) {
    return {
      isValid: false,
      normalized: '',
      error: 'Mobile number must be exactly 10 digits (Indian format).',
    };
  }

  if (!INDIAN_MOBILE_REGEX.test(stripped)) {
    return {
      isValid: false,
      normalized: '',
      error: 'Enter a valid Indian mobile number starting with 6, 7, 8, or 9.',
    };
  }

  return { isValid: true, normalized: stripped };
}

/**
 * Validates a residential address string.
 * @param {string} value
 * @returns {{ isValid: boolean, normalized: string, error?: string }}
 */
function validateAddress(value) {
  if (!value || typeof value !== 'string') {
    return { isValid: false, normalized: '', error: 'Address is required.' };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { isValid: false, normalized: '', error: 'Address cannot be empty.' };
  }

  if (trimmed.length < 10) {
    return {
      isValid: false,
      normalized: '',
      error: 'Address must be at least 10 characters long.',
    };
  }

  if (trimmed.length > 500) {
    return { isValid: false, normalized: '', error: 'Address cannot exceed 500 characters.' };
  }

  // Reject strings that are all the same character (e.g. "aaaaaaaaaa")
  if (/^(.)\1+$/.test(trimmed)) {
    return { isValid: false, normalized: '', error: 'Please enter a valid address.' };
  }

  return { isValid: true, normalized: trimmed };
}

/**
 * Validates a submitted captcha answer against the expected value.
 * Comparison is case-insensitive.
 * @param {string} submitted - What the user typed
 * @param {string} expected  - The correct captcha text (from server-side store)
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateCaptcha(submitted, expected) {
  if (!submitted || typeof submitted !== 'string') {
    return { isValid: false, error: 'Captcha answer is required.' };
  }

  const s = submitted.trim().toUpperCase();
  const e = (expected || '').trim().toUpperCase();

  if (s.length === 0) {
    return { isValid: false, error: 'Captcha answer cannot be empty.' };
  }

  if (!e) {
    return { isValid: false, error: 'Captcha session expired. Please refresh the captcha.' };
  }

  if (s !== e) {
    return { isValid: false, error: 'Incorrect captcha. Please try again.' };
  }

  return { isValid: true };
}

module.exports = {
  validateSyntheticIdentity,
  validatePersonName,
  validateIndianMobile,
  validateAddress,
  validateCaptcha,
  SYNTHETIC_ID_REGEX,
  REAL_AADHAAR_REGEX,
  PERSON_NAME_REGEX,
  INDIAN_MOBILE_REGEX,
};
