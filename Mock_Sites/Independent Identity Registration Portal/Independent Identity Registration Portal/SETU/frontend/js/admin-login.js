/**
 * Administrative Login Script
 */

document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect to dashboard
  if (sessionStorage.getItem('adminToken')) {
    window.location.href = '/admin-dashboard.html';
    return;
  }

  const form = document.getElementById('login-form');
  const submitBtn = document.getElementById('login-btn');
  const btnText = document.getElementById('login-btn-text');
  const btnSpinner = document.getElementById('login-spinner');
  const errorAlert = document.getElementById('login-error');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      if (!username || !password) {
        showError('Please enter both username and password.');
        return;
      }

      setLoading(true);
      hideError();

      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          showError(data.message || 'Authentication failed. Please verify credentials.');
          return;
        }

        // Store JWT token securely in sessionStorage
        sessionStorage.setItem('adminToken', data.token);
        sessionStorage.setItem('adminUser', data.admin.username);

        showToast('Login successful! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = '/admin-dashboard.html';
        }, 600);
      } catch (err) {
        showError('Unable to connect to the backend server. Please verify it is running.');
      } finally {
        setLoading(false);
      }
    });
  }

  function setLoading(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true;
      btnSpinner.style.display = 'inline-block';
      btnText.textContent = 'Authenticating...';
    } else {
      submitBtn.disabled = false;
      btnSpinner.style.display = 'none';
      btnText.textContent = 'Sign In to Dashboard';
    }
  }

  function showError(msg) {
    errorAlert.style.display = 'block';
    errorAlert.textContent = msg;
  }

  function hideError() {
    errorAlert.style.display = 'none';
    errorAlert.textContent = '';
  }
});
