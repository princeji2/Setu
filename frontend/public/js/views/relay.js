'use strict';

/**
 * The consent modal + relay centerpiece — the heart of the demo.
 *
 * Flow (mirrors appflow.md exactly, no shortcuts):
 *   1. openServiceFlow(service) — shows the consent modal for a service.
 *      If the citizen has no verified reference for this department yet,
 *      a reference input is shown (first-time path). If one already
 *      exists, the input is skipped entirely and a "reusing your verified
 *      <department>" note is shown instead — this is the on-screen reuse
 *      signal the user asked for (no new backend endpoint; driven purely
 *      by GET /documents + POST verify's own `reused` flag).
 *   2. Approve & continue -> POST /consent, then create (or reuse) the
 *      application, then call POST /applications/:id/verify.
 *   3. The relay centerpiece shows the submitted -> gateway_relay ->
 *      department_verifying -> complete/failed track and, on completion,
 *      the real response_summary + reused flag pulled from a follow-up
 *      GET /applications/:id — never fabricated.
 *
 * Business-level failure (department says "not found"/"rejected") and
 * infrastructure failure (gateway/department unreachable) are rendered
 * as distinct states, per design.md's error-handling section.
 */

import { api, ApiError, NetworkError } from '../api.js';
import { toast, escapeHtml, DEPARTMENT_LABELS } from '../util.js';

let onSettled = null; // callback invoked after a relay completes, to refresh other views

function setRelayCallback(fn) {
  onSettled = fn;
}

function consentModalHtml(service, reuseReference) {
  const rows = service.fieldsRequested
    .map(
      (f) => `<div class="consent-row"><div><div class="fld">${escapeHtml(f)}</div><div class="from">from ${escapeHtml(service.departmentLabel)}</div></div>Required</div>`
    )
    .join('');

  const referenceBlock = reuseReference
    ? `<div class="field-hint" style="margin:-4px 0 16px">Reusing your verified reference from ${escapeHtml(service.departmentLabel)} — no re-entry needed.</div>`
    : `<div class="field reference-field">
         <label for="consentReference">${escapeHtml(service.referenceLabel)}</label>
         <input id="consentReference" type="text" placeholder="${escapeHtml(service.referencePlaceholder)}" required>
       </div>`;

  return `
  <div class="modal-veil open" id="consentVeil">
    <div class="modal">
      <div class="kicker">${escapeHtml(service.departmentLabel)}</div>
      <h3>${escapeHtml(service.name)}</h3>
      <p class="desc">Setu will fetch and share only the fields below, for this application only.</p>
      <div>${rows}</div>
      ${referenceBlock}
      <div id="consentModalError" class="auth-form-error hidden" style="margin-top:14px"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="consentCancel">Cancel</button>
        <button class="btn btn-primary" id="consentApprove">Approve &amp; continue</button>
      </div>
    </div>
  </div>`;
}

function closeConsentModal() {
  document.getElementById('consentVeil')?.remove();
}

/**
 * @param {object} service  a catalog entry (see catalog.js)
 * @param {string|null} reuseReference  a previously verified department_reference, if any
 */
function openServiceFlow(service, reuseReference) {
  const host = document.getElementById('modalHost');
  host.insertAdjacentHTML('beforeend', consentModalHtml(service, reuseReference));

  const veil = document.getElementById('consentVeil');
  veil.addEventListener('click', (e) => { if (e.target === veil) closeConsentModal(); });
  document.getElementById('consentCancel').addEventListener('click', closeConsentModal);
  document.getElementById('consentApprove').addEventListener('click', () =>
    approveAndRelay(service, reuseReference)
  );
}

async function approveAndRelay(service, reuseReference) {
  const errorBox = document.getElementById('consentModalError');
  const approveBtn = document.getElementById('consentApprove');
  const referenceInput = document.getElementById('consentReference');
  const reference = reuseReference || referenceInput?.value.trim();

  if (!reuseReference && !reference) {
    errorBox.textContent = `${service.referenceLabel} is required.`;
    errorBox.classList.remove('hidden');
    return;
  }

  errorBox.classList.add('hidden');
  approveBtn.disabled = true;
  approveBtn.innerHTML = '<span class="spinner"></span> Submitting…';

  try {
    // Story 2: create the application (no file upload field, ever).
    const application = await api.applications.create(service.type);

    // Story 3: consent is written BEFORE any department call — the gateway
    // enforces this server-side; we don't skip it even on reuse.
    await api.consent.grant(application.id, service.department, service.fieldsRequested);

    closeConsentModal();
    toast('Consent approved — contacting the department now.');

    // Reuse path (Story 8): pass no reference at all when reusing, so the
    // gateway itself resolves it from linked_references and reports
    // reused:true — the frontend never claims reuse on its own, it only
    // displays what the gateway's own response says.
    await runRelay(application.id, reuseReference ? undefined : reference, service);
  } catch (err) {
    approveBtn.disabled = false;
    approveBtn.textContent = 'Approve & continue';
    const message = err instanceof ApiError ? err.message
      : err instanceof NetworkError ? err.message
      : 'Something went wrong. Please try again.';
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }
}

function relayCardHtml(service) {
  return `
  <div class="relay-veil" id="relayVeil">
    <div class="relay-card" id="relayCard">
      <div class="relay-kicker">${escapeHtml(service.departmentLabel)}</div>
      <h3>${escapeHtml(service.name)}</h3>
      <div class="relay-track" id="relayTrack"></div>
      <div id="relayResult"></div>
    </div>
  </div>`;
}

const TRACK_LABELS = ['Submitted', 'Gateway relay', 'Dept. verifying', 'Complete'];

/**
 * Reduced-motion respect: the track/reveal are motion for its own sake
 * only if they can't be turned off. Everything below checks this once and
 * collapses every duration to ~0 when the citizen has asked their OS for
 * less motion — no animation is load-bearing for correctness, only feel.
 */
const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Builds the four-node track once and returns a small controller that
 * animates transitions between states with GSAP — the ONLY place in the
 * frontend GSAP is used, per tech.md ("reserved for a live status/relay
 * reveal on the result screen... not used decoratively"). Kept restrained:
 * short, physically-plausible easings on real state changes the gateway
 * actually reported, never idle decoration.
 */
function createTrackController(trackEl) {
  const nodeEls = [];
  const lineEls = [];
  let liveTween = null; // the pulsing "in progress" tween on the active node, if any

  const html = TRACK_LABELS.map((label, i) => {
    const isLast = i === TRACK_LABELS.length - 1;
    return `<div class="tnode"><div class="tdot" data-i="${i}"></div><div class="tlabel">${label}</div></div>${isLast ? '' : `<div class="tline" data-i="${i}"></div>`}`;
  }).join('');
  trackEl.innerHTML = html;
  trackEl.querySelectorAll('.tdot').forEach((el) => nodeEls.push(el));
  trackEl.querySelectorAll('.tline').forEach((el) => lineEls.push(el));

  const gsapReady = typeof window.gsap !== 'undefined';
  const reduced = prefersReducedMotion();

  function stopPulse() {
    if (liveTween) {
      const target = liveTween.targets()[0];
      liveTween.kill();
      liveTween = null;
      // Clear the inline opacity/scale GSAP left mid-pulse so the node
      // returns cleanly to its CSS-driven state (done/failed/pending)
      // instead of getting stuck half-faded.
      if (target && gsapReady) window.gsap.set(target, { clearProps: 'opacity,scale' });
    }
  }

  /** Mark nodes [0, doneUpTo) as done, node `nowIndex` as in-progress (pulsing), rest untouched/pending. */
  function advanceTo(doneUpTo, nowIndex) {
    stopPulse();
    nodeEls.forEach((dot, i) => {
      const line = lineEls[i];
      if (i < doneUpTo) {
        dot.classList.remove('now', 'failed');
        dot.classList.add('done');
        if (line) line.classList.add('done');
        if (gsapReady && !reduced) {
          window.gsap.fromTo(dot, { scale: 1.35 }, { scale: 1, duration: 0.32, ease: 'back.out(2.2)' });
          window.gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.36, ease: 'power2.out', transformOrigin: 'left center' });
        }
      } else if (i === nowIndex) {
        dot.classList.remove('done', 'failed');
        dot.classList.add('now');
        if (gsapReady && !reduced) {
          window.gsap.fromTo(dot, { scale: 0.85 }, { scale: 1, duration: 0.28, ease: 'power2.out' });
          // Subtle breathing pulse to read as "in progress, not stalled" —
          // scale/opacity only (avoids animating box-shadow directly,
          // which is fragile across browsers and fights the CSS glow the
          // .now class already applies via box-shadow).
          liveTween = window.gsap.to(dot, {
            opacity: 0.55,
            scale: 1.12,
            duration: 0.7,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
        }
      } else {
        dot.classList.remove('done', 'now', 'failed');
        if (line) line.classList.remove('done');
      }
    });
  }

  /** Mark nodes [0, doneUpTo) as done, node `failedIndex` as failed. A firm settle, not a bounce — a failure should land with weight, not fizzle. */
  function fail(doneUpTo, failedIndex) {
    stopPulse();
    nodeEls.forEach((dot, i) => {
      const line = lineEls[i];
      if (i < doneUpTo) {
        dot.classList.add('done');
        if (line) line.classList.add('done');
      } else if (i === failedIndex) {
        dot.classList.add('failed');
        if (gsapReady && !reduced) {
          window.gsap.fromTo(dot, { scale: 1.3 }, { scale: 1, duration: 0.4, ease: 'power3.out' });
        }
      }
    });
  }

  function destroy() {
    stopPulse();
  }

  return { advanceTo, fail, destroy };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/**
 * Drives the relay centerpiece. Shows the track advancing through the
 * SAME states the gateway actually reports (no fabricated intermediate
 * steps) — submitted and gateway_relay/department_verifying are shown as
 * a brief deliberate pacing before the single verify call resolves, since
 * the gateway's own relay-service.js already collapses those two status
 * writes into one HTTP round trip. We do not invent extra network calls
 * just to make the track "look" slower — the pacing is purely a visual
 * beat on the client using values the gateway already returned.
 */
async function runRelay(applicationId, reference, service) {
  const host = document.getElementById('modalHost');
  host.insertAdjacentHTML('beforeend', relayCardHtml(service));
  const veil = document.getElementById('relayVeil');
  const card = document.getElementById('relayCard');
  const track = createTrackController(document.getElementById('relayTrack'));
  const gsapReady = typeof window.gsap !== 'undefined';
  const reduced = prefersReducedMotion();

  veil.classList.add('open');
  if (gsapReady && !reduced) {
    window.gsap.fromTo(card, { opacity: 0, y: 16, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'power2.out' });
  }

  const pace = reduced ? 60 : 280;
  track.advanceTo(0, 0);
  await sleep(pace);
  track.advanceTo(1, 1);
  await sleep(pace);
  track.advanceTo(2, 2);

  let result;
  try {
    result = await api.applications.verify(applicationId, reference);
  } catch (err) {
    // Gateway-side rejection (consent/ownership/validation) — a 4xx thrown
    // by the API client, BEFORE any department call is attempted (see
    // relay-service.js: the consent check runs before the status even
    // moves off "submitted"). Mark the "Gateway relay" node itself as
    // where things stopped. Distinct from a department-side failure,
    // which the gateway reports as a normal 200 with status:"failed"
    // (handled in the success branch below via result.status).
    track.fail(1, 1);
    const message = err instanceof ApiError ? err.message
      : err instanceof NetworkError ? err.message
      : 'Something went wrong contacting the gateway.';
    renderRelayFailure(message, null);
    track.destroy();
    if (typeof onSettled === 'function') onSettled();
    return;
  }

  if (result.status === 'complete') {
    track.advanceTo(4, -1);
    await sleep(reduced ? 40 : 220);
    renderRelaySuccess(result, applicationId);
  } else {
    // Department-side failure: submitted + gateway_relay both happened;
    // it failed while "department_verifying" (index 2) was in flight.
    track.fail(2, 2);
    renderRelayFailure(result.message, result.outcome);
  }

  track.destroy();
  if (typeof onSettled === 'function') onSettled();
}

/**
 * Reveals the result panel. Success and failure use the IDENTICAL
 * entrance (same duration, same easing, same distance) — a failure is a
 * normal, complete outcome of a real request (per api.md's relay
 * convention), not a broken animation, and it should land with the same
 * deliberateness as a success.
 */
function revealResult(el) {
  if (typeof window.gsap === 'undefined' || prefersReducedMotion()) return;
  window.gsap.fromTo(el.firstElementChild, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
}

function renderRelaySuccess(result, applicationId) {
  const el = document.getElementById('relayResult');
  const reuseNote = result.reused
    ? `<div class="reuse-tag">&#10003; Reused your verified reference — no re-entry needed</div>`
    : '';
  el.innerHTML = `
    <div class="relay-result">
      <div class="headline ok">Verified by ${escapeHtml(DEPARTMENT_LABELS[result.department] || result.department)}</div>
      <div class="message">Reference <strong>${escapeHtml(result.reference)}</strong> came back verified. This is now saved to your documents.</div>
      ${reuseNote}
      <div class="relay-actions">
        <button class="btn btn-ghost btn-sm" id="relayViewDetail">View application</button>
        <button class="btn btn-primary btn-sm" id="relayDone">Done</button>
      </div>
    </div>`;
  revealResult(el);
  document.getElementById('relayDone').addEventListener('click', closeRelayCard);
  document.getElementById('relayViewDetail').addEventListener('click', () => {
    closeRelayCard();
    window.dispatchEvent(new CustomEvent('setu:open-application', { detail: { id: applicationId } }));
  });
}

function renderRelayFailure(message, outcome) {
  const el = document.getElementById('relayResult');
  const outcomeNote = outcome ? `<div class="field-hint">Outcome code: ${escapeHtml(outcome)}</div>` : '';
  el.innerHTML = `
    <div class="relay-result">
      <div class="headline fail">Couldn't verify this right now</div>
      <div class="message">${escapeHtml(message || 'The department could not be reached.')}</div>
      ${outcomeNote}
      <div class="relay-actions">
        <button class="btn btn-primary btn-sm" id="relayDone">Close</button>
      </div>
    </div>`;
  revealResult(el);
  document.getElementById('relayDone').addEventListener('click', closeRelayCard);
}

function closeRelayCard() {
  document.getElementById('relayVeil')?.remove();
}

export { openServiceFlow, setRelayCallback };
