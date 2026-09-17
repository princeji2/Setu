'use strict';

/**
 * admin-dashboard.js
 * Powers the admin dashboard: stats, registrations table, audit log, search, pagination.
 * All API calls include the JWT from sessionStorage.
 * Sensitive fields are already masked by the backend — this file does no extra unmasking.
 */

const API_BASE = '/api/v1';

// ── Auth guard ────────────────────────────────────────────────
const token         = sessionStorage.getItem('adminToken');
const adminUsername = sessionStorage.getItem('adminUsername') || 'Admin';

if (!token) {
  window.location.href = 'admin-login.html';
}

// ── DOM refs ──────────────────────────────────────────────────
document.getElementById('admin-username-display').textContent = `👤 ${adminUsername}`;
document.getElementById('logout-btn').addEventListener('click', logout);

// Stats
const statTotal       = document.getElementById('stat-total');
const statFormatValid = document.getElementById('stat-format-valid');
const statPending     = document.getElementById('stat-pending');
const stat24h         = document.getElementById('stat-24h');
const stat7d          = document.getElementById('stat-7d');

// Registrations tab
const regTbody       = document.getElementById('registrations-tbody');
const regError       = document.getElementById('registrations-error');
const prevPageBtn    = document.getElementById('prev-page');
const nextPageBtn    = document.getElementById('next-page');
const pageInfo       = document.getElementById('page-info');

// Search
const searchForm     = document.getElementById('search-form');
const searchInput    = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');

// Audit tab
const auditTbody     = document.getElementById('audit-tbody');
const auditPrevBtn   = document.getElementById('audit-prev-page');
const auditNextBtn   = document.getElementById('audit-next-page');
const auditPageInfo  = document.getElementById('audit-page-info');

// Tabs
const tabBtns        = document.querySelectorAll('.tab-btn');
const tabPanels      = document.querySelectorAll('.tab-panel');

// ── State ─────────────────────────────────────────────────────
let currentPage     = 1;
let totalPages      = 1;
let searchQuery     = '';
let auditPage       = 1;
let auditTotalPages = 1;
let auditLoaded     = false;

// ── API helper ────────────────────────────────────────────────
async function apiFetch(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    logout();
    return null;
  }
  return response.json();
}

// ── Logout ────────────────────────────────────────────────────
function logout() {
  sessionStorage.removeItem('adminToken');
  sessionStorage.removeItem('adminUsername');
  window.location.href = 'admin-login.html';
}

// ── Tab switching ─────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('aria-controls');
    tabBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    tabPanels.forEach(p => p.classList.add('hidden'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(targetId).classList.remove('hidden');

    // Lazy-load audit logs on first visit to that tab
    if (targetId === 'tab-audit' && !auditLoaded) {
      loadAuditLogs();
    }
  });
});

// ── Status badge helper ───────────────────────────────────────
function statusBadge(status) {
  const map = {
    FORMAT_VALID:          'valid',
    VERIFICATION_PENDING:  'pending',
    VERIFIED:              'verified',
    VERIFICATION_FAILED:   'failed',
  };
  const cls  = map[status] || 'pending';
  const label = (status || 'UNKNOWN').replace(/_/g, ' ');
  return `<span class="status-badge status-badge--${cls}" aria-label="Status: ${label}">${label}</span>`;
}

// ── Format date ───────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return str; }
}

function fmtDateTime(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return str; }
}

// ── Escape HTML (prevent XSS from server data) ────────────────
function esc(str) {
  if (str == null) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Load Stats ────────────────────────────────────────────────
async function loadStats() {
  const data = await apiFetch('/admin/stats');
  if (!data || !data.success) return;
  const s = data.data;
  statTotal.textContent       = s.total_registrations    ?? '—';
  statFormatValid.textContent = s.format_valid            ?? '—';
  statPending.textContent     = s.pending_verification    ?? '—';
  stat24h.textContent         = s.registrations_last_24h  ?? '—';
  stat7d.textContent          = s.registrations_last_7d   ?? '—';
}

// ── Load Registrations ────────────────────────────────────────
async function loadRegistrations(page = 1, query = '') {
  regTbody.innerHTML = `<tr><td colspan="10" class="table-empty">Loading…</td></tr>`;
  regError.classList.add('hidden');

  const endpoint = query
    ? `/admin/registrations/search?q=${encodeURIComponent(query)}`
    : `/admin/registrations?page=${page}&limit=20`;

  const data = await apiFetch(endpoint);

  if (!data || !data.success) {
    regTbody.innerHTML = `<tr><td colspan="10" class="table-empty">Failed to load registrations.</td></tr>`;
    return;
  }

  const regs = data.data.registrations || [];

  if (regs.length === 0) {
    regTbody.innerHTML = `<tr><td colspan="10" class="table-empty">No registrations found.</td></tr>`;
    updatePagination(1, 1);
    return;
  }

  regTbody.innerHTML = regs.map(r => `
    <tr>
      <td><strong>${esc(r.registration_reference)}</strong></td>
      <td>${esc(r.licence_holder_name)}</td>
      <td><code>${esc(r.licence_number)}</code></td>
      <td>${fmtDate(r.licence_issue_date)}</td>
      <td>${fmtDate(r.licence_valid_from)}</td>
      <td>${fmtDate(r.licence_expiry_date)}</td>
      <td><code>${esc(r.jan_aadhaar_id)}</code></td>
      <td>${esc(r.family_members_count)}</td>
      <td>${statusBadge(r.verification_status)}</td>
      <td>${fmtDateTime(r.created_at)}</td>
    </tr>
  `).join('');

  if (!query && data.data.pagination) {
    const p = data.data.pagination;
    currentPage = p.page;
    totalPages  = p.totalPages;
    updatePagination(p.page, p.totalPages, p.total);
  } else {
    updatePagination(1, 1);
  }
}

function updatePagination(page, total, totalRecords) {
  prevPageBtn.disabled = page <= 1;
  nextPageBtn.disabled = page >= total;
  pageInfo.textContent = totalRecords != null
    ? `Page ${page} of ${total} (${totalRecords} total)`
    : `Page ${page} of ${total}`;
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    loadRegistrations(currentPage, searchQuery);
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    loadRegistrations(currentPage, searchQuery);
  }
});

// ── Search ────────────────────────────────────────────────────
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  searchQuery  = searchInput.value.trim();
  currentPage  = 1;
  loadRegistrations(1, searchQuery);
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery       = '';
  currentPage       = 1;
  loadRegistrations(1, '');
});

// ── Load Audit Logs ───────────────────────────────────────────
async function loadAuditLogs(page = 1) {
  auditTbody.innerHTML = `<tr><td colspan="7" class="table-empty">Loading…</td></tr>`;

  const data = await apiFetch(`/admin/audit-logs?page=${page}&limit=20`);
  auditLoaded = true;

  if (!data || !data.success) {
    auditTbody.innerHTML = `<tr><td colspan="7" class="table-empty">Failed to load audit logs.</td></tr>`;
    return;
  }

  const logs = data.data.audit_logs || [];

  if (logs.length === 0) {
    auditTbody.innerHTML = `<tr><td colspan="7" class="table-empty">No audit logs found.</td></tr>`;
    return;
  }

  auditTbody.innerHTML = logs.map(l => `
    <tr>
      <td>${esc(l.id)}</td>
      <td><code>${esc(l.event_type)}</code></td>
      <td>${esc(l.registration_ref) || '—'}</td>
      <td>${esc(l.masked_identifier) || '—'}</td>
      <td>${l.admin_id ? esc(l.admin_id) : '—'}</td>
      <td>${esc(l.ip_address) || '—'}</td>
      <td>${fmtDateTime(l.created_at)}</td>
    </tr>
  `).join('');

  if (data.data.pagination) {
    const p = data.data.pagination;
    auditPage       = p.page;
    auditTotalPages = p.totalPages;
    auditPrevBtn.disabled = p.page <= 1;
    auditNextBtn.disabled = p.page >= p.totalPages;
    auditPageInfo.textContent = `Page ${p.page} of ${p.totalPages} (${p.total} total)`;
  }
}

auditPrevBtn.addEventListener('click', () => {
  if (auditPage > 1) { auditPage--; loadAuditLogs(auditPage); }
});
auditNextBtn.addEventListener('click', () => {
  if (auditPage < auditTotalPages) { auditPage++; loadAuditLogs(auditPage); }
});

// ── Initial load ──────────────────────────────────────────────
loadStats();
loadRegistrations(1);
