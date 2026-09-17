/**
 * Registration page controller (v2)
 * Handles: captcha loading/refresh, client-side field validation,
 * form submission with all new fields, result display.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── DOM references ────────────────────────────────────────────────────────
  const form             = document.getElementById('registration-form');
  const identityInput    = document.getElementById('identity-input');
  const nameInput        = document.getElementById('name-input');
  const fatherNameInput  = document.getElementById('father-name-input');
  const mobileInput      = document.getElementById('mobile-input');
  const addressInput     = document.getElementById('address-input');
  const captchaImg       = document.getElementById('captcha-img');
  const captchaLoading   = document.getElementById('captcha-loading');
  const captchaTokenEl   = document.getElementById('captcha-token');
  const captchaAnswer    = document.getElementById('captcha-answer-input');
  const captchaRefreshBtn = document.getElementById('captcha-refresh-btn');

  const submitBtn   = document.getElementById('submit-btn');
  const btnText     = document.getElementById('btn-text');
  const btnSpinner  = document.getElementById('btn-spinner');

  const formSection    = document.getElementById('form-section');
  const resultCard     = document.getElementById('result-card');
  const resultTitle    = document.getElementById('result-title');
  const resultDesc     = document.getElementById('result-desc');
  const resultBadge    = document.getElementById('result-badge');
  const metaContainer  = document.getElementById('result-meta');
  const tryAnotherBtn  = document.getElementById('try-another-btn');

  // ── Captcha ───────────────────────────────────────────────────────────────

  async function loadCaptcha() {
    captchaImg.style.display = 'none';
    captchaLoading.style.display = 'flex';
    captchaRefreshBtn.disabled = true;
    captchaTokenEl.value = '';
    captchaAnswer.value = '';
    clearFieldError('captcha-error');

    try {
      const res = await fetch('/api/registration/captcha');
      const data = await res.json();

      if (!res.ok || !data.success) {
        captchaLoading.textContent = 'Failed to load captcha. Click refresh to retry.';
        return;
      }

      captchaTokenEl.value = data.data.token;
      captchaImg.src = data.data.image;
      captchaImg.style.display = 'block';
      captchaLoading.style.display = 'none';
    } catch {
      captchaLoading.innerHTML = '<span style="color:#f87171;">Could not load captcha. Check server connection.</span>';
    } finally {
      captchaRefreshBtn.disabled = false;
    }
  }

  captchaRefreshBtn.addEventListener('click', () => loadCaptcha());

  // Load captcha on page start
  loadCaptcha();

  // ── Chip preset handlers ──────────────────────────────────────────────────
  document.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      identityInput.value = chip.dataset.val || chip.textContent.trim();
      identityInput.focus();
      clearFieldError('identity-error');
    });
  });

  // ── "Register Another" button ─────────────────────────────────────────────
  if (tryAnotherBtn) {
    tryAnotherBtn.addEventListener('click', () => {
      resultCard.className = 'result-card';
      formSection.style.display = 'block';
      clearAllErrors();
      identityInput.value = '';
      nameInput.value = '';
      fatherNameInput.value = '';
      mobileInput.value = '';
      addressInput.value = '';
      loadCaptcha();
      identityInput.focus();
    });
  }

  // ── Inline validation on blur ─────────────────────────────────────────────
  identityInput.addEventListener('blur', () => validateIdentityField());
  nameInput.addEventListener('blur', () => validateNameField(nameInput, 'name-error', 'Full Name'));
  fatherNameInput.addEventListener('blur', () => validateNameField(fatherNameInput, 'father-name-error', "Father's Name"));
  mobileInput.addEventListener('blur', () => validateMobileField());
  addressInput.addEventListener('blur', () => validateAddressField());
  captchaAnswer.addEventListener('blur', () => validateCaptchaField());

  // Strip non-digits from mobile as user types
  mobileInput.addEventListener('input', () => {
    mobileInput.value = mobileInput.value.replace(/\D/g, '').slice(0, 10);
  });

  // ── Form submit ───────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Run all client-side validators
    const identityOk    = validateIdentityField();
    const nameOk        = validateNameField(nameInput, 'name-error', 'Full Name');
    const fatherOk      = validateNameField(fatherNameInput, 'father-name-error', "Father's Name");
    const mobileOk      = validateMobileField();
    const addressOk     = validateAddressField();
    const captchaOk     = validateCaptchaField();

    if (!identityOk || !nameOk || !fatherOk || !mobileOk || !addressOk || !captchaOk) {
      // Scroll to first error
      const firstError = form.querySelector('.form-input.input-error');
      if (firstError) firstError.focus();
      showToast('Please fix the errors highlighted below.', 'warning');
      return;
    }

    const captchaToken = captchaTokenEl.value;
    if (!captchaToken) {
      setFieldError('captcha-error', 'Captcha token is missing. Please refresh the captcha.');
      captchaAnswer.classList.add('input-error');
      showToast('Captcha token missing. Please refresh the captcha.', 'error');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/registration/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityReference: identityInput.value.trim(),
          name:              nameInput.value.trim(),
          fatherName:        fatherNameInput.value.trim(),
          mobileNumber:      mobileInput.value.trim(),
          address:           addressInput.value.trim(),
          captchaToken,
          captchaAnswer:     captchaAnswer.value.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Map server field errors back to inline messages
        if (data.errors && data.errors.length > 0) {
          data.errors.forEach((err) => mapServerError(err.field, err.message));
        }

        const msg = data.error
          || (data.errors && data.errors.length > 0 ? data.errors[0].message : null)
          || data.message
          || 'An error occurred during registration.';

        // If captcha-related error, reload captcha automatically
        if (isCaptchaError(msg)) {
          setFieldError('captcha-error', msg);
          captchaAnswer.classList.add('input-error');
          loadCaptcha();
          showToast(msg, 'error');
        } else {
          showResultError(msg);
        }
        return;
      }

      if (data.success) {
        const isRegistered = data.data && typeof data.data.registered === 'boolean'
          ? data.data.registered
          : data.registered;

        if (isRegistered === false) {
          showRegistrationSuccess(data);
        } else {
          showAlreadyRegistered(data);
        }
      } else {
        showResultError(data.error || data.message || 'Registration could not be completed.');
      }
    } catch {
      showResultError('Cannot communicate with the server. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  });

  // ── Client-side validators ────────────────────────────────────────────────

  function validateIdentityField() {
    const val = identityInput.value.trim();
    if (!val) {
      return setFieldError('identity-error', 'Synthetic identity reference is required.', identityInput);
    }
    if (/^\d{12}$/.test(val)) {
      return setFieldError('identity-error', 'Real 12-digit numbers are prohibited. Use synthetic identifiers like TESTAADHAAR0001.', identityInput);
    }
    if (val.length < 4) {
      return setFieldError('identity-error', 'Identity reference must be at least 4 characters.', identityInput);
    }
    if (val.length > 32) {
      return setFieldError('identity-error', 'Identity reference cannot exceed 32 characters.', identityInput);
    }
    if (!/^[A-Z0-9_-]{4,32}$/i.test(val)) {
      return setFieldError('identity-error', 'Only letters, digits, hyphens, and underscores are allowed.', identityInput);
    }
    clearFieldError('identity-error', identityInput);
    return true;
  }

  function validateNameField(inputEl, errorId, label) {
    const val = inputEl.value.trim();
    if (!val) {
      return setFieldError(errorId, `${label} is required.`, inputEl);
    }
    if (val.length < 2) {
      return setFieldError(errorId, `${label} must be at least 2 characters.`, inputEl);
    }
    if (val.length > 120) {
      return setFieldError(errorId, `${label} cannot exceed 120 characters.`, inputEl);
    }
    if (!/^[a-zA-Z\u0900-\u097F]+([\s.\-''`][a-zA-Z\u0900-\u097F]+)*$/.test(val)) {
      return setFieldError(errorId, `${label} may only contain letters, spaces, dots, hyphens, and apostrophes.`, inputEl);
    }
    clearFieldError(errorId, inputEl);
    return true;
  }

  function validateMobileField() {
    let val = mobileInput.value.trim().replace(/\D/g, '');
    if (!val) {
      return setFieldError('mobile-error', 'Mobile number is required.', mobileInput);
    }
    if (val.length !== 10) {
      return setFieldError('mobile-error', 'Mobile number must be exactly 10 digits.', mobileInput);
    }
    if (!/^[6-9]\d{9}$/.test(val)) {
      return setFieldError('mobile-error', 'Enter a valid Indian mobile number starting with 6, 7, 8, or 9.', mobileInput);
    }
    clearFieldError('mobile-error', mobileInput);
    return true;
  }

  function validateAddressField() {
    const val = addressInput.value.trim();
    if (!val) {
      return setFieldError('address-error', 'Address is required.', addressInput);
    }
    if (val.length < 10) {
      return setFieldError('address-error', 'Address must be at least 10 characters.', addressInput);
    }
    if (val.length > 500) {
      return setFieldError('address-error', 'Address cannot exceed 500 characters.', addressInput);
    }
    clearFieldError('address-error', addressInput);
    return true;
  }

  function validateCaptchaField() {
    const val = captchaAnswer.value.trim();
    if (!val) {
      return setFieldError('captcha-error', 'Captcha answer is required.', captchaAnswer);
    }
    if (val.length < 4) {
      return setFieldError('captcha-error', 'Please enter the full captcha code.', captchaAnswer);
    }
    clearFieldError('captcha-error', captchaAnswer);
    return true;
  }

  // ── Error helpers ─────────────────────────────────────────────────────────

  function setFieldError(errorId, message, inputEl) {
    const el = document.getElementById(errorId);
    if (el) { el.textContent = message; el.style.display = 'block'; }
    if (inputEl) { inputEl.classList.add('input-error'); inputEl.classList.remove('input-valid'); }
    return false;
  }

  function clearFieldError(errorId, inputEl) {
    const el = document.getElementById(errorId);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
    if (inputEl) { inputEl.classList.remove('input-error'); inputEl.classList.add('input-valid'); }
  }

  function clearAllErrors() {
    ['identity-error', 'name-error', 'father-name-error', 'mobile-error', 'address-error', 'captcha-error']
      .forEach((id) => clearFieldError(id));
    [identityInput, nameInput, fatherNameInput, mobileInput, addressInput, captchaAnswer]
      .forEach((el) => { if (el) { el.classList.remove('input-error', 'input-valid'); } });
  }

  /** Map a server-returned field name to its inline error element */
  function mapServerError(field, message) {
    const map = {
      identityReference: ['identity-error', identityInput],
      name:              ['name-error', nameInput],
      fatherName:        ['father-name-error', fatherNameInput],
      mobileNumber:      ['mobile-error', mobileInput],
      address:           ['address-error', addressInput],
      captchaAnswer:     ['captcha-error', captchaAnswer],
      captchaToken:      ['captcha-error', captchaAnswer],
    };
    const target = map[field];
    if (target) setFieldError(target[0], message, target[1]);
  }

  function isCaptchaError(msg) {
    const lower = (msg || '').toLowerCase();
    return lower.includes('captcha') || lower.includes('token');
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  function setLoading(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true;
      btnSpinner.style.display = 'inline-block';
      btnText.textContent = 'Registering…';
    } else {
      submitBtn.disabled = false;
      btnSpinner.style.display = 'none';
      btnText.textContent = 'Register Identity';
    }
  }

  // ── Result display ────────────────────────────────────────────────────────

  function showRegistrationSuccess(data) {
    formSection.style.display = 'none';
    resultCard.className = 'result-card success-state';
    document.getElementById('result-icon').textContent = '✓';

    resultTitle.textContent = '✓ Registration Successful';
    resultDesc.textContent = 'Your identity reference has been successfully registered in the database.';

    resultBadge.className = 'status-badge status-badge-registered';
    resultBadge.textContent = 'Status: REGISTERED';

    const timestamp = data.data && data.data.createdAt
      ? formatDate(data.data.createdAt)
      : formatDate(new Date());
    const idRef = data.data && data.data.identityReference
      ? data.data.identityReference
      : identityInput.value.trim().toUpperCase();

    metaContainer.innerHTML = `
      <div class="status-meta-row">
        <span>Identity Reference:</span>
        <strong>${escapeHtml(idRef)}</strong>
      </div>
      <div class="status-meta-row">
        <span>Registered Name:</span>
        <strong>${escapeHtml(nameInput.value.trim())}</strong>
      </div>
      <div class="status-meta-row">
        <span>Registration Timestamp:</span>
        <strong>${timestamp}</strong>
      </div>
      <div class="status-meta-row">
        <span>Storage:</span>
        <strong>PostgreSQL (Persistent)</strong>
      </div>
    `;

    showToast('Registered successfully!', 'success');
  }

  function showAlreadyRegistered(data) {
    formSection.style.display = 'none';
    resultCard.className = 'result-card already-registered-state';
    document.getElementById('result-icon').textContent = '⚠';

    resultTitle.textContent = '⚠ Already Registered';
    resultDesc.textContent = 'This identity reference is already registered in this portal database.';

    resultBadge.className = 'status-badge status-badge-already';
    resultBadge.textContent = 'Status: ALREADY REGISTERED';

    const timestamp = data.data && (data.data.registeredAt || data.data.createdAt)
      ? formatDate(data.data.registeredAt || data.data.createdAt)
      : 'Previously Recorded';
    const idRef = data.data && data.data.identityReference
      ? data.data.identityReference
      : identityInput.value.trim().toUpperCase();

    metaContainer.innerHTML = `
      <div class="status-meta-row">
        <span>Identity Reference:</span>
        <strong>${escapeHtml(idRef)}</strong>
      </div>
      <div class="status-meta-row">
        <span>First Registered:</span>
        <strong>${timestamp}</strong>
      </div>
      <div class="status-meta-row">
        <span>Database Status:</span>
        <strong>Existing Persistent Record</strong>
      </div>
    `;

    showToast('Record already exists in portal.', 'warning');
  }

  function showResultError(errorMsg) {
    formSection.style.display = 'none';
    resultCard.className = 'result-card error-state';
    document.getElementById('result-icon').textContent = '✕';

    resultTitle.textContent = '✕ Registration Error';
    resultDesc.textContent = errorMsg;

    resultBadge.className = 'status-badge';
    resultBadge.style.background = 'rgba(239, 68, 68, 0.2)';
    resultBadge.style.color = '#f87171';
    resultBadge.textContent = 'Status: ERROR';

    metaContainer.innerHTML = `
      <div class="status-meta-row">
        <span>Note:</span>
        <strong>Please check the provided input and try again.</strong>
      </div>
    `;

    showToast(errorMsg, 'error');
  }

});
