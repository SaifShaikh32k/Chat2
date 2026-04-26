// chat.js — Advanced Features Update

let db, messaging;
let currentUser  = null;
let selectedUser = null;
let activeChatId = null;

// New state variables
let replyingToMsg = null;
let typingTimer;

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
  
  // Typing Indicator Logic
  const msgInput = document.getElementById('messageInput');
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  msgInput.addEventListener('input', () => {
    if (!activeChatId) return;
    db.ref(`typing/${activeChatId}/${currentUser.userId}`).set(true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      db.ref(`typing/${activeChatId}/${currentUser.userId}`).set(false);
    }, 1500);
  });

  document.getElementById('cancelReply').addEventListener('click', cancelReply);
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
    if (data.success) { allUsers = data.users; renderUsers(); listenToUnreadCounts(); }
    else document.getElementById('userList').innerHTML = '<div class="empty-users">' + (data.message||'Error') + '</div>';
  } catch(e) {
    console.error('loadUsers:', e);
  }
}

function listenToUnreadCounts() {
  db.ref(`unread/${currentUser.userId}`).on('value', snap => {
    const unreadData = snap.val() || {};
    allUsers.forEach(u => {
      const badge = document.getElementById(`unread-${u.userId}`);
      if (badge) {
        const count = unreadData[u.userId] || 0;
        badge.textContent = count;
        if (count > 0 && (!selectedUser || selectedUser.userId !== u.userId)) {
          badge.classList.add('active');
        } else {
          badge.classList.remove('active');
        }
      }
    });
  });
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
      `<div class="avatar" id="av-${user.userId}">${ini(user.displayName)}</div>` +
      `<div class="user-meta">
         <div class="user-name">${esc(user.displayName)} <span id="unread-${user.userId}" class="unread-badge">0</span></div>
         <div class="user-id">@${esc(user.userId)}</div>
       </div>`;
    div.addEventListener('click', () => openChat(user));
    list.appendChild(div);
    
    db.ref('presence/' + user.userId).on('value', snap => {
      const el = document.getElementById('av-' + user.userId);
      if (el) el.classList.toggle('online', !!(snap.val()&&snap.val().online));
    });
  });
  
  // Re-trigger unread render in case users are filtered
  db.ref(`unread/${currentUser.userId}`).once('value', snap => {
    const data = snap.val() || {};
    show.forEach(u => {
      const badge = document.getElementById(`unread-${u.userId}`);
      if(badge && data[u.userId] > 0) badge.classList.add('active');
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
  cancelReply();

  db.ref('presence/' + user.userId).on('value', snap => {
    const online = !!(snap.val()&&snap.val().online);
    document.getElementById('chatStatus').textContent = online ? '● Online' : 'Offline';
    document.getElementById('chatStatus').style.color = online ? 'var(--accent)' : 'var(--muted)';
  });

  const chatId = [currentUser.userId, user.userId].sort().join('__');
  if (activeChatId === chatId) return;
  activeChatId = chatId;

  // Clear unread count when opening
  db.ref(`unread/${currentUser.userId}/${user.userId}`).set(0);

  // detach ALL previous listeners for messages and typing
  db.ref('messages').off();
  db.ref('typing').off();

  // Listen for Typing
  db.ref(`typing/${chatId}/${user.userId}`).on('value', snap => {
    document.getElementById('typingIndicator').textContent = snap.val() ? `${user.displayName} is typing...` : '';
  });

  db.ref('messages/' + chatId).limitToLast(200).on('value', snap => {
    if (activeChatId !== chatId) return;
    const msgs = [];
    snap.forEach(c => { 
      if(c.val() && c.val().text) {
        const m = c.val(); m.id = c.key; msgs.push(m);
      } 
    });
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
    const isMine = msg.from === currentUser.userId;
    const time = new Date(msg.ts||Date.now()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    
    // Feature: Read Receipts (Update if not mine and not seen)
    if (!isMine && msg.status !== 'seen') {
      db.ref(`messages/${activeChatId}/${msg.id}`).update({ status: 'seen' });
    }

    const div  = document.createElement('div');
    div.className = 'msg ' + (isMine ? 'sent' : 'recv') + (msg.isDeleted ? ' deleted' : '');
    
    let replyHtml = '';
    if (msg.replyTo && !msg.isDeleted) {
      replyHtml = `<div class="msg-reply-block">${esc(msg.replyTo.substring(0, 50))}...</div>`;
    }

    let reactionsHtml = '';
    if (msg.reactions) {
      const rx = Object.values(msg.reactions);
      reactionsHtml = `<div class="reactions">` + rx.map(r => `<span class="reaction-badge">${r}</span>`).join('') + `</div>`;
    }

    let statusTick = '';
    if (isMine && !msg.isDeleted) {
      statusTick = msg.status === 'seen' ? '<span class="msg-tick tick-seen">✓✓</span>' : '<span class="msg-tick tick-sent">✓</span>';
    }

    // Actions Menu
    let actionsHtml = `<div class="msg-actions">`;
    if (!msg.isDeleted) {
      actionsHtml += `<button class="action-btn" onclick="reactToMsg('${msg.id}', '❤️')" title="Heart">❤️</button>
                      <button class="action-btn" onclick="reactToMsg('${msg.id}', '👍')" title="Thumbs Up">👍</button>
                      <button class="action-btn" onclick="initReply('${msg.id}', '${esc(msg.text).replace(/'/g, "\\'")}')" title="Reply">📌</button>`;
      if (isMine) actionsHtml += `<button class="action-btn" onclick="deleteMsg('${msg.id}')" title="Delete">🗑️</button>`;
    }
    actionsHtml += `</div>`;

    const displayTxt = msg.isDeleted ? "🗑️ This message was deleted" : msg.text;

    div.innerHTML = `
      ${replyHtml}
      <div class="bubble">${esc(displayTxt)}</div>
      ${reactionsHtml}
      <div class="msg-meta">
        <span class="time">${time}</span>
        ${statusTick}
      </div>
      ${actionsHtml}
    `;
    wrap.appendChild(div);
  });

  if (atBottom || msgs.length <= 5) w.scrollTop = w.scrollHeight;
}

// Features: Delete, Reply, React
window.deleteMsg = function(msgId) {
  if (confirm("Delete this message for everyone?")) {
    db.ref(`messages/${activeChatId}/${msgId}`).update({ isDeleted: true });
  }
};

window.initReply = function(msgId, text) {
  replyingToMsg = { id: msgId, text: text };
  document.getElementById('replyTextPreview').textContent = text.substring(0, 50) + '...';
  document.getElementById('replyPreview').style.display = 'block';
  document.getElementById('messageInput').focus();
};

function cancelReply() {
  replyingToMsg = null;
  document.getElementById('replyPreview').style.display = 'none';
}

window.reactToMsg = function(msgId, emoji) {
  db.ref(`messages/${activeChatId}/${msgId}/reactions/${currentUser.userId}`).set(emoji);
};

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text  = input.value.trim();
  if (!text || !selectedUser || !db) return;

  const chatId = [currentUser.userId, selectedUser.userId].sort().join('__');
  input.value = '';
  input.style.height = 'auto';

  // Stop typing indicator instantly
  db.ref(`typing/${activeChatId}/${currentUser.userId}`).set(false);
  clearTimeout(typingTimer);

  const payload = {
    from: currentUser.userId,
    name: currentUser.displayName,
    text: text,
    ts:   Date.now(),
    status: 'sent' // Read receipts tracking
  };

  if (replyingToMsg) {
    payload.replyTo = replyingToMsg.text;
    cancelReply();
  }

  try {
    await db.ref('messages/' + chatId).push(payload);
    
    // Feature: Increment unread count for receiver
    const unreadRef = db.ref(`unread/${selectedUser.userId}/${currentUser.userId}`);
    unreadRef.transaction(current => (current || 0) + 1);

  } catch(e) {
    console.error('Send failed:', e);
    input.value = text;
    alert('Send failed: ' + e.message);
    return;
  }

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
        playBeep(); // Plays sound + OS banner when message arrives off-screen
      }
    });
  } catch(e) {
    console.warn('FCM skipped:', e.message);
  }
}

function showBanner(title, body, fromId) {
  const div = document.createElement('div');
  div.className = 'notif-banner';
  div.innerHTML = '<div class="notif-dot">💬</div><div class="notif-body"><strong>' + esc(title) + '</strong><span>' + esc(body) + '</span></div>';
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
