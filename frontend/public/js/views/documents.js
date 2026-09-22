'use strict';

/**
 * "My documents" view. GET /api/v1/documents rendered as one card per
 * department the citizen has ever tried to verify. Departments never
 * attempted at all are not shown as fabricated "not started" cards — the
 * gateway's own linked_references rows are the only source of truth here.
 */

import { api } from '../api.js';
import { CATALOG, findServiceByDepartment } from '../catalog.js';
import { openServiceFlow } from './relay.js';
import { escapeHtml, timeAgo, DEPARTMENT_LABELS, departmentTheme, departmentArtHtml } from '../util.js';
import { isStale } from '../render-guard.js';
import { revealStagger, playJustVerified } from '../anim.js';
import { consumeJustVerified } from '../just-verified.js';

const DEPT_SHORT = {
  national_identity_registry: 'NIR',
  digital_tax_records: 'DTR',
  driving_licence_jan_aadhaar: 'DLJA',
};

function getDocTypeLabel(ref, dept) {
  if (ref && ref.startsWith('PANCARD-')) return 'PAN Card';
  if (ref && ref.startsWith('INC-')) return 'Income Certificate';
  if (ref && ref.startsWith('VOTER-')) return 'Voter ID (EPIC)';
  if (ref && ref.startsWith('BIRTH-')) return 'Birth Certificate';
  if (ref && ref.startsWith('RC-')) return 'Vehicle RC';
  if (ref && ref.startsWith('PASS-')) return 'Passport';
  if (dept === 'digital_tax_records') return 'Tax / PAN Record';
  if (dept === 'national_identity_registry') return 'Identity Record';
  if (dept === 'driving_licence_jan_aadhaar') return 'Driving Licence Record';
  return 'Official Record';
}

function docCardHtml(doc) {
  const service = findServiceByDepartment(doc.department);
  const theme = departmentTheme(doc.department);
  const statusClass = doc.verified ? 'status-ok' : 'status-warn';
  const statusLabel = doc.verified ? 'Verified' : 'Needs verification';
  return `
  <div class="doc-card ${theme.themeClass}" data-department="${doc.department}">
    <div class="doc-card-head">
      ${departmentArtHtml(doc.department, 'md')}
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="chip chip-wait" style="font-size:11px;">${escapeHtml(getDocTypeLabel(doc.department_reference, doc.department))}</span>
        <span class="status ${statusClass}">${statusLabel}</span>
      </div>
    </div>
    <h3>${escapeHtml(DEPARTMENT_LABELS[doc.department] || doc.department)}</h3>
    <p>Reference <span class="doc-ref">${escapeHtml(doc.department_reference)}</span> &middot; ${doc.verified ? 'updated' : 'linked'} ${timeAgo(doc.linked_at)}</p>
    ${doc.discrepancy ? `
    <div class="discrepancy-advisory">
      <div class="discrepancy-chip">
        <span class="discrepancy-icon">⚠️</span>
        <span class="discrepancy-title">Data Discrepancy Flagged (${doc.match_confidence ?? doc.discrepancy.confidence}%)</span>
      </div>
      <div class="discrepancy-comparison">
        <span class="disc-val disc-curr"><strong>${DEPT_SHORT[doc.department] || doc.department}:</strong> "${escapeHtml(doc.discrepancy.field === 'dob' ? (doc.discrepancy.current_dob || doc.discrepancy.current_value) : doc.discrepancy.current_value)}"</span>
        <span class="disc-vs">vs</span>
        <span class="disc-val disc-prev"><strong>${DEPT_SHORT[doc.discrepancy.conflicting_department] || doc.discrepancy.conflicting_department}:</strong> "${escapeHtml(doc.discrepancy.field === 'dob' ? (doc.discrepancy.previous_dob || doc.discrepancy.previous_value) : doc.discrepancy.previous_value)}"</span>
      </div>
    </div>` : ''}
    ${service ? `<button class="btn btn-primary btn-sm btn-block" data-reuse-department="${doc.department}">${doc.verified ? 'Reuse this document' : 'Retry verification'}</button>` : ''}
  </div>`;
}

async function renderDocuments(root, token) {
  root.innerHTML = `
    <div class="section-head"><h2>My documents</h2></div>
    <p class="section-note">These are the department references Setu has linked to your account. A verified document is reused automatically the next time a service needs it — no re-entry.</p>
    <div id="docGrid" class="doc-grid"><div class="loading-note"><span class="spinner dark"></span> Loading…</div></div>`;

  let documents = [];
  try {
    documents = await api.documents.list();
  } catch (err) {
    if (isStale(token)) return;
    document.getElementById('docGrid').innerHTML = `<div class="empty-note">Couldn't load your documents right now.</div>`;
    return;
  }
  if (isStale(token)) return; // citizen navigated away while this fetch was in flight

  const gridEl = document.getElementById('docGrid');
  gridEl.innerHTML = documents.length
    ? documents.map(docCardHtml).join('')
    : `<div class="empty-note">Nothing linked yet. Start a service from "Find a service" to link your first document.</div>`;
  if (documents.length) revealStagger(gridEl.querySelectorAll('.doc-card'));

  // If a relay just verified a department, play a single mount-time reveal
  // on that one card's status badge (badge colour settle + check reveal +
  // one gentle pulse) rather than letting it appear already-green. The
  // signal is consumed once, so re-visiting Documents later shows the calm
  // resting state.
  const justVerified = consumeJustVerified();
  if (justVerified) playJustVerified(gridEl.querySelector(`.doc-card[data-department="${justVerified}"] .status`));

  gridEl.querySelectorAll('[data-reuse-department]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = documents.find((d) => d.department === btn.dataset.reuseDepartment);
      const service = findServiceByDepartment(doc.department);
      openServiceFlow(service, doc.verified ? doc.department_reference : null);
    });
  });
}

export { renderDocuments };
