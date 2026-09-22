'use strict';

/**
 * Thin fetch client for the Setu gateway's citizen-facing API (Layer 1).
 * Every call here hits the REAL gateway over HTTP — nothing in this file
 * is mocked or stubbed. Token is kept in localStorage and attached as a
 * Bearer header on every protected call.
 *
 * Base URL resolves from window.SETU_API_BASE (set inline in index.html)
 * and falls back to the gateway's documented local default. The frontend
 * and gateway are two separate apps on two separate ports (frontend:3000,
 * gateway:4000) per tech.md, so the base can't be guessed from
 * window.location. In production the deployed frontend sets
 * window.SETU_API_BASE to the deployed gateway URL; local dev leaves it
 * unset and gets localhost:4000 unchanged.
 */

const API_BASE = (typeof window !== 'undefined' && window.SETU_API_BASE)
  || 'http://localhost:4000/api/v1';
const TOKEN_KEY = 'setu.token';
const CITIZEN_KEY = 'setu.citizen';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getCitizen() {
  const raw = localStorage.getItem(CITIZEN_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setSession(token, citizen) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(CITIZEN_KEY, JSON.stringify(citizen));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CITIZEN_KEY);
}

/**
 * ApiError carries the gateway's own error code/message through to the UI
 * so screens can render an honest, specific message rather than a generic
 * "something went wrong" — matching the "fail honestly" rule in structure.md.
 */
class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Thrown when fetch itself fails (gateway process not running, DNS, CORS). */
class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Global handler invoked whenever a protected call comes back 401 — i.e.
 * the stored token is missing/expired/rejected. app.js registers a handler
 * that clears the session and bounces to the auth screen, so a stale token
 * surfaces as "please log in again" instead of an endless "couldn't load"
 * on every data view. Kept as a callback so this file stays framework-free.
 */
let onUnauthorized = null;
function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // The gateway process isn't reachable at all — distinct from a
    // department being down, which the gateway itself reports as a normal
    // 200 { status: 'failed' } response (see api.md's relay convention).
    const isLocal = API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');
    const hint = isLocal ? ' Is it running on port 4000?' : ` (${API_BASE})`;
    throw new NetworkError(`Could not reach the Setu gateway.${hint}`);
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || (payload && payload.success === false)) {
    const err = (payload && payload.error) || {};
    // A 401 on a call we sent WITH auth means the stored token is stale —
    // clear it and let the app bounce back to login. Skip this for calls
    // that never carried a token (auth=false, e.g. login itself), so a
    // wrong password on the login form doesn't trigger a session wipe loop.
    if (res.status === 401 && auth && onUnauthorized) {
      clearSession();
      onUnauthorized();
    }
    throw new ApiError(err.code || 'UNKNOWN', err.message || `Request failed (${res.status}).`, res.status);
  }

  return payload ? payload.data : null;
}

const api = {
  auth: {
    register: (fullName, email, password) =>
      request('POST', '/auth/register', { full_name: fullName, email, password }, { auth: false }),
    login: (email, password) =>
      request('POST', '/auth/login', { email, password }, { auth: false }),
  },
  applications: {
    list: () => request('GET', '/applications'),
    create: (type) => request('POST', '/applications', { type }),
    get: (id) => request('GET', `/applications/${id}`),
    verify: (id, referenceOrPayload) => {
      let body = {};
      if (typeof referenceOrPayload === 'string') {
        body = { reference: referenceOrPayload };
      } else if (referenceOrPayload && typeof referenceOrPayload === 'object') {
        body = referenceOrPayload;
      }
      return request('POST', `/applications/${id}/verify`, body);
    },
  },
  consent: {
    grant: (applicationId, department, fieldsRequested) =>
      request('POST', '/consent', { application_id: applicationId, department, fields_requested: fieldsRequested }),
  },
  documents: {
    list: () => request('GET', '/documents'),
  },
};

export { api, ApiError, NetworkError, getToken, getCitizen, setSession, clearSession, setUnauthorizedHandler, API_BASE };
