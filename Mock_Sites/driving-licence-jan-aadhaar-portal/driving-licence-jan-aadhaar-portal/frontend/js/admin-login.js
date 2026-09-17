'use strict';

/**
 * admin-login.js
 * Handles admin authentication.
 * JWT is stored in sessionStorage — cleared when the browser tab closes.
 * Never store the JWT in localStorage for admin sessions.
 */

const API_BASE = '/api/v1';

const form          = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn      = document.getElementById('login-btn');
const loginText     = document.getElementById('login-text');
const loginSpinner  = document.getElementById('login-spinner');
const loginError    = document.getElementById('login-error');
const toggleBtn     = document.getElementById('toggle-password');

// ── Redirect if already logged in ────────────────────────────
(function checkExistingSession() {
  const token = sessionStorage.getItem('adminToken');
  if (token) {
    window.location.href = 'admin-dashboard.html';
  }
})();

// ── Password visibility toggle ────────────────────────────────
toggleBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  toggleBtn.textContent = isPassword ? '\uD83D\uDE48' : '\uD83D\uDC41';
});

// ── Helpers ───────────────────────────────────────────────────
function showError(message) {
  loginError.textContent = message;
  loginError.classList.remove('hidden');
}

function hideError() {
  loginError.classList.add('hidden');
}

function setLoading(loading) {
  loginBtn.disabled = loading;
  loginText.textContent = loading ? 'Logging in…' : 'Login';
  loginSpinner.classList.toggle('hidden', !loading);
}

function showFieldError(fieldId, message) {
  const el    = document.getElementById(`${fieldId}-error`);
  const input = document.getElementById(fieldId);
  if (el)    { el.textContent = message; el.classList.remove('hidden'); }
  if (input) { input.classList.add('is-error'); }
}

function clearFieldError(fieldId) {
  const el    = document.getElementById(`${fieldId}-error`);
  const input = document.getElementById(fieldId);
  if (el)    { el.textContent = ''; el.classList.add('hidden'); }
  if (input) { input.classList.remove('is-error'); }
}

// ── Real-time clear on input ──────────────────────────────────
usernameInput.addEventListener('input', () => clearFieldError('username'));
passwordInput.addEventListener('input', () => clearFieldError('password'));

// ── Form submit ───────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  clearFieldError('username');
  clearFieldError('password');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  let valid = true;
  if (!username) { showFieldError('username', 'Username is required.'); valid = false; }
  if (!password) { showFieldError('password', 'Password is required.'); valid = false; }
  if (!valid) return;

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/admin/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Store token and minimal admin info in sessionStorage only
      sessionStorage.setItem('adminToken',    data.token);
      sessionStorage.setItem('adminUsername', data.admin.username);
      window.location.href = 'admin-dashboard.html';
    } else if (response.status === 429) {
      showError('Too many login attempts. Please wait and try again.');
    } else {
      // Generic message — do not reveal whether username or password was wrong
      showError('Invalid credentials. Please check your username and password.');
      // Clear password field for security
      passwordInput.value = '';
    }
  } catch {
    showError('Network error. Please check your connection and try again.');
  } finally {
    setLoading(false);
  }
});
