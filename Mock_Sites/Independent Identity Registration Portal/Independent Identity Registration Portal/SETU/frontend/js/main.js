/**
 * Shared utility functions for Website 1 — Aadhaar Registration Portal
 */

// Global toast notification system
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '✕';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return isoString;
  }
}

// Check database connectivity and display banner if offline
async function checkSystemHealth() {
  try {
    const res = await fetch('/health');
    const data = await res.json();
    const statusEl = document.getElementById('system-status-indicator');
    if (statusEl) {
      if (data.database && data.database.connected) {
        statusEl.innerHTML = '<span style="color:#10b981;">●</span> PostgreSQL 17 Online';
      } else {
        statusEl.innerHTML = '<span style="color:#ef4444;">●</span> PostgreSQL Offline';
      }
    }
  } catch (err) {
    const statusEl = document.getElementById('system-status-indicator');
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#f59e0b;">●</span> Backend Connecting...';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkSystemHealth();
});
