// =====================================================================
// Clarity Desk -- feedback relay (Cloudflare Worker, free plan)
// =====================================================================
// Receives the in-app "Tell me what breaks" form and forwards it to a
// private Telegram chat through the Bot API. The bot token and chat id are
// Worker secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID); they never reach
// the browser.
//
//   POST /          the in-app form, multipart/form-data:
//           type        bug | feedback | idea
//           message     text, up to 2000 characters
//           version     app version number (auto-filled)
//           route       page name (auto-filled)
//           device      Android | iPhone/iPad | Windows | Mac | Other
//           mode        installed app | browser
//           screenshot  optional image file
//   POST /telegram  Telegram webhook (secret header): replies to anyone who
//                   messages the bot, telling them to use the form in the app.
//
// Protection: only pages from ALLOWED_ORIGINS, a hard body cap, and a
// per-IP rate limit. The Origin header is only a browser-side guard (other
// clients can fake it); the size cap and rate limit are what stop abuse.
// The screenshot is passed to Telegram as an opaque file and never decoded.
// =====================================================================

const MAX_BODY_BYTES = 1.2 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 2000;
const TYPES = { bug: '🐞 Bug', feedback: '💬 Feedback', idea: '💡 Idea' };
const DEVICES = ['Android', 'iPhone/iPad', 'Windows', 'Mac', 'Other'];
const MODES = ['installed app', 'browser'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/telegram') return handleTelegramUpdate(request, env);

    const origin = request.headers.get('Origin') || '';
    const cors = isAllowedOrigin(origin, env.ALLOWED_ORIGINS) ? corsHeaders(origin) : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    }
    if (!cors) return json(403, { ok: false, error: 'This site is not allowed to send feedback.' }, null);
    if (request.method !== 'POST') return json(405, { ok: false, error: 'Use POST.' }, cors);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json(501, { ok: false, error: 'Feedback is not set up on the server yet.' }, cors);
    }

    if (env.FEEDBACK_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.FEEDBACK_LIMITER.limit({ key: ip });
      if (!success) return json(429, { ok: false, error: 'Too many reports. Wait a minute and try again.' }, cors, { 'Retry-After': '60' });
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!/^multipart\/form-data\b/i.test(contentType)) {
      return json(415, { ok: false, error: 'Send the form as multipart/form-data.' }, cors);
    }
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) return tooLarge(cors);
    const bytes = await readCapped(request.body, MAX_BODY_BYTES);
    if (bytes === null) return tooLarge(cors);

    let form;
    try {
      form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData();
    } catch (_) {
      return json(400, { ok: false, error: 'Could not read the form.' }, cors);
    }

    const type = TYPES[form.get('type')] ? form.get('type') : null;
    const message = clean(form.get('message'), MAX_MESSAGE_CHARS);
    if (!type) return json(400, { ok: false, error: 'Pick a type: bug, feedback or idea.' }, cors);
    if (!message) return json(400, { ok: false, error: 'Write a message first.' }, cors);

    const version = /^\d{1,6}$/.test(String(form.get('version'))) ? `v${form.get('version')}` : 'v?';
    const route = clean(form.get('route'), 30).replace(/[^\w#/.-]/g, '') || '?';
    const device = DEVICES.includes(form.get('device')) ? form.get('device') : 'Other';
    const mode = MODES.includes(form.get('mode')) ? form.get('mode') : 'browser';
    const text = `${TYPES[type]} · Clarity Desk ${version}\n${route} · ${device} · ${mode}\n\n${message}`;

    const sent = await telegram(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text });
    if (!sent.ok) return json(502, { ok: false, error: 'Could not reach Telegram. Try again in a moment.' }, cors);

    let photo = null;
    const shot = form.get('screenshot');
    if (shot && typeof shot === 'object' && shot.size > 0) {
      if (!/^image\/(jpeg|png|webp)$/i.test(shot.type)) {
        photo = false;
      } else {
        const out = new FormData();
        out.set('chat_id', env.TELEGRAM_CHAT_ID);
        out.set('reply_to_message_id', String(sent.result?.message_id || ''));
        out.set('photo', shot, 'screenshot.jpg');
        photo = (await telegram(env, 'sendPhoto', out)).ok;
      }
    }
    return json(200, { ok: true, photo }, cors);
  },
};

// One retry after a network error, a 429 or a 5xx, so a Telegram hiccup does
// not lose a report.
async function telegram(env, method, payload) {
  const isForm = payload instanceof FormData;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        body: isForm ? payload : JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok === true) return { ok: true, result: data.result };
      if (res.status !== 429 && res.status < 500) return { ok: false };
    } catch (_) { /* network error: fall through to the retry */ }
    if (attempt === 0) await new Promise(r => setTimeout(r, 700));
  }
  return { ok: false };
}

// Replies to anyone who writes to the bot (Telegram calls this as a webhook).
// Reports flow one way, app -> this chat, so the bot says where to report.
const BOT_REPLY = 'Hi, this is the Clarity Desk feedback bot.\n\n'
  + 'Bug reports, feedback and ideas reach the developer from inside the app: open Clarity Desk, go to Settings, and use "Tell me what breaks". You can attach a screenshot.\n\n'
  + 'Messages typed here do not reach the developer, so please use the form in the app.';

async function handleTelegramUpdate(request, env) {
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405 });
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return new Response('Not set up.', { status: 501 });
  const given = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!sameString(given, env.TELEGRAM_WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });
  if (Number(request.headers.get('Content-Length') || 0) > 64 * 1024) return new Response('ok');
  let update;
  try { update = await request.json(); } catch (_) { return new Response('ok'); }
  const msg = update && update.message;
  // Only private chats, and never our own reports: ignore anything not typed by a person.
  if (msg && msg.chat && msg.chat.type === 'private' && msg.from && !msg.from.is_bot) {
    await telegram(env, 'sendMessage', { chat_id: msg.chat.id, text: BOT_REPLY });
  }
  return new Response('ok');
}

function sameString(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Strips control characters (keeps newlines/tabs), trims, caps the length.
function clean(value, max) {
  return String(value ?? '').replace(/[^\S\n\t ]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(status, data, cors, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...(cors || {}), ...extra, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function tooLarge(cors) {
  return json(413, { ok: false, error: 'That report is too large. Try a smaller screenshot or leave it out.' }, cors);
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
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}
