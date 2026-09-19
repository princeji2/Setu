'use strict';

/**
 * Auth screen (login / register). Layout adapted from refrences/signup.txt:
 * a two-column split — the form on one column, a large branded panel on the
 * other, filled edge-to-edge with a living gradient/mesh. This replaces the
 * older sliding split-panel switcher; the two forms now share one column and
 * a plain text link swaps between them (no purple circle, no OAuth row).
 *
 * Rebuilt HONESTLY against the gateway's ACTUAL auth contract:
 *   - email + password only. The reference's Google/Apple/social row is
 *     DROPPED — the gateway has no OAuth, so showing those buttons would
 *     imply a flow that doesn't exist (HOW_TO_USE_REFRENCES.md: never stub
 *     backend behaviour to match a reference).
 *   - the reference's shader gradient is expressed with the trust-first
 *     token palette (primary olive → gold accent), and the kinetic-fabric
 *     backdrop (background.txt) shows through the panel.
 *   - exact form IDs (loginEmail/loginPassword, registerName/Email/Password),
 *     submit buttons and error boxes are preserved so the submit logic and
 *     the 401 "notice" path keep working unchanged.
 */

import { api, ApiError, NetworkError, setSession } from '../api.js';
import { brandMarkSvg } from '../netmap.js';
import { toast, escapeHtml } from '../util.js';

function authScreenHtml() {
  const iconMail = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;
  const iconLock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
  const iconUser = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>`;

  return `
  <section class="auth-screen">
    <div class="auth-grid" id="authCard">

      <!-- FORM COLUMN -->
      <div class="auth-form-col">
        <div class="auth-form-inner">
          <div class="brand auth-brand">
            <div class="mark">${brandMarkSvg()}</div>
            <div class="word">Setu<span>.</span></div>
          </div>

          <!-- SIGN IN -->
          <form class="auth-form sign-in-form" id="loginForm" novalidate>
            <h1 class="auth-title">Welcome back</h1>
            <p class="auth-sub">Log in once to reach every department connected to Setu.</p>
            <div id="loginError" class="auth-form-error hidden"></div>

            <label class="field-box">
              <span class="fb-icon">${iconMail}</span>
              <input id="loginEmail" type="email" autocomplete="email" placeholder="Email" required>
            </label>
            <label class="field-box">
              <span class="fb-icon">${iconLock}</span>
              <input id="loginPassword" type="password" autocomplete="current-password" placeholder="Password" required>
            </label>

            <button type="submit" class="auth-submit" id="loginSubmit">Log in</button>
            <p class="auth-switch">New to Setu? <button type="button" class="auth-link" id="toRegister">Create an account</button></p>
          </form>

          <!-- SIGN UP -->
          <form class="auth-form sign-up-form hidden" id="registerForm" novalidate>
            <h1 class="auth-title">Create an account</h1>
            <p class="auth-sub">One identity, verified once per department, reused everywhere.</p>
            <div id="registerError" class="auth-form-error hidden"></div>

            <label class="field-box">
              <span class="fb-icon">${iconUser}</span>
              <input id="registerName" type="text" autocomplete="name" placeholder="Full name" required>
            </label>
            <label class="field-box">
              <span class="fb-icon">${iconMail}</span>
              <input id="registerEmail" type="email" autocomplete="email" placeholder="Email" required>
            </label>
            <label class="field-box">
              <span class="fb-icon">${iconLock}</span>
              <input id="registerPassword" type="password" autocomplete="new-password" minlength="8" placeholder="Password (min 8 characters)" required>
            </label>

            <button type="submit" class="auth-submit" id="registerSubmit">Create account</button>
            <p class="auth-switch">Already with us? <button type="button" class="auth-link" id="toLogin">Sign in</button></p>
          </form>
        </div>
      </div>

      <!-- BRAND PANEL -->
      <aside class="auth-brand-panel" aria-hidden="true">
        <div class="abp-glow"></div>
        <div class="abp-content">
          <h2 class="abp-headline">One login.<br>Every department.</h2>
          <p class="abp-tagline">Verify a document once — then reuse it across Digital Tax Records, the National Identity Registry and the Driving Licence &amp; Jan Aadhaar Portal. No re-upload, every step logged.</p>
        </div>
      </aside>

    </div>
  </section>`;
}

function setButtonLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span> ${escapeHtml(label)}` : label;
}

function mountAuthScreen(root, onAuthenticated, { notice } = {}) {
  root.innerHTML = authScreenHtml();

  const card = document.getElementById('authCard');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  // Optional notice (e.g. "session expired") shown in the login error box
  // once the DOM exists — used when a 401 bounces the citizen back here.
  if (notice) {
    const errorBox = document.getElementById('loginError');
    if (errorBox) { errorBox.textContent = notice; errorBox.classList.remove('hidden'); }
  }

  // Swap between the two forms. Both stay in the DOM (only one visible), so
  // their submit handlers and IDs are always live regardless of the view.
  function showForm(which) {
    const signUp = which === 'register';
    loginForm.classList.toggle('hidden', signUp);
    registerForm.classList.toggle('hidden', !signUp);
    card.classList.toggle('sign-up-mode', signUp);
    const firstInput = (signUp ? registerForm : loginForm).querySelector('input');
    if (firstInput) firstInput.focus();
  }
  document.getElementById('toRegister').addEventListener('click', () => showForm('register'));
  document.getElementById('toLogin').addEventListener('click', () => showForm('login'));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorBox = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginSubmit');
    errorBox.classList.add('hidden');
    setButtonLoading(submitBtn, true, 'Logging in…');
    try {
      const data = await api.auth.login(email, password);
      setSession(data.token, data.citizen);
      onAuthenticated(data.citizen);
    } catch (err) {
      const message = err instanceof ApiError ? err.message
        : err instanceof NetworkError ? err.message
        : 'Something went wrong. Please try again.';
      errorBox.textContent = message;
      errorBox.classList.remove('hidden');
    } finally {
      setButtonLoading(submitBtn, false, 'Log in');
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const errorBox = document.getElementById('registerError');
    const submitBtn = document.getElementById('registerSubmit');
    errorBox.classList.add('hidden');
    setButtonLoading(submitBtn, true, 'Creating account…');
    try {
      const data = await api.auth.register(fullName, email, password);
      setSession(data.token, data.citizen);
      toast(`Welcome to Setu, ${data.citizen.full_name.split(' ')[0]}.`);
      onAuthenticated(data.citizen);
    } catch (err) {
      const message = err instanceof ApiError ? err.message
        : err instanceof NetworkError ? err.message
        : 'Something went wrong. Please try again.';
      errorBox.textContent = message;
      errorBox.classList.remove('hidden');
    } finally {
      setButtonLoading(submitBtn, false, 'Create account');
    }
  });
}

export { mountAuthScreen };
