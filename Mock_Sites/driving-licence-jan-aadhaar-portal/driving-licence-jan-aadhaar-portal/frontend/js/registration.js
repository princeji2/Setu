'use strict';

/**
 * registration.js
 * Handles real-time validation and form submission for the registration page.
 * All sensitive data is sent only to the backend — never stored in localStorage.
 */

const API_BASE = '/api/v1';

// ── Field references ──────────────────────────────────────────
const form        = document.getElementById('registration-form');
const submitBtn   = document.getElementById('submit-btn');
const submitText  = document.getElementById('submit-text');
const submitSpinner = document.getElementById('submit-spinner');
const formBanner  = document.getElementById('form-banner');
const resetBtn    = document.getElementById('reset-btn');

// Licence fields
const licenceNumberInput     = document.getElementById('licence_number');
const licenceHolderInput     = document.getElementById('licence_holder_name');
const licenceIssueDateInput  = document.getElementById('licence_issue_date');
const licenceValidFromInput  = document.getElementById('licence_valid_from');
const licenceExpiryInput     = document.getElementById('licence_expiry_date');

// Jan Aadhaar fields
const janAadhaarIdInput      = document.getElementById('jan_aadhaar_id');
const familyMembersInput     = document.getElementById('family_members_count');

// ── Validation configuration ──────────────────────────────────
// Pattern must match backend config — adjust LICENCE_NUMBER_PATTERN in .env
const LICENCE_PATTERN    = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/;
const JAN_AADHAAR_LENGTH = 10;
const MAX_FAMILY_MEMBERS = 50;

// ── Utility helpers ───────────────────────────────────────────
function showError(fieldId, message) {
  const el = document.getElementById(`${fieldId}-error`);
  const input = document.getElementById(fieldId);
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
  if (input) { input.classList.add('is-error'); input.classList.remove('is-valid'); }
}

function clearError(fieldId) {
  const el = document.getElementById(`${fieldId}-error`);
  const input = document.getElementById(fieldId);
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
  if (input) { input.classList.remove('is-error'); }
}

function markValid(fieldId) {
  const input = document.getElementById(fieldId);
  if (input) { input.classList.remove('is-error'); input.classList.add('is-valid'); }
}

function showBanner(message, type = 'error') {
  formBanner.textContent = message;
  formBanner.className = `form-banner form-banner--${type}`;
  formBanner.classList.remove('hidden');
  formBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideBanner() {
  formBanner.classList.add('hidden');
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitText.textContent = loading ? 'Submitting…' : 'Submit Registration';
  submitSpinner.classList.toggle('hidden', !loading);
}

// ── Individual field validators ───────────────────────────────
function validateLicenceNumber() {
  const val = licenceNumberInput.value.trim().toUpperCase();
  if (!val) { showError('licence_number', 'Licence number is required.'); return false; }
  if (val.length < 10 || val.length > 20) {
    showError('licence_number', 'Licence number must be between 10 and 20 characters.');
    return false;
  }
  if (!LICENCE_PATTERN.test(val)) {
    showError('licence_number',
      'Invalid format. Expected: 2 letters + 2 digits + 4 digits + 7 digits (e.g. MH0120231234567). ' +
      'Format check does not confirm the licence is genuine.');
    return false;
  }
  clearError('licence_number');
  markValid('licence_number');
  return true;
}

function validateLicenceHolder() {
  const val = licenceHolderInput.value.trim();
  if (!val) { showError('licence_holder_name', 'Licence holder name is required.'); return false; }
  if (val.length < 2) { showError('licence_holder_name', 'Name must be at least 2 characters.'); return false; }
  if (val.length > 255) { showError('licence_holder_name', 'Name is too long (max 255 characters).'); return false; }
  if (!/^[A-Za-z\s'\-.]+$/.test(val)) {
    showError('licence_holder_name', 'Name contains invalid characters. Use letters, spaces, apostrophes or hyphens only.');
    return false;
  }
  clearError('licence_holder_name');
  markValid('licence_holder_name');
  return true;
}

function validateLicenceIssueDate() {
  const val = licenceIssueDateInput.value;
  if (!val) { showError('licence_issue_date', 'Date of issue is required.'); return false; }
  clearError('licence_issue_date');
  markValid('licence_issue_date');
  return true;
}

function validateLicenceValidFrom() {
  const val      = licenceValidFromInput.value;
  const issueVal = licenceIssueDateInput.value;
  if (!val) { showError('licence_valid_from', 'Validity from date is required.'); return false; }
  if (issueVal && new Date(val) < new Date(issueVal)) {
    showError('licence_valid_from', 'Validity from date cannot be before the issue date.');
    return false;
  }
  clearError('licence_valid_from');
  markValid('licence_valid_from');
  return true;
}

function validateLicenceExpiry() {
  const val       = licenceExpiryInput.value;
  const fromVal   = licenceValidFromInput.value;
  if (!val) { showError('licence_expiry_date', 'Validity expiry date is required.'); return false; }
  if (fromVal && new Date(val) < new Date(fromVal)) {
    showError('licence_expiry_date', 'Expiry date cannot be before the validity from date.');
    return false;
  }
  clearError('licence_expiry_date');
  markValid('licence_expiry_date');
  return true;
}

function validateJanAadhaarId() {
  const val = janAadhaarIdInput.value.trim();
  if (!val) { showError('jan_aadhaar_id', 'Jan Aadhaar ID is required.'); return false; }
  if (!/^\d+$/.test(val)) { showError('jan_aadhaar_id', 'Jan Aadhaar ID must contain digits only.'); return false; }
  if (val.length !== JAN_AADHAAR_LENGTH) {
    showError('jan_aadhaar_id',
      `Jan Aadhaar ID must be exactly ${JAN_AADHAAR_LENGTH} digits. ` +
      'Format check does not confirm this ID exists in any government database.');
    return false;
  }
  clearError('jan_aadhaar_id');
  markValid('jan_aadhaar_id');
  return true;
}

function validateFamilyMembers() {
  const raw = familyMembersInput.value;
  if (raw === '' || raw === null) { showError('family_members_count', 'Number of family members is required.'); return false; }
  const val = Number(raw);
  if (!Number.isInteger(val)) { showError('family_members_count', 'Must be a whole number.'); return false; }
  if (val < 1) { showError('family_members_count', 'Must be at least 1.'); return false; }
  if (val > MAX_FAMILY_MEMBERS) { showError('family_members_count', `Cannot exceed ${MAX_FAMILY_MEMBERS}.`); return false; }
  clearError('family_members_count');
  markValid('family_members_count');
  return true;
}

function validateAll() {
  // Run all validators and collect results — do NOT short-circuit so all errors show at once
  const results = [
    validateLicenceNumber(),
    validateLicenceHolder(),
    validateLicenceIssueDate(),
    validateLicenceValidFrom(),
    validateLicenceExpiry(),
    validateJanAadhaarId(),
    validateFamilyMembers(),
  ];
  return results.every(Boolean);
}

// ── Real-time validation listeners ───────────────────────────
licenceNumberInput.addEventListener('blur', validateLicenceNumber);
licenceNumberInput.addEventListener('input', () => {
  licenceNumberInput.value = licenceNumberInput.value.toUpperCase();
  if (licenceNumberInput.classList.contains('is-error')) validateLicenceNumber();
});

licenceHolderInput.addEventListener('blur', validateLicenceHolder);
licenceHolderInput.addEventListener('input', () => {
  if (licenceHolderInput.classList.contains('is-error')) validateLicenceHolder();
});

licenceIssueDateInput.addEventListener('change', () => {
  validateLicenceIssueDate();
  // Re-validate dependent fields
  if (licenceValidFromInput.value) validateLicenceValidFrom();
  if (licenceExpiryInput.value) validateLicenceExpiry();
});

licenceValidFromInput.addEventListener('change', () => {
  validateLicenceValidFrom();
  if (licenceExpiryInput.value) validateLicenceExpiry();
});

licenceExpiryInput.addEventListener('change', validateLicenceExpiry);

janAadhaarIdInput.addEventListener('input', () => {
  // Allow digits only — strip non-digits silently
  janAadhaarIdInput.value = janAadhaarIdInput.value.replace(/\D/g, '');
  if (janAadhaarIdInput.classList.contains('is-error')) validateJanAadhaarId();
});
janAadhaarIdInput.addEventListener('blur', validateJanAadhaarId);

familyMembersInput.addEventListener('input', () => {
  if (familyMembersInput.classList.contains('is-error')) validateFamilyMembers();
});
familyMembersInput.addEventListener('blur', validateFamilyMembers);

// ── Form submission ───────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();

  if (!validateAll()) {
    showBanner('Please fix the errors highlighted below before submitting.', 'error');
    // Scroll to first error field
    const firstError = form.querySelector('.is-error');
    if (firstError) firstError.focus();
    return;
  }

  setLoading(true);

  const payload = {
    licence_number:       licenceNumberInput.value.trim().toUpperCase(),
    licence_holder_name:  licenceHolderInput.value.trim(),
    licence_issue_date:   licenceIssueDateInput.value,
    licence_valid_from:   licenceValidFromInput.value,
    licence_expiry_date:  licenceExpiryInput.value,
    jan_aadhaar_id:       janAadhaarIdInput.value.trim(),
    family_members_count: parseInt(familyMembersInput.value, 10),
  };

  try {
    const response = await fetch(`${API_BASE}/registrations`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Store only the reference and status — no sensitive document data
      sessionStorage.setItem('registrationResult', JSON.stringify(data.data));
      window.location.href = 'success.html';
    } else if (response.status === 409) {
      showBanner('This document information is already registered.', 'error');
    } else if (response.status === 400 && data.fields) {
      // Map backend field errors back to form fields
      data.fields.forEach(({ field, message }) => {
        showError(field, message);
      });
      showBanner('Please fix the validation errors below.', 'error');
    } else {
      showBanner(data.error || 'Submission failed. Please try again.', 'error');
    }
  } catch (err) {
    showBanner('Network error. Please check your connection and try again.', 'error');
  } finally {
    setLoading(false);
  }
});

// ── Reset handler ─────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  hideBanner();
  // Clear all error states
  form.querySelectorAll('.form-input').forEach(input => {
    input.classList.remove('is-error', 'is-valid');
  });
  form.querySelectorAll('.field-error').forEach(el => {
    el.textContent = '';
    el.classList.add('hidden');
  });
});
