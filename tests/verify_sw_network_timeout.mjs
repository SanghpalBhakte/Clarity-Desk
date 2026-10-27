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
const keyOf = (req, ignoreSearch) => { const u = new URL(typeof req === 'string' ? req : req.url, 'https://app.test/'); return ignoreSearch ? u.origin + u.pathname : u.href; };
const caches = {
  open: async () => ({ put: async (req, res) => { cacheStore.set(keyOf(req), res); }, addAll: async () => {}, add: async () => {} }),
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
const res = (body, status = 200) => ({ body, status, type: 'basic', clone() { return res(body, status); } });
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

console.log(`\nSW NETWORK WAIT: ${passed}/${total} passed`);
if (errors.length) process.exit(1);
