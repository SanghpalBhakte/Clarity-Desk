// ==================================================================
// Clarity Desk: FEEDBACK TO TELEGRAM (workers/feedback + app.js form)
// ==================================================================
// Offline. Runs the real Worker's fetch handler in Node with Telegram
// mocked, and the real client functions sliced from app.js, to check:
//   - only allowed origins are served; the bot token stays server-side
//   - type, message, size and per-IP rate limits are enforced
//   - only the known fields reach Telegram (nothing else is forwarded)
//   - a screenshot goes out as a photo reply; a failed photo is reported
//   - offline reports are queued as text only (latest 3), retried once
//     when back online, and never sent twice
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const worker = (await import(pathToFileURL(path.join(ROOT, 'workers', 'feedback', 'worker.mjs')).href)).default;
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const toml = fs.readFileSync(path.join(ROOT, 'workers', 'feedback', 'wrangler.toml'), 'utf8');

const SITE = 'https://claritydesk.web.app';
const TOKEN = 'test-bot-token-123:SECRET';
const CHAT = '987654321';

// ── Mock network (Telegram + the client's FEEDBACK_URL) ───────────────
let tg = [];            // calls to api.telegram.org
let tgMode = 'ok';      // ok | down | photo-fails
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://api.telegram.org/')) {
    const method = url.split('/').pop();
    const isForm = init.body instanceof FormData;
    const body = isForm ? Object.fromEntries(init.body.entries()) : JSON.parse(init.body);
    tg.push({ url, method, body });
    if (tgMode === 'down') throw new TypeError('network down');
    if (tgMode === 'photo-fails' && method === 'sendPhoto') return new Response(JSON.stringify({ ok: false }), { status: 400 });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 55 } }), { status: 200 });
  }
  return realFetch(url, init);
};

function makeEnv(extra = {}) {
  const calls = [];
  return {
    calls, TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: CHAT,
    ALLOWED_ORIGINS: `${SITE},https://campusos-83365.web.app`,
    FEEDBACK_LIMITER: { limit: async ({ key }) => { calls.push(key); return { success: !extra.limited }; } },
    ...extra,
  };
}
// Like a real browser request, the body is sent with its Content-Length.
async function formReq(fields, { origin = SITE, file } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set('screenshot', file, 'screenshot.jpg');
  const probe = new Response(fd);
  const bytes = new Uint8Array(await probe.arrayBuffer());
  const h = { 'CF-Connecting-IP': '203.0.113.9', 'Content-Type': probe.headers.get('Content-Type'), 'Content-Length': String(bytes.byteLength) };
  if (origin) h.Origin = origin;
  return new Request('https://clarity-desk-feedback.example.workers.dev/', { method: 'POST', headers: h, body: bytes });
}
const good = { type: 'bug', message: 'The Today page is blank', version: '237', route: 'dashboard', device: 'Android', mode: 'browser' };
const jpeg = () => new File([new Uint8Array(2000).fill(7)], 'screenshot.jpg', { type: 'image/jpeg' });

let total = 0, passed = 0; const errors = [];
async function check(name, fn) {
  total++; tg = []; tgMode = 'ok';
  try {
    const res = await fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

console.log('==================================================================');
console.log('📨 FEEDBACK TO TELEGRAM');
console.log('==================================================================');

// ── Worker ────────────────────────────────────────────────────────────
await check('Worker: a site that is not allowed gets 403 and Telegram is never called', async () => {
  const a = await worker.fetch(await formReq(good, { origin: 'https://evil.example' }), makeEnv());
  const b = await worker.fetch(await formReq(good, { origin: null }), makeEnv());
  return a.status === 403 && b.status === 403 && tg.length === 0 ? true : `${a.status}/${b.status}, tg=${tg.length}`;
});

await check('Worker: the preflight answers only for allowed sites', async () => {
  const mk = (o) => new Request('https://x.example/', { method: 'OPTIONS', headers: { Origin: o } });
  const ok = await worker.fetch(mk(SITE), makeEnv());
  const no = await worker.fetch(mk('https://evil.example'), makeEnv());
  return ok.status === 204 && ok.headers.get('Access-Control-Allow-Origin') === SITE && no.status === 403 ? true : `${ok.status}/${no.status}`;
});

await check('Worker: a good report goes to the chat with the token in the URL only', async () => {
  const res = await worker.fetch(await formReq(good), makeEnv());
  const body = await res.text();
  const c = tg[0];
  return res.status === 200 && JSON.parse(body).ok === true && tg.length === 1 && c.method === 'sendMessage'
    && c.url === `https://api.telegram.org/bot${TOKEN}/sendMessage` && c.body.chat_id === CHAT
    && c.body.text.includes('Bug') && c.body.text.includes('v237') && c.body.text.includes('dashboard') && c.body.text.includes('Android') && c.body.text.includes('The Today page is blank')
    && !body.includes(TOKEN) && !body.includes(CHAT)
    ? true : `status=${res.status} tg=${JSON.stringify(tg)} body=${body}`;
});

await check('Worker: only the known fields are forwarded', async () => {
  const res = await worker.fetch(await formReq({ ...good, name: 'Asha Verma', email: 'asha@example.com', rollNo: 'CS2024-17' }), makeEnv());
  const t = tg[0]?.body.text || '';
  return res.status === 200 && !/Asha|asha@|CS2024/.test(t) ? true : t;
});

await check('Worker: a screenshot is sent as a photo reply to the message', async () => {
  const res = await worker.fetch(await formReq(good, { file: jpeg() }), makeEnv());
  const photo = tg.find(c => c.method === 'sendPhoto');
  const data = await res.json();
  return tg.length === 2 && photo && photo.body.chat_id === CHAT && photo.body.reply_to_message_id === '55' && photo.body.photo instanceof File && data.photo === true
    ? true : JSON.stringify(tg.map(c => c.method));
});

await check('Worker: a photo Telegram rejects still delivers the text and says so', async () => {
  tgMode = 'photo-fails';
  const res = await worker.fetch(await formReq(good, { file: jpeg() }), makeEnv());
  const data = await res.json();
  return res.status === 200 && data.ok && data.photo === false ? true : JSON.stringify(data);
});

await check('Worker: a file that is not an image is not forwarded', async () => {
  const res = await worker.fetch(await formReq(good, { file: new File(['<script>'], 'x.html', { type: 'text/html' }) }), makeEnv());
  return res.status === 200 && tg.length === 1 && tg[0].method === 'sendMessage' ? true : JSON.stringify(tg.map(c => c.method));
});

await check('Worker: bad type or empty message is refused before Telegram', async () => {
  const a = await worker.fetch(await formReq({ ...good, type: 'spam' }), makeEnv());
  const b = await worker.fetch(await formReq({ ...good, message: '   ' }), makeEnv());
  return a.status === 400 && b.status === 400 && tg.length === 0 ? true : `${a.status}/${b.status}`;
});

await check('Worker: the message is cut to 2000 characters', async () => {
  await worker.fetch(await formReq({ ...good, message: 'x'.repeat(5000) }), makeEnv());
  const sent = (tg[0]?.body.text.match(/x+/) || [''])[0].length;
  return sent === 2000 ? true : `sent ${sent} x`;
});

await check('Worker: an oversize body gets 413 and Telegram is never called', async () => {
  const big = new File([new Uint8Array(1.4 * 1024 * 1024)], 'screenshot.jpg', { type: 'image/jpeg' });
  const res = await worker.fetch(await formReq(good, { file: big }), makeEnv());
  return res.status === 413 && tg.length === 0 ? true : `${res.status}, tg=${tg.length}`;
});

await check('Worker: the per-IP rate limit answers 429, keyed by the caller IP', async () => {
  const env = makeEnv({ limited: true });
  const res = await worker.fetch(await formReq(good), env);
  return res.status === 429 && env.calls[0] === '203.0.113.9' && tg.length === 0 ? true : `${res.status} ${env.calls}`;
});

await check('Worker: wrong content type is refused; missing secrets answer 501', async () => {
  const bad = new Request('https://x.example/', { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json' }, body: '{}' });
  const a = await worker.fetch(bad, makeEnv());
  const b = await worker.fetch(await formReq(good), makeEnv({ TELEGRAM_BOT_TOKEN: '' }));
  return a.status === 415 && b.status === 501 && tg.length === 0 ? true : `${a.status}/${b.status}`;
});

await check('Worker: Telegram being down answers 502 without leaking the token', async () => {
  tgMode = 'down';
  const res = await worker.fetch(await formReq(good), makeEnv());
  const body = await res.text();
  return res.status === 502 && !body.includes(TOKEN) ? true : `${res.status} ${body}`;
});

await check('Config: no secret in wrangler.toml or app.js; the origins match the AI proxy', () => {
  const proxy = fs.readFileSync(path.join(ROOT, 'ai-proxy', 'wrangler.toml'), 'utf8').match(/^ALLOWED_ORIGINS\s*=\s*"([^"]+)"/m)?.[1];
  const mine = toml.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]+)"/m)?.[1];
  const leaks = [/api\.telegram\.org/, /TELEGRAM_BOT_TOKEN/, /\d{8,10}:[A-Za-z0-9_-]{30,}/].filter(re => re.test(appSrc) || re.test(toml.replace(/^#.*$/gm, '')));
  return proxy && proxy === mine && leaks.length === 0 ? true : `proxy=${proxy} mine=${mine} leaks=${leaks}`;
});

// ── Client (real functions sliced from app.js) ────────────────────────
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }, clear() {}
};
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.window = globalThis;
const stubEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, focus() {}, setAttribute() {}, addEventListener() {} });
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: stubEl, body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} } };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile', onLine: true }, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { hostname: 'claritydesk.web.app', search: '', hash: '' }, configurable: true, writable: true });
const stubImports = (src) => src.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const URL_RE = /const FEEDBACK_URL = '[^']*';/;
if (!URL_RE.test(appSrc)) throw new Error('FEEDBACK_URL line not found in app.js');
const EXPORTS = 'return { feedbackInfo, feedbackFormData, postFeedback, queueFeedback, flushFeedbackQueue, bugReportUrl, FEEDBACK_URL };';
const withUrl = (u) => new Function(`${stubImports(appSrc.replace(URL_RE, `const FEEDBACK_URL = '${u}';`))}\n${EXPORTS}`)();
const app = withUrl('https://feedback.test/');
const shipped = withUrl(appSrc.match(URL_RE)[0].match(/'([^']*)'/)[1]);

const entry = (n) => ({ type: 'bug', message: `report ${n}`, info: { version: '237', route: 'dashboard', device: 'Android', mode: 'browser' }, at: n });
let posts = [];
let postMode = 'ok';   // ok | network | refuse
function mockClientFetch() {
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://feedback.test')) {
      posts.push(Object.fromEntries(init.body.entries()));
      if (postMode === 'network') throw new TypeError('offline');
      if (postMode === 'refuse') return new Response(JSON.stringify({ ok: false, error: 'Too many reports.' }), { status: 429 });
      return new Response(JSON.stringify({ ok: true, photo: null }), { status: 200 });
    }
    return prev(url, init);
  };
}
mockClientFetch();

await check('Client: the form data carries only type, message and the four auto fields', () => {
  const fd = app.feedbackFormData(entry(1), null);
  const keys = [...fd.keys()].sort().join(',');
  return keys === 'device,message,mode,route,type,version' ? true : keys;
});

await check('Client: feedbackInfo reports version, device, mode and page without user data', () => {
  const i = app.feedbackInfo();
  return i.device === 'Android' && i.mode === 'browser' && Object.keys(i).sort().join() === 'device,mode,route,version' ? true : JSON.stringify(i);
});

await check('Client: a request that never reaches the Worker reports network, a refusal reports its error', async () => {
  posts = []; postMode = 'network';
  const a = await app.postFeedback(entry(1), null);
  postMode = 'refuse';
  const b = await app.postFeedback(entry(1), null);
  postMode = 'ok';
  const c = await app.postFeedback(entry(1), null);
  return a.network === true && b.ok === false && b.error === 'Too many reports.' && c.ok === true ? true : JSON.stringify([a, b, c]);
});

await check('Client: the queue keeps the latest 3 reports, text only', () => {
  for (const k of Object.keys(store)) delete store[k];
  [1, 2, 3, 4].forEach(n => app.queueFeedback(entry(n)));
  const q = JSON.parse(store.cos_feedback_queue);
  return q.length === 3 && q[0].message === 'report 2' && q.every(e => !('screenshot' in e) && !('shot' in e)) ? true : store.cos_feedback_queue;
});

await check('Client: coming back online sends each queued report once and empties the queue', async () => {
  posts = []; postMode = 'ok';
  const flushing = Promise.all([app.flushFeedbackQueue(), app.flushFeedbackQueue()]);   // a double "online" event
  await flushing;
  return posts.length === 3 && JSON.parse(store.cos_feedback_queue).length === 0 && posts.every(p => !('screenshot' in p)) ? true : `posts=${posts.length} queue=${store.cos_feedback_queue}`;
});

await check('Client: a queued report that fails its one retry is dropped, not retried again', async () => {
  app.queueFeedback(entry(9));
  posts = []; postMode = 'network';
  await app.flushFeedbackQueue();
  const after = JSON.parse(store.cos_feedback_queue).length;
  await app.flushFeedbackQueue();
  postMode = 'ok';
  return posts.length === 1 && after === 0 ? true : `posts=${posts.length} left=${after}`;
});

await check('Client: with no FEEDBACK_URL nothing is sent and the GitHub link is the fallback', async () => {
  posts = [];
  const empty = withUrl('');
  empty.queueFeedback(entry(1));
  await empty.flushFeedbackQueue();
  return posts.length === 0 && empty.FEEDBACK_URL === '' && /^https:\/\/github\.com\/.+\/issues\/new\?/.test(empty.bugReportUrl()) ? true : `posts=${posts.length}`;
});

await check('Client: the shipped build either has no URL or an https workers.dev URL', () => {
  return shipped.FEEDBACK_URL === '' || /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\/?$/.test(shipped.FEEDBACK_URL) ? true : shipped.FEEDBACK_URL;
});

await check('Client: wiring (Settings button, online retry, start-up retry, queue key kept out of backup)', () => {
  const need = ['onclick="openFeedbackForm()"', "const KEY_FEEDBACK_QUEUE      = 'cos_feedback_queue'", 'flushFeedbackQueue();\n    flushUsageQueue();', 'flushFeedbackQueue();\n  }, 4000)'];
  const missing = need.filter(s => !appSrc.includes(s) && !appSrc.includes(s.replace('flushFeedbackQueue();\n  }, 4000)', 'flushFeedbackQueue(); }, 4000)')));
  const exportFn = appSrc.slice(appSrc.indexOf('function exportData()'), appSrc.indexOf('function exportData()') + 2500);
  return missing.length === 0 && !exportFn.includes('FEEDBACK') ? true : `missing: ${missing.join(' | ')}`;
});

console.log('\n========================================');
console.log(`FEEDBACK: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
