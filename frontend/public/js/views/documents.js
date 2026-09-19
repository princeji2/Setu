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
import { revealStagger } from '../anim.js';

function docCardHtml(doc) {
  const service = findServiceByDepartment(doc.department);
  const theme = departmentTheme(doc.department);
  const statusClass = doc.verified ? 'status-ok' : 'status-warn';
  const statusLabel = doc.verified ? 'Verified' : 'Needs verification';
  return `
  <div class="doc-card ${theme.themeClass}">
    <div class="doc-card-head">
      ${departmentArtHtml(doc.department, 'md')}
      <span class="status ${statusClass}">${statusLabel}</span>
    </div>
    <h3>${escapeHtml(DEPARTMENT_LABELS[doc.department] || doc.department)}</h3>
    <p>Reference <span class="doc-ref">${escapeHtml(doc.department_reference)}</span> &middot; ${doc.verified ? 'updated' : 'linked'} ${timeAgo(doc.linked_at)}</p>
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

  gridEl.querySelectorAll('[data-reuse-department]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = documents.find((d) => d.department === btn.dataset.reuseDepartment);
      const service = findServiceByDepartment(doc.department);
      openServiceFlow(service, doc.verified ? doc.department_reference : null);
    });
  });
}

export { renderDocuments };
