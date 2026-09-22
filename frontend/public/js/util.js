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
  pan_card_verification: 'PAN Card verification',
  income_certificate_verification: 'Income Certificate verification',
  identity_verification: 'Identity verification',
  voter_id_verification: 'Voter ID (EPIC) verification',
  birth_certificate_verification: 'Birth Certificate verification',
  driving_licence_registration: 'Driving licence registration',
  vehicle_rc_verification: 'Vehicle RC verification',
  passport_verification: 'Passport verification',
  senior_citizen_transport_concession: 'Senior Citizen Transport Concession',
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

/* ------------------------------------------------------------------
 * Shared per-department visual theme (colour + glyph). One source of
 * truth so the dashboard credential cards, the "Find a service" grid,
 * "My documents", and the applications list all colour-code the three
 * departments identically. Purely presentational — no data invented.
 * ------------------------------------------------------------------ */
const DEPARTMENT_THEME = {
  digital_tax_records: {
    themeClass: 'theme-tax',
    accent: '#4A6B32',
    kind: 'Tax record',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>`,
    // Large glossy 3D illustration for the department, in the vein of the
    // dashboard.png reference (each service card carries a big colourful
    // 3D glyph rather than a flat line icon). Emoji render as full-colour
    // 3D glyphs on every OS and need no image assets / network — so the
    // demo stays offline-safe. Tax records -> receipt.
    art: '🧾',
    artLabel: 'Tax record',
  },
  national_identity_registry: {
    themeClass: 'theme-identity',
    accent: '#8A7847',
    kind: 'Identity',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>`,
    art: '🪪', // identity card
    artLabel: 'Identity card',
  },
  driving_licence_jan_aadhaar: {
    themeClass: 'theme-licence',
    accent: '#9A6B2F',
    kind: 'Driving licence',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="8" cy="12" r="2.2"/><path d="M13 10h6M13 14h4"/></svg>`,
    art: '🚗', // driving licence
    artLabel: 'Driving licence',
  },
  composite_workflow: {
    themeClass: 'theme-composite',
    accent: '#2B6CB0',
    kind: 'Chained service',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.59 8.59l6.82 6.82"/></svg>`,
    art: '🚌',
    artLabel: 'Transport concession',
  },
};

function departmentTheme(department) {
  return DEPARTMENT_THEME[department] || DEPARTMENT_THEME.composite_workflow || DEPARTMENT_THEME.digital_tax_records;
}

/**
 * The big 3D glossy illustration for a department, wrapped so callers just
 * drop it into a card. Decorative (aria-hidden) — meaning is already
 * carried by the card's title/kind/colour. `size` picks a scale class.
 */
function departmentArtHtml(department, size = 'md') {
  const theme = departmentTheme(department);
  return `<span class="dept-art dept-art-${size}" role="img" aria-label="${escapeHtml(theme.artLabel)}">${theme.art}</span>`;
}

/**
 * Markup for the inline data-fetch error banner. Used by any view whose
 * data fetch can fail (dashboard, services). Rendering the banner is not
 * enough — callers must wire the retry button (class `.deb-retry`) to
 * re-run their own fetch. Kept here so the error language + markup stay
 * identical everywhere. `message` is plain text (escaped here).
 */
function dataErrorBannerHtml(message) {
  const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/></svg>`;
  return `
  <div class="data-error-banner" role="alert">
    <span class="deb-ico" aria-hidden="true">${icon}</span>
    <span class="deb-text">${escapeHtml(message || "Couldn't reach the gateway.")}</span>
    <button type="button" class="btn btn-ghost btn-sm deb-retry">Retry</button>
  </div>`;
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
  dataErrorBannerHtml,
  initials,
  DEPARTMENT_THEME,
  departmentTheme,
  departmentArtHtml,
};
