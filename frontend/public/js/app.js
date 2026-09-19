'use strict';

/**
 * App orchestrator: session gate, shell chrome (topbar/tabs), and the tiny
 * hash-free view router. No framework — tab switching is a plain
 * show/hide over four view containers, matching the reference mock's
 * pattern but wired to real data instead of the static HTML in
 * refrences/setu_sih26129_demo.html.
 */

import { getToken, getCitizen, clearSession, setUnauthorizedHandler } from './api.js';
import { mountAuthScreen } from './views/auth.js';
import { mountLanding } from './views/landing.js';
import { netmapSvg, brandMarkSvg } from './netmap.js';
import { initials } from './util.js';
import { setRelayCallback } from './views/relay.js';
import { renderDashboard } from './views/dashboard.js';
import { renderServices } from './views/services.js';
import { renderDocuments } from './views/documents.js';
import { renderApplicationsList, renderApplicationDetail } from './views/applications.js';
import { nextRenderToken } from './render-guard.js';
import { mountFabricBackground } from './fabric-bg.js';

// Sidebar nav (reference layout). Each item keeps its data-tab id + label
// and gains a line icon. The router/handlers are unchanged.
const ICONS = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>`,
  services: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  documents: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5"/><path d="M15 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M9 13h6M9 17h6"/></svg>`,
  applications: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>`,
};
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
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand">
          <div class="mark">${brandMarkSvg()}</div>
          <div class="word">Setu<span>.</span></div>
        </div>
        <button class="sidebar-toggle" id="sidebarToggle" title="Collapse sidebar" aria-label="Collapse sidebar" aria-expanded="true">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
        </button>
      </div>
      <nav class="side-nav" id="tabNav">
        ${TABS.map((t) => `<button data-tab="${t.id}"><span class="side-ico">${ICONS[t.id] || ''}</span><span class="side-label">${t.label}</span></button>`).join('')}
      </nav>
      <div class="sidebar-foot">
        <div class="who" role="group" aria-label="Signed-in account">
          <div class="avatar" aria-hidden="true">${initials(citizen.full_name)}</div>
          <div class="role"><b>${citizen.full_name}</b>${citizen.email}</div>
          <button class="logout-btn" id="logoutBtn" title="Log out" aria-label="Log out ${citizen.full_name}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
          </button>
        </div>
      </div>
    </aside>
    <main class="shell" id="viewRoot"></main>
  </div>
  <div id="modalHost"></div>
  <div id="toast" class="toast"></div>`;
}

function setActiveTab(tabId) {
  document.querySelectorAll('#tabNav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
}

/**
 * Subtle content transition on tab switch (apple-design §7 spatial
 * consistency + animate §5: a short ease-out fade + rise so the new view
 * arrives rather than teleporting). This animates the view CONTAINER, not
 * its children, so it's independent of each view's own async render and of
 * the per-card GSAP staggers inside — the panel eases in as a whole while
 * its cards stagger in on top. Purely a CSS class re-trigger (one reflow),
 * no JS animation loop. prefers-reduced-motion collapses it (see app.css:
 * the keyframe duration is a motion token that zeroes under reduced-motion,
 * and the media query drops the transform outright).
 */
function playViewEnter(el) {
  if (!el) return;
  el.classList.remove('view-enter');
  // Force a reflow so removing + re-adding the class restarts the animation
  // even on rapid consecutive tab clicks (without this the browser
  // coalesces the class toggle and the animation never replays).
  void el.offsetWidth;
  el.classList.add('view-enter');
}

async function loadTab(tabId) {
  currentTab = tabId;
  currentApplicationId = null;
  const token = nextRenderToken(); // invalidates any in-flight render from a previous view
  setActiveTab(tabId);
  const viewRoot = document.getElementById('viewRoot');
  viewRoot.scrollIntoView({ block: 'start' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  playViewEnter(viewRoot); // subtle fade+rise on the whole panel per tab switch

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
  playViewEnter(viewRoot);
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
    showLanding();
  });

  // Sidebar collapse toggle (3-dot). Persists the choice in localStorage so
  // it survives reloads. Collapsed = icon-only rail; the router is untouched.
  const layoutEl = root.querySelector('.app-layout');
  const toggleBtn = document.getElementById('sidebarToggle');
  const applyCollapsed = (collapsed) => {
    layoutEl.classList.toggle('sidebar-collapsed', collapsed);
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  };
  applyCollapsed(localStorage.getItem('setu.sidebarCollapsed') === '1');
  toggleBtn.addEventListener('click', () => {
    const collapsed = !layoutEl.classList.contains('sidebar-collapsed');
    localStorage.setItem('setu.sidebarCollapsed', collapsed ? '1' : '0');
    applyCollapsed(collapsed);
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

/**
 * Landing page is the pre-auth entry surface (Phase 4). Its CTAs open the
 * Phase-3 auth screen. This is additive: the router structure is unchanged
 * — boot() still branches purely on whether a valid session exists; the
 * only change is that the unauthenticated branch (and logout) now show the
 * marketing landing page instead of jumping straight to the auth form.
 */
function showLanding() {
  mountLanding(root, {
    onLogin: () => mountAuthScreen(root, mountApp),
    onRegister: () => mountAuthScreen(root, mountApp),
  });
}

function boot() {
  // Living kinetic-fabric backdrop (ported from refrences/background.txt),
  // mounted once behind the whole app. Fixed, pointer-events:none, honours
  // reduced-motion. Persists across view/tab changes since it lives on body.
  mountFabricBackground();

  // A 401 on any protected call means the stored token is stale. Clear it
  // (api.js already did) and drop back to the landing/auth screen with a
  // clear message, instead of leaving the citizen on a dashboard that can
  // never load. Guarded so a burst of parallel 401s only bounces once.
  let bouncing = false;
  setUnauthorizedHandler(() => {
    if (bouncing) return;
    bouncing = true;
    mountAuthScreen(root, mountApp, { notice: 'Your session expired — please log in again.' });
    setTimeout(() => { bouncing = false; }, 1500);
  });

  const token = getToken();
  const citizen = getCitizen();
  if (token && citizen) {
    mountApp(citizen);   // valid session -> straight into the app shell, skip marketing
  } else {
    showLanding();       // no session -> landing page (CTAs -> auth screen)
  }
}

boot();
