'use strict';

/**
 * Dashboard view. Every number here comes from a real GET call — nothing
 * is a placeholder stat. Adapted from refrences/setu_sih26129_demo.html's
 * hero + stat-row + applications-panel + documents-sidecard layout, with
 * the fabricated "12,450 requests / 97.8% success" admin KPIs cut (no
 * backing endpoint — see design.md).
 */

import { api } from '../api.js';
import { netmapSvg } from '../netmap.js';
import {
  escapeHtml, timeAgo, DEPARTMENT_LABELS, APPLICATION_TYPE_LABELS,
  STATUS_LABELS, statusChipClass, trackStepIndex,
} from '../util.js';
import { isStale } from '../render-guard.js';

function heroHtml() {
  return `
  <div class="hero">
    <div>
      <div class="kicker">Smart India Hackathon &middot; SIH26129</div>
      <h1>One record for every citizen, shared with consent — not copied.</h1>
      <p>Setu links Digital Tax Records, the National Identity Registry and the Driving Licence &amp; Jan Aadhaar Portal behind a single citizen login, so a document verified once doesn't need to be uploaded again.</p>
      <div class="hero-actions">
        <button class="btn btn-primary" data-goto-tab="services">Find a service</button>
        <button class="btn btn-ghost" data-goto-tab="documents">See what's verified</button>
      </div>
    </div>
    <div class="netmap">${netmapSvg('paper')}</div>
  </div>`;
}

function trackHtml(status) {
  const steps = ['Submitted', 'Gateway relay', 'Dept. verifying', 'Complete'];
  const activeIndex = trackStepIndex(status);
  const isFailed = status === 'failed';
  return `<div class="track">${steps
    .map((label, i) => {
      let dotClass = 'tdot';
      let lineClass = 'tline';
      if (isFailed) {
        if (i <= 1) { dotClass += ' done'; lineClass += ' done'; }
        else if (i === 2) dotClass += ' failed';
      } else if (i < activeIndex) {
        dotClass += ' done'; lineClass += ' done';
      } else if (i === activeIndex) {
        dotClass += ' now';
      }
      const node = `<div class="tnode"><div class="${dotClass}"></div><div class="tlabel">${label}</div></div>`;
      return i < steps.length - 1 ? node + `<div class="${lineClass}"></div>` : node;
    })
    .join('')}</div>`;
}

function appItemHtml(app) {
  return `
  <div class="app-item">
    <div class="app-top app-top-click" data-open-application="${app.id}">
      <div>
        <div class="app-name">${escapeHtml(APPLICATION_TYPE_LABELS[app.type] || app.type)}</div>
        <div class="app-meta">Updated ${timeAgo(app.updated_at || app.created_at)}</div>
      </div>
      <span class="chip ${statusChipClass(app.status)}">${escapeHtml(STATUS_LABELS[app.status] || app.status)}</span>
    </div>
    ${trackHtml(app.status)}
  </div>`;
}

function docRowHtml(doc) {
  const dotClass = doc.verified ? 'dot-ok' : 'dot-pending';
  return `
  <div class="doc-row">
    <div>
      <div class="doc-name"><span class="${dotClass}"></span>${escapeHtml(DEPARTMENT_LABELS[doc.department] || doc.department)}</div>
      <div class="doc-src">${doc.verified ? 'Verified' : 'Not yet verified'} &middot; ${timeAgo(doc.linked_at)}</div>
    </div>
  </div>`;
}

async function renderDashboard(root, token) {
  root.innerHTML = `
    ${heroHtml()}
    <div class="stat-row" id="statRow"></div>
    <div class="layout">
      <div class="panel panel-pad">
        <div class="section-head"><h2>Your applications</h2><button class="link" data-goto-tab="applications">View all</button></div>
        <div id="dashboardApps"><div class="loading-note"><span class="spinner dark"></span> Loading…</div></div>
      </div>
      <div class="stack">
        <div class="side-card">
          <h3>Documents on file</h3>
          <div id="dashboardDocs"><div class="loading-note"><span class="spinner dark"></span> Loading…</div></div>
        </div>
      </div>
    </div>`;

  root.querySelectorAll('[data-goto-tab]').forEach((btn) =>
    btn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('setu:goto-tab', { detail: btn.dataset.gotoTab })))
  );

  let applications = [];
  let documents = [];
  try {
    [applications, documents] = await Promise.all([api.applications.list(), api.documents.list()]);
  } catch (err) {
    if (isStale(token)) return;
    document.getElementById('dashboardApps').innerHTML = `<div class="empty-note">Couldn't load your applications right now.</div>`;
    document.getElementById('dashboardDocs').innerHTML = `<div class="empty-note">Couldn't load your documents right now.</div>`;
    return;
  }
  if (isStale(token)) return; // citizen navigated away while this fetch was in flight

  const inProgress = applications.filter((a) => !['complete', 'failed'].includes(a.status)).length;
  const verifiedDocs = documents.filter((d) => d.verified).length;
  document.getElementById('statRow').innerHTML = `
    <div class="stat"><div class="n">${applications.length}</div><div class="l">Total applications</div></div>
    <div class="stat"><div class="n">${inProgress}</div><div class="l">In progress</div></div>
    <div class="stat"><div class="n">${verifiedDocs}</div><div class="l">Verified documents</div></div>
    <div class="stat"><div class="n">${documents.length}</div><div class="l">Departments connected</div></div>`;

  const appsEl = document.getElementById('dashboardApps');
  appsEl.innerHTML = applications.length
    ? applications.slice(0, 4).map(appItemHtml).join('')
    : `<div class="empty-note">No applications yet — start one from "Find a service".</div>`;
  appsEl.querySelectorAll('[data-open-application]').forEach((el) =>
    el.addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('setu:open-application', { detail: { id: el.dataset.openApplication } }))
    )
  );

  const docsEl = document.getElementById('dashboardDocs');
  docsEl.innerHTML = documents.length
    ? documents.map(docRowHtml).join('')
    : `<div class="empty-note">Nothing verified yet.</div>`;
}

export { renderDashboard };
