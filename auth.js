// js/auth.js — handles login via Google Apps Script

document.addEventListener('DOMContentLoaded', () => {
  // Already logged in? Go straight to chat
  if (sessionStorage.getItem('tcUser')) {
    window.location.href = 'chat.html';
    return;
  }

  const form    = document.getElementById('loginForm');
  const errorEl = document.getElementById('errorMsg');
  const btn     = document.getElementById('loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const userId   = document.getElementById('userId').value.trim();
    const password = document.getElementById('password').value;

    if (!userId || !password) {
      errorEl.textContent = 'Please fill in both fields.';
      return;
    }

    // Show loading state
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method:  'POST',
        // 'text/plain' avoids CORS preflight when calling Apps Script
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ action: 'login', userId, password }),
        redirect: 'follow'
      });

      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem('tcUser', JSON.stringify(data.user));
        window.location.href = 'chat.html';
      } else {
        errorEl.textContent = data.message || 'Invalid ID or password.';
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    } catch (err) {
      console.error(err);
      errorEl.textContent = 'Could not connect. Check your internet and try again.';
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
});
