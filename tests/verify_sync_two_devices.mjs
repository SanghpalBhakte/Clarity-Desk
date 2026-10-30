// ==================================================================
// Clarity Desk: TWO DEVICES, ONE CLOUD COPY (offline-first sync, step 4)
// ==================================================================
// Runs two copies of the real app.js (each with its own localStorage and
// timers) against one fake Firestore doc. Covers the per-record merge on
// apply, tombstones in the cloud doc, the push guards (size, same-hash
// skip, back-off) and the two Task 3 review items (restore rollback,
// 14-day prune). Ids, titles and times are made up.
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
const domStub = (id) => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild(c) { if (id === 'toast-container' && c) toasts.push(String((c.children || []).map(x => x.textContent).join(' ') || c.textContent || c.innerHTML || '')); }, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, addEventListener() {} });
const els = {};
globalThis.document = {
  getElementById: (id) => els[id] || (els[id] = domStub(id)), querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => { const o = { tagName: tag, style: {}, children: [], textContent: '', innerHTML: '', classList: { add() {}, remove() {} }, appendChild(c) { o.children.push(c); }, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }; return o; },
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
globalThis.confirm = () => true;
let readerText = '';
globalThis.FileReader = class { readAsText() { Promise.resolve().then(() => this.onload({ target: { result: readerText } })); } };

// ── Fake Firestore: one doc; set(merge) deep-merges maps and replaces arrays ──
const DELETE = { __delete: true };
class FieldPath { constructor(...segs) { this.segs = segs; } }
globalThis.firebase = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => 'ts' }, FieldPath } };
let cloud = {};
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
function deepMerge(t, s) { for (const k of Object.keys(s)) { if (isObj(s[k]) && isObj(t[k])) deepMerge(t[k], s[k]); else t[k] = clone(s[k] ?? null); } return t; }

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);

function makeDevice(name) {
  const store = {};
  const failKeys = new Set();
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { if (failKeys.has(k)) throw new Error('QuotaExceededError'); store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; }
  };
  const timers = new Map(); let tid = 0;
  const st = (fn, ms) => { const id = ++tid; timers.set(id, { fn, ms }); return id; };
  const ct = (id) => { timers.delete(id); };
  const dev = { name, store, failKeys, timers, sets: [], listener: null, failSet: null };
  const ref = {
    set: (payload, opts) => {
      dev.sets.push(payload);
      if (dev.failSet) return Promise.reject({ code: dev.failSet });
      if (opts && opts.merge) deepMerge(cloud, payload); else cloud = clone(payload);
      return Promise.resolve();
    },
    update: (...args) => {
      for (let i = 0; i < args.length; i += 2) {
        const segs = args[i].segs; let o = cloud;
        for (let j = 0; j < segs.length - 1 && o; j++) o = o[segs[j]];
        if (o) delete o[segs[segs.length - 1]];
      }
      return Promise.resolve();
    },
    get: () => Promise.resolve({ exists: false }),
    onSnapshot: (opts, cb) => { dev.listener = cb; return () => { dev.listener = null; }; }
  };
  const db = { collection: () => ({ doc: () => ref }) };
  dev.app = new Function('__db', 'localStorage', 'setTimeout', 'clearTimeout', `${code}
    db = __db; currentUser = { uid: 'u1' };
    return { state, saveCustomTasks, saveCustomLinks, loadCustomTasks, pushLocalDataToCloud, applyCloudDataToLocalState,
      subscribeUserCloudData, calculatePayloadHash, importData, syncToCloud, onCloudPushError,
      pushGuard: typeof pushGuard === 'function' ? pushGuard : undefined,
      nextPushDelay: typeof nextPushDelay === 'function' ? nextPushDelay : undefined,
      get pushFailed() { return cloudPushFailed; } };`)(db, ls, st, ct);
  dev.app.state.currentPage = 'none';
  return dev;
}

const tick = () => new Promise(r => setImmediate(r));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Run this device's pending cloud pushes (the 2.5 s debounce and retries).
async function flushPush(dev, onlyMs) {
  for (const [id, t] of [...dev.timers]) {
    if (!/pushLocalDataToCloud/.test(String(t.fn))) continue;
    if (onlyMs != null && t.ms !== onlyMs) continue;
    dev.timers.delete(id); t.fn();
  }
  await tick();
}
function deliver(dev, pending = false) {
  if (!dev.listener) return;
  dev.listener({ exists: Object.keys(cloud).length > 0, data: () => clone(cloud), metadata: { hasPendingWrites: pending } });
}
async function settle(devs) {
  for (let round = 0; round < 10; round++) {
    const before = devs.reduce((n, d) => n + d.sets.length, 0);
    for (const d of devs) { deliver(d); await tick(); await flushPush(d); }
    if (devs.reduce((n, d) => n + d.sets.length, 0) === before) return round;
  }
  throw new Error('devices never settled (ping-pong)');
}

const task = (id, over = {}) => ({ id, subject: 'Physics', code: 'PHY', title: `Task ${id}`, taskType: 'assignment', noDeadline: false, description: '—', dueDate: '2099-01-01', priority: 'medium', status: 'pending', marks: 0, isCustom: true, ...over });
const tasksOf = (dev) => JSON.parse(dev.store.cos_custom_tasks || '[]');
const linksOf = (dev) => JSON.parse(dev.store.cos_custom_links || '[]');
const stonesOf = (dev) => JSON.parse(dev.store.cos_tombstones || '[]');
const byId = (dev, id) => tasksOf(dev).find(t => t.id === id);
const section = (code, resources) => ({ subject: code + ' subj', code, color: '#394B63', resources });

// Two devices that start from the same synced cloud copy.
async function pair(startTasks, startLinks) {
  cloud = {};
  const A = makeDevice('A'), B = makeDevice('B');
  for (const d of [A, B]) {
    if (startTasks) d.store.cos_custom_tasks = JSON.stringify(startTasks);
    if (startLinks) d.store.cos_custom_links = JSON.stringify(startLinks);
    d.app.state.customTasks = d.app.loadCustomTasks();
  }
  A.app.pushLocalDataToCloud('u1');
  await tick();
  for (const d of [A, B]) d.app.subscribeUserCloudData('u1');
  await settle([A, B]);
  A.sets.length = 0; B.sets.length = 0;
  return [A, B];
}
function edit(dev, id, over) {
  dev.app.state.customTasks = dev.app.state.customTasks.map(t => (t.id === id ? { ...t, ...over } : t));
  dev.app.saveCustomTasks();
}
function remove(dev, id) {
  dev.app.state.customTasks = dev.app.state.customTasks.filter(t => t.id !== id);
  dev.app.saveCustomTasks();
}

let total = 0, passed = 0; const errors = [];
async function check(name, fn) {
  total++;
  try {
    const res = await fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

console.log('==================================================================');
console.log('TWO DEVICES, ONE CLOUD COPY (sync step 4)');
console.log('==================================================================');

await check('A and B each edit a different task offline, then both sync: both edits survive on both', async () => {
  const [A, B] = await pair([task('t1'), task('t2')]);
  edit(A, 't1', { title: 'A edit' });
  await sleep(2);
  edit(B, 't2', { title: 'B edit' });
  await flushPush(A); await flushPush(B);          // B's whole array lands last
  await settle([A, B]);
  const ok = [A, B].every(d => byId(d, 't1').title === 'A edit' && byId(d, 't2').title === 'B edit');
  const c = cloud.customTasks.map(t => t.title).sort().join();
  return ok && c === 'A edit,B edit' ? true : JSON.stringify({ A: tasksOf(A).map(t => t.title), B: tasksOf(B).map(t => t.title), c });
});

await check('Same task edited on both: the later stamp wins on both', async () => {
  const [A, B] = await pair([task('t1')]);
  edit(A, 't1', { title: 'older' });
  await sleep(3);
  edit(B, 't1', { title: 'newer' });
  await flushPush(B); await flushPush(A);          // the older edit is pushed last
  await settle([A, B]);
  return [A, B].every(d => byId(d, 't1').title === 'newer') && cloud.customTasks[0].title === 'newer'
    ? true : JSON.stringify({ A: byId(A, 't1').title, B: byId(B, 't1').title, c: cloud.customTasks });
});

await check('A deletes a task, B (not editing it) syncs: it stays deleted on both', async () => {
  const [A, B] = await pair([task('t1'), task('t2')]);
  remove(A, 't1');
  edit(B, 't2', { title: 'B edit' });               // B still has the stale t1
  await flushPush(A); await flushPush(B);
  await settle([A, B]);
  const ok = [A, B].every(d => !byId(d, 't1') && byId(d, 't2').title === 'B edit');
  return ok && !cloud.customTasks.some(t => t.id === 't1') && cloud.tombstones.some(s => s.id === 't1')
    ? true : JSON.stringify({ A: tasksOf(A).map(t => t.id), B: tasksOf(B).map(t => t.id), c: cloud.customTasks.map(t => t.id), s: cloud.tombstones });
});

await check('B edits the task after A deleted it: the task comes back on both', async () => {
  const [A, B] = await pair([task('t1')]);
  remove(A, 't1');
  await sleep(3);
  edit(B, 't1', { title: 'still needed' });
  await flushPush(A); await flushPush(B);
  await settle([A, B]);
  return [A, B].every(d => byId(d, 't1') && byId(d, 't1').title === 'still needed')
    ? true : JSON.stringify({ A: tasksOf(A), B: tasksOf(B) });
});

await check('A snapshot with hasPendingWrites, or an older cloud copy, never overwrites an unsynced local edit', async () => {
  const [A] = await pair([task('t1')]);
  const stale = clone(cloud);
  edit(A, 't1', { title: 'local, not pushed yet' });
  A.listener({ exists: true, data: () => clone(stale), metadata: { hasPendingWrites: true } });
  const keep1 = byId(A, 't1').title === 'local, not pushed yet';
  A.listener({ exists: true, data: () => ({ ...clone(stale), attTarget: 80 }), metadata: { hasPendingWrites: false } });
  const keep2 = byId(A, 't1').title === 'local, not pushed yet' && A.app.state.customTasks[0].title === 'local, not pushed yet';
  return keep1 && keep2 ? true : JSON.stringify({ keep1, keep2, t: tasksOf(A) });
});

await check('A merge whose result equals the cloud copy makes zero writes', async () => {
  const [A, B] = await pair([task('t1'), task('t2')]);
  edit(B, 't2', { title: 'B edit' });
  await flushPush(B);
  B.sets.length = 0;
  deliver(A); await tick(); await flushPush(A);
  deliver(A); await tick(); await flushPush(A);
  A.app.applyCloudDataToLocalState(clone(cloud)); await flushPush(A);
  return A.sets.length === 0 && byId(A, 't2').title === 'B edit' ? true : `A wrote ${A.sets.length} time(s)`;
});

await check('pushGuard measures UTF-8 bytes: ok / warn at 700 KB / full at 900 KB', async () => {
  const { app } = makeDevice('G');
  if (!app.pushGuard) return 'pushGuard missing';
  const g1 = app.pushGuard({ a: 'x'.repeat(1000) });
  const g2 = app.pushGuard({ a: 'x'.repeat(750000) });
  const g3 = app.pushGuard({ a: 'x'.repeat(950000) });
  const g4 = app.pushGuard({ a: 'é'.repeat(400000) });   // 800 KB in UTF-8, 400 K chars
  return g1.level === 'ok' && g1.ok && g2.level === 'warn' && g2.ok && g3.level === 'full' && !g3.ok && g4.level === 'warn' && g3.bytes > 950000
    ? true : JSON.stringify([g1, g2, g3, g4]);
});

await check('A ~950 KB payload skips set() and reports a full cloud copy; data stays on the device', async () => {
  cloud = {};
  const D = makeDevice('D');
  D.store.cos_custom_links = JSON.stringify([section('PHY', [{ label: 'big', url: 'https://x.test/' + 'a'.repeat(950000) }])]);
  toasts.length = 0;
  D.app.pushLocalDataToCloud('u1');
  await tick();
  const msg = toasts.join(' | ');
  return D.sets.length === 0 && D.app.pushFailed === 'cloud-full' && /full/i.test(msg) && /safe on this device/i.test(msg) && linksOf(D)[0].resources.length === 1
    ? true : JSON.stringify({ sets: D.sets.length, failed: D.app.pushFailed, msg });
});

await check('nextPushDelay: 5 s, 30 s, 2 min, then stop', async () => {
  const { app } = makeDevice('N');
  if (!app.nextPushDelay) return 'nextPushDelay missing';
  const seq = [1, 2, 3, 4, 5].map(app.nextPushDelay);
  return JSON.stringify(seq) === JSON.stringify([5000, 30000, 120000, null, null]) ? true : JSON.stringify(seq);
});

await check('A failed push retries after 5 s, then 30 s; success resets the back-off', async () => {
  cloud = {};
  const D = makeDevice('R');
  D.store.cos_custom_tasks = JSON.stringify([task('t1')]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.failSet = 'unavailable';
  D.app.pushLocalDataToCloud('u1'); await tick(); await tick();
  const first = [...D.timers.values()].filter(t => /pushLocalDataToCloud/.test(String(t.fn))).map(t => t.ms);
  await flushPush(D, 5000); await tick();
  const second = [...D.timers.values()].filter(t => /pushLocalDataToCloud/.test(String(t.fn))).map(t => t.ms);
  D.failSet = null;
  await flushPush(D, 30000); await tick();
  const after = [...D.timers.values()].filter(t => /pushLocalDataToCloud/.test(String(t.fn))).length;
  return first.join() === '5000' && second.join() === '30000' && D.sets.length === 3 && after === 0 && cloud.customTasks
    ? true : JSON.stringify({ first, second, sets: D.sets.length, after });
});

await check('Pushing the same data twice writes once (same-hash skip)', async () => {
  cloud = {};
  const D = makeDevice('S');
  D.store.cos_custom_tasks = JSON.stringify([task('t1')]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.app.pushLocalDataToCloud('u1'); await tick();
  D.app.pushLocalDataToCloud('u1'); await tick();
  edit(D, 't1', { title: 'changed' }); await flushPush(D);
  return D.sets.length === 2 ? true : `${D.sets.length} writes`;
});

await check('The sync hash changes when only a vault resource changes (and with tombstones)', async () => {
  const { app } = makeDevice('H');
  const base = { customTasks: [task('t1')], customLinks: [section('PHY', [{ label: 'A', url: 'https://x.test/a' }])], tombstones: [] };
  const v = clone(base); v.customLinks[0].resources[0].url = 'https://x.test/a2';
  const s = clone(base); s.tombstones = [{ id: 'x', deletedAt: 5 }];
  return app.calculatePayloadHash(base) !== app.calculatePayloadHash(v) && app.calculatePayloadHash(base) !== app.calculatePayloadHash(s)
    ? true : 'vault / tombstone change ignored by the hash';
});

await check('Old-app cloud doc (no updatedAt, no tombstones field) merges without losing local tasks', async () => {
  cloud = { customTasks: [task('c1'), task('shared', { title: 'cloud title' })] };
  const D = makeDevice('O');
  D.store.cos_custom_tasks = JSON.stringify([task('local1', { updatedAt: Date.now() }), task('shared')]);
  D.store.cos_tombstones = JSON.stringify([{ id: 'gone', deletedAt: Date.now() }]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.app.applyCloudDataToLocalState(clone(cloud));
  const ids = tasksOf(D).map(t => t.id).sort().join();
  return ids === 'c1,local1,shared' && byId(D, 'shared').title === 'cloud title' && stonesOf(D).some(s => s.id === 'gone') && !byId(D, 'c1').updatedAt
    ? true : JSON.stringify({ ids, shared: byId(D, 'shared'), s: stonesOf(D) });
});

await check('Cloud doc with no tombstones field keeps local deletes (a deleted task is not brought back)', async () => {
  cloud = { customTasks: [task('t1'), task('t2')] };
  const D = makeDevice('T');
  D.store.cos_custom_tasks = JSON.stringify([task('t2')]);
  D.store.cos_tombstones = JSON.stringify([{ id: 't1', deletedAt: Date.now() }]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.app.applyCloudDataToLocalState(clone(cloud));
  await flushPush(D);
  return !byId(D, 't1') && stonesOf(D).length === 1 && D.sets.length === 1 && Array.isArray(cloud.tombstones) && !cloud.customTasks.some(t => t.id === 't1')
    ? true : JSON.stringify({ t: tasksOf(D).map(t => t.id), sets: D.sets.length, c: cloud });
});

await check('Local legacy tasks (no stamps) vs stamped cloud, and the reverse: no record lost either way', async () => {
  const now = Date.now();
  cloud = { customTasks: [task('x', { title: 'cloud new', updatedAt: now }), task('c-only', { updatedAt: now })] };
  const D = makeDevice('L1');
  D.store.cos_custom_tasks = JSON.stringify([task('x', { title: 'legacy' }), task('l-only')]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.app.applyCloudDataToLocalState(clone(cloud));
  const one = tasksOf(D).map(t => t.id).sort().join() === 'c-only,l-only,x' && byId(D, 'x').title === 'cloud new';
  cloud = { customTasks: [task('x', { title: 'cloud legacy' }), task('c-only')] };
  const E = makeDevice('L2');
  E.store.cos_custom_tasks = JSON.stringify([task('x', { title: 'local new', updatedAt: now }), task('l-only', { updatedAt: now })]);
  E.app.state.customTasks = E.app.loadCustomTasks();
  E.app.applyCloudDataToLocalState(clone(cloud));
  const two = tasksOf(E).map(t => t.id).sort().join() === 'c-only,l-only,x' && byId(E, 'x').title === 'local new';
  return one && two ? true : JSON.stringify({ D: tasksOf(D), E: tasksOf(E) });
});

await check('Unstamped on both sides: a tie, the cloud copy wins; identical content changes nothing', async () => {
  cloud = { customTasks: [task('x', { title: 'cloud' }), task('y')] };
  const D = makeDevice('TIE');
  D.store.cos_custom_tasks = JSON.stringify([task('x', { title: 'local' }), task('y')]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.app.applyCloudDataToLocalState(clone(cloud));
  await flushPush(D);
  return byId(D, 'x').title === 'cloud' && D.sets.length === 0 && !byId(D, 'x').updatedAt ? true : JSON.stringify({ t: tasksOf(D), sets: D.sets.length });
});

await check('Before a merge removes or overwrites local tasks, the old tasks and links are saved to cos_sync_prev', async () => {
  cloud = { customTasks: [task('x', { title: 'cloud', updatedAt: Date.now() + 5 })] };
  const D = makeDevice('P');
  D.store.cos_custom_tasks = JSON.stringify([task('x', { title: 'mine' })]);
  D.store.cos_custom_links = JSON.stringify([section('PHY', [{ label: 'F', url: 'data:text/plain;base64,QUJD' }])]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.app.applyCloudDataToLocalState(clone(cloud));
  const prev = JSON.parse(D.store.cos_sync_prev || 'null');
  const noPrevWhenSame = makeDevice('P2');
  noPrevWhenSame.store.cos_custom_tasks = JSON.stringify([task('x', { title: 'cloud', updatedAt: cloud.customTasks[0].updatedAt })]);
  noPrevWhenSame.app.applyCloudDataToLocalState(clone(cloud));
  return prev && prev.customTasks[0].title === 'mine' && Array.isArray(prev.customLinks) && !JSON.stringify(prev.customLinks).includes('base64') && !noPrevWhenSame.store.cos_sync_prev
    ? true : JSON.stringify({ prev, other: noPrevWhenSame.store.cos_sync_prev });
});

await check('Applying cloud data does not stamp anything or write tombstones for records it adopts', async () => {
  cloud = { customTasks: [task('c1')], customLinks: [section('PHY', [{ label: 'A', url: 'https://x.test/a' }])] };
  const D = makeDevice('NS');
  D.app.applyCloudDataToLocalState(clone(cloud));
  return !byId(D, 'c1').updatedAt && !linksOf(D)[0].resources[0].updatedAt && stonesOf(D).length === 0 && !D.store.cos_sync_clock
    ? true : JSON.stringify({ t: tasksOf(D), l: linksOf(D), s: stonesOf(D), c: D.store.cos_sync_clock });
});

await check('Incoming stamps raise this device\'s clock (observeStamp)', async () => {
  const future = Date.now() + 60 * 60 * 1000;
  cloud = { customTasks: [task('c1', { updatedAt: future })], tombstones: [{ id: 'z', deletedAt: future + 7 }] };
  const D = makeDevice('CLK');
  D.app.applyCloudDataToLocalState(clone(cloud));
  return Number(D.store.cos_sync_clock) === future + 7 ? true : D.store.cos_sync_clock;
});

await check('Vault: two devices add/edit different resources offline; both survive, device files stay on their device', async () => {
  const file = { label: 'Notes.pdf', url: 'data:application/pdf;base64,QUJDREVG', isUpload: true };
  const [A, B] = await pair([], [section('PHY', [{ label: 'Site', url: 'https://x.test/s' }]), section('CHE', [])]);
  const la = linksOf(A); la[0].resources.push(file); A.app.saveCustomLinks(la);
  await sleep(2);
  const lb = linksOf(B); lb[0].resources[0].url = 'https://x.test/s2'; lb.push(section('MAT', [{ label: 'M', url: 'https://x.test/m' }])); B.app.saveCustomLinks(lb);
  await flushPush(A); await flushPush(B);
  await settle([A, B]);
  const ra = linksOf(A), rb = linksOf(B);
  const aFile = ra[0].resources.find(r => r.label === 'Notes.pdf');
  const bFile = rb[0].resources.find(r => r.label === 'Notes.pdf');
  const ok = aFile && aFile.url === file.url && bFile && bFile.onDevice === true && !bFile.url
    && [ra, rb].every(l => l[0].resources.find(r => r.label === 'Site').url === 'https://x.test/s2' && l.some(s => s.code === 'MAT') && l.some(s => s.code === 'CHE'))
    && !JSON.stringify(cloud.customLinks).includes('base64');
  return ok ? true : JSON.stringify({ ra, rb });
});

await check('Vault: a resource deleted on A stays deleted on B; a section emptied by deletes elsewhere is dropped', async () => {
  const [A, B] = await pair([], [section('PHY', [{ label: 'A1', url: 'https://x.test/1' }, { label: 'A2', url: 'https://x.test/2' }]), section('OLD', [{ label: 'O', url: 'https://x.test/o' }])]);
  const la = linksOf(A).filter(s => s.code !== 'OLD'); la[0].resources = la[0].resources.filter(r => r.label !== 'A2'); A.app.saveCustomLinks(la);
  await flushPush(A);
  await settle([A, B]);
  const rb = linksOf(B);
  return rb.length === 1 && rb[0].resources.map(r => r.label).join() === 'A1' && linksOf(A).length === 1 ? true : JSON.stringify({ rb, ra: linksOf(A) });
});

await check('M1: a restore whose vault save fails leaves no tombstones for the live vault items', async () => {
  cloud = {};
  const D = makeDevice('M1');
  D.store.cos_custom_links = JSON.stringify([section('PHY', [{ label: 'Live', url: 'https://x.test/live' }])]);
  D.failKeys.add('cos_custom_links');
  readerText = JSON.stringify({ customLinks: [section('CHE', [{ label: 'Other', url: 'https://x.test/other' }])] });
  D.app.importData({ target: { files: [{}] } });
  for (let i = 0; i < 5; i++) await tick();
  const st = stonesOf(D);
  return linksOf(D)[0].resources[0].label === 'Live' && !st.some(s => String(s.id).includes('live')) ? true : JSON.stringify(st);
});

await check('M2: the 14-day prune of done tasks writes no tombstone', async () => {
  cloud = {};
  const D = makeDevice('M2a');
  D.store.cos_custom_tasks = JSON.stringify([task('old', { status: 'submitted', dueDate: '2020-01-01' }), task('keep')]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.app.saveCustomTasks();
  return !byId(D, 'old') && stonesOf(D).length === 0 ? true : JSON.stringify({ t: tasksOf(D).map(t => t.id), s: stonesOf(D) });
});

await check('M2: an old done task coming back from the cloud is pruned again, not resurfaced', async () => {
  cloud = { customTasks: [task('old', { status: 'submitted', dueDate: '2020-01-01' }), task('keep')] };
  const D = makeDevice('M2b');
  D.store.cos_custom_tasks = JSON.stringify([task('keep')]);
  D.app.state.customTasks = D.app.loadCustomTasks();
  D.app.applyCloudDataToLocalState(clone(cloud));
  await flushPush(D);
  return !byId(D, 'old') && !D.app.state.customTasks.some(t => t.id === 'old') && !cloud.customTasks.some(t => t.id === 'old')
    ? true : JSON.stringify({ t: tasksOf(D).map(t => t.id), c: cloud.customTasks.map(t => t.id) });
});

await check('M2: a task reopened on B survives when stale A prunes it', async () => {
  // B reopened t1 (fresh stamp) before stale A, which still has it done and
  // more than 14 days old, runs its prune on the next save.
  cloud = {};
  const A = makeDevice('M2cA'), B = makeDevice('M2cB');
  const s0 = Date.now() - 1000;
  A.store.cos_custom_tasks = JSON.stringify([task('t1', { status: 'submitted', dueDate: '2020-01-01', updatedAt: s0 }), task('t2')]);
  B.store.cos_custom_tasks = JSON.stringify([task('t1', { status: 'pending', dueDate: '2099-02-02', updatedAt: s0 + 500 }), task('t2')]);
  for (const d of [A, B]) d.app.state.customTasks = d.app.loadCustomTasks();
  A.app.saveCustomTasks();
  B.app.pushLocalDataToCloud('u1'); await tick();
  await flushPush(A);
  for (const d of [A, B]) d.app.subscribeUserCloudData('u1');
  await settle([A, B]);
  return [A, B].every(d => byId(d, 't1') && byId(d, 't1').status === 'pending') && !stonesOf(A).some(s => s.id === 't1')
    ? true : JSON.stringify({ A: tasksOf(A), B: tasksOf(B), sA: stonesOf(A) });
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ TWO-DEVICE SYNC TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL TWO-DEVICE SYNC TESTS PASSED! 🚀');
process.exit(0);
