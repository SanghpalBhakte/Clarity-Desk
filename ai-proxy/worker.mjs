// =====================================================================
// Clarity Desk — AI proxy (Cloudflare Worker, free plan)
// =====================================================================
// Keeps the Gemini / Groq / OpenRouter API keys on the server so they are
// never shipped to the browser. The app sends the exact request body it
// used to send straight to the provider; this Worker adds the key and
// forwards it.
//
//   POST /v1/gemini/<model>  -> Gemini generateContent
//   POST /v1/groq            -> Groq chat/completions
//   POST /v1/openrouter      -> OpenRouter chat/completions (":free" models only)
//   GET  /v1/health          -> which providers have a key configured
//
// Who may call it:
//   - only pages served from ALLOWED_ORIGINS (see wrangler.toml)
//   - signed-in students (Firebase ID token in Authorization) are limited
//     per account; guests (ALLOW_GUESTS = "true") are limited per network.
//
// The body is forwarded as raw bytes and never JSON-parsed: a timetable
// photo is several MB, and parsing it could exceed the free plan's 10 ms
// CPU budget. Time spent waiting on the provider is not CPU time.
// =====================================================================

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const GEMINI_MODEL = /^(gemini|gemma)-[a-z0-9][a-z0-9.-]{0,63}$/;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const PROVIDERS = {
  gemini: { label: 'Gemini', secret: 'GEMINI_API_KEY' },
  groq: { label: 'Groq', secret: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions' },
  openrouter: { label: 'OpenRouter', secret: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions' },
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = isAllowedOrigin(origin, env.ALLOWED_ORIGINS) ? corsHeaders(origin) : null;
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    }
    if (url.pathname === '/v1/health' && request.method === 'GET') {
      const providers = Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, !!env[p.secret]]));
      return json(200, { ok: true, providers }, cors);
    }
    if (!cors) return json(403, errorBody('This site is not allowed to use the Clarity Desk AI proxy.'), null);

    const route = matchRoute(url.pathname);
    if (!route) return json(404, errorBody('Unknown AI proxy route.'), cors);
    if (request.method !== 'POST') return json(405, errorBody('Use POST.'), cors);

    const who = await identify(request, env);
    if (!who) return json(401, errorBody('Sign in to use AI scanning.'), cors);
    const limiter = who.kind === 'user' ? env.USER_LIMITER : env.GUEST_LIMITER;
    if (limiter) {
      const { success } = await limiter.limit({ key: `${who.kind}:${who.id}` });
      if (!success) return json(429, errorBody('Too many AI requests right now. Wait a minute and try again.'), cors, { 'Retry-After': '60' });
    }

    const provider = PROVIDERS[route.provider];
    const key = env[provider.secret];
    if (!key) return json(501, errorBody(`The AI proxy has no ${provider.label} key configured.`), cors);

    if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) {
      return json(415, errorBody('Send the request as application/json.'), cors);
    }
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) return tooLarge(cors);
    const body = await readCapped(request.body, MAX_BODY_BYTES);
    if (body === null) return tooLarge(cors);
    if (body.byteLength === 0) return json(400, errorBody('Empty request body.'), cors);

    // Chat-completions bodies: the app always puts "model" first, so it can
    // be checked from the first few hundred bytes without parsing the image.
    if (route.provider !== 'gemini') {
      const model = leadingModel(body);
      if (!model) return json(400, errorBody('Request body must start with a "model" field.'), cors);
      // OpenRouter keys can hold paid credit; only free models may be used through the proxy.
      if (route.provider === 'openrouter' && !model.endsWith(':free')) {
        return json(403, errorBody('Only OpenRouter ":free" models are allowed through this proxy.'), cors);
      }
    }

    const target = route.provider === 'gemini'
      ? `https://generativelanguage.googleapis.com/v1beta/models/${route.model}:generateContent`
      : provider.url;
    const headers = { 'Content-Type': 'application/json' };
    if (route.provider === 'gemini') headers['x-goog-api-key'] = key;
    else headers['Authorization'] = `Bearer ${key}`;
    if (route.provider === 'openrouter') {
      headers['HTTP-Referer'] = origin;
      headers['X-Title'] = 'Clarity Desk';
    }

    let upstream;
    try {
      upstream = await fetch(target, { method: 'POST', headers, body });
    } catch (_) {
      return json(502, errorBody(`Could not reach ${provider.label}. Try again in a moment.`), cors);
    }
    const out = new Headers(cors);
    out.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    out.set('Cache-Control', 'no-store');
    const retryAfter = upstream.headers.get('Retry-After');
    if (retryAfter) out.set('Retry-After', retryAfter);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

function matchRoute(pathname) {
  const gemini = pathname.match(/^\/v1\/gemini\/([^/]+)$/);
  if (gemini) {
    const model = decodeURIComponent(gemini[1]);
    return GEMINI_MODEL.test(model) ? { provider: 'gemini', model } : null;
  }
  const chat = pathname.match(/^\/v1\/(groq|openrouter)$/);
  return chat ? { provider: chat[1] } : null;
}

// "https://x.web.app" must match exactly; "http://localhost:*" matches any port.
function isAllowedOrigin(origin, list) {
  if (!origin) return false;
  return String(list || '').split(',').map(s => s.trim()).filter(Boolean).some(entry => {
    if (entry.endsWith(':*')) {
      const base = entry.slice(0, -1);
      return origin.startsWith(base) && /^\d{1,5}$/.test(origin.slice(base.length));
    }
    return origin === entry;
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function errorBody(message) {
  return { error: { message } };
}

function json(status, data, cors, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...(cors || {}), ...extra, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function tooLarge(cors) {
  return json(413, errorBody('This image is too large for AI scanning. Try a smaller photo or a screenshot.'), cors);
}

async function readCapped(stream, max) {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function leadingModel(bytes) {
  const head = new TextDecoder().decode(bytes.subarray(0, 300));
  const m = head.match(/^\s*\{\s*"model"\s*:\s*"([^"\\]{1,120})"/);
  return m ? m[1] : null;
}

// ── Who is calling ──────────────────────────────────────────────────
async function identify(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    try {
      const claims = await verifyFirebaseIdToken(auth.slice(7).trim(), env.FIREBASE_PROJECT_ID);
      return { kind: 'user', id: claims.sub };
    } catch (_) {
      // Expired or invalid token: treated the same as no token.
    }
  }
  if (String(env.ALLOW_GUESTS).toLowerCase() === 'false') return null;
  return { kind: 'guest', id: request.headers.get('CF-Connecting-IP') || 'unknown' };
}

// Firebase ID tokens are RS256 JWTs signed by Google's securetoken service.
// Checks follow Firebase's documented rules: signature, aud, iss, exp, iat, sub.
let jwks = { keys: new Map(), expires: 0, fetchedAt: 0 };

async function loadGoogleKeys(force) {
  const now = Date.now();
  if (!force && jwks.keys.size && now < jwks.expires) return jwks.keys;
  if (force && now - jwks.fetchedAt < 60_000) return jwks.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Google keys HTTP ${res.status}`);
  const { keys = [] } = await res.json();
  const map = new Map();
  for (const jwk of keys) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    map.set(jwk.kid, await crypto.subtle.importKey(
      'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    ));
  }
  const maxAge = Number(((res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/) || [])[1]) || 3600;
  jwks = { keys: map, expires: now + maxAge * 1000, fetchedAt: now };
  return map;
}

async function verifyFirebaseIdToken(token, projectId) {
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = JSON.parse(b64urlText(parts[0]));
  const claims = JSON.parse(b64urlText(parts[1]));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('unexpected token header');
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('token is for another project');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new Error('token has no user');
  if (!(claims.exp > now) || !(claims.iat <= now + 300)) throw new Error('token expired');
  let key = (await loadGoogleKeys(false)).get(header.kid);
  if (!key) key = (await loadGoogleKeys(true)).get(header.kid);
  if (!key) throw new Error('unknown signing key');
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error('bad token signature');
  return claims;
}

function b64urlBytes(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlText(s) {
  return new TextDecoder().decode(b64urlBytes(s));
}
