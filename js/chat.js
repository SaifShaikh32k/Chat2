// js/chat.js — real-time chat, notifications, presence

// ── State ──────────────────────────────────────────────────
let db, messaging;
let currentUser  = null;
let selectedUser = null;
let msgRef       = null;   // Firebase ref for current chat
let msgHandler   = null;   // listener function to detach
let allUsers     = [];
let unread       = {};
let presenceRefs = {};

// ── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const raw = sessionStorage.getItem('tcUser');
  if (!raw) { window.location.href = 'index.html'; return; }
  currentUser = JSON.parse(raw);

  const el = (id) => document.getElementById(id);
  el('myName').textContent   = currentUser.displayName;
  el('myId').textContent     = '@' + currentUser.userId;
  el('myAvatar').textContent = initial(currentUser.displayName);

  // Init Firebase
  firebase.initializeApp(CONFIG.FIREBASE);
  db = firebase.database();

  await setupFCM();
  setupPresence();
  await loadUsers();

  el('logoutBtn').addEventListener('click', logout);
  el('sendBtn').addEventListener('click', sendMessage);
  el('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  el('messageInput').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
  el('searchInput').addEventListener('input', (e) => renderUsers(e.target.value));
});

// ── FCM ────────────────────────────────────────────────────
async function setupFCM() {
  try {
    if ('serviceWorker' in navigator) {
      // Use relative path so it works on GitHub Pages subfolders
      const swPath = location.pathname.replace(/\/[^/]*$/, '/') + 'firebase-messaging-sw.js';
      await navigator.serviceWorker.register(swPath);
    }
    messaging = firebase.messaging();
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      const token = await messaging.getToken({ vapidKey: CONFIG.VAPID_KEY });
      if (token) {
        await db.ref(`tokens/${currentUser.userId}`).set({ token, updated: Date.now() });
      }
    }
    messaging.onMessage((payload) => {
      const fromId = payload.data?.senderId;
      if (!selectedUser || selectedUser.userId !== fromId) {
        showBanner(payload.notification?.title || 'New message', payload.notification?.body || '', fromId);
        playBeep();
        if (fromId) { unread[fromId] = (unread[fromId] || 0) + 1; refreshUserBadge(fromId); }
      }
    });
  } catch (err) {
    console.warn('FCM setup skipped:', err.message);
  }
}

// ── Presence ───────────────────────────────────────────────
function setupPresence() {
  const ref = db.ref(`presence/${currentUser.userId}`);
  ref.set({ online: true, lastSeen: Date.now() });
  ref.onDisconnect().set({ online: false, lastSeen: Date.now() });
  window.addEventListener('beforeunload', () => {
    ref.set({ online: false, lastSeen: Date.now() });
  });
}

function watchPresence(userId, cb) {
  if (presenceRefs[userId]) {
    db.ref(`presence/${userId}`).off('value', presenceRefs[userId]);
  }
  presenceRefs[userId] = db.ref(`presence/${userId}`).on('value', (snap) => {
    cb(!!snap.val()?.online);
  });
}

// ── User list ──────────────────────────────────────────────
async function loadUsers() {
  try {
    const res  = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getUsers', userId: currentUser.userId }),
      redirect: 'follow'
    });
    const data = await res.json();
    if (data.success) { allUsers = data.users; renderUsers(); }
    else {
      document.getElementById('userList').innerHTML =
        `<div class="empty-users">Could not load team.<br>${data.message || ''}</div>`;
    }
  } catch (err) {
    document.getElementById('userList').innerHTML =
      `<div class="empty-users">Connection error loading team.</div>`;
  }
}

function renderUsers(filter = '') {
  const list = document.getElementById('userList');
  list.innerHTML = '';

  const show = allUsers.filter(u =>
    u.displayName.toLowerCase().includes(filter.toLowerCase()) ||
    u.userId.toLowerCase().includes(filter.toLowerCase())
  );

  if (!show.length) { list.innerHTML = `<div class="empty-users">No teammates found.</div>`; return; }

  // Detach old presence watchers
  Object.keys(presenceRefs).forEach(uid => {
    db.ref(`presence/${uid}`).off('value', presenceRefs[uid]);
  });
  presenceRefs = {};

  show.forEach(user => {
    const item = document.createElement('div');
    item.className = 'user-item' + (selectedUser?.userId === user.userId ? ' active' : '');
    item.dataset.id = user.userId;
    const count = unread[user.userId] || 0;
    item.innerHTML = `
      <div class="avatar" id="av-${user.userId}">${initial(user.displayName)}</div>
      <div class="user-meta">
        <div class="user-name">${esc(user.displayName)}</div>
        <div class="user-id">@${esc(user.userId)}</div>
      </div>
      <div class="badge" id="badge-${user.userId}" style="display:${count > 0 ? 'flex' : 'none'}">${count}</div>
    `;
    item.addEventListener('click', () => openChat(user));
    list.appendChild(item);

    watchPresence(user.userId, (online) => {
      const av = document.getElementById(`av-${user.userId}`);
      if (av) av.classList.toggle('online', online);
    });
  });
}

function refreshUserBadge(userId) {
  const el = document.getElementById(`badge-${userId}`);
  if (!el) return;
  const n = unread[userId] || 0;
  el.textContent = n;
  el.style.display = n > 0 ? 'flex' : 'none';
}

// ── Open chat ──────────────────────────────────────────────
function openChat(user) {
  selectedUser = user;
  unread[user.userId] = 0;
  refreshUserBadge(user.userId);

  document.querySelectorAll('.user-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === user.userId);
  });

  document.getElementById('chatPlaceholder').style.display = 'none';
  document.getElementById('chatArea').style.display = 'flex';

  const av = document.getElementById('chatAvatar');
  av.textContent = initial(user.displayName);
  document.getElementById('chatUserName').textContent = user.displayName;

  watchPresence(user.userId, (online) => {
    document.getElementById('chatStatus').textContent = online ? '● Online' : 'Offline';
    document.getElementById('chatStatus').style.color = online ? 'var(--accent)' : 'var(--muted)';
    av.classList.toggle('online', online);
  });

  // ── Properly detach previous message listener ──
  if (msgRef && msgHandler) {
    msgRef.off('value', msgHandler);
    msgRef    = null;
    msgHandler = null;
  }

  // ── Attach new listener ──
  const chatId = roomId(currentUser.userId, user.userId);
  msgRef    = db.ref(`messages/${chatId}`).orderByChild('ts').limitToLast(200);
  msgHandler = msgRef.on('value', (snap) => {
    const msgs = [];
    snap.forEach(c => msgs.push({ key: c.key, ...c.val() }));
    renderMessages(msgs);
  });

  document.getElementById('messageInput').focus();
}

// ── Render messages ────────────────────────────────────────
function renderMessages(msgs) {
  const wrap = document.getElementById('messages');
  wrap.innerHTML = '';
  let lastDate = '';

  msgs.forEach(msg => {
    const d    = new Date(msg.ts);
    const day  = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    if (day !== lastDate) {
      const div = document.createElement('div');
      div.className   = 'date-divider';
      const today     = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      div.textContent = day === today ? 'Today' : day;
      wrap.appendChild(div);
      lastDate = day;
    }

    const el = document.createElement('div');
    el.className = 'msg ' + (msg.from === currentUser.userId ? 'sent' : 'recv');
    el.innerHTML = `
      <div class="bubble">${esc(msg.text)}</div>
      <div class="msg-time">${time}</div>
    `;
    wrap.appendChild(el);
  });

  const w = document.getElementById('messagesWrap');
  w.scrollTop = w.scrollHeight;
}

// ── Send message ───────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text  = input.value.trim();
  if (!text || !selectedUser) return;

  input.value = '';
  input.style.height = 'auto';

  const chatId = roomId(currentUser.userId, selectedUser.userId);

  try {
    await db.ref(`messages/${chatId}`).push({
      from: currentUser.userId,
      name: currentUser.displayName,
      text: text,
      ts:   Date.now()
    });
  } catch (err) {
    console.error('Failed to send message:', err);
    input.value = text; // restore text so user can retry
    return;
  }

  // Push notification (fire and forget)
  try {
    const snap = await db.ref(`tokens/${selectedUser.userId}/token`).get();
    const fcmToken = snap.val();
    if (fcmToken) {
      fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'notify',
          token:  fcmToken,
          title:  currentUser.displayName,
          body:   text.length > 80 ? text.slice(0, 80) + '…' : text,
          data:   { senderId: currentUser.userId }
        }),
        redirect: 'follow'
      }).catch(() => {});
    }
  } catch (_) {}
}

// ── Logout ─────────────────────────────────────────────────
async function logout() {
  if (msgRef && msgHandler) msgRef.off('value', msgHandler);
  await db.ref(`presence/${currentUser.userId}`)
         .set({ online: false, lastSeen: Date.now() });
  sessionStorage.removeItem('tcUser');
  window.location.href = 'index.html';
}

// ── Banner ─────────────────────────────────────────────────
function showBanner(title, body, fromId) {
  const div = document.createElement('div');
  div.className = 'notif-banner';
  div.innerHTML = `
    <div class="notif-dot">💬</div>
    <div class="notif-body">
      <strong>${esc(title)}</strong>
      <span>${esc(body)}</span>
    </div>
  `;
  div.addEventListener('click', () => {
    const user = allUsers.find(u => u.userId === fromId);
    if (user) openChat(user);
    div.remove();
  });
  document.body.appendChild(div);
  setTimeout(() => div.classList.add('show'), 10);
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 350); }, 5000);
}

// ── Beep ───────────────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.frequency.value = 820; osc.type = 'sine';
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}
}

// ── Helpers ────────────────────────────────────────────────
function roomId(a, b)  { return [a, b].sort().join('__'); }
function initial(name) { return name ? name.charAt(0).toUpperCase() : '?'; }
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}
