'use strict';

/**
 * Citizen Profile view.
 * Displays citizen identity header, Activity summary stats, Recent activity,
 * and Verified reusable documents across connected departments.
 */

import { api, getCitizen } from '../api.js';
import {
  escapeHtml,
  initials,
  timeAgo,
  DEPARTMENT_LABELS,
  APPLICATION_TYPE_LABELS,
  departmentTheme,
  dataErrorBannerHtml,
} from '../util.js';
import { isStale } from '../render-guard.js';
import { resolveDepartment, statusBadgeHtml } from './applications.js';

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

function renderDeptTag(app) {
  const isComposite = app.type === 'senior_citizen_transport_concession' || Boolean(app.composite_workflow_id);
  if (isComposite) {
    return `<span class="dept-tag theme-composite"><span class="dept-tag-glyph">🚌</span>NIR + DLJA (Chained)</span>`;
  }
  const department = resolveDepartment(app);
  if (!department) {
    return `<span class="dept-tag"><span class="dept-tag-glyph">🏛️</span>Other department</span>`;
  }
  const theme = departmentTheme(department);
  return `<span class="dept-tag ${theme.themeClass}"><span class="dept-tag-glyph">${theme.icon}</span>${escapeHtml(DEPARTMENT_LABELS[department] || department)}</span>`;
}

function recentActivityRowHtml(app) {
  const typeLabel = APPLICATION_TYPE_LABELS[app.type] || app.type;
  const deptTag = renderDeptTag(app);
  const time = timeAgo(app.updated_at || app.created_at);

  return `
  <div class="profile-act-row" data-open-application="${escapeHtml(app.id)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(typeLabel)} application">
    <div class="profile-act-left">
      <div class="profile-act-title-area">
        <span class="profile-act-name">${escapeHtml(typeLabel)}</span>
        ${deptTag}
      </div>
      <span class="profile-act-time">${escapeHtml(time)}</span>
    </div>
    <div class="profile-act-right">
      ${statusBadgeHtml(app.status)}
    </div>
  </div>`;
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
          <h2>Recent activity</h2>
          <button type="button" class="link profile-view-all-apps" id="profileViewAllApps">View all applications &rarr;</button>
        </div>
        <div id="profileRecentSlot">
          <div class="loading-note"><span class="spinner dark"></span> Loading recent activity…</div>
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

  const viewAllBtn = document.getElementById('profileViewAllApps');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('setu:goto-tab', { detail: 'applications' }));
    });
  }

  const fetchActivity = async () => {
    const activitySlot = document.getElementById('profileActivitySlot');
    const recentSlot = document.getElementById('profileRecentSlot');
    if (activitySlot) {
      activitySlot.innerHTML = `<div class="loading-note"><span class="spinner dark"></span> Loading activity…</div>`;
    }
    if (recentSlot) {
      recentSlot.innerHTML = `<div class="loading-note"><span class="spinner dark"></span> Loading recent activity…</div>`;
    }

    try {
      const apps = await api.applications.list();
      if (isStale(token)) return;

      const total = apps.length;
      const verified = apps.filter((a) => a.status === 'complete').length;
      const needsRetry = apps.filter((a) => a.status === 'failed').length;

      if (activitySlot) {
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
      }

      if (recentSlot) {
        if (!apps.length) {
          recentSlot.innerHTML = `<div class="empty-note">No applications yet. Start one from "Find a service".</div>`;
        } else {
          const sortedApps = [...apps].sort((a, b) => {
            const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
            const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
            return timeB - timeA;
          });
          const recentApps = sortedApps.slice(0, 5);

          recentSlot.innerHTML = `
            <div class="profile-act-list">
              ${recentApps.map(recentActivityRowHtml).join('')}
            </div>`;

          recentSlot.querySelectorAll('[data-open-application]').forEach((row) => {
            const appId = row.dataset.openApplication;
            const open = () => {
              window.dispatchEvent(new CustomEvent('setu:open-application', { detail: { id: appId } }));
            };
            row.addEventListener('click', open);
            row.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                open();
              }
            });
          });
        }
      }
    } catch (err) {
      if (isStale(token)) return;
      const errorHtml = dataErrorBannerHtml(err?.message || "Couldn't load activity.");
      if (activitySlot) {
        activitySlot.innerHTML = errorHtml;
        activitySlot.querySelector('.deb-retry')?.addEventListener('click', () => fetchActivity());
      }
      if (recentSlot) {
        recentSlot.innerHTML = errorHtml;
        recentSlot.querySelector('.deb-retry')?.addEventListener('click', () => fetchActivity());
      }
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
