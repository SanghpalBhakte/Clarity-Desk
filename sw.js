const CACHE_NAME = 'clarity-desk-v238';
// How long a page/script request waits for the network before the saved
// copy is used (only when a saved copy exists).
const NETWORK_WAIT_MS = 3000;
// After one request to this site had to fall back to its saved copy, the
// requests that follow it (app.js, then data.js) use their saved copies
// straight away for this long instead of each waiting NETWORK_WAIT_MS in
// turn. Only this site's own answers count: gstatic can be fast while the
// path to this site's CDN is not.
const SLOW_NETWORK_MS = 30000;
let slowUntil = 0;
// URLs are spelled exactly as index.html requests them (with ?v=N, or the
// jsDelivr copy pinned to the deployed commit), so the install step and the
// page share one download. scripts/ship.mjs bumps ?v=N and sets the commit.
// deadline-import*.js, welcome-tour.js and vendor/jszip.min.js are cached on first use instead.
const PRECACHE_ASSETS = [
  './',
  './index.html',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@3876799a6ce1a8f05cb10563053ed8f30e49c981/app.js',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@3876799a6ce1a8f05cb10563053ed8f30e49c981/style.css',
  'firebase-config.js?v=238',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@3876799a6ce1a8f05cb10563053ed8f30e49c981/data.js',
  './manifest.json',
  'favicon.ico?v=238',
  'favicon.svg?v=238',
  'favicon-32.png?v=238',
  'favicon-16.png?v=238',
  'apple-touch-icon.png?v=238',
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

// ── Android share target (manifest.json share_target) ─────────
// WhatsApp "Export chat" -> Clarity Desk posts the chat file here. It is
// kept in this worker's memory only (never the Cache API or any storage),
// handed to the page once via postMessage, then dropped. If the worker is
// restarted in between, the page just opens the normal "Add chat" step.
let pendingShare = null;
const SHARE_TTL_MS = 5 * 60 * 1000;

async function receiveShare(request) {
  pendingShare = null;
  try {
    const form = await request.formData();
    const file = form.get('chat');
    const text = form.get('text');
    pendingShare = {
      file: file && typeof file === 'object' && file.size ? file : null,
      text: typeof text === 'string' ? text : '',
      at: Date.now()
    };
  } catch (_) { pendingShare = null; }
  return Response.redirect(new URL('./index.html?share=whatsapp#assignments', self.registration.scope).href, 303);
}

self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'wa-share-get' || !e.ports || !e.ports[0]) return;
  const share = pendingShare && Date.now() - pendingShare.at < SHARE_TTL_MS ? pendingShare : null;
  pendingShare = null;
  e.ports[0].postMessage(share ? { file: share.file, text: share.text } : null);
});

self.addEventListener('fetch', (e) => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share-target')) {
    e.respondWith(receiveShare(e.request));
    return;
  }
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Skip Firebase Firestore / Auth / Gemini / Groq API traffic from SW caching
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebase') || url.hostname.includes('groq.com')) {
    return;
  }

  // Network-First for Navigation and JS files to prevent stale cache lock.
  // A slow network never fails, so after NETWORK_WAIT_MS the saved copy is
  // used instead; the network answer still lands in the cache for next time.
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    let saved = Promise.resolve();
    const network = fetch(e.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          saved = caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      });
    // caches.match() returns a Promise (always truthy), so each fallback
    // must be awaited in turn. ignoreSearch lets a first-visit precached
    // "app.js" answer the page's "app.js?v=N" request; the cache is
    // per-version, so it is the same build.
    const fromCache = async () => {
      const cached = (await caches.match(e.request)) || (await caches.match(e.request, { ignoreSearch: true }));
      if (cached) return cached;
      if (e.request.mode === 'navigate') {
        return (await caches.match('./index.html')) || (await caches.match('index.html')) || (await caches.match('./')) || null;
      }
      return null;
    };
    // Keep the worker alive until the late network answer is saved too.
    e.waitUntil(network.then(() => saved).catch(() => {}));
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
      const ownSite = url.origin === self.location.origin;
      const wait = ownSite && Date.now() < slowUntil ? 0 : NETWORK_WAIT_MS;
      const timer = setTimeout(() => fromCache().then((res) => {
        if (res && !done && ownSite) slowUntil = Date.now() + SLOW_NETWORK_MS;
        finish(res);
      }), wait);
      network
        .then((res) => { if (!done && ownSite && res.ok) slowUntil = 0; clearTimeout(timer); finish(res); })
        .catch(async () => { clearTimeout(timer); finish((await fromCache()) || Response.error()); });
    }));
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
  // Closed-app reminders (push-worker/) send a flat { title, body, tag, url }.
  const url   = (typeof data.url === 'string' && data.url) || (data.data && data.data.url) || './#dashboard';
  event.waitUntil(
    // The same reminder can also come from the open app or the older push
    // job under the same tag. If it is already showing, replace it quietly
    // instead of buzzing twice. (Always show: a silent push is not allowed.)
    self.registration.getNotifications({ tag }).catch(() => []).then((shown) =>
      self.registration.showNotification(title, {
        body,
        icon:      data.icon  || NOTIF_DEFAULT_ICON,
        badge:     data.badge || NOTIF_DEFAULT_BADGE,
        tag,
        renotify:  shown.length === 0,
        data:      { url }
      })
    )
  );
});

// ── Firebase Cloud Messaging — background (app closed) push ───
// Public config only (safe client-side, same values as firebase-config.js's
// default). Hardcoded here because this is a static site with no build step,
// so there is no env-substitution mechanism, and service workers have no
// `window` to read firebase-config.js's override logic from anyway.
// importScripts stays inside the try: if gstatic is unreachable (ad blocker,
// campus firewall, flaky network), a throw here would fail the whole worker
// and take offline support down with it. Push is optional; offline is not.
try {
  importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

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

