// ==================================================================
// Clarity Desk: FIRST SIGN-IN REVIEW (offline-first sync, step 5)
// ==================================================================
// Runs the real app.js against a fake Firestore doc (same harness idea as
// verify_sync_two_devices.mjs). A phone that already has data and signs in
// to an account that also has data must ask first ("Keep both", "Use
// account copy", "Use this phone", "Decide later"), save a safety copy
// (cos_signin_backup) before anything is written, and offer Undo.
// Ids, titles and times are made up.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
globalThis.console.warn = () => {};
const toasts = [];
const shown = [];   // ids of elements added to document.body
const domStub = (id) => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild(c) { if (id === 'toast-container' && c) toasts.push(String((c.children || []).map(x => x.textContent).join(' ') || c.textContent || c.innerHTML || '')); }, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, addEventListener() {}, lastElementChild: null });
const els = {};
globalThis.document = {
  getElementById: (id) => els[id] || null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => { const o = { tagName: tag, style: {}, children: [], textContent: '', innerHTML: '', classList: { add() {}, remove() {} }, appendChild(c) { o.children.push(c); }, remove() { if (o.id && els[o.id] === o) delete els[o.id]; }, addEventListener() {}, removeEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], focus() {} }; return o; },
  body: { appendChild(n) { if (n && n.id) { shown.push(n.id); els[n.id] = n; } } }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
els['toast-container'] = domStub('toast-container');
globalThis.confirm = () => true;

// ── Fake Firestore: one doc; set(merge) deep-merges maps and replaces arrays ──
const DELETE = { __delete: true };
class FieldPath { constructor(...segs) { this.segs = segs; } }
globalThis.firebase = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => 'ts' }, FieldPath } };
let cloud = {};
let cacheDoc = null;   // what get({source:'cache'}) returns
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
function deepMerge(t, s) { for (const k of Object.keys(s)) { if (isObj(s[k]) && isObj(t[k])) deepMerge(t[k], s[k]); else t[k] = clone(s[k] ?? null); } return t; }

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);

// A device: one app.js copy. Pass `store` to start a new session on the same phone.
function makeDevice(name, store = {}) {
  const writes = [];
  const failKeys = new Set();
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { if (failKeys.has(k)) throw new Error('QuotaExceededError'); writes.push(k); store[k] = String(v); },
    removeItem: (k) => { writes.push('-' + k); delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; }
  };
  const timers = new Map(); let tid = 0;
  const st = (fn, ms) => { const id = ++tid; timers.set(id, { fn, ms }); return id; };
  const ct = (id) => { timers.delete(id); };
  const dev = { name, store, writes, failKeys, timers, sets: [], listener: null };
  const ref = {
    set: (payload, opts) => { dev.sets.push(payload); if (opts && opts.merge) deepMerge(cloud, payload); else cloud = clone(payload); return Promise.resolve(); },
    update: (...args) => {
      for (let i = 0; i < args.length; i += 2) {
        const segs = args[i].segs; let o = cloud;
        for (let j = 0; j < segs.length - 1 && o; j++) o = o[segs[j]];
        if (o) delete o[segs[segs.length - 1]];
      }
      return Promise.resolve();
    },
    get: () => Promise.resolve(cacheDoc ? { exists: true, data: () => clone(cacheDoc) } : { exists: false }),
    onSnapshot: (opts, cb) => { dev.listener = cb; return () => { dev.listener = null; }; }
  };
  const db = { collection: () => ({ doc: () => ref }) };
  dev.app = new Function('__db', 'localStorage', 'setTimeout', 'clearTimeout', `${code}
    db = __db; currentUser = { uid: 'u1' };
    const fn = (n) => { try { return eval(n); } catch (e) { return undefined; } };
    return { state, saveCustomTasks, loadCustomTasks, subscribeUserCloudData, applyCloudDataToLocalState, syncToCloud,
      pushLocalDataToCloud, mergeRecords,
      needsSigninReview: fn('needsSigninReview'), applySigninChoice: fn('applySigninChoice'), undoSignin: fn('undoSignin'),
      localHasData: fn('localHasData'), cloudHasData: fn('cloudHasData'), signinDecideLater: fn('signinDecideLater'),
      get held() { try { return eval('signinHold'); } catch (e) { return undefined; } } };`)(db, ls, st, ct);
  dev.app.state.currentPage = 'none';
  dev.app.state.customTasks = dev.app.loadCustomTasks();
  return dev;
}

const tick = () => new Promise(r => setImmediate(r));
async function flushPush(dev) {
  for (const [id, t] of [...dev.timers]) {
    if (!/pushLocalDataToCloud/.test(String(t.fn))) continue;
    dev.timers.delete(id); t.fn();
  }
  await tick();
}
function deliver(dev) {
  if (!dev.listener) return;
  dev.listener({ exists: Object.keys(cloud).length > 0, data: () => clone(cloud), metadata: { hasPendingWrites: false } });
}

const task = (id, over = {}) => ({ id, subject: 'Physics', code: 'PHY', title: `Task ${id}`, taskType: 'assignment', noDeadline: false, description: '—', dueDate: '2099-01-01', priority: 'medium', status: 'pending', marks: 0, isCustom: true, ...over });
const section = (code, resources) => ({ subject: code + ' subj', code, color: '#394B63', resources });
const tasksOf = (dev) => JSON.parse(dev.store.cos_custom_tasks || '[]');
const ids = (list) => list.map(t => t.id).sort().join();
const TT_LOCAL = { 1: [{ time: '09:00', subject: 'Local Maths', type: 'lecture' }], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
const TT_CLOUD = { 1: [{ time: '10:00', subject: 'Cloud Physics', type: 'lecture' }], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
const DATA_KEYS = ['cos_custom_tasks', 'cos_custom_links', 'cos_custom_timetable', 'cos_timetable_choice', 'cos_attendance', 'cos_attendance_baseline', 'cos_attendance_live', 'cos_profile', 'cos_assignments', 'cos_tombstones',
  'cos_syllabus', 'cos_notif_prefs', 'cos_notice_channels', 'cos_att_target', 'cos_holiday'];
const snapshotKeys = (dev) => Object.fromEntries(DATA_KEYS.map(k => [k, dev.store[k] ?? null]));

// A phone with its own tasks, vault, timetable and marks; an account with others.
function phoneWithData(store) {
  const D = makeDevice('P', store);
  if (!store) {
    D.store.cos_custom_tasks = JSON.stringify([task('L1', { title: 'phone task' }), task('S', { title: 'shared, phone version', updatedAt: 1000 })]);
    D.store.cos_custom_links = JSON.stringify([section('PHY', [{ label: 'Phone notes', url: 'https://phone.test/n' }])]);
    D.store.cos_custom_timetable = JSON.stringify(TT_LOCAL);
    D.store.cos_attendance = JSON.stringify({ '2026-10-01': { '09:00': 'present' } });
    D.store.cos_tombstones = JSON.stringify([{ id: 'gone', deletedAt: Date.now() - 60000 }]);
    D.store.cos_syllabus = JSON.stringify([{ subject: 'Phone Maths', topics: [{ id: 'p1', title: 'Phone topic' }] }]);
    D.store.cos_notif_prefs = JSON.stringify({ enabled: false, phone: true });
    D.store.cos_notice_channels = JSON.stringify({ phone: true });
    D.store.cos_att_target = '80';
    D.store.cos_assignments = JSON.stringify({ L1: 'submitted' });
    D.app.state.customTasks = D.app.loadCustomTasks();
  }
  return D;
}
function accountWithData() {
  cloud = {
    profile: { name: 'Cloud Name' },
    customTasks: [task('C1', { title: 'account task' }), task('S', { title: 'shared, account version', updatedAt: 5000 })],
    customLinks: [section('CHE', [{ label: 'Account notes', url: 'https://cloud.test/n' }])],
    customTimetable: TT_CLOUD,
    attendance: { '2026-10-02': { '10:00': 'absent' } },
    syllabus: [{ subject: 'Cloud Physics', topics: [{ id: 'c1', title: 'Cloud topic' }] }],
    notificationPrefs: { enabled: true, cloud: true },
    noticeChannels: { cloud: true },
    attTarget: 70,
    holiday: { on: true, until: '2099-01-01' },
    assignmentStatuses: { C1: 'pending', L1: 'pending' },
    tombstones: []
  };
}
async function signIn(D) {
  D.app.subscribeUserCloudData('u1');
  await tick();
  deliver(D); await tick();
}

let total = 0, passed = 0; const errors = [];
async function check(name, fn) {
  total++;
  try {
    const res = await fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
  cacheDoc = null; shown.length = 0; toasts.length = 0;
  for (const k of Object.keys(els)) if (k !== 'toast-container') delete els[k];
}
const REVIEW_ID = 'signin-review-backdrop';

console.log('==================================================================');
console.log('FIRST SIGN-IN REVIEW (sync step 5)');
console.log('==================================================================');

await check('needsSigninReview: true only when both sides have data and the uid is new on this phone', async () => {
  const D = makeDevice('N');
  if (!D.app.needsSigninReview) return 'needsSigninReview missing';
  const a = D.app.needsSigninReview('u1', true, true), b = D.app.needsSigninReview('u1', false, true), c = D.app.needsSigninReview('u1', true, false);
  D.store.cos_signin_seen = JSON.stringify(['u1']);
  const d = D.app.needsSigninReview('u1', true, true), e = D.app.needsSigninReview('u2', true, true);
  return a && !b && !c && !d && e ? true : JSON.stringify({ a, b, c, d, e });
});

await check('localHasData / cloudHasData: tasks, vault resources, timetable and marks count; empty shells do not', async () => {
  const D = makeDevice('H');
  if (!D.app.localHasData || !D.app.cloudHasData) return 'helpers missing';
  const none = D.app.localHasData();
  D.store.cos_custom_links = JSON.stringify([section('PHY', [])]);
  const emptySection = D.app.localHasData();
  D.store.cos_attendance = JSON.stringify({ '2026-10-01': { '09:00': 'present' } });
  const marks = D.app.localHasData();
  const c0 = D.app.cloudHasData({ profile: { name: 'x' }, theme: 'paper-slate', customTasks: [], customLinks: [], attendance: {}, customTimetable: { 1: [] } });
  const c1 = D.app.cloudHasData({ customTimetable: TT_CLOUD });
  const c2 = D.app.cloudHasData({ customLinks: [section('X', [{ label: 'a', url: 'https://a.test' }])] });
  const c3 = D.app.cloudHasData({ customTasks: [task('z')] });
  return !none && !emptySection && marks && !c0 && c1 && c2 && c3 ? true : JSON.stringify({ none, emptySection, marks, c0, c1, c2, c3 });
});

await check('Empty phone signs in to an account with data: no review, the account copy is used', async () => {
  accountWithData();
  const D = makeDevice('E');
  await signIn(D);
  return !shown.includes(REVIEW_ID) && ids(tasksOf(D)) === 'C1,S' && JSON.parse(D.store.cos_signin_seen || '[]').includes('u1')
    ? true : JSON.stringify({ shown, t: ids(tasksOf(D)), seen: D.store.cos_signin_seen });
});

await check('Phone with data, account with no doc: no review, the phone copy is pushed (existing path)', async () => {
  cloud = {};
  const D = phoneWithData();
  await signIn(D);
  return !shown.includes(REVIEW_ID) && D.sets.length === 1 && ids(cloud.customTasks) === 'L1,S'
    ? true : JSON.stringify({ shown, sets: D.sets.length });
});

await check('Both have data: the review opens and NOTHING is written (only the safety copy) and nothing is pushed until a choice', async () => {
  accountWithData();
  const D = phoneWithData();
  const before = snapshotKeys(D);
  const cloudBefore = JSON.stringify(cloud);
  D.writes.length = 0;
  await signIn(D);
  cacheDoc = clone(cloud);                      // cache read also held
  D.app.subscribeUserCloudData('u1'); await tick(); deliver(D); await tick();
  await flushPush(D);
  // A local edit while waiting must not push either.
  D.app.state.customTasks = [...D.app.state.customTasks, task('L2')];
  D.app.saveCustomTasks();
  await flushPush(D);
  const after = snapshotKeys(D);
  delete after.cos_custom_tasks; delete before.cos_custom_tasks;   // the student's own edit
  const dataWrites = D.writes.filter(k => k !== 'cos_signin_backup' && !['cos_custom_tasks', 'cos_tombstones', 'cos_sync_clock'].includes(k));
  return shown.includes(REVIEW_ID) && D.sets.length === 0 && JSON.stringify(cloud) === cloudBefore
    && JSON.stringify(after) === JSON.stringify(before) && dataWrites.length === 0 && D.app.held && D.app.held.uid === 'u1'
    ? true : JSON.stringify({ shown, sets: D.sets.length, dataWrites, held: !!D.app.held, diff: DATA_KEYS.filter(k => after[k] !== before[k]).map(k => [k, before[k], after[k]]) });
});

await check('cos_signin_backup is saved before any write, with tasks, vault (no file bytes), timetable, marks, tombstones', async () => {
  accountWithData();
  const D = phoneWithData();
  D.store.cos_custom_links = JSON.stringify([section('PHY', [{ label: 'Phone notes', url: 'https://phone.test/n' }, { label: 'scan.pdf', url: 'data:application/pdf;base64,QUJD' }])]);
  D.writes.length = 0;
  await signIn(D);
  const b = JSON.parse(D.store.cos_signin_backup || 'null');
  if (!b || !b.keys) return 'no backup';
  // Stored strings as they were (exact Undo); the vault in cloud shape.
  const k = (key) => JSON.parse(b.keys[key] || 'null');
  const firstData = D.writes.findIndex(x => x !== 'cos_signin_backup');
  const okShape = ids(k('cos_custom_tasks')) === 'L1,S' && JSON.stringify(k('cos_custom_timetable')) === JSON.stringify(TT_LOCAL)
    && k('cos_attendance')['2026-10-01'] && k('cos_tombstones').length === 1 && b.uid === 'u1'
    && !b.keys.cos_custom_links.includes('data:') && k('cos_custom_links')[0].resources.length === 2;
  if (!D.app.applySigninChoice) return 'applySigninChoice missing';
  D.writes.length = 0;
  D.app.applySigninChoice('both', clone(cloud));
  return okShape && firstData === -1 && D.writes[0] === 'cos_signin_backup' ? true : JSON.stringify({ okShape, firstData, w: D.writes.slice(0, 3), b });
});

await check("'both' equals the per-record merge (mergeRecords), then the uid is marked seen", async () => {
  accountWithData();
  const D = phoneWithData();
  const local = tasksOf(D), cloudTasks = clone(cloud.customTasks);
  await signIn(D);
  if (!D.app.applySigninChoice) return 'applySigninChoice missing';
  const seenBefore = (D.store.cos_signin_seen || '').includes('u1');
  D.app.applySigninChoice('both', clone(cloud));
  const expect = D.app.mergeRecords(local, cloudTasks, [], t => t.id).merged;
  const got = tasksOf(D);
  const S = got.find(t => t.id === 'S');
  // Vault and tombstones merged too; timetable/marks come from the account (as before).
  const links = JSON.parse(D.store.cos_custom_links);
  return ids(got) === ids(expect) && S.title === 'shared, account version' && !seenBefore && D.store.cos_signin_seen.includes('u1')
    && links.map(s => s.code).sort().join() === 'CHE,PHY' && !D.app.held && shown.includes(REVIEW_ID) && !els[REVIEW_ID]
    ? true : JSON.stringify({ got: ids(got), expect: ids(expect), S, links: links.map(s => s.code) });
});

await check("'cloud' uses the account copy for tasks, vault, timetable and marks on this phone; the phone's own items are not pushed", async () => {
  accountWithData();
  const D = phoneWithData();
  await signIn(D);
  if (!D.app.applySigninChoice) return 'applySigninChoice missing';
  D.app.applySigninChoice('cloud', clone(cloud));
  await flushPush(D); deliver(D); await tick(); await flushPush(D);
  const links = JSON.parse(D.store.cos_custom_links);
  const ok = ids(tasksOf(D)) === 'C1,S' && tasksOf(D).find(t => t.id === 'S').title === 'shared, account version'
    && links.map(s => s.code).join() === 'CHE' && D.store.cos_custom_timetable === JSON.stringify(TT_CLOUD)
    && Object.keys(JSON.parse(D.store.cos_attendance)).join() === '2026-10-02'
    && !cloud.customTasks.some(t => t.id === 'L1');
  return ok ? true : JSON.stringify({ t: tasksOf(D).map(t => t.id + ':' + t.title), links: links.map(s => s.code), tt: D.store.cos_custom_timetable, cloudT: cloud.customTasks.map(t => t.id) });
});

await check("'device' keeps this phone's data (its version wins), keeps account-only items, and pushes", async () => {
  accountWithData();
  const D = phoneWithData();
  await signIn(D);
  if (!D.app.applySigninChoice) return 'applySigninChoice missing';
  D.app.applySigninChoice('device', clone(cloud));
  await flushPush(D);
  const S = tasksOf(D).find(t => t.id === 'S');
  const cS = (cloud.customTasks || []).find(t => t.id === 'S');
  const ok = ids(tasksOf(D)) === 'C1,L1,S' && S.title === 'shared, phone version' && cS && cS.title === 'shared, phone version'
    && D.store.cos_custom_timetable === JSON.stringify(TT_LOCAL) && JSON.stringify(cloud.customTimetable) === JSON.stringify(TT_LOCAL)
    && cloud.attendance['2026-10-01'] && cloud.customTasks.some(t => t.id === 'L1') && D.sets.length >= 1
    && JSON.parse(D.store.cos_profile || '{}').name !== 'Cloud Name';
  return ok ? true : JSON.stringify({ t: tasksOf(D).map(t => t.id + ':' + t.title), sets: D.sets.length, cT: (cloud.customTasks || []).map(t => t.id + ':' + t.title), tt: cloud.customTimetable });
});

await check('undoSignin() restores the exact earlier tasks, vault, timetable and marks (after each choice); nothing is pushed', async () => {
  const res = [];
  for (const choice of ['both', 'cloud', 'device']) {
    accountWithData();
    const D = phoneWithData();
    const before = snapshotKeys(D);
    await signIn(D);
    if (!D.app.undoSignin) return 'undoSignin missing';
    D.app.applySigninChoice(choice, clone(cloud));
    toasts.length = 0;
    const setsBefore = D.sets.length;
    const ok = D.app.undoSignin();
    await flushPush(D);
    const after = snapshotKeys(D);
    const same = DATA_KEYS.every(k => after[k] === before[k]);
    res.push({ choice, ok, same, pushed: D.sets.length - setsBefore, state: ids(D.app.state.customTasks), diff: DATA_KEYS.filter(k => after[k] !== before[k]) });
  }
  return res.every(r => r.ok && r.same && r.pushed === 0 && r.state === 'L1,S') ? true : JSON.stringify(res);
});

await check('An Undo toast is shown after a choice', async () => {
  accountWithData();
  const D = phoneWithData();
  await signIn(D);
  if (!D.app.applySigninChoice) return 'applySigninChoice missing';
  toasts.length = 0;
  D.app.applySigninChoice('both', clone(cloud));
  const t = els['toast-container'];
  return toasts.some(x => /kept|account|phone/i.test(x)) ? true : JSON.stringify(toasts);
});

await check('Second sign-in with the same uid never asks again', async () => {
  accountWithData();
  const D = phoneWithData();
  await signIn(D);
  if (!D.app.applySigninChoice) return 'applySigninChoice missing';
  D.app.applySigninChoice('both', clone(cloud));
  shown.length = 0;
  // Next session on the same phone, the account changed on another device meanwhile.
  cloud.customTasks = [...cloud.customTasks, task('C2', { title: 'new elsewhere' })];
  const D2 = makeDevice('P2', D.store);
  await signIn(D2);
  return !shown.includes(REVIEW_ID) && tasksOf(D2).some(t => t.id === 'C2') && !D2.app.held ? true : JSON.stringify({ shown, t: ids(tasksOf(D2)) });
});

await check('"Decide later" keeps local data untouched, sends no push this session, and asks again next session', async () => {
  accountWithData();
  const D = phoneWithData();
  const before = snapshotKeys(D);
  await signIn(D);
  if (!D.app.signinDecideLater) return 'signinDecideLater missing';
  D.app.signinDecideLater();
  const closed = !els[REVIEW_ID];
  shown.length = 0;
  D.app.syncToCloud(); await flushPush(D);
  D.app.subscribeUserCloudData('u1'); await tick(); deliver(D); await tick(); await flushPush(D);   // app shown again
  const askedAgainSameSession = shown.includes(REVIEW_ID);
  const same = DATA_KEYS.every(k => snapshotKeys(D)[k] === before[k]);
  const D2 = makeDevice('P2', D.store);
  await signIn(D2);
  return closed && !askedAgainSameSession && same && D.sets.length === 0 && shown.includes(REVIEW_ID) && !(D.store.cos_signin_seen || '').includes('u1')
    ? true : JSON.stringify({ closed, askedAgainSameSession, same, sets: D.sets.length, next: shown });
});

await check('If the safety copy cannot be saved, the review says so and the choice falls back to "Keep both"', async () => {
  accountWithData();
  const D = phoneWithData();
  D.failKeys.add('cos_signin_backup');
  await signIn(D);
  const modal = els[REVIEW_ID];
  const said = !!modal && /safety copy/i.test(modal.innerHTML || '');
  if (!D.app.applySigninChoice) return 'applySigninChoice missing';
  const local = tasksOf(D), cloudTasks = clone(cloud.customTasks);
  const used = D.app.applySigninChoice('cloud', clone(cloud));
  const expect = D.app.mergeRecords(local, cloudTasks, [], t => t.id).merged;
  return said && used === 'both' && ids(tasksOf(D)) === ids(expect) && toasts.some(x => /safety copy/i.test(x))
    ? true : JSON.stringify({ said, used, t: ids(tasksOf(D)), toasts });
});

await check('A phone that was already syncing before this update (cos_sync_last_pushed, no cos_signin_seen) is not asked', async () => {
  accountWithData();
  const D = phoneWithData();
  D.store.cos_sync_last_pushed = JSON.stringify({ attendance: {}, attendanceBaseline: {}, attendanceLive: {} });
  await signIn(D);
  return !shown.includes(REVIEW_ID) && ids(tasksOf(D)) === 'C1,L1,S' ? true : JSON.stringify({ shown, t: ids(tasksOf(D)) });
});

await check("After 'both' and 'cloud' the syllabus and settings change; undoSignin restores them byte for byte", async () => {
  const res = [];
  for (const choice of ['both', 'cloud']) {
    accountWithData();
    const D = phoneWithData();
    const before = snapshotKeys(D);
    await signIn(D);
    if (!D.app.applySigninChoice) return 'applySigninChoice missing';
    D.app.applySigninChoice(choice, clone(cloud));
    const changed = ['cos_syllabus', 'cos_notif_prefs', 'cos_att_target', 'cos_holiday'].every(k => D.store[k] !== before[k]);
    D.app.undoSignin();
    const back = ['cos_syllabus', 'cos_notif_prefs', 'cos_notice_channels', 'cos_att_target', 'cos_holiday'].filter(k => (D.store[k] ?? null) !== before[k]);
    res.push({ choice, changed, back });
  }
  return res.every(r => r.changed && !r.back.length) ? true : JSON.stringify(res);
});

await check("'device' keeps this phone's task statuses and pushes them, not the account's", async () => {
  accountWithData();
  const D = phoneWithData();
  await signIn(D);
  if (!D.app.applySigninChoice) return 'applySigninChoice missing';
  D.app.applySigninChoice('device', clone(cloud));
  await flushPush(D);
  const local = JSON.parse(D.store.cos_assignments || '{}');
  return local.L1 === 'submitted' && cloud.assignmentStatuses.L1 === 'submitted' ? true : JSON.stringify({ local, cloud: cloud.assignmentStatuses });
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ FIRST SIGN-IN REVIEW TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL FIRST SIGN-IN REVIEW TESTS PASSED! 🚀');
process.exit(0);
