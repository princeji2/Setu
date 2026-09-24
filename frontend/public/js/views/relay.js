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
import { markJustVerified } from '../just-verified.js';

let onSettled = null; // callback invoked after a relay completes, to refresh other views

function setRelayCallback(fn) {
  onSettled = fn;
}

function consentModalHtml(service, reuseReference) {
  if (service.isComposite) {
    const reuseMap = (reuseReference && typeof reuseReference === 'object') ? reuseReference : {};
    const stepsHtml = (service.steps || []).map((step, idx) => {
      const fieldRows = step.fieldsRequested.map((f) =>
        `<div class="consent-row"><div><div class="fld">${escapeHtml(f)}</div><div class="from">from ${escapeHtml(step.departmentLabel)}</div></div>Required</div>`
      ).join('');

      const stepDemoRef = (step.referencePlaceholder || '').replace(/^e\.g\.\s*/i, '').trim();
      const refBlock = hasReuse
        ? `<div class="field-hint" style="margin:6px 0 10px">&#10003; Reusing your verified reference (${escapeHtml(hasReuse)}) &mdash; no re-entry needed.</div>`
        : `<div class="field reference-field" style="margin-top:8px">
             <label for="consentRef_${step.referenceKey}">${escapeHtml(step.referenceLabel)}</label>
             <input id="consentRef_${step.referenceKey}" type="text" placeholder="${escapeHtml(step.referencePlaceholder)}" value="${escapeHtml(stepDemoRef)}" required>
           </div>`;

      return `
      <div class="composite-consent-step" style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:12px;background:#f8fafc">
        <div style="font-weight:600;font-size:13px;color:#1e293b;margin-bottom:4px">
          Step ${idx + 1}: ${escapeHtml(step.name)} <span style="font-size:11px;font-weight:normal;color:#64748b;margin-left:4px">(${escapeHtml(step.departmentLabel)})</span>
        </div>
        <div style="font-size:12px;color:#64748b;margin-bottom:8px">Data fields requested from ${escapeHtml(step.departmentLabel)}:</div>
        <div>${fieldRows}</div>
        ${refBlock}
      </div>`;
    }).join('');

    return `
    <div class="modal-veil open" id="consentVeil">
      <div class="modal" style="max-width:540px">
        <div class="kicker">${escapeHtml(service.departmentLabel)}</div>
        <h3>${escapeHtml(service.name)}</h3>
        <p class="desc">Setu will orchestrate this application across both departments in a single chained workflow. Review and grant consent for both departments below.</p>
        <div style="max-height:360px;overflow-y:auto;padding-right:4px">${stepsHtml}</div>
        <div id="consentModalError" class="auth-form-error hidden" style="margin-top:14px"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="consentCancel">Cancel</button>
          <button class="btn btn-primary" id="consentApprove">Approve &amp; continue</button>
        </div>
      </div>
    </div>`;
  }

  const rows = service.fieldsRequested
    .map(
      (f) => `<div class="consent-row"><div><div class="fld">${escapeHtml(f)}</div><div class="from">from ${escapeHtml(service.departmentLabel)}</div></div>Required</div>`
    )
    .join('');

  const demoRef = (service.referencePlaceholder || '').replace(/^e\.g\.\s*/i, '').trim();
  const referenceBlock = reuseReference
    ? `<div class="field-hint" style="margin:-4px 0 16px">Reusing your verified reference from ${escapeHtml(service.departmentLabel)} — no re-entry needed.</div>`
    : `<div class="field reference-field">
         <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
           <label for="consentReference" style="margin-bottom:0">${escapeHtml(service.referenceLabel)}</label>
           ${demoRef ? `<button type="button" style="font-size:11px;font-weight:600;color:var(--color-primary,#991b1b);background:none;border:none;cursor:pointer;padding:0;text-decoration:underline" onclick="document.getElementById('consentReference').value='${escapeHtml(demoRef)}'">Use demo reference</button>` : ''}
         </div>
         <input id="consentReference" type="text" placeholder="${escapeHtml(service.referencePlaceholder)}" value="${escapeHtml(demoRef)}" required>
         <div class="field-hint" style="font-size:11px;margin-top:4px">Pre-filled with synthetic demo reference. Real government IDs are strictly forbidden.</div>
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
 * @param {string|object|null} reuseReference  a previously verified reference or map of references
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

  if (service.isComposite) {
    const reuseMap = (reuseReference && typeof reuseReference === 'object') ? reuseReference : {};
    const references = {};

    for (const step of service.steps) {
      const inputEl = document.getElementById(`consentRef_${step.referenceKey}`);
      const val = reuseMap[step.referenceKey] || inputEl?.value.trim();
      if (!val) {
        errorBox.textContent = `${step.referenceLabel} is required.`;
        errorBox.classList.remove('hidden');
        return;
      }
      if (!reuseMap[step.referenceKey]) {
        references[step.referenceKey] = val;
      }
    }

    errorBox.classList.add('hidden');
    approveBtn.disabled = true;
    approveBtn.innerHTML = '<span class="spinner"></span> Submitting…';

    try {
      // 1. Create composite application
      const application = await api.applications.create(service.type);

      // 2. Grant consent for both departments in this single flow
      for (const step of service.steps) {
        await api.consent.grant(application.id, step.department, step.fieldsRequested);
      }

      closeConsentModal();
      toast('Consents approved — orchestrating multi-department verification.');

      // 3. Trigger composite relay
      await runRelay(application.id, { references }, service);
    } catch (err) {
      approveBtn.disabled = false;
      approveBtn.textContent = 'Approve & continue';
      const message = err instanceof ApiError ? err.message
        : err instanceof NetworkError ? err.message
        : 'Something went wrong. Please try again.';
      errorBox.textContent = message;
      errorBox.classList.remove('hidden');
    }
    return;
  }

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
const COMPOSITE_TRACK_LABELS = ['Step 1: Identity Verified', 'Step 2: Transport Verified', 'Clearance Granted'];

/**
 * Reduced-motion respect: the track/reveal are motion for its own sake
 * only if they can't be turned off. Everything below checks this once and
 * collapses every duration to ~0 when the citizen has asked their OS for
 * less motion — no animation is load-bearing for correctness, only feel.
 */
const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Builds the track once and returns a small controller that
 * animates transitions between states with GSAP — the ONLY place in the
 * frontend GSAP is used, per tech.md ("reserved for a live status/relay
 * reveal on the result screen... not used decoratively"). Kept restrained:
 * short, physically-plausible easings on real state changes the gateway
 * actually reported, never idle decoration.
 */
function createTrackController(trackEl, labels = TRACK_LABELS) {
  const nodeEls = [];
  const lineEls = [];
  let liveTween = null; // the pulsing "in progress" tween on the active node, if any

  const html = labels.map((label, i) => {
    const isLast = i === labels.length - 1;
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
          window.gsap.fromTo(dot, { scale: 1.4 }, { scale: 1, duration: 0.38, ease: 'back.out(2)' });
          window.gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.44, ease: 'power2.out', transformOrigin: 'left center' });
        }
      } else if (i === nowIndex) {
        dot.classList.remove('done', 'failed');
        dot.classList.add('now');
        if (gsapReady && !reduced) {
          window.gsap.fromTo(dot, { scale: 0.8 }, { scale: 1, duration: 0.3, ease: 'power2.out' });
          liveTween = window.gsap.to(dot, {
            scale: 1.22,
            duration: 0.85,
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

  /** Mark nodes [0, doneUpTo) as done, node `failedIndex` as failed. */
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
          window.gsap.fromTo(dot, { scale: 1.35 }, { scale: 1, duration: 0.46, ease: 'power3.out' });
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
 * Drives the relay centerpiece.
 */
async function runRelay(applicationId, reference, service) {
  const host = document.getElementById('modalHost');
  host.insertAdjacentHTML('beforeend', relayCardHtml(service));
  const veil = document.getElementById('relayVeil');
  const card = document.getElementById('relayCard');
  const labels = service.isComposite ? COMPOSITE_TRACK_LABELS : TRACK_LABELS;
  const track = createTrackController(document.getElementById('relayTrack'), labels);
  const gsapReady = typeof window.gsap !== 'undefined';
  const reduced = prefersReducedMotion();

  veil.classList.add('open');
  if (gsapReady && !reduced) {
    window.gsap.fromTo(card, { opacity: 0, y: 18, scale: 0.975 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out' });
  }

  const pace = reduced ? 60 : 350;

  if (service.isComposite) {
    // Composite stepper: Step 1 (NIR) active -> Step 2 (DLJA) active -> Clearance Granted
    track.advanceTo(0, 0); // Step 1 pulsing

    let result;
    try {
      const verifyPromise = api.applications.verify(applicationId, reference);
      await sleep(pace * 1.5);
      track.advanceTo(1, 1); // Step 1 done, Step 2 pulsing
      result = await verifyPromise;
    } catch (err) {
      track.fail(0, 0);
      const message = err instanceof ApiError ? err.message
        : err instanceof NetworkError ? err.message
        : 'Something went wrong contacting the gateway.';
      renderRelayFailure(message, null);
      track.destroy();
      if (typeof onSettled === 'function') onSettled();
      return;
    }

    if (result.status === 'complete') {
      track.advanceTo(3, -1); // All 3 nodes green!
      await sleep(reduced ? 40 : 260);
      renderRelaySuccess(result, applicationId);
      (service.departments || []).forEach((d) => markJustVerified(d));
    } else {
      if (result.failed_step === 1) {
        track.fail(0, 0);
      } else {
        track.fail(1, 1);
      }
      renderRelayFailure(result.message, result.outcome);
    }

    track.destroy();
    if (typeof onSettled === 'function') onSettled();
    return;
  }

  // Standalone single-department pacing
  track.advanceTo(0, 0);
  await sleep(pace);
  track.advanceTo(1, 1);
  await sleep(pace);
  track.advanceTo(2, 2);

  let result;
  try {
    result = await api.applications.verify(applicationId, reference);
  } catch (err) {
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
    await sleep(reduced ? 40 : 260);
    renderRelaySuccess(result, applicationId);
    markJustVerified(result.department);
  } else {
    track.fail(2, 2);
    renderRelayFailure(result.message, result.outcome);
  }

  track.destroy();
  if (typeof onSettled === 'function') onSettled();
}

/**
 * Reveals the result panel.
 */
function revealResult(el) {
  if (typeof window.gsap === 'undefined' || prefersReducedMotion()) return;
  window.gsap.fromTo(el.firstElementChild, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.44, ease: 'power3.out' });
}

function renderRelaySuccess(result, applicationId) {
  const el = document.getElementById('relayResult');

  if (result.composite) {
    const stepSummaries = (result.steps || []).map((s) => {
      const reuseTag = s.reused ? ' <span class="reuse-badge" style="display:inline-block;padding:2px 6px;font-size:11px;margin-left:6px">&#10003; Reused</span>' : '';
      return `<li style="margin-bottom:8px"><strong>${escapeHtml(s.name)}</strong> (${escapeHtml(DEPARTMENT_LABELS[s.department] || s.department)}): Reference <code>${escapeHtml(s.reference)}</code> verified.${reuseTag}</li>`;
    }).join('');

    el.innerHTML = `
      <div class="relay-result">
        <div class="headline ok">&#10003; Clearance Granted &mdash; Multi-Department Approved</div>
        <div class="message">Identity and transport requirements verified across both departments. Senior Citizen Transport Concession clearance is active.</div>
        <ul style="margin:12px 0 16px;padding-left:20px;font-size:13px;color:var(--ink)">
          ${stepSummaries}
        </ul>
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
    return;
  }

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
