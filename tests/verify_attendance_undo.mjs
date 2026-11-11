// ==================================================================
// Clarity Desk: ATTENDANCE UNDO AND "MARK ALL ENDED PRESENT"
// ==================================================================
// Locked down here:
//  - endedUnmarkedClassKeys lists only today's ended, unmarked teaching
//    classes (no breaks, no later classes, nothing for other dates);
//  - markEndedPresent writes exactly those keys in one write, and its
//    Undo puts the day back exactly (no empty day key left behind);
//  - setAttendance's Undo puts the earlier mark back, or removes the key;
//  - an Undo reaches the account and a second device, also when it
//    leaves this phone with no marks at all (the "looks like a wipe"
//    guard must not keep the undone marks in the cloud).
// Runs the real app.js code against a fake Firestore (set merge deep-
// merges maps; update(FieldPath, delete) removes). Codes are made up.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const store = {};
let attWrites = 0;
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { if (k === 'cos_attendance') attWrites++; store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;

// Tiny DOM: enough for showToast / showUndoToast to hand us the Undo button.
let undoBtn = null;
function el(tag) {
  const e = {
    tagName: tag, id: '', style: { setProperty() {} }, dataset: {}, children: [], disabled: false, _click: null,
    append(...cs) { cs.forEach((c) => this.children.push(typeof c === 'string' ? { textContent: c } : c)); },
    replaceWith() {}, contains: () => false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); if (c.className === 'toast-action') undoBtn = c; return c; },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    remove() {}, focus() {}, setAttribute() {}, getAttribute: () => null,
    addEventListener(type, fn) { if (type === 'click') this._click = fn; }, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => []
  };
  return e;
}
const toastContainer = el('div');
toastContainer.id = 'toast-container';
globalThis.document = {
  getElementById: (id) => (id === 'toast-container' ? toastContainer : null),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: el, hidden: false, activeElement: null,
  body: el('body'), documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120', onLine: true, webdriver: false, serviceWorker: {}, sendBeacon: () => true }, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { hostname: 'claritydesk.web.app', search: '', hash: '' }, configurable: true, writable: true });

// ── Fake Firestore ──
const DELETE = { __delete: true };
class FieldPath { constructor(...segs) { this.segs = segs; } }
globalThis.firebase = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => 'ts' }, FieldPath } };
let cloud = {};
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
function deepMerge(t, s) { for (const k of Object.keys(s)) { if (isObj(s[k]) && isObj(t[k])) deepMerge(t[k], s[k]); else t[k] = JSON.parse(JSON.stringify(s[k] ?? null)); } return t; }
const fakeDb = { collection: () => ({ doc: () => ({
  set: (payload, opts) => { if (opts && opts.merge) deepMerge(cloud, payload); else cloud = JSON.parse(JSON.stringify(payload)); return Promise.resolve(); },
  update: (...args) => {
    for (let i = 0; i < args.length; i += 2) {
      const segs = args[i].segs; let o = cloud;
      for (let j = 0; j < segs.length - 1 && o; j++) o = o[segs[j]];
      if (o) delete o[segs[segs.length - 1]];
    }
    return Promise.resolve();
  }
}) }) };

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const app = new Function('__fakeDb', `${code}\n db = __fakeDb;\n signinSeen = () => true;\n return { state, endedUnmarkedClassKeys, pushLocalDataToCloud, applyCloudDataToLocalState };`)(fakeDb);
app.state.currentPage = 'none';

const RealDate = Date;
function setNow(iso) {
  const fixed = new RealDate(iso).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...a) { a.length ? super(...a) : super(fixed); }
    static now() { return fixed; }
  };
}

// Wednesday 4 Nov 2026 (day 3). At 12:30, DS, OS and CN have ended, AI has not.
const TODAY = '2026-11-04';
const TT = { 0: [], 1: [], 2: [], 4: [], 5: [], 6: [], 3: [
  { time: '09:00', end: '10:00', subject: 'Data Structures', code: 'DS', type: 'lecture' },
  { time: '10:00', end: '11:00', subject: 'Operating Systems', code: 'OS', type: 'lecture' },
  { time: '11:00', end: '11:15', subject: 'Recess', type: 'break' },
  { time: '11:15', end: '12:15', subject: 'Computer Networks', code: 'CN', type: 'lecture' },
  { time: '14:00', end: '15:00', subject: 'Artificial Intelligence', code: 'AI', type: 'lecture' }
] };
function seed(att) {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_custom_timetable = JSON.stringify(TT);
  store.cos_attendance = JSON.stringify(att);
  undoBtn = null; attWrites = 0;
  // Fake timers never fire here, so close the last toast by hand before the next case.
  const ts = globalThis.toastState; if (ts) { ts.visible = null; ts.ordinaryQueue.length = 0; ts.failQueue.length = 0; }
}
const att = () => JSON.parse(store.cos_attendance || '{}');
const tapUndo = () => { if (!undoBtn || !undoBtn._click) throw new Error('no Undo button shown'); undoBtn._click(); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  let r;
  try { r = fn(); } catch (e) { r = e.stack || String(e); }
  if (r === true) { passed++; console.log(`✅ ${name}`); }
  else { errors.push(name); console.error(`❌ ${name}\n   ${r}`); }
}

setNow(`${TODAY}T12:30:00+05:30`);

check('Ended, unmarked teaching classes only (no break, no later class, no marked one)', () => {
  seed({ [TODAY]: { OS_1000: 'skipped' } });
  const keys = app.endedUnmarkedClassKeys(TODAY);
  return same(keys, ['DS_0900', 'CN_1115']) ? true : JSON.stringify(keys);
});

check('Nothing for another date, even one with the same weekday', () => {
  seed({});
  const a = app.endedUnmarkedClassKeys('2026-10-28');  // also a Wednesday
  const b = app.endedUnmarkedClassKeys('2026-11-05');
  return a.length === 0 && b.length === 0 ? true : JSON.stringify({ a, b });
});

check('Before the first class ends: nothing to mark', () => {
  setNow(`${TODAY}T09:59:00+05:30`);
  seed({});
  const keys = app.endedUnmarkedClassKeys(TODAY);
  setNow(`${TODAY}T12:30:00+05:30`);
  return keys.length === 0 ? true : JSON.stringify(keys);
});

check('Mark all writes exactly the ended, unmarked keys in one write; the earlier mark stays', () => {
  seed({ [TODAY]: { OS_1000: 'skipped' }, '2026-10-28': { DS_0900: 'attended' } });
  window.markEndedPresent(TODAY);
  const want = { [TODAY]: { OS_1000: 'skipped', DS_0900: 'attended', CN_1115: 'attended' }, '2026-10-28': { DS_0900: 'attended' } };
  return attWrites === 1 && same(att(), want) ? true : JSON.stringify({ attWrites, att: att() });
});

check('Mark all Undo restores the exact earlier day', () => {
  const before = { [TODAY]: { OS_1000: 'skipped' }, '2026-10-28': { DS_0900: 'attended' } };
  seed(before);
  window.markEndedPresent(TODAY);
  tapUndo();
  return same(att(), before) ? true : JSON.stringify(att());
});

check('Mark all Undo on an unmarked day leaves no empty day key', () => {
  seed({ '2026-10-28': { DS_0900: 'attended' } });
  window.markEndedPresent(TODAY);
  tapUndo();
  return !(TODAY in att()) && same(att(), { '2026-10-28': { DS_0900: 'attended' } }) ? true : JSON.stringify(att());
});

check('Mark all with nothing left writes nothing', () => {
  seed({ [TODAY]: { DS_0900: 'attended', OS_1000: 'attended', CN_1115: 'skipped' } });
  window.markEndedPresent(TODAY);
  return attWrites === 0 ? true : `${attWrites} writes`;
});

check('setAttendance Undo puts the earlier mark back', () => {
  seed({ [TODAY]: { DS_0900: 'skipped' } });
  window.setAttendance(TODAY, 'DS_0900', 'attended');
  const mid = att()[TODAY].DS_0900;
  tapUndo();
  return mid === 'attended' && same(att(), { [TODAY]: { DS_0900: 'skipped' } }) ? true : JSON.stringify({ mid, att: att() });
});

check('setAttendance Undo removes a new mark and the day it created', () => {
  seed({ '2026-10-28': { DS_0900: 'attended' } });
  window.setAttendance(TODAY, 'CN_1115', 'skipped');
  tapUndo();
  return same(att(), { '2026-10-28': { DS_0900: 'attended' } }) ? true : JSON.stringify(att());
});

check('setAttendance Undo keeps the other marks of that day', () => {
  seed({ [TODAY]: { DS_0900: 'attended' } });
  window.setAttendance(TODAY, 'CN_1115', 'od_pending');
  tapUndo();
  return same(att(), { [TODAY]: { DS_0900: 'attended' } }) ? true : JSON.stringify(att());
});

// ── Undo vs sync: the Undo must reach the account and another device ──
function phoneB(cloudCopy) {
  // A second phone: same code, its own storage, receives the cloud copy.
  const saved = { ...store };
  for (const k of Object.keys(store)) delete store[k];
  store.cos_custom_timetable = JSON.stringify(TT);
  app.applyCloudDataToLocalState(JSON.parse(JSON.stringify(cloudCopy)));
  const got = att();
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, saved);
  return got;
}

check('Sync: Mark all then Undo is undone in the account and on a second phone', () => {
  seed({ '2026-10-28': { DS_0900: 'attended' } });
  cloud = {};
  app.pushLocalDataToCloud('u1');
  window.markEndedPresent(TODAY);
  app.pushLocalDataToCloud('u1');
  const mid = JSON.stringify(cloud.attendance);
  tapUndo();
  app.pushLocalDataToCloud('u1');
  const b = phoneB(cloud);
  return !(TODAY in cloud.attendance) && !(TODAY in b) && mid.includes('CN_1115') ? true : JSON.stringify({ mid, cloud: cloud.attendance, b });
});

check('Sync: a first-ever mark undone (phone now has no marks) is removed from the account too', () => {
  seed({});
  cloud = {};
  app.pushLocalDataToCloud('u1');
  window.markEndedPresent(TODAY);
  app.pushLocalDataToCloud('u1');
  tapUndo();
  app.pushLocalDataToCloud('u1');
  // This phone's next cloud read must not bring the undone marks back.
  app.applyCloudDataToLocalState(JSON.parse(JSON.stringify(cloud)));
  const b = phoneB(cloud);
  return !(TODAY in (cloud.attendance || {})) && !(TODAY in att()) && !(TODAY in b) ? true : JSON.stringify({ cloud: cloud.attendance, here: att(), b });
});

check('Sync: a single first-ever setAttendance Undo is removed from the account too', () => {
  seed({});
  cloud = {};
  app.pushLocalDataToCloud('u1');
  window.setAttendance(TODAY, 'DS_0900', 'attended');
  app.pushLocalDataToCloud('u1');
  tapUndo();
  app.pushLocalDataToCloud('u1');
  return !(TODAY in (cloud.attendance || {})) ? true : JSON.stringify(cloud.attendance);
});

check('Safety kept: marks emptied without an Undo (failed read or wipe) delete nothing', () => {
  seed({ [TODAY]: { DS_0900: 'attended' } });
  cloud = {};
  app.pushLocalDataToCloud('u1');
  store.cos_attendance = '{}';
  app.pushLocalDataToCloud('u1');
  return cloud.attendance && cloud.attendance[TODAY] && cloud.attendance[TODAY].DS_0900 === 'attended' ? true : JSON.stringify(cloud.attendance);
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ ATTENDANCE UNDO TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ATTENDANCE UNDO TESTS PASSED! 🚀');
process.exit(0);
