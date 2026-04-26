// firebase-messaging-sw.js
// ⚠️  Must stay at the ROOT of your GitHub repo (same level as index.html)

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyDtypgH4ugzhOCi70JonjvuVxFGg3hPGeI",
  authDomain:        "chatting2-13dfb.firebaseapp.com",
  databaseURL:       "https://chatting2-13dfb-default-rtdb.firebaseio.com",
  projectId:         "chatting2-13dfb",
  storageBucket:     "chatting2-13dfb.firebasestorage.app",
  messagingSenderId: "385769991125",
  appId:             "1:385769991125:web:316e6dd01854ec15fa2b5c"
});

const messaging = firebase.messaging();

// Background push (app minimised or closed)
messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification?.title || 'New message',
    {
      body:    payload.notification?.body || '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [200, 100, 200],
      data:    payload.data || {}
    }
  );
});

// Tap notification → open / focus app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});
