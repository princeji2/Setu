'use strict';

/**
 * Auth screen (login/register switcher). Structural intent adapted from
 * refrences/signin.txt + signup.txt (split panel: form on one side, brand
 * copy on the other) — but rebuilt against the gateway's ACTUAL auth
 * contract (hand-rolled email+password, no OAuth) rather than the
 * reference's Google/Apple/social buttons, which don't exist here and
 * would imply a login flow the gateway doesn't have (flagged per
 * HOW_TO_USE_REFRENCES.md rather than stubbed silently).
 */

import { api, ApiError, NetworkError, setSession } from '../api.js';
import { netmapSvg, brandMarkSvg } from '../netmap.js';
import { toast, escapeHtml } from '../util.js';

function authScreenHtml() {
  return `
  <div class="auth-screen">
    <div class="auth-panel">
      <div class="auth-card">
        <div class="brand">
          <div class="brand" style="gap:11px">
            <div class="mark">${brandMarkSvg()}</div>
            <div class="word">Setu<span>.</span></div>
          </div>
        </div>

        <div id="authLoginPane">
          <h1>Welcome back</h1>
          <p class="sub">Log in once to reach every department connected to Setu.</p>
          <div id="loginError" class="auth-form-error hidden"></div>
          <form id="loginForm">
            <div class="field">
              <label for="loginEmail">Email</label>
              <input id="loginEmail" type="email" autocomplete="email" required>
            </div>
            <div class="field">
              <label for="loginPassword">Password</label>
              <input id="loginPassword" type="password" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block" id="loginSubmit">Log in</button>
          </form>
          <p class="auth-switch-line">New to Setu? <button type="button" id="toRegister">Create an account</button></p>
        </div>

        <div id="authRegisterPane" class="hidden">
          <h1>Create your Setu ID</h1>
          <p class="sub">One identity, verified once per department, reused everywhere it's accepted.</p>
          <div id="registerError" class="auth-form-error hidden"></div>
          <form id="registerForm">
            <div class="field">
              <label for="registerName">Full name</label>
              <input id="registerName" type="text" autocomplete="name" required>
            </div>
            <div class="field">
              <label for="registerEmail">Email</label>
              <input id="registerEmail" type="email" autocomplete="email" required>
            </div>
            <div class="field">
              <label for="registerPassword">Password</label>
              <input id="registerPassword" type="password" autocomplete="new-password" minlength="8" required>
              <div class="field-hint">At least 8 characters.</div>
            </div>
            <button type="submit" class="btn btn-primary btn-block" id="registerSubmit">Create account</button>
          </form>
          <p class="auth-switch-line">Already have an account? <button type="button" id="toLogin">Log in</button></p>
        </div>
      </div>
    </div>

    <div class="auth-visual">
      <div class="netmap">${netmapSvg('dark')}</div>
      <div class="copy">
        <div class="kicker">Smart India Hackathon &middot; SIH26129</div>
        <h2>One login, three departments, verified through a gateway.</h2>
        <p>Setu links Digital Tax Records, the National Identity Registry and the Driving Licence &amp; Jan Aadhaar Portal behind a single citizen login — a document verified once doesn't need to be uploaded again.</p>
      </div>
    </div>
  </div>`;
}

function setButtonLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span> ${escapeHtml(label)}` : label;
}

function mountAuthScreen(root, onAuthenticated) {
  root.innerHTML = authScreenHtml();

  const loginPane = document.getElementById('authLoginPane');
  const registerPane = document.getElementById('authRegisterPane');

  document.getElementById('toRegister').addEventListener('click', () => {
    loginPane.classList.add('hidden');
    registerPane.classList.remove('hidden');
  });
  document.getElementById('toLogin').addEventListener('click', () => {
    registerPane.classList.add('hidden');
    loginPane.classList.remove('hidden');
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
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

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
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
