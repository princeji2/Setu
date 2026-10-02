'use strict';

/**
 * Citizen Profile view.
 * Displays citizen identity header, Activity summary stats, and
 * Verified reusable documents across connected departments.
 */

import { api, getCitizen } from '../api.js';
import {
  escapeHtml,
  initials,
  timeAgo,
  DEPARTMENT_LABELS,
  departmentTheme,
  dataErrorBannerHtml,
} from '../util.js';
import { isStale } from '../render-guard.js';

function formatJoinDate(isoString) {
  if (!isoString) return 'Member';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Member';
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `Member since ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

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

function verifiedDocCardHtml(doc) {
  const theme = departmentTheme(doc.department);
  const docName = getDocTypeLabel(doc.department_reference, doc.department);
  const deptLabel = DEPARTMENT_LABELS[doc.department] || doc.department;
  const refHtml = doc.department_reference
    ? `<div class="profile-doc-ref">Reference <span class="doc-ref">${escapeHtml(doc.department_reference)}</span> &middot; verified ${escapeHtml(timeAgo(doc.linked_at))}</div>`
    : '';

  return `
  <div class="profile-doc-card ${theme.themeClass}">
    <div class="profile-doc-header">
      <div class="profile-doc-title-area">
        <h3 class="profile-doc-name">${escapeHtml(docName)}</h3>
        <span class="dept-tag ${theme.themeClass}">
          <span class="dept-tag-glyph">${theme.icon}</span>
          ${escapeHtml(deptLabel)}
        </span>
      </div>
      <span class="status-badge status-badge-verified" title="Officially verified via connected department">
        <svg class="status-badge-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10 2l6 2.5v5.5c0 4.5-3 7.5-6 9-3-1.5-6-4.5-6-9V4.5L10 2z" fill="currentColor" fill-opacity="0.14"/>
          <path d="M10 2l6 2.5v5.5c0 4.5-3 7.5-6 9-3-1.5-6-4.5-6-9V4.5L10 2z"/>
          <polyline points="7 10 9 12 13 8"/>
        </svg>
        <span class="status-badge-text">Verified</span>
      </span>
    </div>
    ${refHtml}
  </div>`;
}

async function renderProfile(root, token, { onBack, onLogout } = {}) {
  if (isStale(token)) return;

  const citizen = getCitizen() || {};
  const safeName = escapeHtml(citizen.full_name || 'Citizen');
  const safeEmail = escapeHtml(citizen.email || '');
  const joinDate = formatJoinDate(citizen.created_at);

  root.innerHTML = `
    <div class="profile-view">
      <button type="button" class="btn btn-ghost btn-sm profile-back" id="profileBack" aria-label="Back">
        &larr; Back
      </button>

      <div class="panel panel-pad profile-card">
        <div class="profile-card-main">
          <div class="profile-avatar" aria-hidden="true">${initials(citizen.full_name)}</div>
          <div class="profile-info">
            <h1 class="profile-name">${safeName}</h1>
            <div class="profile-email">${safeEmail}</div>
            <div class="profile-meta">${escapeHtml(joinDate)}</div>
          </div>
        </div>
        <div class="profile-card-actions">
          <button type="button" class="btn btn-ghost btn-sm profile-signout-btn" id="profileSignoutBtn">
            Sign out
          </button>
        </div>
      </div>

      <section class="profile-section">
        <div class="section-head">
          <h2>Activity summary</h2>
        </div>
        <div id="profileActivitySlot">
          <div class="loading-note"><span class="spinner dark"></span> Loading activity…</div>
        </div>
      </section>

      <section class="profile-section">
        <div class="section-head">
          <h2>Verified documents</h2>
        </div>
        <p class="section-note">Documents verified through Setu that can be reused across connected departments without re-entry.</p>
        <div id="profileDocsSlot">
          <div class="loading-note"><span class="spinner dark"></span> Loading verified documents…</div>
        </div>
      </section>
    </div>
  `;

  if (isStale(token)) return;

  const backBtn = document.getElementById('profileBack');
  if (backBtn && typeof onBack === 'function') {
    backBtn.addEventListener('click', onBack);
  }

  const signoutBtn = document.getElementById('profileSignoutBtn');
  if (signoutBtn && typeof onLogout === 'function') {
    signoutBtn.addEventListener('click', onLogout);
  }

  const fetchActivity = async () => {
    const activitySlot = document.getElementById('profileActivitySlot');
    if (!activitySlot) return;
    activitySlot.innerHTML = `<div class="loading-note"><span class="spinner dark"></span> Loading activity…</div>`;
    try {
      const apps = await api.applications.list();
      if (isStale(token)) return;
      const total = apps.length;
      const verified = apps.filter((a) => a.status === 'complete').length;
      const needsRetry = apps.filter((a) => a.status === 'failed').length;

      activitySlot.innerHTML = `
        <div class="stat-row profile-stat-row">
          <div class="stat">
            <div class="n">${total}</div>
            <div class="l">Total applications</div>
          </div>
          <div class="stat">
            <div class="n">${verified}</div>
            <div class="l">Applications verified</div>
          </div>
          <div class="stat">
            <div class="n">${needsRetry}</div>
            <div class="l">Needs retry</div>
          </div>
        </div>`;
    } catch (err) {
      if (isStale(token)) return;
      activitySlot.innerHTML = dataErrorBannerHtml(err?.message || "Couldn't load activity summary.");
      activitySlot.querySelector('.deb-retry')?.addEventListener('click', () => fetchActivity());
    }
  };

  const fetchDocuments = async () => {
    const docsSlot = document.getElementById('profileDocsSlot');
    if (!docsSlot) return;
    docsSlot.innerHTML = `<div class="loading-note"><span class="spinner dark"></span> Loading verified documents…</div>`;
    try {
      const docs = await api.documents.list();
      if (isStale(token)) return;
      const verifiedDocs = (docs || []).filter((d) => d.verified);

      if (verifiedDocs.length === 0) {
        docsSlot.innerHTML = `
          <div class="profile-empty-docs panel panel-pad">
            <div class="empty-note" style="margin-bottom: var(--space-4);">No verified documents yet. Complete a verification from a connected service to store reusable credentials.</div>
            <button type="button" class="btn btn-primary btn-sm" id="profileFindServiceBtn">Find a service</button>
          </div>`;
        document.getElementById('profileFindServiceBtn')?.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('setu:goto-tab', { detail: 'services' }));
        });
      } else {
        docsSlot.innerHTML = `
          <div class="profile-doc-list">
            ${verifiedDocs.map(verifiedDocCardHtml).join('')}
          </div>`;
      }
    } catch (err) {
      if (isStale(token)) return;
      docsSlot.innerHTML = dataErrorBannerHtml(err?.message || "Couldn't load verified documents.");
      docsSlot.querySelector('.deb-retry')?.addEventListener('click', () => fetchDocuments());
    }
  };

  await Promise.all([fetchActivity(), fetchDocuments()]);
}

export { renderProfile };
