'use strict';

/**
 * Dashboard view. Every number here comes from a real GET call — nothing
 * is a placeholder stat. Adapted from refrences/setu_sih26129_demo.html's
 * hero + stat-row + applications-panel + documents-sidecard layout, with
 * the fabricated "12,450 requests / 97.8% success" admin KPIs cut (no
 * backing endpoint — see design.md).
 */

import { api, getCitizen, NetworkError } from '../api.js';
import { netmapSvg } from '../netmap.js';
import { CATALOG } from '../catalog.js';
import {
  escapeHtml, timeAgo, DEPARTMENT_LABELS, APPLICATION_TYPE_LABELS,
  STATUS_LABELS, statusChipClass, departmentTheme, departmentArtHtml,
  dataErrorBannerHtml,
} from '../util.js';
import { isStale, nextRenderToken } from '../render-guard.js';
import { revealStagger, revealRise, playJustVerified } from '../anim.js';
import { consumeJustVerified } from '../just-verified.js';

/* Greeting header (reference top bar): time-aware greeting + the citizen's
   name + the two primary actions on the right. */
function greetingHtml() {
  const citizen = getCitizen();
  const name = citizen ? escapeHtml((citizen.full_name || '').split(' ')[0] || 'there') : 'there';
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `
  <div class="dash-head">
    <div>
      <h1 class="dash-greeting">Good ${part}, ${name}</h1>
      <p class="dash-sub">Your gateway to every connected department, behind one login.</p>
    </div>
    <div class="dash-actions">
      <button class="btn btn-ghost" data-goto-tab="documents">See what's verified</button>
      <button class="btn btn-primary" data-goto-tab="services">Find a service</button>
    </div>
  </div>`;
}

/* Onboarding step strip (reference numbered steps). These are the REAL
   stages of the Setu journey; done-state is derived from the citizen's
   actual data (an account exists, at least one verified doc, a reused
   verification), never faked. */
function stepStripHtml(documents, applications) {
  const verifiedCount = documents.filter((d) => d.verified).length;
  const reused = applications.some((a) => a.status === 'complete') && verifiedCount >= 1 && applications.length >= 2;
  const steps = [
    { title: 'Create your Setu ID', desc: 'One login for every connected department.', done: true },
    { title: 'Verify a document', desc: 'Fetch and verify a record live from a department.', done: verifiedCount >= 1, tab: 'services' },
    { title: 'Reuse across departments', desc: 'A verified record is reused with no re-entry.', done: reused, tab: 'services' },
  ];
  const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>`;
  return `<div class="step-strip">${steps
    .map((s, i) => {
      const state = s.done ? 'done' : (i === steps.findIndex((x) => !x.done) ? 'active' : 'todo');
      const badge = s.done ? `<span class="step-badge done">${check}</span>` : `<span class="step-badge ${state}">${i + 1}</span>`;
      const isClickable = !s.done && s.tab;
      const clickable = isClickable ? ` data-goto-tab="${s.tab}" role="button" tabindex="0" aria-label="${escapeHtml(s.title)} — open Find a service"` : '';
      // A resting chevron signals the step is actionable BEFORE hover, so a
      // clickable step no longer looks identical to a static one (audit #5).
      const chevron = isClickable
        ? `<span class="step-go" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>`
        : '';
      return `
      <div class="step ${state}"${clickable}>
        ${badge}
        <div class="step-text"><div class="step-title">${escapeHtml(s.title)}</div><div class="step-desc">${escapeHtml(s.desc)}</div></div>
        ${chevron}
      </div>`;
    })
    .join('')}</div>`;
}

/* Highlighted status card (reference "live" card): the identity-network
   preview + a status badge + connected-departments count + last activity. */
function statusCardHtml(documents, applications) {
  const verifiedCount = documents.filter((d) => d.verified).length;
  const live = verifiedCount >= 1;
  const lastApp = applications[0];
  const lastText = lastApp ? `Last activity ${timeAgo(lastApp.updated_at || lastApp.created_at)}` : 'No activity yet';
  return `
  <div class="status-card">
    <div class="status-body">
      <span class="status-badge ${live ? 'live' : 'idle'}"><span class="cdot"></span>${live ? 'Live' : 'Getting started'}</span>
      <div class="status-line"><span class="status-ico">${statusGlobe()}</span><b>${verifiedCount}</b> of ${CRED_ORDER.length} departments verified</div>
      <div class="status-meta">${escapeHtml(lastText)}</div>
      <div class="status-line status-line-sub"><span class="status-ico">${statusLink()}</span>Setu · consent-based gateway</div>
      <div class="status-meta">Every department call is logged for accountability</div>
    </div>
  </div>`;
}
/* Small hub-and-spoke network motif, parked at the very bottom of the
   dashboard. It's the project's one visual thesis (citizen -> 3 depts) but
   it is decoration here, so it's kept deliberately small and out of the
   way — a compact triangle strip, not a hero element. */
function netmapFooterHtml() {
  return `
  <div class="netmap-footer">
    <div class="netmap-footer-art">${netmapSvg('paper')}</div>
    <div class="netmap-footer-cap">One Setu ID · three connected departments</div>
  </div>`;
}
function statusGlobe() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>`; }
function statusLink() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15 15 9"/><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1"/></svg>`; }

/* Connected departments (the real mock services Setu integrates). Lists
   the CATALOG's three departments, showing per-department connection state
   from the citizen's real linked_references (verified / linked / not
   connected), plus a button to fetch/verify that department's data — which
   opens the real service flow (consent → live fetch → log). No fabricated
   "live" pings: state comes only from data the gateway actually holds. */
function connectedDeptsHtml(documents) {
  const byDept = {};
  documents.forEach((d) => { byDept[d.department] = d; });
  const rows = CATALOG.map((svc) => {
    const theme = departmentTheme(svc.department);
    const doc = byDept[svc.department];
    const state = doc ? (doc.verified ? 'verified' : 'linked') : 'none';
    const label = state === 'verified' ? 'Verified' : state === 'linked' ? 'Linked' : 'Not connected';
    const chipClass = state === 'verified' ? 'chip-done' : state === 'linked' ? 'chip-progress' : 'chip-wait';
    const ref = doc && doc.department_reference ? escapeHtml(doc.department_reference) : '';
    const btnLabel = state === 'verified' ? 'Get my data' : state === 'linked' ? 'Verify now' : 'Connect';
    return `
    <div class="conn-row ${theme.themeClass}" data-department="${svc.department}">
      <span class="conn-glyph">${theme.icon}</span>
      <div class="conn-body">
        <div class="conn-name">${escapeHtml(svc.departmentLabel)}</div>
        <div class="conn-meta">${ref ? `Ref ${ref}` : escapeHtml(svc.description)}</div>
      </div>
      <span class="chip ${chipClass} conn-chip">${label}</span>
      <button class="btn btn-ghost btn-sm conn-btn" data-connect-service="${svc.type}">${btnLabel}</button>
    </div>`;
  }).join('');
  return `
  <div class="panel panel-pad dash-connected">
    <div class="section-head"><h2>Connected departments</h2><button class="link" data-goto-tab="documents">Manage</button></div>
    <p class="section-note" style="margin-bottom:var(--space-4)">The three government services Setu integrates over real HTTP. Fetch your data from any connected department — with consent, and every call logged.</p>
    <div class="conn-list">${rows}</div>
  </div>`;
}

/* ------------------------------------------------------------------
 * Colourful credential cards (PAN / Identity / Driving Licence).
 * These are visual components for the three departments Setu links.
 * They are data-driven: theme + copy are fixed per department, but the
 * reference string + verified state come from the citizen's real
 * linked_references (GET /api/v1/documents). No fabricated data.
 * ------------------------------------------------------------------ */
// Fixed department order so the row of cards is stable across renders.
const CRED_ORDER = [
  'digital_tax_records',
  'national_identity_registry',
  'driving_licence_jan_aadhaar',
];

function credCardHtml(department, doc) {
  const theme = departmentTheme(department);
  const title = DEPARTMENT_LABELS[department] || department;
  const verified = !!(doc && doc.verified);
  const ref = doc && doc.department_reference ? escapeHtml(doc.department_reference) : '';
  const statusLabel = verified ? 'Verified' : (doc ? 'Linked' : 'Not linked');
  const statusClass = verified ? '' : 'pending';
  // Verified/linked footers are plain captions. The not-linked state is the
  // card's actual call to action, so it is rendered as a real link-styled
  // button that routes to Services — giving it a clear affordance instead
  // of masquerading as muted caption text (usability audit #2).
  const foot = doc
    ? `<span class="cred-foot-note">${verified ? `Verified ${escapeHtml(timeAgo(doc.linked_at))}` : `Linked ${escapeHtml(timeAgo(doc.linked_at))} — not yet verified`}</span>`
    : `<button type="button" class="cred-foot-link" data-goto-tab="services">Link this record from a service<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
  return `
  <div class="cred-card ${theme.themeClass}" data-department="${department}">
    <div class="cred-head">
      ${departmentArtHtml(department, 'md')}
      <span class="cred-status ${statusClass}"><span class="cdot"></span>${statusLabel}</span>
    </div>
    <div class="cred-body">
      <div class="cred-kind">${escapeHtml(theme.kind)}</div>
      <div class="cred-title">${escapeHtml(title)}</div>
      <div class="cred-ref ${ref ? '' : 'empty'}">${ref || 'No reference yet'}</div>
    </div>
    <div class="cred-foot">${foot}</div>
  </div>`;
}

function credGridHtml(documents) {
  const byDept = {};
  documents.forEach((d) => { byDept[d.department] = d; });
  return `<div class="cred-grid">${CRED_ORDER.map((dep) => credCardHtml(dep, byDept[dep])).join('')}</div>`;
}

/* Activity-history row (reference table): department glyph + application
   type + a done/failed/progress marker, timestamp, and status chip. Built
   from real applications. The whole row opens the application detail. */
function activityRowHtml(app) {
  const theme = (function () {
    // Best-effort department tag from the application type.
    if (app.type === 'pan_verification') return departmentTheme('digital_tax_records');
    if (app.type === 'identity_verification') return departmentTheme('national_identity_registry');
    if (app.type === 'driving_licence_registration') return departmentTheme('driving_licence_jan_aadhaar');
    return departmentTheme('digital_tax_records');
  })();
  const label = APPLICATION_TYPE_LABELS[app.type] || app.type;
  return `
  <div class="act-row" data-open-application="${app.id}" role="button" tabindex="0" aria-label="Open ${escapeHtml(label)} application">
    <div class="act-main">
      <span class="act-glyph ${theme.themeClass}">${theme.icon}</span>
      <div>
        <div class="act-title">${escapeHtml(label)}</div>
        <div class="act-meta">Updated ${timeAgo(app.updated_at || app.created_at)}</div>
      </div>
    </div>
    <div class="act-when">${escapeHtml(new Date(app.updated_at || app.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div>
    <span class="chip ${statusChipClass(app.status)} act-chip">${escapeHtml(STATUS_LABELS[app.status] || app.status)}</span>
  </div>`;
}

async function renderDashboard(root, token) {
  root.innerHTML = `
    ${greetingHtml()}
    <div id="dashError"></div>
    <div id="stepStrip"></div>
    <div class="dash-grid">
      <div id="credGrid" class="dash-cred"></div>
      <div id="statusCard"></div>
    </div>
    <div id="connectedDepts"></div>
    <div class="panel panel-pad dash-activity">
      <div class="section-head"><h2>Activity history</h2><button class="link" data-goto-tab="applications">View all</button></div>
      <div id="dashboardApps"><div class="loading-note"><span class="spinner dark"></span> Loading…</div></div>
    </div>
    ${netmapFooterHtml()}`;

  const wireGoto = (scope) => scope.querySelectorAll('[data-goto-tab]').forEach((btn) => {
    const go = () => window.dispatchEvent(new CustomEvent('setu:goto-tab', { detail: btn.dataset.gotoTab }));
    btn.addEventListener('click', go);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  wireGoto(root);
  revealRise('.dash-head > div > *');

  let applications = [];
  let documents = [];
  try {
    [applications, documents] = await Promise.all([api.applications.list(), api.documents.list()]);
  } catch (err) {
    if (isStale(token)) return;
    // A REAL fetch failure — distinct from a legitimately empty account
    // (which resolves successfully with empty arrays and falls through to
    // the normal "0 of 3 / no activity yet" state below). Surface an
    // honest, dismissible-by-retry banner instead of silently rendering
    // the first-time empty state, which would masquerade as "new account".
    const message = err instanceof NetworkError
      ? "Couldn't reach the gateway — your data couldn't be loaded."
      : (err && err.message) || 'Something went wrong loading your dashboard.';
    const errSlot = document.getElementById('dashError');
    if (errSlot) {
      errSlot.innerHTML = dataErrorBannerHtml(message);
      const retry = errSlot.querySelector('.deb-retry');
      if (retry) retry.addEventListener('click', () => renderDashboard(root, nextRenderToken()));
    }
    // Still show the credential cards + step strip (empty state) so the
    // dashboard never leaves a blank gap beneath the banner. These clearly
    // read as "unloaded" because the banner above says the fetch failed.
    const credErrEl = document.getElementById('credGrid');
    if (credErrEl) { credErrEl.innerHTML = credGridHtml([]); wireGoto(credErrEl); }
    const stepErrEl = document.getElementById('stepStrip');
    if (stepErrEl) stepErrEl.innerHTML = stepStripHtml([], []);
    const statusErrEl = document.getElementById('statusCard');
    if (statusErrEl) statusErrEl.innerHTML = statusCardHtml([], []);
    const connErrEl = document.getElementById('connectedDepts');
    if (connErrEl) { connErrEl.innerHTML = connectedDeptsHtml([]); wireGoto(connErrEl); connErrEl.querySelectorAll('[data-connect-service]').forEach((btn) => btn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('setu:goto-tab', { detail: 'services' })))); }
    document.getElementById('dashboardApps').innerHTML = `<div class="empty-note">Couldn't load your activity right now.</div>`;
    return;
  }
  if (isStale(token)) return; // citizen navigated away while this fetch was in flight

  const stepEl = document.getElementById('stepStrip');
  if (stepEl) { stepEl.innerHTML = stepStripHtml(documents, applications); wireGoto(stepEl); revealStagger(stepEl.querySelectorAll('.step')); }

  // A department that was just verified in a relay (the re-render that
  // brought us here was fired by that relay's onSettled). Read once; used
  // to play a single "just verified" reveal on that one card below.
  const justVerified = consumeJustVerified();

  const credEl = document.getElementById('credGrid');
  if (credEl) {
    credEl.innerHTML = credGridHtml(documents);
    wireGoto(credEl);
    revealStagger(credEl.querySelectorAll('.cred-card'));
    if (justVerified) playJustVerified(credEl.querySelector(`.cred-card[data-department="${justVerified}"]`));
  }

  const statusEl = document.getElementById('statusCard');
  if (statusEl) statusEl.innerHTML = statusCardHtml(documents, applications);

  const connEl = document.getElementById('connectedDepts');
  if (connEl) {
    connEl.innerHTML = connectedDeptsHtml(documents);
    wireGoto(connEl);
    connEl.querySelectorAll('[data-connect-service]').forEach((btn) =>
      btn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('setu:goto-tab', { detail: 'services' })))
    );
    revealStagger(connEl.querySelectorAll('.conn-row'), { y: 8 });
    if (justVerified) playJustVerified(connEl.querySelector(`.conn-row[data-department="${justVerified}"] .conn-chip`));
  }

  const appsEl = document.getElementById('dashboardApps');
  appsEl.innerHTML = applications.length
    ? applications.slice(0, 6).map(activityRowHtml).join('')
    : `<div class="empty-note">No activity yet — start one from "Find a service".</div>`;
  appsEl.querySelectorAll('[data-open-application]').forEach((el) => {
    const open = () =>
      window.dispatchEvent(new CustomEvent('setu:open-application', { detail: { id: el.dataset.openApplication } }));
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(); }
    });
  });
  revealStagger(appsEl.querySelectorAll('.act-row'), { y: 8 });
}

export { renderDashboard };
