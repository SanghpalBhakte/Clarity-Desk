// ==================================================================
// Clarity Desk: DELETIONS REACH THE CLOUD (step 5)
// ==================================================================
// set(payload, {merge:true}) deep-merges maps and never removes a key, so
// a cleared attendance mark came back on the next sync. The push now also
// sends FieldValue.delete() for every path that was in the last synced
// copy and is gone locally. Runs the real push/apply code against a fake
// Firestore with the documented semantics. Codes and dates are made up.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

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
const domStub = (id) => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, addEventListener() {} });
globalThis.document = {
  getElementById: domStub, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

// ── Fake Firestore: set(merge) deep-merges maps; update(FieldPath, DELETE) removes ──
const DELETE = { __delete: true };
class FieldPath { constructor(...segs) { this.segs = segs; } }
globalThis.firebase = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => 'ts' }, FieldPath } };
let cloud = {};
let updateCalls = [];
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
function deepMerge(t, s) { for (const k of Object.keys(s)) { if (isObj(s[k]) && isObj(t[k])) deepMerge(t[k], s[k]); else t[k] = JSON.parse(JSON.stringify(s[k] ?? null)); } return t; }
const fakeDb = { collection: () => ({ doc: () => ({
  set: (payload, opts) => { if (opts && opts.merge) deepMerge(cloud, payload); else cloud = JSON.parse(JSON.stringify(payload)); return Promise.resolve(); },
  update: (...args) => {
    updateCalls.push(args);
    for (let i = 0; i < args.length; i += 2) {
      if (!(args[i] instanceof FieldPath) || args[i + 1] !== DELETE) throw new Error('unexpected update arg');
      const segs = args[i].segs; let o = cloud;
      for (let j = 0; j < segs.length - 1 && o; j++) o = o[segs[j]];
      if (o) delete o[segs[segs.length - 1]];
    }
    return Promise.resolve();
  }
}) }) };

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const app = new Function('__fakeDb', `${code}\n db = __fakeDb;\n return { state, pushLocalDataToCloud, applyCloudDataToLocalState, computeSyncDeletePaths };`)(fakeDb);
globalThis.showToast = () => {};
app.state.currentPage = 'none';
app.state.customTasks = [];

const att = () => JSON.parse(store.cos_attendance || '{}');
function reset(cloudData) {
  for (const k of Object.keys(store)) delete store[k];
  cloud = JSON.parse(JSON.stringify(cloudData));
  updateCalls = [];
  app.applyCloudDataToLocalState(JSON.parse(JSON.stringify(cloud)));   // device receives the cloud copy
}
function editLocal(fn) { const a = att(); fn(a); store.cos_attendance = JSON.stringify(a); }

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

console.log('==================================================================');
console.log('☁️  DELETIONS REACH THE CLOUD (step 5)');
console.log('==================================================================');

const START = {
  attendance: { '2026-10-12': { DS_1000: 'attended', OS_1100: 'skipped' }, '2026-10-13': { DS_1000: 'attended' } },
  attendanceBaseline: { DS: { subjectName: 'Data Structures', present: 10, absent: 2 }, OS: { subjectName: 'Operating Systems', present: 5, absent: 1 } },
  attendanceLive: { DS: { present: 2 }, OS: { present: 1 } }
};

check('Premise: merge alone keeps a cleared mark, and it comes back on the next sync', () => {
  cloud = JSON.parse(JSON.stringify(START));
  deepMerge(cloud, { attendance: { '2026-10-12': { OS_1100: 'skipped' } } });   // what a push without deletes sends
  return cloud.attendance['2026-10-12'].DS_1000 === 'attended' ? true : 'fake Firestore does not deep-merge';
});

check('A cleared mark is deleted in the cloud and stays cleared after the next sync', () => {
  reset(START);
  editLocal(a => { delete a['2026-10-12'].DS_1000; });
  app.pushLocalDataToCloud('u1');
  const gone = !('DS_1000' in cloud.attendance['2026-10-12']) && cloud.attendance['2026-10-12'].OS_1100 === 'skipped';
  app.applyCloudDataToLocalState(JSON.parse(JSON.stringify(cloud)));
  return gone && !('DS_1000' in att()['2026-10-12']) ? true : JSON.stringify(cloud.attendance);
});

check('A whole day removed locally is removed in the cloud (dates with "-" as one path segment)', () => {
  reset(START);
  editLocal(a => { delete a['2026-10-13']; });
  app.pushLocalDataToCloud('u1');
  const seg = updateCalls[0] && updateCalls[0][0].segs;
  return !('2026-10-13' in cloud.attendance) && JSON.stringify(seg) === '["attendance","2026-10-13"]' ? true : JSON.stringify({ cloud: cloud.attendance, seg });
});

check('Undo of +1 taps and clearing a baseline reach the cloud', () => {
  reset(START);
  const live = JSON.parse(store.cos_attendance_live); delete live.DS; store.cos_attendance_live = JSON.stringify(live);
  const base = JSON.parse(store.cos_attendance_baseline); delete base.OS; store.cos_attendance_baseline = JSON.stringify(base);
  app.pushLocalDataToCloud('u1');
  return !('DS' in cloud.attendanceLive) && cloud.attendanceLive.OS && !('OS' in cloud.attendanceBaseline) && cloud.attendanceBaseline.DS
    ? true : JSON.stringify({ live: cloud.attendanceLive, base: Object.keys(cloud.attendanceBaseline) });
});

check('A moved (renamed) mark: the old key is deleted, the new one kept', () => {
  reset({ attendance: { '2026-10-12': { DSA_0900: 'skipped' } } });
  editLocal(a => { a['2026-10-12'].DataStructures_0900 = a['2026-10-12'].DSA_0900; delete a['2026-10-12'].DSA_0900; });
  app.pushLocalDataToCloud('u1');
  const d = cloud.attendance['2026-10-12'];
  return !('DSA_0900' in d) && d.DataStructures_0900 === 'skipped' ? true : JSON.stringify(d);
});

check('Two devices: a mark the other device added is never deleted, and both adds survive', () => {
  reset(START);
  deepMerge(cloud, { attendance: { '2026-10-14': { WD_1200: 'attended' } } });   // other device, not yet seen here
  editLocal(a => { a['2026-10-15'] = { DS_1000: 'skipped' }; });
  app.pushLocalDataToCloud('u1');
  const kept = cloud.attendance['2026-10-14'] && cloud.attendance['2026-10-15'] && updateCalls.length === 0;
  app.applyCloudDataToLocalState(JSON.parse(JSON.stringify(cloud)));
  app.pushLocalDataToCloud('u1');                                                   // after receiving it: still no deletes
  return kept && updateCalls.length === 0 && cloud.attendance['2026-10-14'].WD_1200 === 'attended' ? true : JSON.stringify({ calls: updateCalls.length, cloud: cloud.attendance });
});

check('First push after the update (no synced copy yet) sends no deletes', () => {
  for (const k of Object.keys(store)) delete store[k];
  cloud = JSON.parse(JSON.stringify(START)); updateCalls = [];
  store.cos_attendance = JSON.stringify({ '2026-10-12': { OS_1100: 'skipped' } });
  app.pushLocalDataToCloud('u1');
  return updateCalls.length === 0 && cloud.attendance['2026-10-12'].DS_1000 === 'attended' ? true : `${updateCalls.length} delete calls`;
});

check('Safety: local attendance suddenly empty (failed read or wipe) deletes nothing in the cloud', () => {
  reset(START);
  store.cos_attendance = '{}';
  app.pushLocalDataToCloud('u1');
  return Object.keys(cloud.attendance).length === 2 && !updateCalls.some(c => c.some(a => a.segs && a.segs[0] === 'attendance')) ? true : JSON.stringify(cloud.attendance);
});

check('Nothing changed: no delete call at all', () => {
  reset(START);
  app.pushLocalDataToCloud('u1');
  return updateCalls.length === 0 ? true : `${updateCalls.length} calls`;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ SYNC DELETE TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL SYNC DELETE TESTS PASSED! 🚀');
process.exit(0);
