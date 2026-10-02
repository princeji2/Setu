'use strict';

/**
 * Citizen Profile view skeleton.
 * Displays citizen identity header (avatar, name, email, join date)
 * and sign-out action. Step 3 adds Verified documents & Activity summary.
 */

import { getCitizen } from '../api.js';
import { escapeHtml, initials } from '../util.js';
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
}

export { renderProfile };
