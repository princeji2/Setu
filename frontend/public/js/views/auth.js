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

/* Line-art illustration for the left column — echoes the reference's
   friendly hand-drawn faces, redrawn inline as a single SVG so the demo
   keeps its zero-external-asset guarantee. Uses currentColor so it inherits
   the olive ink. */
function authArtSvg() {
  return `<svg class="auth-art-svg" viewBox="0 0 320 300" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <!-- face, glasses (left) -->
    <path d="M52 150c-14 0-24-12-22-27 2-15 15-24 30-21 6-16 30-16 37 0 14-2 24 9 22 24-2 14-13 22-27 21"/>
    <circle cx="60" cy="132" r="9"/><circle cx="86" cy="132" r="9"/><path d="M69 132h8"/><path d="M95 130l7-3"/>
    <path d="M62 148c6 6 16 6 22 0"/>
    <!-- face, bun (top) -->
    <path d="M150 92c-9-16 4-34 24-34s33 18 24 34c8 4 12 15 6 24-6 10-19 13-30 13s-24-3-30-13c-6-9-2-20 6-24Z"/>
    <path d="M162 96c4 4 12 4 16 0"/><path d="M180 96c4 4 12 4 16 0"/><circle cx="170" cy="108" r="1.6" fill="currentColor" stroke="none"/><circle cx="192" cy="108" r="1.6" fill="currentColor" stroke="none"/>
    <path d="M172 120c5 4 13 4 18 0"/>
    <path d="M186 54c0-10 8-16 16-14 8 2 11 11 6 18"/>
    <!-- face (lower) -->
    <path d="M120 210c-9-16 4-34 24-34s33 18 24 34c8 4 12 15 6 24-6 10-19 13-30 13s-24-3-30-13c-6-9-2-20 6-24Z"/>
    <circle cx="140" cy="214" r="1.6" fill="currentColor" stroke="none"/><circle cx="162" cy="214" r="1.6" fill="currentColor" stroke="none"/>
    <path d="M142 226c5 4 13 4 18 0"/>
    <!-- pointing hand (right) -->
    <path d="M244 150c0-8 3-14 3-22 0-5 7-5 7 0v14c3-4 9-3 9 2 4-3 9-1 9 3 3-2 8 0 8 4 0 12-4 26-14 30-10 4-22 0-27-9-3-6-2-14 2-19Z"/>
    <!-- sparkle -->
    <path d="M268 96l3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" class="auth-art-spark"/>
  </svg>`;
}

function authScreenHtml() {
  const iconEye = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

  return `
  <section class="auth-screen">
    <div class="auth-grid" id="authCard">

      <!-- ILLUSTRATION COLUMN -->
      <aside class="auth-art-col" aria-hidden="true">
        <div class="brand auth-brand">
          <div class="mark">${brandMarkSvg()}</div>
          <div class="word">Setu<span>.</span></div>
        </div>
        <div class="auth-art">${authArtSvg()}</div>
      </aside>

      <!-- FORM COLUMN -->
      <div class="auth-form-col">
        <div class="auth-form-inner">

          <!-- SIGN IN -->
          <form class="auth-form sign-in-form" id="loginForm" novalidate>
            <h1 class="auth-title">Sign in</h1>
            <p class="auth-sub">New to Setu? <button type="button" class="auth-link" id="toRegister">Create an account</button></p>
            <div id="loginError" class="auth-form-error hidden"></div>

            <label class="af-field">
              <span class="af-label">E-mail</span>
              <input id="loginEmail" type="email" autocomplete="email" placeholder="you@example.com" required>
            </label>
            <label class="af-field">
              <span class="af-label">Password</span>
              <span class="af-input-wrap">
                <input id="loginPassword" type="password" autocomplete="current-password" placeholder="••••••••" required>
                <button type="button" class="af-reveal" data-reveal="loginPassword" aria-label="Show password">${iconEye}</button>
              </span>
            </label>

            <button type="submit" class="auth-submit" id="loginSubmit">Sign in</button>
          </form>

          <!-- SIGN UP -->
          <form class="auth-form sign-up-form hidden" id="registerForm" novalidate>
            <h1 class="auth-title">Sign up</h1>
            <p class="auth-sub">Already have an account? <button type="button" class="auth-link" id="toLogin">Sign in</button></p>
            <div id="registerError" class="auth-form-error hidden"></div>

            <label class="af-field">
              <span class="af-label">Full name</span>
              <input id="registerName" type="text" autocomplete="name" placeholder="Sam Lee" required>
            </label>
            <label class="af-field">
              <span class="af-label">E-mail</span>
              <input id="registerEmail" type="email" autocomplete="email" placeholder="you@example.com" required>
            </label>
            <label class="af-field">
              <span class="af-label">Password</span>
              <span class="af-input-wrap">
                <input id="registerPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" required>
                <button type="button" class="af-reveal" data-reveal="registerPassword" aria-label="Show password">${iconEye}</button>
              </span>
            </label>

            <label class="af-check">
              <input type="checkbox" id="registerConsent" required>
              <span>I agree that Setu may contact departments on my behalf, and that every call is logged. I acknowledge the consent-based data flow.</span>
            </label>

            <button type="submit" class="auth-submit" id="registerSubmit">Sign up</button>
          </form>

          <!-- Officials console pointer. Deliberately low-emphasis: this is a
               "wrong portal?" footnote for government officials, NOT a citizen
               action. Plain <a> to /admin.html — no auth handoff, since
               admin.html has its own separate X-Admin-Key gate. -->
          <p class="auth-officials-footer">
            <a href="/admin.html">Officials Console &rarr;</a>
          </p>
        </div>
      </div>

    </div>
  </section>`;
}

function setButtonLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span> ${escapeHtml(label)}` : label;
}

function mountAuthScreen(root, onAuthenticated, { notice } = {}) {
  root.innerHTML = authScreenHtml();

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
    const firstInput = (signUp ? registerForm : loginForm).querySelector('input');
    if (firstInput) firstInput.focus();
  }
  document.getElementById('toRegister').addEventListener('click', () => showForm('register'));
  document.getElementById('toLogin').addEventListener('click', () => showForm('login'));

  // Password reveal toggles — flip the target input's type between
  // password/text. Purely a UI convenience; no bearing on submit.
  root.querySelectorAll('.af-reveal').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.reveal);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('is-on', show);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

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
