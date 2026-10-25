// ==================================================================
// Clarity Desk: CLOSED-APP REMINDERS (push-worker/ + app.js + sw.js)
// ==================================================================
// Locked down here:
//  - buildUpcomingReminders(): the right reminders at the right UTC times
//    (worked out in IST), General + own group only, holidays skipped,
//    12-hour AM/PM text, only notification fields (no descriptions);
//  - the in-app check and the push sync build the same title/body/tag, and
//    the in-app check stands down once push is active (no double alerts);
//  - push-worker: RFC 8291 encryption vector, input validation, flat
//    payload, sync writes only what changed, cron sends then deletes, a
//    gone subscription is forgotten;
//  - sw.js: shows the flat payload with the app icon/badge, deep-links,
//    replaces an already-showing tag quietly, still skips FCM payloads.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import vm from 'vm';
import { fileURLToPath } from 'url';
import path from 'path';
import * as W from '../push-worker/webpush.mjs';
import Worker, { validateReminders, validateSubscription, buildPushPayload, pushTtlFor, diffReminders, sendDue, LIMITS } from '../push-worker/worker.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');
const swSrc = fs.readFileSync(`${ROOT}/sw.js`, 'utf8');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` -- ${detail}` : ''}`); }
};

// ── App harness (same pattern as verify_calendar.mjs) ─────────
const RealDate = Date;
let NOW = new RealDate('2026-10-19T21:00:00+05:30').getTime(); // Mon 9 PM IST
class FakeDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = globalThis;
const shown = [];
globalThis.Notification = class { constructor(title, opts) { shown.push({ title, ...opts }); } static permission = 'granted'; };
const domStub = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
globalThis.document = {
  getElementById: domStub, querySelector: () => null, querySelectorAll: () => [],
  activeElement: null, hidden: false, addEventListener() {}, removeEventListener() {},
  createElement: () => domStub(), body: { appendChild() {} },
  documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const app = new Function(`${code}\n return { state, buildUpcomingReminders, checkScheduledNotifications, buildTaskReminder, buildClassReminder, isClosedAppPushActive };`)();

const LECTURE = { subject: 'Data Structures', code: 'DS', time: '09:00', end: '10:00', room: '301', teacher: 'Prof. Rao', type: 'lecture', batches: [] };
const LAB_A2  = { subject: 'DS Lab', code: 'DSL', time: '13:30', end: '15:30', type: 'lab', batches: ['A2'] };
const LAB_B1  = { subject: 'Web Lab', code: 'WDL', time: '13:30', end: '15:30', type: 'lab', batches: ['B1'] };
const RECESS  = { subject: 'Recess', code: 'REC', time: '11:00', end: '11:15', type: 'break' };
const TT = { 0: [], 1: [LECTURE, RECESS, LAB_A2, LAB_B1], 2: [], 3: [], 4: [], 5: [], 6: [] };
const QUIZ = { id: 'c-1-wa0', title: 'DBMS quiz', subject: 'General', code: 'GEN', taskType: 'exam', dueDate: '2026-10-20', status: 'pending', isCustom: true, source: 'whatsapp', description: 'Prof: quiz tomorrow, unit 2. See you all.' };
const EARLY = { id: 'c-2', title: 'Viva', subject: 'DBMS', taskType: 'exam', dueDate: '2026-10-22', startTime: '07:30', status: 'pending', isCustom: true };
const DONE  = { id: 'c-3', title: 'Old report', taskType: 'assignment', dueDate: '2026-10-21', status: 'submitted', isCustom: true };

function setup({ prefs = {}, batch = 'A2', holiday = null } = {}) {
  localStorage.clear();
  store.cos_custom_timetable = JSON.stringify(TT);
  store.cos_user_batch = JSON.stringify(batch);
  store.cos_notif_prefs = JSON.stringify({ taskUpcoming: 'day_before', taskOverdue: 'off', classReminders: '15_min', attendanceAlerts: 'off', newNotices: 'off', dailySummaryTime: '08:00', ...prefs });
  if (holiday) store.cos_holiday = JSON.stringify(holiday);
  app.state.customTasks = [QUIZ, EARLY, DONE];
}
const ist = (s) => new RealDate(`${s}+05:30`).getTime();

console.log('\n1. buildUpcomingReminders (Mon 19 Oct 2026, 9:00 PM IST)');
setup();
let rs = app.buildUpcomingReminders();
const byTag = (t) => rs.find(r => r.tag === t);
const quizMorning = byTag('upcoming_sameday_c-1-wa0_2026-10-20');
check('Imported quiz gets its morning reminder at 8:00 AM IST on the day', quizMorning && quizMorning.fireAt === ist('2026-10-20T08:00:00'), quizMorning && new RealDate(quizMorning.fireAt).toISOString());
check('...sent as UTC 02:30', quizMorning && new RealDate(quizMorning.fireAt).toISOString() === '2026-10-20T02:30:00.000Z');
check('...with the existing title/body text', quizMorning && quizMorning.title === 'Task Due Today: DBMS quiz' && quizMorning.body === 'General · Due today!');
check('...and opens that task', quizMorning && quizMorning.url === './?task=c-1-wa0#assignments');
check('Day-before reminder already past (8 AM today) is not sent', !byTag('upcoming_daybefore_c-1-wa0_2026-10-19'));
const early = byTag('upcoming_sameday_c-2_2026-10-22');
check('7:30 AM viva: reminder an hour before (6:30 AM), not after it starts', early && early.fireAt === ist('2026-10-22T06:30:00'));
check('Day-before reminder for the viva at 8:00 AM Wed', byTag('upcoming_daybefore_c-2_2026-10-21') && byTag('upcoming_daybefore_c-2_2026-10-21').fireAt === ist('2026-10-21T08:00:00'));
check('Submitted tasks get no reminder', !rs.some(r => r.tag.includes('c-3')));
const cls = byTag('class_rem_DS_09:00_2026-10-26');
check('Monday lecture: reminder 15 min before, next Monday', cls && cls.fireAt === ist('2026-10-26T08:45:00'));
check('Class body keeps 12-hour AM/PM', cls && cls.body === 'Starts at 9:00 AM in 301 with Prof. Rao', cls && cls.body);
check('Own group lab (A2) included', !!byTag('class_rem_DSL_13:30_2026-10-26'));
check('Other group lab (B1) left out', !byTag('class_rem_WDL_13:30_2026-10-26'));
check('Recess never reminded', !rs.some(r => r.tag.startsWith('class_rem_REC')));
check('14-day window: 26 Oct is in, 2 Nov (day 15) is not', !!byTag('class_rem_DS_09:00_2026-10-26') && !byTag('class_rem_DS_09:00_2026-11-02'));
check('Only notification fields are sent (no description/chat text)', rs.every(r => Object.keys(r).sort().join(',') === 'body,fireAt,id,tag,title,url') && !JSON.stringify(rs).includes('See you all'));
check('Sorted by time, tags unique', rs.every((r, i) => i === 0 || rs[i - 1].fireAt <= r.fireAt) && new Set(rs.map(r => r.tag)).size === rs.length);
check('Every reminder passes the Worker validation', validateReminders(rs, NOW).length === rs.length);

setup({ prefs: { classReminders: '1_hour' } });
rs = app.buildUpcomingReminders();
check('1-hour lead moves the class reminder to 8:00 AM', byTag('class_rem_DS_09:00_2026-10-26')?.fireAt === ist('2026-10-26T08:00:00'));
setup({ prefs: { taskUpcoming: 'same_day' } });
rs = app.buildUpcomingReminders();
check('"Same day" setting: no day-before reminders, still the morning one', !rs.some(r => r.tag.startsWith('upcoming_daybefore_')) && !!byTag('upcoming_sameday_c-2_2026-10-22'));
setup({ prefs: { taskUpcoming: 'off', classReminders: 'off' } });
check('Both switched off: nothing synced', app.buildUpcomingReminders().length === 0);
setup({ holiday: { on: true, since: '2026-10-26', until: '2026-10-27' } });
rs = app.buildUpcomingReminders();
check('Holiday mode: no class reminders on a holiday, deadlines still come', !byTag('class_rem_DS_09:00_2026-10-26') && !!byTag('upcoming_sameday_c-2_2026-10-22'));

console.log('\n2. In-app check and push agree (dedupe)');
setup();
NOW = ist('2026-10-20T08:05:00');
shown.length = 0;
app.checkScheduledNotifications();
const quizInApp = shown.find(n => n.tag === 'upcoming_sameday_c-1-wa0_2026-10-20');
check('In-app (no push): morning due-today reminder fires with the same tag', !!quizInApp && quizInApp.body === 'General · Due today!');
NOW = ist('2026-10-26T08:50:00');
shown.length = 0;
app.checkScheduledNotifications();
check('In-app class reminder uses the same tag as push', shown.some(n => n.tag === 'class_rem_DS_09:00_2026-10-26'));
NOW = ist('2026-10-26T13:20:00');
shown.length = 0;
app.checkScheduledNotifications();
check('In-app check now applies the group filter too', shown.some(n => n.tag === 'class_rem_DSL_13:30_2026-10-26') && !shown.some(n => n.tag.startsWith('class_rem_WDL')));
setup();
store.cos_push_device = JSON.stringify({ id: 'dev', secret: 's', lastSyncOk: true, lastSyncAt: ist('2026-10-26T08:00:00') });
NOW = ist('2026-10-26T08:50:00');
shown.length = 0;
check('Push counts as active after a good sync', app.isClosedAppPushActive());
app.checkScheduledNotifications();
check('Push active: in-app check stays quiet for classes (no double alert)', !shown.some(n => n.tag.startsWith('class_rem_')));
NOW = ist('2026-11-10T08:50:00');
check('A sync older than 13 days no longer counts (in-app takes over)', !app.isClosedAppPushActive());
NOW = ist('2026-10-19T21:00:00');

// ── push-worker ───────────────────────────────────────────────
console.log('\n3. Web Push encryption (RFC 8291 worked example)');
{
  const keys = await W.importEcdhKeys('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8', 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');
  const out = await W.encryptPayload('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', { salt: W.b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), serverKeys: keys });
  const expected = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
  check('Ciphertext matches RFC 8291 section 5 byte for byte', W.b64urlEncode(out) === expected);

  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = W.b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const auth = await W.vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', { publicKey: pub, privateKey: d, subject: 'https://campusos-83365.web.app' }, 1_800_000_000);
  const [, jwt, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/) || [];
  const [h, c, s] = (jwt || '').split('.');
  const claims = JSON.parse(new TextDecoder().decode(W.b64urlDecode(c)));
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, W.b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  check('VAPID JWT: audience is the push service, signature verifies', claims.aud === 'https://fcm.googleapis.com' && claims.exp === 1_800_000_000 + 43200 && k === pub && ok);
}

console.log('\n4. Worker validation and payload');
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } };
check('Accepts a real push service subscription', !!validateSubscription(SUB));
check('Refuses any other host (no open relay)', !validateSubscription({ ...SUB, endpoint: 'https://evil.example.com/fcm.googleapis.com' }) && !validateSubscription({ ...SUB, endpoint: 'http://fcm.googleapis.com/x' }));
check('Accepts Apple and Mozilla push', !!validateSubscription({ ...SUB, endpoint: 'https://web.push.apple.com/abc' }) && !!validateSubscription({ ...SUB, endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/x' }));
const R = (o = {}) => ({ id: 'a', fireAt: NOW + 3600000, title: 'Class Starting Soon: DS', body: 'Starts at 9:00 AM', url: './#timetable', tag: 'class_rem_DS_09:00_2026-10-26', ...o });
check('Reminder with an outside link is refused', validateReminders([R({ url: 'https://evil.example.com' })], NOW) === null);
check('Past and too-far reminders are dropped, duplicates collapse', validateReminders([R(), R(), R({ id: 'b', fireAt: NOW - 3600000 }), R({ id: 'c', fireAt: NOW + 20 * 86400000 })], NOW).length === 1);
check('More than the cap is refused', validateReminders(Array.from({ length: LIMITS.maxReminders + 1 }, (_, i) => R({ id: `r${i}` })), NOW) === null);
const payload = buildPushPayload({ ...R(), device_id: 'x', rid: 1 });
check('Push payload is flat {title, body, tag, url} (sw.js FCM guard lets it through)', Object.keys(payload).sort().join(',') === 'body,tag,title,url' && !('data' in payload));
check('Class reminders expire after 15 min, deadlines after 6 h', pushTtlFor('class_rem_x') === 900 && pushTtlFor('upcoming_sameday_x') === 21600);
const dif = diffReminders([{ reminder_id: 'a', fire_at: 1, title: 't', body: 'b', url: 'u', tag: 'a' }, { reminder_id: 'gone', fire_at: 1, title: 't', body: 'b', url: 'u', tag: 'gone' }],
  [{ id: 'a', fireAt: 1, title: 't', body: 'b', url: 'u', tag: 'a' }, { id: 'new', fireAt: 2, title: 't', body: 'b', url: 'u', tag: 'new' }]);
check('Sync diff: unchanged rows are not rewritten', dif.remove.join() === 'gone' && dif.add.map(r => r.id).join() === 'new');

console.log('\n5. Worker end to end on SQLite (D1 stand-in)');
{
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(`${ROOT}/push-worker/schema.sql`, 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    run: async () => sqlite.prepare(sql).run(...args),
    _exec: () => sqlite.prepare(sql).run(...args),
  });
  const DB = { prepare: (sql) => stmt(sql), batch: async (list) => { sqlite.exec('BEGIN'); try { list.forEach(s => s._exec()); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const env = {
    DB, ALLOWED_ORIGINS: 'https://campusos-83365.web.app', VAPID_SUBJECT: 'https://campusos-83365.web.app',
    VAPID_PUBLIC_KEY: W.b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d,
  };
  globalThis.Date = RealDate; // the Worker runs on real time
  const call = async (method, p, body, origin = 'https://campusos-83365.web.app') => {
    const res = await Worker.fetch(new Request(`https://push.test${p}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, data: await res.json().catch(() => null), cors: res.headers.get('Access-Control-Allow-Origin') };
  };
  check('Unknown page origin is refused', (await call('GET', '/vapid', null, 'https://evil.example.com')).status === 403);
  const v = await call('GET', '/vapid');
  check('GET /vapid gives the public key with CORS', v.status === 200 && v.data.publicKey === env.VAPID_PUBLIC_KEY && v.cors === 'https://campusos-83365.web.app');
  const sub = await call('POST', '/subscribe', SUB);
  check('POST /subscribe returns an anonymous id and secret', sub.status === 200 && /^[0-9a-f-]{36}$/.test(sub.data.device) && sub.data.secret.length > 30);
  check('Only the hash of the secret is stored', !JSON.stringify(sqlite.prepare('SELECT * FROM devices').all()).includes(sub.data.secret));
  const now = RealDate.now();
  const list = [R({ id: 'due', tag: 'due', fireAt: now + 30000 }), R({ id: 'later', tag: 'later', fireAt: now + 86400000 })];
  check('PUT /sync with a wrong secret is refused', (await call('PUT', '/sync', { device: sub.data.device, secret: 'nope', reminders: list })).status === 401);
  const s1 = await call('PUT', '/sync', { device: sub.data.device, secret: sub.data.secret, reminders: list });
  check('PUT /sync stores the reminders', s1.status === 200 && sqlite.prepare('SELECT COUNT(*) AS n FROM reminders').get().n === 2);
  check('A second sync within 10 s is slowed down', (await call('PUT', '/sync', { device: sub.data.device, secret: sub.data.secret, reminders: list })).status === 429);
  const again = await call('POST', '/subscribe', SUB);
  check('Same browser subscribing again replaces the old device (no double pushes)', sqlite.prepare('SELECT COUNT(*) AS n FROM devices').get().n === 1 && again.data.device !== sub.data.device);

  sqlite.prepare('DELETE FROM reminders').run();
  sqlite.prepare('INSERT INTO reminders (device_id, reminder_id, fire_at, title, body, url, tag) VALUES (?,?,?,?,?,?,?),(?,?,?,?,?,?,?),(?,?,?,?,?,?,?)')
    .run(again.data.device, 'due', now - 1000, 'Class Starting Soon: DS', 'Starts at 9:00 AM', './#timetable', 'class_rem_DS',
      again.data.device, 'later', now + 3600000, 't', 'b', './#timetable', 'later',
      again.data.device, 'stale', now - 2 * 3600000, 't', 'b', './#timetable', 'stale');
  const sentTo = [];
  const fakeFetch = async (url, init) => { sentTo.push({ url, init }); return { status: 201 }; };
  const r1 = await sendDue(env, now, { fetchImpl: fakeFetch });
  const left = sqlite.prepare('SELECT reminder_id FROM reminders').all().map(r => r.reminder_id).join();
  check('Cron sends only the due reminder, encrypted, with VAPID and a 15 min TTL', r1.sent === 1 && sentTo.length === 1 && sentTo[0].url === SUB.endpoint &&
    sentTo[0].init.headers['Content-Encoding'] === 'aes128gcm' && sentTo[0].init.headers.TTL === '900' && sentTo[0].init.headers.Authorization.startsWith('vapid t='));
  check('Sent and stale rows are deleted; later ones stay', left === 'later', left);
  sqlite.prepare('UPDATE reminders SET fire_at = ?').run(now - 1000);
  const r2 = await sendDue(env, now, { fetchImpl: async () => ({ status: 410 }) });
  check('A gone subscription (410) deletes the device and its reminders', r2.gone === 1 && sqlite.prepare('SELECT COUNT(*) AS n FROM devices').get().n === 0 && sqlite.prepare('SELECT COUNT(*) AS n FROM reminders').get().n === 0);
  const s404 = await call('PUT', '/sync', { device: again.data.device, secret: again.data.secret, reminders: list });
  check('Sync from a forgotten device gets 404 (app signs up again)', s404.status === 404);
  globalThis.Date = FakeDate;
}

console.log('\n6. sw.js push handler');
{
  const listeners = {};
  const notes = [];
  const self = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    registration: {
      showNotification: async (title, opts) => { notes.push({ title, ...opts }); },
      getNotifications: async ({ tag }) => notes.filter(n => n.tag === tag),
    },
    location: { origin: 'https://campusos-83365.web.app' },
    skipWaiting() {}, clients: { claim() {} },
  };
  const ctx = { self, caches: {}, clients: {}, console: { warn() {}, log() {} }, importScripts: () => { throw new Error('offline'); }, URL, Response, fetch: async () => ({}) };
  vm.createContext(ctx);
  vm.runInContext(swSrc, ctx);
  const push = async (obj) => {
    let p;
    listeners.push({ data: { json: () => obj, text: () => JSON.stringify(obj) }, waitUntil: (x) => { p = x; } });
    await p;
  };
  await push({ title: 'Class Starting Soon: DS', body: 'Starts at 9:00 AM in 301 with Prof. Rao', tag: 'class_rem_DS_09:00_2026-10-26', url: './#timetable' });
  const n = notes[0];
  check('Flat payload shows with the app icon and monochrome badge', n && n.title === 'Class Starting Soon: DS' && n.icon === './icon-192.png' && n.badge === './badge-96.png');
  check('Click target is the payload url, tag kept, first one alerts', n && n.data.url === './#timetable' && n.tag === 'class_rem_DS_09:00_2026-10-26' && n.renotify === true);
  await push({ title: 'Class Starting Soon: DS', body: 'x', tag: 'class_rem_DS_09:00_2026-10-26', url: './#timetable' });
  check('Same tag already showing: replaced quietly (no second buzz)', notes.length === 2 && notes[1].renotify === false);
  await push({ data: { title: 'from FCM' } });
  check('FCM-shaped payloads are still left to the FCM handler', notes.length === 2);
  check('Cache version bumped (v206)', /clarity-desk-v206/.test(swSrc));
}

console.log(`\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failed) process.exit(1);
console.log('✓ ALL PUSH REMINDER TESTS PASSED');
