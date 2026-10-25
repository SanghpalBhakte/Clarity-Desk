// Clarity Desk closed-app reminders -- Cloudflare Workers + D1, free plans.
//
// The phone works out its own upcoming class and deadline reminders and
// syncs just what a notification needs (title, body, tag, screen to open,
// fire time in UTC ms). Every minute a cron sends the ones that are due by
// Web Push and deletes them. No login: each device gets a random id and a
// secret (only its SHA-256 is stored). Chats and task descriptions are
// never sent here.
//
//   GET    /vapid      -> { publicKey }            (for pushManager.subscribe)
//   POST   /subscribe  { device?, secret?, endpoint, keys:{p256dh,auth} }
//                      -> { device, secret }
//   PUT    /sync       { device, secret, reminders:[{id,fireAt,title,body,url,tag}] }
//                      -> { stored }              (replaces the next 14 days)
//   DELETE /device     { device, secret }         (forget this device)
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (see README.md).

import { sendPush } from './webpush.mjs';

export const LIMITS = {
  maxReminders: 200,          // per device, matches PUSH_MAX_REMINDERS in app.js
  horizonMs: 15 * 86400000,   // nothing further ahead than this
  syncGapMs: 10000,           // one sync per device per 10 s
  sendPerTick: 10,            // free plan: 10 ms CPU per run; the rest go next minute
  staleMs: 30 * 60000,        // a reminder 30+ min late is dropped, not sent
  deviceIdleMs: 60 * 86400000 // devices that stop syncing are forgotten
};

const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = isAllowedOrigin(origin, env.ALLOWED_ORIGINS) ? corsHeaders(origin) : null;
    if (request.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    if (!cors) return json({ error: 'origin not allowed' }, 403);
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      console.error('request failed', err && err.message);
      return json({ error: 'server error' }, 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDue(env, Date.now()));
  },
};

async function route(request, env) {
  const { pathname } = new URL(request.url);
  const now = Date.now();
  if (request.method === 'GET' && pathname === '/vapid') {
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'bad request' }, 400);

  if (request.method === 'POST' && pathname === '/subscribe') {
    if (env.SUBSCRIBE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.SUBSCRIBE_LIMITER.limit({ key: ip });
      if (!success) return json({ error: 'slow down' }, 429);
    }
    const sub = validateSubscription(body);
    if (!sub) return json({ error: 'bad subscription' }, 400);
    return json(await subscribe(env.DB, body, sub, now));
  }
  if (request.method === 'PUT' && pathname === '/sync') {
    const auth = await authDevice(env.DB, body);
    if (auth.error) return json({ error: auth.error }, auth.status);
    if (now - (auth.row.last_sync_at || 0) < LIMITS.syncGapMs) return json({ error: 'slow down' }, 429);
    const reminders = validateReminders(body.reminders, now);
    if (!reminders) return json({ error: 'bad reminders' }, 400);
    return json({ stored: await replaceReminders(env.DB, body.device, reminders, now) });
  }
  if (request.method === 'DELETE' && pathname === '/device') {
    const auth = await authDevice(env.DB, body);
    if (auth.error) return json({ error: auth.error }, auth.status);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(body.device),
      env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(body.device),
    ]);
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

// ── Validation (exported for tests) ───────────────────────────
export function validateSubscription(body) {
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const keys = body.keys && typeof body.keys === 'object' ? body.keys : {};
  let url;
  try { url = new URL(endpoint); } catch (_) { return null; }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.test(url.hostname) || endpoint.length > 1024) return null;
  const b64 = /^[A-Za-z0-9_-]+$/;
  if (typeof keys.p256dh !== 'string' || !b64.test(keys.p256dh) || keys.p256dh.length < 80 || keys.p256dh.length > 100) return null;
  if (typeof keys.auth !== 'string' || !b64.test(keys.auth) || keys.auth.length < 16 || keys.auth.length > 32) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

export function validateReminders(list, now) {
  if (!Array.isArray(list) || list.length > LIMITS.maxReminders) return null;
  const out = [];
  const seen = new Set();
  for (const r of list) {
    if (!r || typeof r !== 'object') return null;
    const { id, fireAt, title, body, url, tag } = r;
    if (typeof id !== 'string' || !id || id.length > 200) return null;
    if (typeof tag !== 'string' || !tag || tag.length > 200) return null;
    if (typeof title !== 'string' || !title || title.length > 200) return null;
    if (typeof body !== 'string' || body.length > 300) return null;
    if (typeof url !== 'string' || !/^\.\/(\?task=[A-Za-z0-9%_.-]{1,120})?#[a-z-]{1,30}$/.test(url)) return null;
    if (!Number.isInteger(fireAt)) return null;
    if (fireAt <= now - 60000 || fireAt > now + LIMITS.horizonMs) continue; // past or too far: skip
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, fireAt, title, body, url, tag });
  }
  return out;
}

// What the phone receives. Flat on purpose: sw.js reads title/body/tag/url.
export function buildPushPayload(row) {
  return { title: row.title, body: row.body, tag: row.tag, url: row.url };
}

// A class reminder is useless once the class has started; a deadline
// reminder can still help hours later if the phone was offline.
export function pushTtlFor(tag) {
  return String(tag).startsWith('class_rem_') ? 900 : 6 * 3600;
}

// ── Devices ───────────────────────────────────────────────────
async function sha256Hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSecret() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function authDevice(db, body) {
  if (typeof body.device !== 'string' || typeof body.secret !== 'string') return { error: 'missing device', status: 401 };
  const row = await db.prepare('SELECT id, secret_hash, last_sync_at FROM devices WHERE id = ?').bind(body.device).first();
  if (!row) return { error: 'unknown device', status: 404 };
  if (row.secret_hash !== await sha256Hex(body.secret)) return { error: 'bad secret', status: 401 };
  return { row };
}

async function subscribe(db, body, sub, now) {
  if (typeof body.device === 'string' && typeof body.secret === 'string') {
    const auth = await authDevice(db, body);
    if (auth.row) {
      await db.batch([
        // The same browser subscription under another id (e.g. after the
        // app's data was reset) would get every reminder twice.
        db.prepare('DELETE FROM reminders WHERE device_id IN (SELECT id FROM devices WHERE endpoint = ? AND id != ?)').bind(sub.endpoint, body.device),
        db.prepare('DELETE FROM devices WHERE endpoint = ? AND id != ?').bind(sub.endpoint, body.device),
        db.prepare('UPDATE devices SET endpoint = ?, p256dh = ?, auth = ?, last_sync_at = 0 WHERE id = ?').bind(sub.endpoint, sub.p256dh, sub.auth, body.device),
      ]);
      return { device: body.device, secret: body.secret };
    }
  }
  const device = crypto.randomUUID();
  const secret = randomSecret();
  await db.batch([
    db.prepare('DELETE FROM reminders WHERE device_id IN (SELECT id FROM devices WHERE endpoint = ?)').bind(sub.endpoint),
    db.prepare('DELETE FROM devices WHERE endpoint = ?').bind(sub.endpoint),
    db.prepare('INSERT INTO devices (id, secret_hash, endpoint, p256dh, auth, created_at, last_sync_at) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .bind(device, await sha256Hex(secret), sub.endpoint, sub.p256dh, sub.auth, now),
  ]);
  return { device, secret };
}

// ── Sync: write only what changed (D1 free plan counts rows written) ──
export function diffReminders(existing, incoming) {
  const key = r => `${r.fire_at ?? r.fireAt}|${r.title}|${r.body}|${r.url}|${r.tag}`;
  const have = new Map(existing.map(r => [r.reminder_id, key(r)]));
  const want = new Map(incoming.map(r => [r.id, r]));
  const remove = existing.filter(r => !want.has(r.reminder_id) || key(want.get(r.reminder_id)) !== have.get(r.reminder_id)).map(r => r.reminder_id);
  const add = incoming.filter(r => have.get(r.id) !== key(r));
  return { remove, add };
}

const INSERT_COLS = 7;           // device_id, reminder_id, fire_at, title, body, url, tag
const ROWS_PER_INSERT = 14;      // D1 allows 100 bound parameters per query
const IDS_PER_DELETE = 90;

async function replaceReminders(db, device, reminders, now) {
  const { results = [] } = await db.prepare('SELECT reminder_id, fire_at, title, body, url, tag FROM reminders WHERE device_id = ? AND sent = 0').bind(device).all();
  const { remove, add } = diffReminders(results, reminders);
  const stmts = [];
  for (let i = 0; i < remove.length; i += IDS_PER_DELETE) {
    const ids = remove.slice(i, i + IDS_PER_DELETE);
    stmts.push(db.prepare(`DELETE FROM reminders WHERE device_id = ? AND sent = 0 AND reminder_id IN (${ids.map(() => '?').join(',')})`).bind(device, ...ids));
  }
  for (let i = 0; i < add.length; i += ROWS_PER_INSERT) {
    const rows = add.slice(i, i + ROWS_PER_INSERT);
    const values = rows.map(() => `(${Array(INSERT_COLS).fill('?').join(',')})`).join(',');
    // OR IGNORE: a row being sent right now (sent = 1) keeps its place.
    stmts.push(db.prepare(`INSERT OR IGNORE INTO reminders (device_id, reminder_id, fire_at, title, body, url, tag) VALUES ${values}`)
      .bind(...rows.flatMap(r => [device, r.id, r.fireAt, r.title, r.body, r.url, r.tag])));
  }
  stmts.push(db.prepare('UPDATE devices SET last_sync_at = ? WHERE id = ?').bind(now, device));
  await db.batch(stmts);
  return reminders.length;
}

// ── Cron: send what is due, then delete it ────────────────────
export async function sendDue(env, now, { fetchImpl = fetch } = {}) {
  const db = env.DB;
  await db.prepare('DELETE FROM reminders WHERE fire_at < ?').bind(now - LIMITS.staleMs).run();
  if (new Date(now).getUTCMinutes() === 0) {
    const idle = now - LIMITS.deviceIdleMs;
    await db.batch([
      db.prepare('DELETE FROM reminders WHERE device_id IN (SELECT id FROM devices WHERE last_sync_at < ? AND created_at < ?)').bind(idle, idle),
      db.prepare('DELETE FROM devices WHERE last_sync_at < ? AND created_at < ?').bind(idle, idle),
    ]);
  }
  // Claim first (sent = 1) so an overlapping run can't send the same row.
  const { results: due = [] } = await db.prepare(
    'UPDATE reminders SET sent = 1 WHERE rowid IN (SELECT rowid FROM reminders WHERE sent = 0 AND fire_at <= ? ORDER BY fire_at LIMIT ?) ' +
    'RETURNING rowid AS rid, device_id, reminder_id, title, body, url, tag'
  ).bind(now, LIMITS.sendPerTick).all();
  if (!due.length) return { sent: 0 };

  const ids = [...new Set(due.map(r => r.device_id))];
  const { results: devices = [] } = await db.prepare(`SELECT id, endpoint, p256dh, auth FROM devices WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  const byId = new Map(devices.map(d => [d.id, d]));
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
  const authCache = new Map();
  const done = [], retry = [], gone = new Set();
  let sent = 0;

  await Promise.all(due.map(async (row) => {
    const dev = byId.get(row.device_id);
    if (!dev) { done.push(row.rid); return; }
    try {
      const { status, reason } = await sendPush(dev, buildPushPayload(row), vapid, { ttl: pushTtlFor(row.tag), authCache, fetchImpl });
      // Refusals are logged (push service host, status, its reason) so a
      // reminder that never arrives can be traced. No ids, keys or text.
      if (status < 200 || status >= 300) console.log(JSON.stringify({ pushRefused: status, host: new URL(dev.endpoint).host, reason }));
      if (status === 404 || status === 410) gone.add(dev.id);
      if (status >= 200 && status < 300) sent++;
      // Push service busy: try again next minute (the stale cleanup ends it).
      if (status === 429 || status >= 500) retry.push(row.rid); else done.push(row.rid);
    } catch (err) {
      console.error('push failed', err && err.message);
      retry.push(row.rid);
    }
  }));

  const stmts = [];
  if (done.length) stmts.push(db.prepare(`DELETE FROM reminders WHERE rowid IN (${done.map(() => '?').join(',')})`).bind(...done));
  if (retry.length) stmts.push(db.prepare(`UPDATE reminders SET sent = 0 WHERE rowid IN (${retry.map(() => '?').join(',')})`).bind(...retry));
  for (const id of gone) {
    stmts.push(db.prepare('DELETE FROM reminders WHERE device_id = ?').bind(id));
    stmts.push(db.prepare('DELETE FROM devices WHERE id = ?').bind(id));
  }
  if (stmts.length) await db.batch(stmts);
  return { sent, retried: retry.length, gone: gone.size };
}

// ── HTTP helpers ──────────────────────────────────────────────
// "https://x.web.app" must match exactly; "http://localhost:*" matches any port.
export function isAllowedOrigin(origin, list) {
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
