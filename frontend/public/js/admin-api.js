'use strict';

/**
 * Fetch client for the Setu gateway's OFFICIALS/ADMIN read API (Phase A
 * backend, Part 1b in api.md). Completely separate from the citizen client
 * (js/api.js): different endpoints (/api/v1/admin/*), a different credential
 * (a shared X-Admin-Key header, NOT a citizen Bearer JWT), and its own error
 * types. Nothing here is mocked — every call hits the real gateway.
 *
 * The admin key is held in sessionStorage ONLY: it lives for the browser
 * session/tab and is gone when the tab closes. It is never written to
 * localStorage and never committed anywhere. This matches the prototype-
 * grade posture in product.md while keeping the key off durable storage.
 */

const API_BASE = 'http://localhost:4000/api/v1';
const ADMIN_KEY_STORAGE = 'setu.adminKey';

function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
}

function setAdminKey(key) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

/**
 * Raised specifically when the gateway rejects the admin key — a 401
 * (missing) or 403 (wrong / not configured). The dashboard catches this to
 * bounce back to the key prompt with a clear message, rather than showing a
 * generic "couldn't load" error. Distinct from other API errors so the two
 * are handled differently at the call site.
 */
class AdminAuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
  }
}

/** Any other non-2xx / success:false response from the gateway. */
class AdminApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
  }
}

/** Thrown when fetch itself fails (gateway process not running, DNS, CORS). */
class AdminNetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdminNetworkError';
  }
}

/**
 * Build a query string from a filters object, dropping empty/undefined
 * values so `?status=&department=` never goes out with blank params.
 */
function qs(params = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.append(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function adminGet(path, params) {
  const key = getAdminKey();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}${qs(params)}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Admin-Key': key },
    });
  } catch (err) {
    throw new AdminNetworkError('Could not reach the Setu gateway. Is it running on port 4000?');
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (res.status === 401 || res.status === 403) {
    const msg = (payload && payload.error && payload.error.message) || 'Invalid admin key.';
    throw new AdminAuthError(msg, res.status);
  }

  if (!res.ok || (payload && payload.success === false)) {
    const err = (payload && payload.error) || {};
    throw new AdminApiError(err.code || 'UNKNOWN', err.message || `Request failed (${res.status}).`, res.status);
  }

  return payload ? payload.data : null;
}

const adminApi = {
  stats: () => adminGet('/admin/stats'),
  applications: (filters) => adminGet('/admin/applications', filters),
  auditLog: (filters) => adminGet('/admin/audit-log', filters),
};

export {
  adminApi,
  getAdminKey,
  setAdminKey,
  clearAdminKey,
  AdminAuthError,
  AdminApiError,
  AdminNetworkError,
  API_BASE,
};
