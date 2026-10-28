const CACHE_NAME = 'clarity-desk-v249';
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
// desk-assistant.js, scanners.js and timetable-ocr.js are precached so Ask Desk and the photo
// scans work offline even though app.js imports them lazily. deadline-import*.js, welcome-tour.js and vendor/jszip.min.js
// are cached on first use instead.
const PRECACHE_ASSETS = [
  './',
  './index.html',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@546ae8fc2ce25e57d3dbc5eed88fbda170d1ce04/app.js',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@546ae8fc2ce25e57d3dbc5eed88fbda170d1ce04/style.css',
  'firebase-config.js?v=249',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@546ae8fc2ce25e57d3dbc5eed88fbda170d1ce04/data.js',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@546ae8fc2ce25e57d3dbc5eed88fbda170d1ce04/desk-assistant.js',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@546ae8fc2ce25e57d3dbc5eed88fbda170d1ce04/scanners.js',
  'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@546ae8fc2ce25e57d3dbc5eed88fbda170d1ce04/timetable-ocr.js',
  './manifest.json',
  'favicon.ico?v=249',
  'favicon.svg?v=249',
  'favicon-32.png?v=249',
  'favicon-16.png?v=249',
  'apple-touch-icon.png?v=249',
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
  // Old Firebase (FCM) pushes wrap everything in a top-level "data" object.
  // Nothing sends those any more; skip them so a stray one can't show an empty
  // notification. push-worker/ reminders are flat and always reach the code below.
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
