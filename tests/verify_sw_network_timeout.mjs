// ==================================================================
// Clarity Desk: SERVICE WORKER WAITS AT MOST NETWORK_WAIT_MS
// ==================================================================
// A slow network (one that never fails) used to keep the installed app
// on a blank screen. Locked down here, for page/JS/CSS requests:
//  - a fast network answer is used, as before;
//  - a slow one: the saved copy is used after the wait, and the network
//    answer still lands in the cache for next time;
//  - slow with no saved copy: keep waiting for the network;
//  - network error: saved copy, else Response.error() (as before).
// ==================================================================
import fs from 'fs';
import vm from 'vm';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(`${ROOT}/sw.js`, 'utf8');
const WAIT = 40;
if (!/const NETWORK_WAIT_MS = 3000;/.test(src)) { console.error('✗ NETWORK_WAIT_MS = 3000 not found in sw.js'); process.exit(1); }

const cacheStore = new Map();
let putDelay = 0;   // ms a cache write takes (a real one is not instant)
const keyOf = (req, ignoreSearch) => { const u = new URL(typeof req === 'string' ? req : req.url, 'https://app.test/'); return ignoreSearch ? u.origin + u.pathname : u.href; };
const caches = {
  open: async () => ({ put: async (req, res) => { if (putDelay) await new Promise(r => setTimeout(r, putDelay)); cacheStore.set(keyOf(req), res); }, addAll: async () => {}, add: async () => {} }),
  match: async (req, opts = {}) => {
    if (!opts.ignoreSearch) return cacheStore.get(keyOf(req));
    for (const [k, v] of cacheStore) if (keyOf(k, true) === keyOf(req, true)) return v;
    return undefined;
  },
  keys: async () => [], delete: async () => true
};
let fetchImpl = null;
const listeners = {};
const self = {
  addEventListener: (t, fn) => { listeners[t] = fn; },
  registration: { scope: 'https://app.test/', showNotification() {} },
  clients: { claim() {}, matchAll: async () => [] },
  skipWaiting() {}, location: { origin: 'https://app.test' }
};
const res = (body, status = 200) => ({ body, status, ok: status >= 200 && status < 300, type: 'basic', clone() { return res(body, status); } });
const Response = { error: () => ({ body: 'ERROR', status: 0, type: 'error' }), redirect: () => res('redirect', 303) };
vm.runInNewContext(src.replace('const NETWORK_WAIT_MS = 3000;', `const NETWORK_WAIT_MS = ${WAIT};`), {
  self, caches, Response, URL, console, setTimeout, clearTimeout, Promise,
  fetch: (req) => fetchImpl(req)
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function request(url, mode = 'no-cors') {
  let responded = null;
  const waits = [];
  listeners.fetch({ request: { url, method: 'GET', mode }, respondWith: (p) => { responded = Promise.resolve(p); }, waitUntil: (p) => waits.push(p) });
  const t0 = Date.now();
  const out = await responded;
  return { out, ms: Date.now() - t0, waits };
}

let total = 0, passed = 0; const errors = [];
async function check(name, fn) {
  total++;
  try {
    const r = await fn();
    if (r === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push(name); console.error(`✗ [FAIL] ${name}: ${r}`); }
  } catch (err) { errors.push(name); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

console.log('📶 SERVICE WORKER NETWORK WAIT');

await check('Fast network: the network answer is used and cached', async () => {
  cacheStore.clear(); cacheStore.set('https://app.test/app.js?v=1', res('old'));
  fetchImpl = async () => res('new');
  const { out } = await request('https://app.test/app.js?v=1');
  await sleep(5);
  return out.body === 'new' && cacheStore.get('https://app.test/app.js?v=1').body === 'new' ? true : out.body;
});

await check('Slow network: the saved copy is used after the wait, the network answer is cached later', async () => {
  cacheStore.clear(); cacheStore.set('https://app.test/app.js?v=1', res('saved'));
  let release; fetchImpl = () => new Promise(r => { release = () => r(res('fresh')); });
  const { out, ms, waits } = await request('https://app.test/app.js?v=1');
  if (out.body !== 'saved' || ms > WAIT * 5) return `${out.body} after ${ms} ms`;
  release(); await Promise.all(waits); await sleep(5);
  return cacheStore.get('https://app.test/app.js?v=1').body === 'fresh' ? true : 'network answer not cached';
});

await check('Slow page load: the saved index.html opens the installed app', async () => {
  cacheStore.clear(); cacheStore.set('https://app.test/index.html', res('shell'));
  fetchImpl = () => new Promise(() => {});
  const { out } = await request('https://app.test/', 'navigate');
  return out.body === 'shell' ? true : out.body;
});

await check('Slow network with no saved copy: keeps waiting for the network', async () => {
  cacheStore.clear();
  fetchImpl = () => new Promise(r => setTimeout(() => r(res('late')), WAIT * 3));
  const { out, ms } = await request('https://app.test/style.css');
  return out.body === 'late' && ms >= WAIT * 2 ? true : `${out.body} after ${ms} ms`;
});

await check('Network error: saved copy (ignoring ?v=), else Response.error()', async () => {
  cacheStore.clear(); cacheStore.set('https://app.test/app.js', res('precached'));
  fetchImpl = async () => { throw new Error('offline'); };
  const a = (await request('https://app.test/app.js?v=9')).out;
  cacheStore.clear();
  const b = (await request('https://app.test/data.js')).out;
  return a.body === 'precached' && b.type === 'error' ? true : `${a.body} ${b.type}`;
});

await check('After one slow request, the next ones use their saved copy at once', async () => {
  cacheStore.clear();
  cacheStore.set('https://app.test/index.html', res('shell'));
  cacheStore.set('https://app.test/app.js?v=1', res('saved-app'));
  cacheStore.set('https://app.test/data.js', res('saved-data'));
  fetchImpl = async () => res('fresh');            // fast answer clears slow mode
  await request('https://app.test/style.css');
  fetchImpl = () => new Promise(() => {});          // now the network stalls
  const page = await request('https://app.test/', 'navigate');
  const app = await request('https://app.test/app.js?v=1');
  const data = await request('https://app.test/data.js');
  // Timers can fire a millisecond early on CI, so compare against half the wait.
  if (page.out.body !== 'shell' || page.ms < WAIT / 2) return `page ${page.out.body} after ${page.ms} ms`;
  return app.out.body === 'saved-app' && data.out.body === 'saved-data' && app.ms < WAIT / 2 && data.ms < WAIT / 2
    ? true : `app ${app.out.body} ${app.ms} ms, data ${data.out.body} ${data.ms} ms`;
});

await check('A fast gstatic answer or a fast 404 does not end slow mode', async () => {
  // Slow mode is still on from the check above.
  cacheStore.clear(); cacheStore.set('https://app.test/data.js', res('saved-data'));
  fetchImpl = async () => res('sdk');
  await request('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
  fetchImpl = async () => res('missing', 404);
  await request('https://app.test/firebase-config.local.js');
  fetchImpl = () => new Promise(() => {});
  const { out, ms } = await request('https://app.test/data.js');
  return out.body === 'saved-data' && ms < WAIT / 2 ? true : `${out.body} after ${ms} ms`;
});

await check('A fast answer ends slow mode: later requests wait for the network again', async () => {
  // Slow mode is still on from the check above.
  cacheStore.clear(); cacheStore.set('https://app.test/app.js?v=1', res('saved'));
  fetchImpl = async () => res('fresh');
  const first = (await request('https://app.test/app.js?v=1')).out;
  fetchImpl = () => new Promise(r => setTimeout(() => r(res('fresh2')), WAIT / 2));
  const second = (await request('https://app.test/app.js?v=1')).out;
  return first.body === 'fresh' && second.body === 'fresh2' ? true : `${first.body} then ${second.body}`;
});

await check('The worker stays alive until a late network answer is saved', async () => {
  cacheStore.clear(); cacheStore.set('https://app.test/x.js', res('saved'));
  let release; fetchImpl = () => new Promise(r => { release = () => r(res('fresh')); });
  const { waits } = await request('https://app.test/x.js');
  putDelay = 20;
  release(); await Promise.all(waits);               // no extra sleep: waitUntil must cover cache.put
  putDelay = 0;
  return cacheStore.get('https://app.test/x.js').body === 'fresh' ? true : 'cache.put not covered by waitUntil';
});

console.log(`\nSW NETWORK WAIT: ${passed}/${total} passed`);
if (errors.length) process.exit(1);
