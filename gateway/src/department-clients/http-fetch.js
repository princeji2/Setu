'use strict';

/**
 * Shared HTTP fetch helper for the three department clients — Layer 2.
 *
 * The retry/backoff/parse/log block was byte-identical across the three
 * `*-client.js` files; only the status→outcome mapping and `translate()`
 * differ per department. This module owns the common concern so retry /
 * backoff / "temporarily unavailable" / observability behave IDENTICALLY
 * for all three (one implementation, not three copies that can drift), and
 * so request-header redaction lives in exactly ONE place.
 *
 * Behavior preserved from the previous inline loop:
 *   - retryCodes = {502,503,504}; retries those statuses OR a caught fetch
 *     exception, within maxRetryMs = Math.min(timeoutMs - 5000, 35000).
 *   - per-attempt signal: AbortSignal.timeout(Math.min(15000, Math.max(5000,
 *     timeoutMs - (Date.now() - start)))).
 *   - request headers set here, and ONLY here: X-Gateway-Key + Accept.
 *
 * Changed vs. the previous inline loop:
 *   - fixed 3000ms sleep → exponential backoff with jitter:
 *       delay = min(1000 * 2^n, 8000) + random(0..500) ms   (n = attempt idx)
 *     still bounded by maxRetryMs (only sleep if it fits the budget).
 *   - body is single-consumed via res.text() then JSON.parse (a suspended
 *     service returns an HTML page, so res.json() would throw and we'd lose
 *     the text we need for the log preview).
 *
 * Return — ONE of:
 *   (a) terminal transport failure (no response within budget):
 *       { kind: 'timeout' | 'unreachable', durationMs }
 *       The client supplies the department-named message + endpoint.
 *   (b) terminal exhausted-retry 502/503/504:
 *       { kind: 'unavailable', status, durationMs }
 *       The helper has ALREADY emitted the observability log for this case.
 *   (c) a received response for the client to map (200/404/401/400/unexpected):
 *       { kind: 'response', res, body, bodyTextPreview, durationMs }
 *
 * Observability split (kept identical for all three clients):
 *   - the HELPER logs once for the `unavailable` case (just before returning).
 *   - the CLIENT logs once for the `unexpected` case, reusing `res` +
 *     `bodyTextPreview` from the `response` result via logUpstreamSignal().
 * Both go through logUpstreamSignal() so the exact call + redaction are shared.
 */

const RETRY_CODES = new Set([502, 503, 504]);

/**
 * Response-side observability log. Redaction (HARD rules):
 *   - NEVER log X-Gateway-Key or any Authorization header.
 *   - NEVER log request headers at all — response side only.
 * The allow-list of response headers below is exhaustive; absent headers are
 * left undefined (not logged as null noise).
 *
 * @param {object} p
 * @param {string} p.departmentHumanName e.g. 'Digital Tax Records'
 * @param {string} p.endpoint method+path only, e.g. 'GET /pan/SYNPAN-000123/fields'
 * @param {Response} p.res the received response (headers read response-side only)
 * @param {string} p.bodyTextPreview first 300 chars of the raw text body
 */
function logUpstreamSignal({ departmentHumanName, endpoint, res, bodyTextPreview }) {
  console.warn('[dept-client] upstream signal', {
    department: departmentHumanName,
    request: endpoint,
    status: res.status,
    headers: {
      'retry-after': res.headers.get('retry-after') || undefined,
      'content-type': res.headers.get('content-type') || undefined,
      server: res.headers.get('server') || undefined,
      'cf-ray': res.headers.get('cf-ray') || undefined,
      'x-render-routing': res.headers.get('x-render-routing') || undefined,
    },
    bodyPreview: bodyTextPreview,
  });
}

/**
 * Run the retry loop and return a normalized result (see module doc).
 *
 * @param {object} p
 * @param {string} p.url fully-qualified URL to GET
 * @param {string} p.gatewayKey this department's X-Gateway-Key (never logged)
 * @param {number} p.timeoutMs overall budget (default 45000 upstream)
 * @param {number} p.start Date.now() captured by the client before branching
 * @param {Function} p.fetchImpl fetch implementation (injectable for tests)
 * @param {string} p.departmentHumanName human name for the observability log
 * @param {string} p.endpoint method+path only, for the observability log
 */
async function fetchWithRetry({ url, gatewayKey, timeoutMs, start, fetchImpl, departmentHumanName, endpoint }) {
  let res = null;
  let lastErr = null;
  const retryStart = Date.now();
  const maxRetryMs = Math.min(timeoutMs - 5000, 35000);
  let attempt = 0;

  while (Date.now() - retryStart < maxRetryMs) {
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { 'X-Gateway-Key': gatewayKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(Math.min(15000, Math.max(5000, timeoutMs - (Date.now() - start)))),
      });
      lastErr = null;
      if (!RETRY_CODES.has(res?.status)) {
        break;
      }
    } catch (fetchErr) {
      lastErr = fetchErr;
      res = null;
    }

    // Exponential backoff with jitter: 1s, 2s, 4s, 8s… capped at 8s, +0..500ms.
    const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 500);
    attempt += 1;
    if (Date.now() - retryStart + delay < maxRetryMs) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      break;
    }
  }

  // (a) Transport failure after exhausting the budget — no response at all.
  if (!res && lastErr) {
    const durationMs = Date.now() - start;
    const isTimeout = lastErr.name === 'TimeoutError' || lastErr.name === 'AbortError';
    return { kind: isTimeout ? 'timeout' : 'unreachable', durationMs };
  }

  const durationMs = Date.now() - start;

  // Single-consume the body: read the raw text ONCE, then try to JSON-parse it.
  // (A suspended service returns an HTML page, so JSON.parse throws and we fall
  // back to a null object body while keeping the text preview for logging.)
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  const bodyTextPreview = (text || '').slice(0, 300);
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  // (b) Exhausted-retry 502/503/504 — log once, return the terminal outcome.
  if (RETRY_CODES.has(res.status)) {
    logUpstreamSignal({ departmentHumanName, endpoint, res, bodyTextPreview });
    return { kind: 'unavailable', status: res.status, durationMs };
  }

  // (c) A received response for the client to map (200/404/401/400/unexpected).
  return { kind: 'response', res, body, bodyTextPreview, durationMs };
}

module.exports = { fetchWithRetry, logUpstreamSignal };
