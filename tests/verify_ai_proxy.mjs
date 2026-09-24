// ==================================================================
// Clarity Desk: AI PROXY (ai-proxy/worker.mjs + AIService proxy mode)
// ==================================================================
// Offline. Runs the real Worker's fetch handler in Node with the network
// mocked, and the real AIService object sliced from app.js, to check:
//   - the Worker only serves allowed origins, adds the key server-side,
//     forwards the body byte-for-byte, and never echoes a key back
//   - Firebase sign-in tokens are verified (signature, project, expiry)
//     and pick the per-account limit; anything else is a guest
//   - OpenRouter is limited to ":free" models; oversize bodies are refused
//   - with CAMPUS_OS_AI_PROXY set, the app sends no key at all; without it
//     the direct-key calls are unchanged
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const worker = (await import(path.join(ROOT, 'ai-proxy', 'worker.mjs'))).default;

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const PROJECT = 'campusos-83365';
const SITE = 'https://campusos-83365.web.app';
const KEYS = { GEMINI_API_KEY: 'test-gemini-secret-111', GROQ_API_KEY: 'test-groq-secret-222', OPENROUTER_API_KEY: 'test-or-secret-333' };

// ── Test fixtures ─────────────────────────────────────────────────────
const signingPair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const otherPair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicJwk = { ...(await crypto.subtle.exportKey('jwk', signingPair.publicKey)), kid: 'kid-1', use: 'sig', alg: 'RS256' };

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
async function makeToken(overrides = {}, { kid = 'kid-1', key = signingPair.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const claims = b64url(Buffer.from(JSON.stringify({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'student-uid-42',
    iat: now - 60, exp: now + 3000, auth_time: now - 60, ...overrides
  })));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(new Uint8Array(sig))}`;
}

let upstreamCalls = [];
let jwksFetches = 0;
let upstreamMode = 'ok';
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === JWKS_URL) {
    jwksFetches++;
    return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
  }
  if (upstreamMode === 'down') throw new TypeError('network down');
  const body = init.body instanceof Uint8Array ? init.body : new Uint8Array(await new Response(init.body).arrayBuffer());
  upstreamCalls.push({ url, headers: { ...init.headers }, body });
  return new Response(JSON.stringify({ echoedUrl: url, candidates: [{ content: { parts: [{ text: '{"schedule":[{"day":"Mon"}]}' }] }, finishReason: 'STOP' }], choices: [{ message: { content: '{"schedule":[{"day":"Tue"}]}' } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function makeLimiter(allow = true) {
  const calls = [];
  return { calls, limit: async ({ key }) => { calls.push(key); return { success: allow }; } };
}
function makeEnv(extra = {}) {
  return {
    ...KEYS, ALLOWED_ORIGINS: `${SITE},https://campusos-83365.firebaseapp.com,http://127.0.0.1:*`,
    FIREBASE_PROJECT_ID: PROJECT, ALLOW_GUESTS: 'true',
    USER_LIMITER: makeLimiter(), GUEST_LIMITER: makeLimiter(), ...extra
  };
}
function post(pathname, body, { origin = SITE, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers };
  if (origin) h.Origin = origin;
  return new Request(`https://clarity-desk-ai.example.workers.dev${pathname}`, { method: 'POST', headers: h, body });
}
const chatBody = (model) => JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'text', text: 'read this' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }] }], temperature: 0.1 });
const geminiBody = JSON.stringify({ contents: [{ parts: [{ text: 'read this' }, { inline_data: { mime_type: 'image/png', data: 'iVBORw0KGgo=' } }] }] });
const containsSecret = (s) => Object.values(KEYS).some(k => String(s).includes(k));

// ── Harness ───────────────────────────────────────────────────────────
let total = 0, passed = 0; const errors = [];
async function scenario(name, fn) {
  total++; upstreamCalls = []; upstreamMode = 'ok';
  try {
    const res = await fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.stack || err.message }); console.error(`✗ [FAIL] ${name}: ${err.message}`); }
}

console.log('==================================================================');
console.log('🔐 AI PROXY: Worker + AIService proxy mode');
console.log('==================================================================');

// ── Worker: origin / CORS ─────────────────────────────────────────────
await scenario('Preflight from the hosted site is allowed with CORS headers', async () => {
  const res = await worker.fetch(new Request('https://w.dev/v1/groq', { method: 'OPTIONS', headers: { Origin: SITE } }), makeEnv());
  if (res.status !== 204) return `status ${res.status}`;
  if (res.headers.get('Access-Control-Allow-Origin') !== SITE) return 'missing ACAO';
  if (!/Authorization/.test(res.headers.get('Access-Control-Allow-Headers') || '')) return 'Authorization not allowed in preflight';
  return true;
});
await scenario('Preflight and POST from another site are refused, provider never called', async () => {
  const pre = await worker.fetch(new Request('https://w.dev/v1/groq', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), makeEnv());
  const res = await worker.fetch(post('/v1/groq', chatBody('qwen/qwen3.8-27b'), { origin: 'https://evil.example' }), makeEnv());
  const noOrigin = await worker.fetch(post('/v1/groq', chatBody('qwen/qwen3.8-27b'), { origin: null }), makeEnv());
  if (pre.status !== 403 || pre.headers.get('Access-Control-Allow-Origin')) return `preflight ${pre.status}`;
  if (res.status !== 403 || noOrigin.status !== 403) return `post ${res.status}/${noOrigin.status}`;
  return upstreamCalls.length === 0 ? true : 'provider was called';
});
await scenario('Wildcard-port origin matches only a real port on that exact host', async () => {
  const ok = await worker.fetch(post('/v1/groq', chatBody('m'), { origin: 'http://127.0.0.1:5173' }), makeEnv());
  const bad1 = await worker.fetch(post('/v1/groq', chatBody('m'), { origin: 'http://127.0.0.1.evil.example' }), makeEnv());
  const bad2 = await worker.fetch(post('/v1/groq', chatBody('m'), { origin: 'http://127.0.0.1:80@evil.example' }), makeEnv());
  if (ok.status !== 200) return `localhost port refused: ${ok.status}`;
  return bad1.status === 403 && bad2.status === 403 ? true : `lookalike origin accepted: ${bad1.status}/${bad2.status}`;
});
await scenario('Health check reports configured providers without revealing keys', async () => {
  const res = await worker.fetch(new Request('https://w.dev/v1/health'), makeEnv({ OPENROUTER_API_KEY: '' }));
  const text = await res.text(); const data = JSON.parse(text);
  if (res.status !== 200 || !data.ok) return `status ${res.status}`;
  if (data.providers.gemini !== true || data.providers.groq !== true || data.providers.openrouter !== false) return text;
  return containsSecret(text) ? 'key leaked in health output' : true;
});

// ── Worker: forwarding ────────────────────────────────────────────────
await scenario('Gemini: key goes in a server-side header, body forwarded byte-for-byte', async () => {
  const res = await worker.fetch(post('/v1/gemini/gemini-flash-latest', geminiBody), makeEnv());
  const text = await res.text();
  const call = upstreamCalls[0];
  if (res.status !== 200 || !call) return `status ${res.status}`;
  if (call.url !== 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent') return `url ${call.url}`;
  if (call.headers['x-goog-api-key'] !== KEYS.GEMINI_API_KEY) return 'key header missing';
  if (Buffer.from(call.body).toString() !== geminiBody) return 'body changed in transit';
  if (res.headers.get('Access-Control-Allow-Origin') !== SITE) return 'no CORS on response';
  return containsSecret(text) || containsSecret([...res.headers].join()) ? 'key leaked in response' : true;
});
await scenario('Gemini model names that could escape the path are refused', async () => {
  for (const bad of ['..%2F..%2Fx', 'gpt-4o', 'gemini-flash%3AstreamGenerateContent', 'gemini-']) {
    const res = await worker.fetch(post(`/v1/gemini/${bad}`, geminiBody), makeEnv());
    if (res.status !== 404) return `${bad} -> ${res.status}`;
  }
  return upstreamCalls.length === 0 ? true : 'provider was called';
});
await scenario('Groq: Bearer key added server-side', async () => {
  const body = chatBody('qwen/qwen3.8-27b');
  const res = await worker.fetch(post('/v1/groq', body), makeEnv());
  const call = upstreamCalls[0];
  if (res.status !== 200 || !call) return `status ${res.status}`;
  if (call.url !== 'https://api.groq.com/openai/v1/chat/completions') return call.url;
  if (call.headers.Authorization !== `Bearer ${KEYS.GROQ_API_KEY}`) return 'bearer missing';
  return Buffer.from(call.body).toString() === body ? true : 'body changed';
});
await scenario('OpenRouter: ":free" models forwarded with referer, paid models refused', async () => {
  const paid = await worker.fetch(post('/v1/openrouter', chatBody('openai/gpt-5')), makeEnv());
  if (paid.status !== 403 || upstreamCalls.length) return `paid model allowed: ${paid.status}`;
  const free = await worker.fetch(post('/v1/openrouter', chatBody('google/gemma-4-31b-it:free')), makeEnv());
  const call = upstreamCalls[0];
  if (free.status !== 200 || !call) return `free model status ${free.status}`;
  if (call.headers['HTTP-Referer'] !== SITE || call.headers['X-Title'] !== 'Clarity Desk') return 'referer/title missing';
  return call.headers.Authorization === `Bearer ${KEYS.OPENROUTER_API_KEY}` ? true : 'bearer missing';
});
await scenario('Chat body must name its model first; wrong content type refused', async () => {
  const noModel = await worker.fetch(post('/v1/groq', JSON.stringify({ messages: [], model: 'x' })), makeEnv());
  const wrongType = await worker.fetch(post('/v1/groq', chatBody('m'), { headers: { 'Content-Type': 'text/plain' } }), makeEnv());
  if (noModel.status !== 400) return `model-not-first -> ${noModel.status}`;
  if (wrongType.status !== 415) return `text/plain -> ${wrongType.status}`;
  return upstreamCalls.length === 0 ? true : 'provider was called';
});
await scenario('Bodies over 12 MB are refused, declared or streamed', async () => {
  const declared = await worker.fetch(post('/v1/groq', chatBody('m'), { headers: { 'Content-Length': String(13 * 1024 * 1024) } }), makeEnv());
  const big = new Uint8Array(13 * 1024 * 1024).fill(32);
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < big.length; i += 1 << 20) c.enqueue(big.subarray(i, i + (1 << 20))); c.close(); } });
  const streamed = await worker.fetch(new Request('https://w.dev/v1/groq', { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json' }, body: stream, duplex: 'half' }), makeEnv());
  if (declared.status !== 413 || streamed.status !== 413) return `${declared.status}/${streamed.status}`;
  return upstreamCalls.length === 0 ? true : 'provider was called';
});
await scenario('Missing provider key -> 501; provider unreachable -> 502', async () => {
  const noKey = await worker.fetch(post('/v1/groq', chatBody('m')), makeEnv({ GROQ_API_KEY: '' }));
  upstreamMode = 'down';
  const down = await worker.fetch(post('/v1/groq', chatBody('m')), makeEnv());
  return noKey.status === 501 && down.status === 502 ? true : `${noKey.status}/${down.status}`;
});

// ── Worker: identity + rate limits ───────────────────────────────────
await scenario('Guest (no token) uses the per-network limiter keyed by IP', async () => {
  const env = makeEnv();
  await worker.fetch(post('/v1/groq', chatBody('m')), env);
  return env.GUEST_LIMITER.calls[0] === 'guest:203.0.113.7' && env.USER_LIMITER.calls.length === 0 ? true : JSON.stringify([env.GUEST_LIMITER.calls, env.USER_LIMITER.calls]);
});
await scenario('Valid Firebase sign-in token uses the per-account limiter', async () => {
  const env = makeEnv();
  const res = await worker.fetch(post('/v1/groq', chatBody('m'), { headers: { Authorization: `Bearer ${await makeToken()}` } }), env);
  if (res.status !== 200) return `status ${res.status}`;
  if (upstreamCalls[0].headers.Authorization !== `Bearer ${KEYS.GROQ_API_KEY}`) return 'student token was forwarded to the provider';
  return env.USER_LIMITER.calls[0] === 'user:student-uid-42' && env.GUEST_LIMITER.calls.length === 0 ? true : JSON.stringify(env.USER_LIMITER.calls);
});
await scenario('Forged, expired or other-project tokens are not treated as signed in', async () => {
  const now = Math.floor(Date.now() / 1000);
  const tokens = {
    'wrong signing key': await makeToken({}, { key: otherPair.privateKey }),
    'expired': await makeToken({ exp: now - 10 }),
    'other project': await makeToken({ aud: 'someone-else', iss: 'https://securetoken.google.com/someone-else' }),
    'issued in the future': await makeToken({ iat: now + 3600 }),
    'tampered claims': (await makeToken()).replace(/^([^.]+)\.([^.]+)\./, (m, h) => `${h}.${b64url(Buffer.from(JSON.stringify({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'admin', iat: now, exp: now + 999 })))}.`),
    'garbage': 'not.a.jwt'
  };
  for (const [label, token] of Object.entries(tokens)) {
    const env = makeEnv();
    await worker.fetch(post('/v1/groq', chatBody('m'), { headers: { Authorization: `Bearer ${token}` } }), env);
    if (env.USER_LIMITER.calls.length || env.GUEST_LIMITER.calls.length !== 1) return `${label}: counted as signed in`;
    const strict = makeEnv({ ALLOW_GUESTS: 'false' });
    const res = await worker.fetch(post('/v1/groq', chatBody('m'), { headers: { Authorization: `Bearer ${token}` } }), strict);
    if (res.status !== 401) return `${label}: ALLOW_GUESTS=false let it through (${res.status})`;
  }
  return true;
});
await scenario('Unknown signing key refetches Google keys at most once a minute', async () => {
  const before = jwksFetches;
  const token = await makeToken({}, { kid: 'rotated-kid' });
  for (let i = 0; i < 5; i++) await worker.fetch(post('/v1/groq', chatBody('m'), { headers: { Authorization: `Bearer ${token}` } }), makeEnv());
  return jwksFetches - before <= 1 ? true : `${jwksFetches - before} key fetches for 5 requests`;
});
await scenario('Over the limit -> 429 with Retry-After, provider never called', async () => {
  const res = await worker.fetch(post('/v1/groq', chatBody('m')), makeEnv({ GUEST_LIMITER: makeLimiter(false) }));
  if (res.status !== 429 || res.headers.get('Retry-After') !== '60') return `status ${res.status}`;
  const data = await res.json();
  return upstreamCalls.length === 0 && /wait a minute/i.test(data.error.message) ? true : 'provider called or message missing';
});

// ── App side: AIService in proxy mode vs direct mode ─────────────────
const appLines = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split('\n');
const lineOf = (prefix) => { const i = appLines.findIndex(l => l.startsWith(prefix)); if (i === -1) throw new Error(`app.js marker not found: ${prefix}`); return i; };
const aiSlice = appLines.slice(lineOf('const AIService = {'), lineOf('function updateTimetableLoadingModal')).join('\n');
function loadAIService(win, user) {
  return new Function('window', 'currentUser', `${aiSlice}\nreturn AIService;`)(win, user);
}
function routeFetchThroughWorker(env) {
  const realMock = globalThis.fetch;
  const seen = [];
  const appFetch = async (url, init = {}) => {
    seen.push({ url: String(url), headers: { ...init.headers } });
    if (String(url).startsWith('https://proxy.test/')) {
      const req = new Request(String(url).replace('https://proxy.test', 'https://w.dev'), { method: init.method, headers: { ...init.headers, Origin: SITE, 'CF-Connecting-IP': '198.51.100.9' }, body: init.body });
      return worker.fetch(req, env);
    }
    return realMock(url, init);
  };
  return { seen, appFetch, restore: () => { globalThis.fetch = realMock; } };
}

await scenario('Proxy mode: scan goes through the proxy and the page sends no provider key', async () => {
  const env = makeEnv();
  const { seen, appFetch, restore } = routeFetchThroughWorker(env);
  globalThis.fetch = appFetch;
  try {
    // Keys still present locally must be ignored once the proxy is set.
    const win = { CAMPUS_OS_AI_PROXY: 'https://proxy.test/', CAMPUS_OS_GEMINI_KEY: 'LOCAL-KEY-SHOULD-NOT-BE-SENT', location: { origin: SITE } };
    const AI = loadAIService(win, null);
    const out = await AI.extractStructuredFromImage('iVBORw0KGgo=', 'image/png', 'read it');
    if (!out?.schedule?.length) return 'no schedule returned';
    if (!seen.length || !seen[0].url.startsWith('https://proxy.test/v1/gemini/gemini-flash-latest')) return `first call ${seen[0]?.url}`;
    if (seen.some(c => /LOCAL-KEY|key=/.test(c.url + JSON.stringify(c.headers)))) return 'a key left the page';
    if (!upstreamCalls[0] || upstreamCalls[0].headers['x-goog-api-key'] !== KEYS.GEMINI_API_KEY) return 'worker did not add its own key';
    return env.GUEST_LIMITER.calls.length === 1 ? true : 'expected one guest call';
  } finally { restore(); }
});
await scenario('Proxy mode: signed-in student sends a Firebase token; Groq and OpenRouter legs route too', async () => {
  const env = makeEnv();
  const { seen, appFetch, restore } = routeFetchThroughWorker(env);
  globalThis.fetch = appFetch;
  try {
    const token = await makeToken();
    const AI = loadAIService({ CAMPUS_OS_AI_PROXY: 'https://proxy.test', location: { origin: SITE } }, { getIdToken: async () => token });
    const g = await AI.callGroqVision('iVBORw0KGgo=', 'image/png', 'read it');
    const o = await AI.callOpenRouterVision('iVBORw0KGgo=', 'image/png', 'read it');
    const t = await AI.callGroqText('Mon DS 10:00', 'structure it');
    if (!g?.schedule || !o?.schedule || !t?.schedule) return 'a leg returned nothing';
    const urls = seen.map(c => c.url);
    if (!urls.includes('https://proxy.test/v1/groq') || !urls.includes('https://proxy.test/v1/openrouter')) return urls.join(', ');
    // (the Worker's own Google-keys fetch also passes through this mock; only the app's calls count)
    const appCalls = seen.filter(c => c.url.startsWith('https://proxy.test/'));
    if (appCalls.length !== 3 || !appCalls.every(c => c.headers.Authorization === `Bearer ${token}`)) return 'token missing on a call';
    return env.USER_LIMITER.calls.length === 3 && env.USER_LIMITER.calls.every(k => k === 'user:student-uid-42') ? true : JSON.stringify(env.USER_LIMITER.calls);
  } finally { restore(); }
});
await scenario('Direct mode (no proxy set) is unchanged: same endpoints and key placement as before', async () => {
  upstreamCalls = [];
  const AI = loadAIService({ CAMPUS_OS_GEMINI_KEY: 'gem-local', CAMPUS_OS_GROQ_KEY: 'groq-local', location: { origin: SITE } }, null);
  if (AI.hasProvider('openrouter')) return 'openrouter reported without key or proxy';
  await AI.generateContentFromImage('iVBORw0KGgo=', 'image/png', 'read it');
  await AI.callGroqVision('iVBORw0KGgo=', 'image/png', 'read it');
  const [gem, groq] = upstreamCalls;
  if (gem.url !== 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=gem-local') return gem.url;
  if (groq.url !== 'https://api.groq.com/openai/v1/chat/completions' || groq.headers.Authorization !== 'Bearer groq-local') return 'groq direct call changed';
  return true;
});
await scenario('No proxy and no keys: every provider reports unavailable (scan stays on-device)', async () => {
  const AI = loadAIService({ location: { origin: SITE } }, null);
  if (['gemini', 'groq', 'openrouter'].some(p => AI.hasProvider(p))) return 'provider reported available';
  try { await AI.extractStructuredFromImage('x', 'image/png', 'p'); return 'expected a throw'; }
  catch (e) { return /No vision-capable AI provider configured/.test(e.message) ? true : e.message; }
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${errors.length}`);
console.log('========================================');
if (errors.length > 0) {
  console.error('\n❌ FAILURES:');
  errors.forEach(e => console.error(`  - ${e.name}: ${e.error}`));
  process.exit(1);
} else {
  console.log('🏆 ALL AI PROXY TESTS PASSED! 🚀\n');
}
