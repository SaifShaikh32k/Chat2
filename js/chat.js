// chat.js — simplified & bulletproof version

let db, messaging;
let currentUser  = null;
let selectedUser = null;
let activeChatId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const raw = sessionStorage.getItem('tcUser');
  if (!raw) { window.location.href = 'index.html'; return; }
  currentUser = JSON.parse(raw);

  document.getElementById('myName').textContent   = currentUser.displayName;
  document.getElementById('myId').textContent     = '@' + currentUser.userId;
  document.getElementById('myAvatar').textContent = ini(currentUser.displayName);

  // Init Firebase once
  try {
    firebase.initializeApp(CONFIG.FIREBASE);
  } catch(e) {
    // already initialized — ignore
  }
  db = firebase.database();

  // Mark online
  db.ref('presence/' + currentUser.userId).set({ online: true, ts: Date.now() });
  window.addEventListener('beforeunload', () => {
    db.ref('presence/' + currentUser.userId).set({ online: false, ts: Date.now() });
  });

  // Setup FCM (non-blocking)
  setupFCM();

  // Load users
  loadUsers();

  // UI events
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('logoutBtn').addEventListener('click', () => {
    db.ref('presence/' + currentUser.userId).set({ online: false, ts: Date.now() });
    sessionStorage.removeItem('tcUser');
    location.href = 'index.html';
  });
  document.getElementById('searchInput').addEventListener('input', (e) => renderUsers(e.target.value));
});

// ── Load users from Apps Script ────────────────────────────
let allUsers = [];
async function loadUsers() {
  try {
    const res  = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getUsers', userId: currentUser.userId }),
      redirect: 'follow'
    });
    const data = await res.json();
    if (data.success) {
      allUsers = data.users;
      renderUsers();
    } else {
      document.getElementById('userList').innerHTML =
        '<div class="empty-users">Error: ' + (data.message || 'Could not load users') + '</div>';
    }
  } catch(e) {
    document.getElementById('userList').innerHTML =
      '<div class="empty-users">Network error. Check console.</div>';
    console.error('loadUsers error:', e);
  }
}

function renderUsers(filter) {
  filter = (filter || '').toLowerCase();
  const list = document.getElementById('userList');
  list.innerHTML = '';
  const show = filter
    ? allUsers.filter(u => u.displayName.toLowerCase().includes(filter) || u.userId.toLowerCase().includes(filter))
    : allUsers;

  if (!show.length) {
    list.innerHTML = '<div class="empty-users">No users found.</div>';
    return;
  }

  show.forEach(user => {
    const div = document.createElement('div');
    div.className = 'user-item' + (selectedUser && selectedUser.userId === user.userId ? ' active' : '');
    div.dataset.id = user.userId;
    div.innerHTML =
      '<div class="avatar" id="av-' + user.userId + '">' + ini(user.displayName) + '</div>' +
      '<div class="user-meta">' +
        '<div class="user-name">' + esc(user.displayName) + '</div>' +
        '<div class="user-id">@' + esc(user.userId) + '</div>' +
      '</div>';
    div.addEventListener('click', () => openChat(user));
    list.appendChild(div);

    // Online dot
    db.ref('presence/' + user.userId).on('value', snap => {
      const el = document.getElementById('av-' + user.userId);
      if (el) el.classList.toggle('online', !!(snap.val() && snap.val().online));
    });
  });
}

// ── Open chat with a user ──────────────────────────────────
function openChat(user) {
  selectedUser = user;

  // Update sidebar highlight
  document.querySelectorAll('.user-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === user.userId);
  });

  // Show chat area
  document.getElementById('chatPlaceholder').style.display = 'none';
  document.getElementById('chatArea').style.display = 'flex';
  document.getElementById('chatAvatar').textContent = ini(user.displayName);
  document.getElementById('chatUserName').textContent = user.displayName;

  // Online status in header
  db.ref('presence/' + user.userId).on('value', snap => {
    const online = !!(snap.val() && snap.val().online);
    document.getElementById('chatStatus').textContent = online ? '● Online' : 'Offline';
    document.getElementById('chatStatus').style.color = online ? 'var(--accent)' : 'var(--muted)';
  });

  // Detach previous chat listener by switching to new chatId
  const chatId = [currentUser.userId, user.userId].sort().join('__');

  if (activeChatId === chatId) return; // same chat, nothing to do
  activeChatId = chatId;

  // Remove previous listener
  db.ref('messages').off();

  // Listen to messages for this chat
  const msgRef = db.ref('messages/' + chatId).orderByChild('ts').limitToLast(200);
  msgRef.on('value', snap => {
    // Only render if still on same chat
    if (activeChatId !== chatId) return;
    const msgs = [];
    snap.forEach(c => msgs.push(c.val()));
    renderMessages(msgs);
  });

  document.getElementById('messageInput').focus();
}

// ── Render messages ────────────────────────────────────────
function renderMessages(msgs) {
  const wrap = document.getElementById('messages');
  // Save scroll position — if user is at bottom, keep them there
  const messagesWrap = document.getElementById('messagesWrap');
  const atBottom = messagesWrap.scrollHeight - messagesWrap.scrollTop - messagesWrap.clientHeight < 60;

  wrap.innerHTML = '';
  msgs.forEach(msg => {
    if (!msg || !msg.text) return;
    const d    = new Date(msg.ts || Date.now());
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const div  = document.createElement('div');
    div.className = 'msg ' + (msg.from === currentUser.userId ? 'sent' : 'recv');
    div.innerHTML = '<div class="bubble">' + esc(msg.text) + '</div><div class="msg-time">' + time + '</div>';
    wrap.appendChild(div);
  });

  if (atBottom || msgs.length <= 5) {
    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  }
}

// ── Send message ───────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text  = input.value.trim();
  if (!text) { console.warn('No text'); return; }
  if (!selectedUser) { console.warn('No user selected'); return; }
  if (!db) { console.error('DB not ready'); return; }

  const chatId = [currentUser.userId, selectedUser.userId].sort().join('__');
  const msgData = {
    from: currentUser.userId,
    name: currentUser.displayName,
    text: text,
    ts:   Date.now()
  };

  input.value = '';
  input.style.height = 'auto';

  try {
    await db.ref('messages/' + chatId).push(msgData);
    console.log('Message sent to', chatId);
  } catch(e) {
    console.error('Send failed:', e);
    input.value = text; // restore
    alert('Failed to send message: ' + e.message);
    return;
  }

  // FCM push (non-blocking)
  try {
    const snap = await db.ref('tokens/' + selectedUser.userId + '/token').get();
    const token = snap.val();
    if (token) {
      fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'notify', token,
          title:  currentUser.displayName,
          body:   text.slice(0, 100),
          data:   { senderId: currentUser.userId }
        }),
        redirect: 'follow'
      }).catch(() => {});
    }
  } catch(_) {}
}

// ── FCM push setup ─────────────────────────────────────────
async function setupFCM() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const base = location.href.replace(/\/[^/]*$/, '/');
    await navigator.serviceWorker.register(base + 'firebase-messaging-sw.js');
    messaging = firebase.messaging();
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      const token = await messaging.getToken({ vapidKey: CONFIG.VAPID_KEY });
      if (token) await db.ref('tokens/' + currentUser.userId).set({ token, ts: Date.now() });
    }
    messaging.onMessage(payload => {
      const fromId = payload.data && payload.data.senderId;
      if (!selectedUser || selectedUser.userId !== fromId) {
        showBanner(payload.notification.title, payload.notification.body, fromId);
        playBeep();
      }
    });
  } catch(e) {
    console.warn('FCM skipped:', e.message);
  }
}

// ── In-app notification banner ─────────────────────────────
function showBanner(title, body, fromId) {
  const div = document.createElement('div');
  div.className = 'notif-banner';
  div.innerHTML =
    '<div class="notif-dot">💬</div>' +
    '<div class="notif-body"><strong>' + esc(title) + '</strong><span>' + esc(body) + '</span></div>';
  div.addEventListener('click', () => {
    const u = allUsers.find(u => u.userId === fromId);
    if (u) openChat(u);
    div.remove();
  });
  document.body.appendChild(div);
  setTimeout(() => div.classList.add('show'), 10);
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, 5000);
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 820; o.type = 'sine';
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(); o.stop(ctx.currentTime + 0.3);
  } catch(_) {}
}

function ini(name) { return name ? name[0].toUpperCase() : '?'; }
function esc(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s || ''));
  return d.innerHTML;
}
