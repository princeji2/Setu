'use strict';

/** Small shared helpers used across view modules. */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(message, { error = false, duration = 3200 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(window.__setuToastTimer);
  window.__setuToastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(isoString).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const DEPARTMENT_LABELS = {
  digital_tax_records: 'Digital Tax Records',
  national_identity_registry: 'National Identity Registry',
  driving_licence_jan_aadhaar: 'Driving Licence & Jan Aadhaar Portal',
};

const APPLICATION_TYPE_LABELS = {
  pan_verification: 'PAN verification',
  identity_verification: 'Identity verification',
  driving_licence_registration: 'Driving licence registration',
};

const STATUS_LABELS = {
  submitted: 'Submitted',
  gateway_relay: 'Gateway relay',
  department_verifying: 'Awaiting department',
  complete: 'Complete',
  failed: 'Failed — needs retry',
};

function statusChipClass(status) {
  if (status === 'complete') return 'chip-done';
  if (status === 'failed') return 'chip-failed';
  if (status === 'submitted') return 'chip-wait';
  return 'chip-progress';
}

/** Track-step index for the four-node relay progress rail. */
const TRACK_STEPS = ['submitted', 'gateway_relay', 'department_verifying', 'complete'];

function trackStepIndex(status) {
  if (status === 'failed') return -1; // rendered specially
  const idx = TRACK_STEPS.indexOf(status);
  return idx === -1 ? 0 : idx;
}

function initials(fullName) {
  if (!fullName) return '?';
  const parts = String(fullName).trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export {
  escapeHtml,
  toast,
  timeAgo,
  DEPARTMENT_LABELS,
  APPLICATION_TYPE_LABELS,
  STATUS_LABELS,
  statusChipClass,
  TRACK_STEPS,
  trackStepIndex,
  initials,
};
