// chat.js — v3

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

  try { firebase.initializeApp(CONFIG.FIREBASE); } catch(e) {}
  db = firebase.database();

  db.ref('presence/' + currentUser.userId).set({ online: true, ts: Date.now() });
  window.addEventListener('beforeunload', () => {
    db.ref('presence/' + currentUser.userId).set({ online: false, ts: Date.now() });
  });

  setupFCM();
  loadUsers();

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

let allUsers = [];
async function loadUsers() {
  try {
    const res  = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getUsers', userId: currentUser.userId }),
      redirect: 'follow'
    });
    const data = await res.json();
    if (data.success) { allUsers = data.users; renderUsers(); }
    else document.getElementById('userList').innerHTML = '<div class="empty-users">' + (data.message||'Error') + '</div>';
  } catch(e) {
    document.getElementById('userList').innerHTML = '<div class="empty-users">Connection error</div>';
    console.error('loadUsers:', e);
  }
}

function renderUsers(filter) {
  filter = (filter||'').toLowerCase();
  const list = document.getElementById('userList');
  list.innerHTML = '';
  const show = filter ? allUsers.filter(u =>
    u.displayName.toLowerCase().includes(filter) || u.userId.toLowerCase().includes(filter)
  ) : allUsers;

  if (!show.length) { list.innerHTML = '<div class="empty-users">No users found.</div>'; return; }

  show.forEach(user => {
    const div = document.createElement('div');
    div.className = 'user-item' + (selectedUser && selectedUser.userId === user.userId ? ' active' : '');
    div.dataset.id = user.userId;
    div.innerHTML =
      '<div class="avatar" id="av-' + user.userId + '">' + ini(user.displayName) + '</div>' +
      '<div class="user-meta"><div class="user-name">' + esc(user.displayName) + '</div>' +
      '<div class="user-id">@' + esc(user.userId) + '</div></div>';
    div.addEventListener('click', () => openChat(user));
    list.appendChild(div);
    db.ref('presence/' + user.userId).on('value', snap => {
      const el = document.getElementById('av-' + user.userId);
      if (el) el.classList.toggle('online', !!(snap.val()&&snap.val().online));
    });
  });
}

function openChat(user) {
  selectedUser = user;
  document.querySelectorAll('.user-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === user.userId));

  document.getElementById('chatPlaceholder').style.display = 'none';
  document.getElementById('chatArea').style.display = 'flex';
  document.getElementById('chatAvatar').textContent = ini(user.displayName);
  document.getElementById('chatUserName').textContent = user.displayName;

  db.ref('presence/' + user.userId).on('value', snap => {
    const online = !!(snap.val()&&snap.val().online);
    document.getElementById('chatStatus').textContent = online ? '● Online' : 'Offline';
    document.getElementById('chatStatus').style.color = online ? 'var(--accent)' : 'var(--muted)';
  });

  const chatId = [currentUser.userId, user.userId].sort().join('__');
  if (activeChatId === chatId) return;
  activeChatId = chatId;

  // detach ALL previous listeners
  db.ref('messages').off();

  // listen without orderByChild to avoid index warning, sort in JS
  db.ref('messages/' + chatId).limitToLast(200).on('value', snap => {
    if (activeChatId !== chatId) return;
    const msgs = [];
    snap.forEach(c => { if(c.val() && c.val().text) msgs.push(c.val()); });
    msgs.sort((a,b) => (a.ts||0) - (b.ts||0));
    renderMessages(msgs);
  });

  document.getElementById('messageInput').focus();
}

function renderMessages(msgs) {
  const wrap = document.getElementById('messages');
  const w    = document.getElementById('messagesWrap');
  const atBottom = w.scrollHeight - w.scrollTop - w.clientHeight < 80;
  wrap.innerHTML = '';

  msgs.forEach(msg => {
    const time = new Date(msg.ts||Date.now()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    const div  = document.createElement('div');
    div.className = 'msg ' + (msg.from === currentUser.userId ? 'sent' : 'recv');
    div.innerHTML = '<div class="bubble">' + esc(msg.text) + '</div><div class="msg-time">' + time + '</div>';
    wrap.appendChild(div);
  });

  if (atBottom || msgs.length <= 5) w.scrollTop = w.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text  = input.value.trim();
  if (!text || !selectedUser || !db) return;

  const chatId = [currentUser.userId, selectedUser.userId].sort().join('__');
  input.value = '';
  input.style.height = 'auto';

  try {
    await db.ref('messages/' + chatId).push({
      from: currentUser.userId,
      name: currentUser.displayName,
      text: text,
      ts:   Date.now()
    });
  } catch(e) {
    console.error('Send failed:', e);
    input.value = text;
    alert('Send failed: ' + e.message);
    return;
  }

  // FCM push — non-blocking
  try {
    const snap = await db.ref('tokens/' + selectedUser.userId + '/token').get();
    const token = snap.val();
    if (token) fetch(CONFIG.APPS_SCRIPT_URL, {
      method:'POST', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({ action:'notify', token,
        title: currentUser.displayName,
        body: text.slice(0,100),
        data: { senderId: currentUser.userId }
      }), redirect:'follow'
    }).catch(()=>{});
  } catch(_) {}
}

async function setupFCM() {
  try {
    if (!('serviceWorker' in navigator)) return;
    // GitHub Pages serves from /teamchat/ so SW must be registered from same scope
    const swUrl = location.origin + location.pathname.replace(/\/[^/]*$/, '/') + 'firebase-messaging-sw.js';
    const reg = await navigator.serviceWorker.register(swUrl, { scope: location.pathname.replace(/\/[^/]*$/, '/') });
    messaging = firebase.messaging();
    await messaging.useServiceWorker(reg);
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      const token = await messaging.getToken({ vapidKey: CONFIG.VAPID_KEY, serviceWorkerRegistration: reg });
      if (token) await db.ref('tokens/' + currentUser.userId).set({ token, ts: Date.now() });
    }
    messaging.onMessage(payload => {
      const fromId = payload.data && payload.data.senderId;
      if (!selectedUser || selectedUser.userId !== fromId) {
        showBanner((payload.notification||{}).title||'New message', (payload.notification||{}).body||'', fromId);
        playBeep();
      }
    });
  } catch(e) {
    console.warn('FCM skipped:', e.message);
  }
}

function showBanner(title, body, fromId) {
  const div = document.createElement('div');
  div.className = 'notif-banner';
  div.innerHTML = '<div class="notif-dot">💬</div><div class="notif-body"><strong>' +
    esc(title) + '</strong><span>' + esc(body) + '</span></div>';
  div.addEventListener('click', () => { const u=allUsers.find(u=>u.userId===fromId); if(u)openChat(u); div.remove(); });
  document.body.appendChild(div);
  setTimeout(() => div.classList.add('show'), 10);
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, 5000);
}

function playBeep() {
  try {
    const ctx=new(window.AudioContext||window.webkitAudioContext)(),o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.frequency.value=820;o.type='sine';
    g.gain.setValueAtTime(0.3,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3);
    o.start();o.stop(ctx.currentTime+0.3);
  } catch(_){}
}

function ini(n) { return n ? n[0].toUpperCase() : '?'; }
function esc(s) { const d=document.createElement('div'); d.appendChild(document.createTextNode(s||'')); return d.innerHTML; }
