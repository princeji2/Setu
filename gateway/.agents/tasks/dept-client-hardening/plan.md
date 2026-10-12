# Implementation Plan — Department-Client Hardening (Setu Gateway)

## Context (confirmed by reading the code)

Root cause is already diagnosed and is NOT in scope to re-fix: the three mock
department services on Render (DTR `setu-dtr`, NIR `setu-nir`, DLJA `setu-dlja`)
are **suspended** and return HTTP **503** (Cloudflare "This service has been
suspended." HTML). The gateway (`setu-gateway-v2.onrender.com`) is healthy.
Resuming the services is a manual Render action the user performs separately.
This task is ONLY the code hardening so a down / suspended / cold-starting
department is handled well and reported honestly, plus a config-URL fix.

### Current client behavior (all three identical in this concern)
Each of the three `*-client.js` files has a `fetchFields()` with:
- A retry loop: `while (Date.now() - retryStart < maxRetryMs)` where
  `maxRetryMs = Math.min(timeoutMs - 5000, 35000)`, `timeoutMs` default 45000.
- `retryCodes = new Set([502, 503, 504])`; retries on those statuses or on a
  caught fetch exception, with a **fixed 3000ms** `setTimeout` sleep between
  attempts, bounded so it won't sleep past the budget.
- Per-attempt `signal: AbortSignal.timeout(Math.min(15000, Math.max(5000, timeoutMs - (Date.now() - start))))`.
- After the loop: if `!res && lastErr` → returns `outcome:'timeout'` (when
  `lastErr.name` is `TimeoutError`/`AbortError`) or `outcome:'unreachable'`.
- Else parses body via `await res.json()` in try/catch, then branches on
  status `200` (success → `translate(body.data)`), `404` (`not_found`),
  `401` (`auth_error`), `400` (`rejected`), and a **fall-through** returning
  `outcome:'unexpected'`, `statusCode: res.status`, message
  `"<Department> returned an unexpected status (${res.status})."`.
- Every return is `{ outcome, statusCode, endpoint, durationMs, data, error }`.
- Exports: `{ create<Dept>Client, translate, DEPARTMENT }`.

Department human names (keep verbatim in messages):
- DTR → `Digital Tax Records`
- NIR → `National Identity Registry`
- DLJA → `Driving Licence & Jan Aadhaar Portal`

Each client also has pre-loop endpoint/path branching by reference prefix
(DTR: `PANCARD-`, `INC-`/`INCOME-`; NIR: `VOTER-`/`EPIC-`, `BIRTH-`/`BC-`;
DLJA: `RC-`/`VEH-`, `PASS-`/`PPT-`). This branching and each `translate()`
MUST remain untouched.

### Consumer (do NOT modify its branching)
`src/citizen-api/services/relay-service.js` consumes `result.outcome`:
`succeeded = result.outcome === 'success'`. Any non-success outcome →
application status `failed`, `result.error` surfaced to the citizen,
`result.outcome` recorded in `audit_log` (`department_call` detail) and the
`application_department_calls` row. **A new `unavailable` outcome needs NO
relay change** — it flows through the existing non-success path exactly like
`timeout`/`unreachable`, and `result.statusCode` (the real 503) is logged.

### Frontend outcome copy — FINDING (no new frontend structure needed)
`frontend/public/js/views/relay.js` renders failures via
`renderRelayFailure(message, outcome)` which generically prints
`result.message` and `Outcome code: ${outcome}`. **There is NO per-outcome
copy map.** So the new `unavailable` outcome renders correctly with zero
frontend code change: the message ("… is temporarily unavailable. Please try
again in a minute.") and `Outcome code: unavailable` both display. The ONLY
frontend change in this task is the `admin.html` API-base URL fix below.

### Verification baseline
`npm test` from `gateway/` currently passes **89/89** (node:test runner,
`--test` over the explicit file list in `package.json`). Tests inject FAKE
clients, so adding a helper + new outcome does not disturb existing tests.

---

## Decision: EXTRACT a shared helper (`http-fetch.js`) — rationale

The retry/backoff/parse/log block is byte-identical across all three clients;
only the status→outcome mapping and `translate()` differ. Extracting the loop
into ONE module (`src/department-clients/http-fetch.js`) is the task's stated
strong preference and is the lower-risk choice here because:
- It **guarantees behavioral parity** for the retry/unavailable/logging
  concern (one implementation, not three copies that can drift).
- It **centralizes redaction** — the sensitive `X-Gateway-Key` request header
  is set in exactly one place and response-only logging lives in one function,
  so a key leak can't creep into one divergent copy.
- Each client keeps its own endpoint branching, status mapping, messages and
  `translate()`, so the department-specific surface is unchanged.

The helper returns a normalized result the client maps to its own outcomes,
OR a ready-made terminal outcome for the department-agnostic cases
(timeout / unreachable / unavailable). Public client shape and exports are
unchanged.

### Exponential-backoff formula (exact)
Per retry attempt index `n` starting at 0:
`delay = min(1000 * 2^n, 8000) + random(0..500)` ms
→ ~1s, 2s, 4s, 8s, 8s… each with up to 500ms jitter. The sleep is still
bounded by the existing budget: only sleep if
`Date.now() - retryStart + delay < maxRetryMs`, else break (same guard shape
as the current fixed-3000ms code, with `delay` substituted for `3000`).
`maxRetryMs = Math.min(timeoutMs - 5000, 35000)` is **unchanged**. Per-attempt
`AbortSignal.timeout(...)` logic is **unchanged**. Transport errors (caught
fetch exceptions) are retried within the same budget as now.

### Body single-consume rule (exact)
Replace `await res.json()` with: read `const text = await res.text()` ONCE,
then `let body = null; try { body = JSON.parse(text); } catch { body = null; }`.
This yields both an object `body` (when JSON) for the 200/… branches AND a
`bodyTextPreview = text.slice(0, 300)` for logging — without double-consuming
the stream (critical: a 503 Cloudflare page is HTML, so `res.json()` throws
and we need the text anyway).

### Observability log (exact call + redaction rules)
When the final received response status is retryable (502/503/504, →
`unavailable`) OR unexpected (not in {200,404,401,400,502,503,504}), log
**once** with `console.warn`, immediately before returning that outcome:

```js
console.warn('[dept-client] upstream signal', {
  department: departmentHumanName,       // e.g. 'Digital Tax Records'
  request: endpoint,                     // method+path only, e.g. 'GET /pan/SYNPAN-000123/fields'
  status: res.status,
  headers: {                             // RESPONSE headers only; include only if present
    'retry-after': res.headers.get('retry-after') || undefined,
    'content-type': res.headers.get('content-type') || undefined,
    server: res.headers.get('server') || undefined,
    'cf-ray': res.headers.get('cf-ray') || undefined,
    'x-render-routing': res.headers.get('x-render-routing') || undefined,
  },
  bodyPreview: bodyTextPreview,          // first 300 chars of raw text body
});
```
REDACTION (hard rules): NEVER log `X-Gateway-Key` or any `Authorization`
header. NEVER log request headers at all — response side only. The allow-list
of response headers above is exhaustive; omit any that are absent (don't log
`null`/`undefined` noise — fine to leave them `undefined` in the object).

---

## Ordered implementation steps

- [ ] 1. Create the shared fetch helper.
      Add `src/department-clients/http-fetch.js` exporting
      `fetchWithRetry({ url, gatewayKey, timeoutMs, start, fetchImpl, departmentHumanName })`.
      It runs the retry loop with the exponential-backoff-with-jitter formula
      and the `maxRetryMs = Math.min(timeoutMs - 5000, 35000)` budget, keeps
      the per-attempt `AbortSignal.timeout(Math.min(15000, Math.max(5000, timeoutMs - (Date.now() - start))))`,
      sets ONLY `{ 'X-Gateway-Key': gatewayKey, Accept: 'application/json' }`,
      and single-consumes the body via `res.text()` + `JSON.parse`. It returns
      ONE of:
        (a) a ready-made terminal outcome object `{ terminal: true, outcome }`
            where `outcome` is the full `{ outcome, statusCode, endpoint:null?, durationMs, data:null, error }`-less
            core for the department-agnostic cases — specifically:
            - transport failure after budget: `{ kind:'timeout' }` or
              `{ kind:'unreachable' }` (helper reports which; client fills the
              department-named message, endpoint, durationMs);
            - exhausted-retry 502/503/504: `{ kind:'unavailable', status }`.
        (b) a normalized received-response result
            `{ kind:'response', res, body, bodyTextPreview, durationMs }` for
            the client to map (200/404/401/400/unexpected).
      The helper performs the `console.warn` observability log (exact call +
      redaction above) for the `unavailable` case and leaves the `unexpected`
      log to the client OR performs it when the client signals an unexpected
      status — choose one placement and keep it identical for all three; the
      simplest is: helper logs for `unavailable`; client logs for `unexpected`
      using the same `bodyTextPreview`/headers it receives from the helper
      (so the helper must surface `res` + `bodyTextPreview` in the `response`
      result, which it does). Document the chosen split in a header comment.
      Files: `gateway/src/department-clients/http-fetch.js`
      Verify: `node -e "require('./src/department-clients/http-fetch.js')"`
      from `gateway/` exits 0 (module loads).

- [ ] 2. Rewire Digital Tax Records client onto the helper + add `unavailable`.
      In `digital-tax-records-client.js`, replace the inline retry loop and
      body parse inside `fetchFields()` with a call to `fetchWithRetry({...})`
      (`departmentHumanName: 'Digital Tax Records'`). Keep the pre-loop
      endpoint/path prefix branching and `translate()` exactly as-is. Map the
      helper result: terminal `timeout`/`unreachable` → existing messages;
      terminal `unavailable` → NEW return `{ outcome:'unavailable', statusCode: <real upstream status>, endpoint, durationMs, data:null, error:'Digital Tax Records is temporarily unavailable. Please try again in a minute.' }`.
      For a received response map 200/404/401/400 to the EXISTING outcomes and
      messages verbatim; keep the fall-through `unexpected` with its existing
      message, and emit the observability `console.warn` for the `unexpected`
      case per step 1's split. Keep exports `{ createDigitalTaxRecordsClient, translate, DEPARTMENT }` identical.
      Files: `gateway/src/department-clients/digital-tax-records-client.js`
      Verify: `npm test` from `gateway/` still passes 89/89 (DTR relay tests
      use fake clients, so unchanged) AND the step-6 stub script asserts
      `unavailable`/`503` for this client.

- [ ] 3. Apply the identical change to the National Identity Registry client.
      Same edit as step 2 with `departmentHumanName: 'National Identity Registry'`
      and the `unavailable` message `'National Identity Registry is temporarily unavailable. Please try again in a minute.'`.
      Preserve NIR's endpoint prefix branching (`VOTER-`/`EPIC-`, `BIRTH-`/`BC-`),
      its `translate()` (note `identityReference`), and exports.
      Files: `gateway/src/department-clients/national-identity-registry-client.js`
      Verify: `npm test` from `gateway/` still 89/89 AND step-6 stub asserts
      `unavailable`/`503` for this client.

- [ ] 4. Apply the identical change to the Driving Licence & Jan Aadhaar client.
      Same edit as step 2 with `departmentHumanName: 'Driving Licence & Jan Aadhaar Portal'`
      and the `unavailable` message `'Driving Licence & Jan Aadhaar Portal is temporarily unavailable. Please try again in a minute.'`.
      Preserve DLJA's endpoint prefix branching (`RC-`/`VEH-`, `PASS-`/`PPT-`),
      its differently-shaped `translate()` (uses `registration_reference` /
      `verification_status`), and exports.
      Files: `gateway/src/department-clients/driving-licence-jan-aadhaar-client.js`
      Verify: `npm test` from `gateway/` still 89/89 AND step-6 stub asserts
      `unavailable`/`503` for this client.

- [ ] 5. Fix the deployed gateway-URL mismatch (two files).
      5a. `frontend/public/admin.html` — in the inline
          `window.SETU_API_BASE = ... : 'https://setu-gateway.onrender.com/api/v1';`
          replace the deployed branch value
          `'https://setu-gateway.onrender.com/api/v1'`
          → `'https://setu-gateway-v2.onrender.com/api/v1'`.
          Keep the `/api/v1` suffix, no trailing slash. (The comment example
          on line ~22 may be left or updated to match; the LIVE value on the
          ternary's `:` branch is the one that must change. Do NOT touch the
          `localhost` branch.)
      5b. `gateway/src/server.js` — in `startKeepAlive()` `targets`, replace
          `'https://setu-gateway.onrender.com/api/v1/health'`
          → `'https://setu-gateway-v2.onrender.com/api/v1/health'`.
          Keep the `/api/v1/health` suffix.
      Do NOT touch `frontend/public/index.html` — its live branch already uses
      `setu-gateway-v2` (only a comment example mentions the old host; leave it).
      Files: `frontend/public/admin.html`, `gateway/src/server.js`
      Verify: step-7 grep below finds NO remaining live
      `setu-gateway.onrender.com` without `-v2` outside comment examples.

- [ ] 6. Add a throwaway stub test proving the `unavailable` mapping.
      Write a temporary Node script (e.g. `gateway/tmp-unavailable-check.js`,
      deleted after) that, for each of the three clients, injects a
      `fetchImpl` returning a stub `Response`-like object with
      `status: 503`, HTML `text()` of a Cloudflare "This service has been
      suspended." page, and a `headers.get()` stub, then calls
      `fetchFields('SYNPAN-000123' | 'TESTAADHAAR0001' | 'REG-4C3978A0')` and
      asserts `outcome === 'unavailable'`, `statusCode === 503`, and the
      message contains the department human name + "temporarily unavailable".
      Keep `timeoutMs` small (e.g. 7000, so `maxRetryMs` ≈ 2000) so the retry
      loop exhausts fast and the test runs in a couple seconds.
      Files: `gateway/tmp-unavailable-check.js` (temporary; remove when done)
      Verify: `node tmp-unavailable-check.js` from `gateway/` prints all three
      asserts passing and exits 0; then delete the file.

- [ ] 7. Final verification sweep.
      Run, from `gateway/`: `npm test` (expect 89/89) and
      `node -e "require('./src/department-clients/digital-tax-records-client.js'); require('./src/department-clients/national-identity-registry-client.js'); require('./src/department-clients/driving-licence-jan-aadhaar-client.js'); require('./src/department-clients/http-fetch.js'); console.log('require-ok')"`
      (expect `require-ok`). Then grep for any remaining live old host:
      `Select-String -Path (Get-ChildItem -Recurse c:\Users\Prince\OneDrive\Desktop\Setu\frontend\public\*.html, c:\Users\Prince\OneDrive\Desktop\Setu\gateway\src\*.js).FullName -Pattern "setu-gateway\.onrender\.com" | Where-Object { $_.Line -notmatch "setu-gateway-v2" }`
      — expect only comment-example lines (index.html / admin.html doc
      comments), NO live assignment lines.
      Files: none (verification only)
      Verify: all three checks green as described.

---

## Verification commands summary
- `npm test` (from `gateway/`) → 89/89 pass, no regressions.
- Throwaway stub script → `unavailable` / `503` / friendly message for all
  three clients (step 6), then deleted.
- `node -e "require(...)"` for all three clients + `http-fetch.js` → `require-ok`.
- Grep: no live `setu-gateway.onrender.com` without `-v2` (comment examples OK).

## Items flagged "verify during implementation" (not dismissed)
- `index.html` live branch already `-v2` — confirmed by reading; leave as-is,
  re-confirm the exact string before deciding not to edit.
- No per-outcome copy map in `relay.js` — confirmed; re-confirm no other
  frontend file maps outcomes before concluding no FE change beyond admin.html.
- `relay-service.js` branching unchanged — the new `unavailable` outcome rides
  the existing non-success path; confirm `result.statusCode` (503) lands in
  the audit log / calls row during the stub run if feasible.
