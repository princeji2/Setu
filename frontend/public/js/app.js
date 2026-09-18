'use strict';

/**
 * App orchestrator: session gate, shell chrome (topbar/tabs), and the tiny
 * hash-free view router. No framework — tab switching is a plain
 * show/hide over four view containers, matching the reference mock's
 * pattern but wired to real data instead of the static HTML in
 * refrences/setu_sih26129_demo.html.
 */

import { getToken, getCitizen, clearSession } from './api.js';
import { mountAuthScreen } from './views/auth.js';
import { netmapSvg, brandMarkSvg } from './netmap.js';
import { initials } from './util.js';
import { setRelayCallback } from './views/relay.js';
import { renderDashboard } from './views/dashboard.js';
import { renderServices } from './views/services.js';
import { renderDocuments } from './views/documents.js';
import { renderApplicationsList, renderApplicationDetail } from './views/applications.js';
import { nextRenderToken } from './render-guard.js';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'services', label: 'Find a service' },
  { id: 'documents', label: 'Documents' },
  { id: 'applications', label: 'Applications' },
];

const root = document.getElementById('appRoot');
let currentTab = 'dashboard';
let currentApplicationId = null;

function shellHtml(citizen) {
  return `
  <header class="topbar">
    <div class="brand">
      <div class="mark">${brandMarkSvg()}</div>
      <div class="word">Setu<span>.</span></div>
    </div>
    <nav class="tabs" id="tabNav">
      ${TABS.map((t) => `<button data-tab="${t.id}">${t.label}</button>`).join('')}
    </nav>
    <div class="who">
      <div class="role"><b>${citizen.full_name}</b>${citizen.email}</div>
      <div class="avatar">${initials(citizen.full_name)}</div>
      <button class="logout-btn" id="logoutBtn">Log out</button>
    </div>
  </header>
  <main class="shell" id="viewRoot"></main>
  <div id="modalHost"></div>
  <div id="toast" class="toast"></div>`;
}

function setActiveTab(tabId) {
  document.querySelectorAll('#tabNav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
}

async function loadTab(tabId) {
  currentTab = tabId;
  currentApplicationId = null;
  const token = nextRenderToken(); // invalidates any in-flight render from a previous view
  setActiveTab(tabId);
  const viewRoot = document.getElementById('viewRoot');
  viewRoot.scrollIntoView({ block: 'start' });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabId === 'dashboard') return renderDashboard(viewRoot, token);
  if (tabId === 'services') return renderServices(viewRoot, token);
  if (tabId === 'documents') return renderDocuments(viewRoot, token);
  if (tabId === 'applications') return renderApplicationsList(viewRoot, token);
}

async function openApplicationDetail(applicationId) {
  currentApplicationId = applicationId;
  const token = nextRenderToken();
  setActiveTab('applications');
  const viewRoot = document.getElementById('viewRoot');
  await renderApplicationDetail(viewRoot, applicationId, token);
}

function mountApp(citizen) {
  root.innerHTML = shellHtml(citizen);

  document.getElementById('tabNav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (btn) loadTab(btn.dataset.tab);
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearSession();
    mountAuthScreen(root, mountApp);
  });

  // A relay completing anywhere in the app should refresh whichever view
  // is currently visible, since it may have changed the citizen's
  // documents/applications state (e.g. dashboard stats, documents grid).
  setRelayCallback(() => {
    if (currentApplicationId) openApplicationDetail(currentApplicationId);
    else loadTab(currentTab);
  });

  window.addEventListener('setu:goto-tab', (e) => loadTab(e.detail));
  window.addEventListener('setu:open-application', (e) => openApplicationDetail(e.detail.id));

  loadTab('dashboard');
}

function boot() {
  const token = getToken();
  const citizen = getCitizen();
  if (token && citizen) {
    mountApp(citizen);
  } else {
    mountAuthScreen(root, mountApp);
  }
}

boot();
