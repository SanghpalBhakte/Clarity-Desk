const CACHE_NAME = 'clarity-desk-v124';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  'index.html',
  './style.css',
  'style.css',
  './app.js',
  'app.js',
  './data.js',
  './firebase-config.js',
  './manifest.json',
  './favicon.ico',
  './favicon.svg',
  './favicon-32.png',
  './favicon-16.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-192-maskable.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './badge-96.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((asset) => cache.add(asset).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Skip Firebase Firestore / Auth / Gemini / Groq API traffic from SW caching
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebase') || url.hostname.includes('groq.com')) {
    return;
  }

  // Network-First for Navigation and JS files to prevent stale cache lock
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request) || caches.match('./index.html') || caches.match('index.html') || caches.match('./'))
    );
    return;
  }

  // Stale-While-Revalidate for other static assets
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// ── Notification Click & Web Push Handlers ──────────────────────
const NOTIF_DEFAULT_ICON = './icon-192.png';
const NOTIF_DEFAULT_BADGE = './badge-96.png'; // monochrome transparent PNG for Android status bar

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './#dashboard';
  const absoluteTarget = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find an existing app window and navigate it to the right screen
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => {
            if ('navigate' in client) {
              return client.navigate(absoluteTarget);
            }
          });
        }
      }
      // No existing window — open a new one
      if (clients.openWindow) {
        return clients.openWindow(absoluteTarget);
      }
    })
  );
});

self.addEventListener('push', (event) => {
  // FCM-delivered pushes are already displayed via messaging.onBackgroundMessage()
  // below (registered by the Firebase Messaging SW integration); skip them here so
  // the same push doesn't produce two notifications. Only a genuinely custom,
  // non-FCM Web Push payload (no top-level "data" object) reaches the code below.
  if (event.data) {
    try {
      const peek = event.data.json();
      if (peek && typeof peek === 'object' && peek.data && typeof peek.data === 'object') return;
    } catch (_) { /* not JSON — handle as legacy/plain push below */ }
  }
  let data = { title: 'Clarity Desk', body: 'You have a new update.' };
  if (event.data) {
    try { data = event.data.json(); } catch(err) { data.body = event.data.text() || data.body; }
  }
  const title = data.title || 'Clarity Desk';
  const body  = data.body  || 'Tap to open the app.';
  const tag   = data.tag   || 'cd-push-default';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:      data.icon  || NOTIF_DEFAULT_ICON,
      badge:     data.badge || NOTIF_DEFAULT_BADGE,
      tag,
      renotify:  true,
      data:      data.data  || { url: './#dashboard' }
    })
  );
});

// ── Firebase Cloud Messaging — background (app closed) push ───
// Public config only (safe client-side, same values as firebase-config.js's
// default). Hardcoded here because this is a static site with no build step,
// so there is no env-substitution mechanism, and service workers have no
// `window` to read firebase-config.js's override logic from anyway.
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

try {
  firebase.initializeApp({
    apiKey:            "AIzaSyD1st-UB9NbBme9z-8M0upwJ0ndQrr8J2E",
    authDomain:        "campusos-83365.firebaseapp.com",
    projectId:         "campusos-83365",
    storageBucket:     "campusos-83365.appspot.com",
    messagingSenderId: "248625780152",
    appId:             "1:248625780152:web:555bfb8bdf0b42ba776b4d"
  });

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    if (!d.title) return;
    self.registration.showNotification(d.title, {
      body:      d.body || '',
      icon:      NOTIF_DEFAULT_ICON,
      badge:     NOTIF_DEFAULT_BADGE,
      tag:       d.tag || 'cd-push-scheduled',
      renotify:  true,
      data:      { url: d.url || './#dashboard' }
    });
  });
} catch (err) {
  console.warn('FCM background messaging init skipped:', err);
}

