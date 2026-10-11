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
 * Thrown when the gateway didn't answer in time. Separated from
 * NetworkError so the UI can say "the server is waking up" (expected on
 * Render's free tier after idle) rather than "unreachable" (looks broken).
 */
class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// --- Cold-start / retry tuning -------------------------------------------
// Render's free tier spins the gateway down after ~15 min idle; the first
// request after that takes 30-60s to cold-start. We give each attempt a
// generous timeout and retry a couple of times with backoff so a sleeping
// server wakes up transparently instead of failing on the first try.
const REQUEST_TIMEOUT_MS = 60000; // 60s per attempt — covers a full cold start
const MAX_ATTEMPTS = 3;           // 1 initial + 2 retries
const RETRY_BASE_DELAY_MS = 1500; // backoff: 1.5s, then 3s

// Optional callback the UI can register to show "waking up the server…"
// while a request is being retried. Kept as a callback so this file stays
// framework-free (same pattern as onUnauthorized below).
let onRetry = null;
function setRetryHandler(fn) {
  onRetry = fn;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isLocalBase = () =>
  API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');

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

  const hint = isLocalBase() ? ' Is it running on port 4000?' : ` (${API_BASE})`;

  let res = null;
  let lastTransportError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Each attempt gets its own abort timer. On Render's free tier the very
    // first request after idle can take most of a minute to cold-start, so
    // the timeout is deliberately generous rather than a snappy 5-10s.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastTransportError = null;
      break; // got an HTTP response (any status) — stop retrying at transport level
    } catch (err) {
      clearTimeout(timer);
      lastTransportError = err;
      // Retry transport failures (gateway asleep / cold-starting / transient
      // network blip) with backoff. A department being down is NOT this —
      // the gateway reports that as a normal 200 { status: 'failed' } body
      // (see api.md's relay convention), which never lands here.
      if (attempt < MAX_ATTEMPTS) {
        if (onRetry) onRetry({ attempt, maxAttempts: MAX_ATTEMPTS });
        await sleep(RETRY_BASE_DELAY_MS * attempt); // 1.5s, then 3s
        continue;
      }
    }
  }

  // Exhausted all attempts without any HTTP response — classify the failure
  // so the banner is accurate (timeout vs. unreachable) instead of generic.
  if (!res) {
    if (lastTransportError && lastTransportError.name === 'AbortError') {
      throw new TimeoutError(
        `The Setu gateway didn't respond in time. It may be waking up — please try again in a moment.${hint}`,
      );
    }
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
    // Distinct message for a 5xx the server itself returned (as opposed to
    // never reaching it) — including Render's 502/503 while a service is
    // suspended or still booting — so "server error" isn't confused with
    // "bad credentials". The gateway's own JSON error (if any) wins; this
    // is the fallback when the body is empty or non-JSON (e.g. Render's
    // HTML "Service Suspended" page).
    if (res.status >= 500 && !(payload && payload.error && payload.error.message)) {
      throw new ApiError(
        'SERVER_ERROR',
        `The Setu gateway is temporarily unavailable (HTTP ${res.status}). Please try again shortly.`,
        res.status,
      );
    }
    throw new ApiError(err.code || 'UNKNOWN', err.message || `Request failed (${res.status}).`, res.status);
  }

  return payload ? payload.data : null;
}

/**
 * Fire-and-forget liveness ping used to wake a sleeping Render instance
 * before the citizen interacts. Never throws — a failure here is silent
 * (the real request path handles retries/errors). Resolves true if the
 * gateway answered 200, false otherwise.
 */
async function pingHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
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

export {
  api,
  ApiError,
  NetworkError,
  TimeoutError,
  getToken,
  getCitizen,
  setSession,
  clearSession,
  setUnauthorizedHandler,
  setRetryHandler,
  pingHealth,
  API_BASE,
};
