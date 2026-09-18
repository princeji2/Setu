'use strict';

/**
 * "Find a service" view. Adapted from the reference's searchable
 * service-grid, but the catalog itself is trimmed to the three types the
 * gateway actually supports (see catalog.js). Reuse is surfaced here too:
 * a service whose department already has a verified linked_reference
 * shows a "verified — reuse instantly" badge instead of implying the
 * citizen needs to hunt for their reference again.
 */

import { api } from '../api.js';
import { CATALOG } from '../catalog.js';
import { openServiceFlow } from './relay.js';
import { escapeHtml } from '../util.js';
import { isStale } from '../render-guard.js';

function serviceCardHtml(service, verifiedRef) {
  const badge = verifiedRef
    ? `<div class="reuse-badge">&#10003; Verified &mdash; reuse instantly</div>`
    : '';
  return `
  <div class="service">
    <span class="src">${escapeHtml(service.departmentLabel)}</span>
    <h3>${escapeHtml(service.name)}</h3>
    <p>${escapeHtml(service.description)}</p>
    ${badge}
    <button class="btn btn-ghost btn-sm" data-start-service="${service.type}">Start application</button>
  </div>`;
}

async function renderServices(root, token) {
  root.innerHTML = `
    <div class="section-head" style="margin-bottom:6px"><h2>Find a government service</h2></div>
    <p class="section-note">Every service below calls a real department over HTTP through the gateway — nothing here is simulated.</p>
    <input class="field" id="serviceSearch" placeholder="Try &quot;PAN&quot;, &quot;identity&quot;, &quot;licence&quot;…" style="max-width:420px">
    <div id="serviceResults" class="service-grid" style="margin-top:20px"></div>`;

  let documents = [];
  try {
    documents = await api.documents.list();
  } catch {
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
  }

  document.getElementById('serviceSearch').addEventListener('input', (e) => draw(e.target.value));
  draw('');
}

export { renderServices };
