/**
 * Administrative Dashboard Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('adminToken');
  const user = sessionStorage.getItem('adminUser') || 'Admin';

  if (!token) {
    window.location.href = '/admin-login.html';
    return;
  }

  // Display admin username
  const userDisplay = document.getElementById('admin-username-display');
  if (userDisplay) {
    userDisplay.textContent = user;
  }

  // Setup Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('adminToken');
      sessionStorage.removeItem('adminUser');
      showToast('Logged out successfully.', 'info');
      setTimeout(() => {
        window.location.href = '/admin-login.html';
      }, 500);
    });
  }

  // Load Dashboard Data
  loadStats();
  loadRegistrations();
  loadAuditLogs();

  // Search input handler with debounce
  const searchInput = document.getElementById('search-input');
  let debounceTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        loadRegistrations(e.target.value.trim());
      }, 300);
    });
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/admin/dashboard-stats', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        handleAuthExpiry();
        return;
      }

      const data = await res.json();
      if (data.success && data.data) {
        document.getElementById('stat-total').textContent = data.data.totalRegistrations;
        document.getElementById('stat-today').textContent = data.data.registrationsToday;
        document.getElementById('stat-audit').textContent = data.data.totalAuditEvents;
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function loadRegistrations(search = '') {
    const tableBody = document.getElementById('registrations-tbody');
    try {
      const url = search 
        ? `/api/admin/registrations?search=${encodeURIComponent(search)}`
        : '/api/admin/registrations';

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        handleAuthExpiry();
        return;
      }

      const data = await res.json();
      if (!tableBody) return;

      if (!data.success || !data.data || data.data.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="4" class="empty-state">
              No registration records found in PostgreSQL database.
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = data.data.map((item) => `
        <tr>
          <td><span class="id-badge">${escapeHtml(item.identity_reference)}</span></td>
          <td><span class="tag-status tag-status-registered">${escapeHtml(item.status)}</span></td>
          <td class="timestamp">${formatDate(item.created_at)}</td>
          <td><span style="color:#10b981; font-size: 0.8rem;">● Persistent</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load registrations:', err);
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color:#ef4444;">Error loading registrations from database.</td></tr>`;
      }
    }
  }

  async function loadAuditLogs() {
    const listContainer = document.getElementById('audit-list');
    try {
      const res = await fetch('/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        handleAuthExpiry();
        return;
      }

      const data = await res.json();
      if (!listContainer) return;

      if (!data.success || !data.data || data.data.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">No audit logs recorded yet.</div>`;
        return;
      }

      listContainer.innerHTML = data.data.map((log) => `
        <div class="audit-item">
          <div class="audit-left">
            <span class="audit-tag">${escapeHtml(log.event_type)}</span>
            <span style="color: #cbd5e1; font-size: 0.85rem;">${escapeHtml(formatMetadata(log.metadata))}</span>
          </div>
          <div style="display: flex; gap: 1rem; align-items: center;">
            <span style="color: var(--text-dim); font-size: 0.75rem;">IP: ${escapeHtml(log.ip_address || '127.0.0.1')}</span>
            <span class="timestamp">${formatDate(log.created_at)}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      if (listContainer) {
        listContainer.innerHTML = `<div class="empty-state" style="color:#ef4444;">Error loading audit logs.</div>`;
      }
    }
  }

  function formatMetadata(meta) {
    if (!meta) return '';
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch (e) {}
    }
    if (meta.identity_reference) {
      return `Target ID: ${meta.identity_reference} (${meta.status || 'CHECK'})`;
    }
    if (meta.username) {
      return `User: ${meta.username}`;
    }
    return JSON.stringify(meta);
  }

  function handleAuthExpiry() {
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    showToast('Session expired. Please log in again.', 'error');
    setTimeout(() => {
      window.location.href = '/admin-login.html';
    }, 800);
  }
});
