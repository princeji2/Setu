'use strict';

/**
 * "Find a service" view. Adapted from the reference's searchable
 * service-grid, but the catalog itself is trimmed to the three types the
 * gateway actually supports (see catalog.js). Reuse is surfaced here too:
 * a service whose department already has a verified linked_reference
 * shows a "verified — reuse instantly" badge instead of implying the
 * citizen needs to hunt for their reference again.
 */

import { api, NetworkError } from '../api.js';
import { CATALOG } from '../catalog.js';
import { openServiceFlow } from './relay.js';
import { escapeHtml, departmentTheme, departmentArtHtml, dataErrorBannerHtml } from '../util.js';
import { isStale, nextRenderToken } from '../render-guard.js';
import { revealStagger } from '../anim.js';

function serviceCardHtml(service, verifiedRef) {
  const theme = departmentTheme(service.department);
  const badge = verifiedRef
    ? `<div class="reuse-badge">&#10003; Verified &mdash; reuse instantly</div>`
    : '';
  return `
  <div class="service ${theme.themeClass}">
    <div class="service-head">
      <span class="src">${escapeHtml(service.departmentLabel)}</span>
      ${departmentArtHtml(service.department, 'md')}
    </div>
    <h3>${escapeHtml(service.name)}</h3>
    <p>${escapeHtml(service.description)}</p>
    ${badge}
    <button class="btn btn-primary btn-sm btn-block" data-start-service="${service.type}">Start application</button>
  </div>`;
}

async function renderServices(root, token) {
  root.innerHTML = `
    <div class="section-head" style="margin-bottom:6px"><h2>Find a government service</h2></div>
    <p class="section-note">Every service below calls a real department over HTTP through the gateway — nothing here is simulated.</p>
    <div id="serviceError"></div>
    <input class="field" id="serviceSearch" placeholder="Try &quot;PAN&quot;, &quot;identity&quot;, &quot;licence&quot;…" style="max-width:420px">
    <div id="serviceResults" class="service-grid" style="margin-top:20px"></div>`;

  let documents = [];
  try {
    documents = await api.documents.list();
  } catch (err) {
    if (isStale(token)) return;
    // A REAL fetch failure — NOT a legitimately empty account (that
    // resolves to []). GET /documents here only drives the "reuse
    // instantly" badge, so the grid still works; but a silent [] would
    // hide a gateway outage AND wrongly imply nothing is verified yet.
    // Surface it honestly with a retry, then fall through so the citizen
    // can still browse and start a first-time application.
    const message = err instanceof NetworkError
      ? "Couldn't reach the gateway — your verified records couldn't be loaded, so reuse badges may be missing."
      : (err && err.message) || "Couldn't load your verified records.";
    const errSlot = document.getElementById('serviceError');
    if (errSlot) {
      errSlot.innerHTML = dataErrorBannerHtml(message);
      const retry = errSlot.querySelector('.deb-retry');
      if (retry) retry.addEventListener('click', () => renderServices(root, nextRenderToken()));
    }
    documents = [];
  }
  if (isStale(token)) return; // citizen navigated away while this fetch was in flight
  const verifiedByDept = new Map(
    documents.filter((d) => d.verified).map((d) => [d.department, d.department_reference])
  );

  function draw(filterText) {
    const q = (filterText || '').toLowerCase();
    const filtered = CATALOG.filter((s) =>
      `${s.name} ${s.departmentLabel} ${s.description}`.toLowerCase().includes(q)
    );
    const resultsEl = document.getElementById('serviceResults');
    resultsEl.innerHTML = filtered.length
      ? filtered.map((s) => serviceCardHtml(s, verifiedByDept.get(s.department))).join('')
      : `<div class="empty-note">No matching service.</div>`;
    resultsEl.querySelectorAll('[data-start-service]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const service = CATALOG.find((s) => s.type === btn.dataset.startService);
        openServiceFlow(service, verifiedByDept.get(service.department) || null);
      })
    );
    revealStagger(resultsEl.querySelectorAll('.service'));
  }

  document.getElementById('serviceSearch').addEventListener('input', (e) => draw(e.target.value));
  draw('');
}

export { renderServices };
