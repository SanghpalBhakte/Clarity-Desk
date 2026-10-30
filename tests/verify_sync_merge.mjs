// ==================================================================
// Clarity Desk: SYNC MERGE BUILDING BLOCKS (offline-first sync, step 2)
// ==================================================================
// Pure helpers, not wired into apply/push yet: the edit clock, stamp
// clamping, record merge (newest wins, tie goes to the cloud copy) and
// tombstones (deletes that expire after 30 days, capped at 200).
// Runs the real code from app.js. Ids and times are made up.
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

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const app = new Function(`${code}\n return { nextStamp, observeStamp, clampStamp, mergeRecords, pruneTombstones, mergeTombstones };`)();

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}


const DAY = 86400000;
const keyOf = (r) => r.id;
const merge = (l, c, t = []) => app.mergeRecords(l, c, t, keyOf);
const byId = (res, id) => res.merged.find(r => r.id === id);

console.log('==================================================================');
console.log('SYNC MERGE BUILDING BLOCKS (step 2)');
console.log('==================================================================');

check('Newer local copy beats older cloud copy', () => {
  const r = merge([{ id: 'a', title: 'local', updatedAt: 2000 }], [{ id: 'a', title: 'cloud', updatedAt: 1000 }]);
  return byId(r, 'a').title === 'local' && r.merged.length === 1 ? true : JSON.stringify(r);
});

check('Newer cloud copy beats older local copy, and reports a change', () => {
  const r = merge([{ id: 'a', title: 'local', updatedAt: 1000 }], [{ id: 'a', title: 'cloud', updatedAt: 2000 }]);
  return byId(r, 'a').title === 'cloud' && r.changed === true ? true : JSON.stringify(r);
});

check('Equal stamps return the cloud copy', () => {
  const r = merge([{ id: 'a', title: 'local', updatedAt: 1500 }], [{ id: 'a', title: 'cloud', updatedAt: 1500 }]);
  return byId(r, 'a').title === 'cloud' ? true : JSON.stringify(r);
});

check('Unstamped copy (0) loses to a stamped one, on either side', () => {
  const r1 = merge([{ id: 'a', title: 'local' }], [{ id: 'a', title: 'cloud', updatedAt: 5 }]);
  const r2 = merge([{ id: 'a', title: 'local', updatedAt: 5 }], [{ id: 'a', title: 'cloud' }]);
  return byId(r1, 'a').title === 'cloud' && byId(r2, 'a').title === 'local' ? true : JSON.stringify({ r1, r2 });
});

check('Both unstamped: tie goes to the cloud copy', () => {
  const r = merge([{ id: 'a', title: 'local' }], [{ id: 'a', title: 'cloud' }]);
  return byId(r, 'a').title === 'cloud' ? true : JSON.stringify(r);
});

check('A stamp 3 days in the future is clamped, so a real edit made 1 s later beats it', () => {
  const now = Date.now();
  const far = now + 3 * DAY;
  const c = app.clampStamp(far, now);
  const ok = c === now;
  const r = merge([{ id: 'a', title: 'local', updatedAt: now + 1000 }], [{ id: 'a', title: 'cloud', updatedAt: far }]);
  return ok && byId(r, 'a').title === 'local' ? true : JSON.stringify({ c, now, r });
});

check('clampStamp: missing, junk and non-finite give 0; a normal stamp and one within 24 h pass through', () => {
  const now = 1e12;
  const vals = [undefined, null, 'x', NaN, Infinity].map(v => app.clampStamp(v, now));
  return vals.every(v => v === 0) && app.clampStamp(123, now) === 123 && app.clampStamp(now + DAY - 1, now) === now + DAY - 1 ? true : JSON.stringify(vals);
});

check('Records only on one side are kept (local-only and cloud-only)', () => {
  const r = merge([{ id: 'l', updatedAt: 1 }], [{ id: 'c', updatedAt: 1 }]);
  return r.merged.length === 2 && byId(r, 'l') && byId(r, 'c') && r.changed === true ? true : JSON.stringify(r);
});

check('Identical sides: nothing changed', () => {
  const r = merge([{ id: 'a', updatedAt: 1 }], [{ id: 'a', updatedAt: 1 }]);
  return r.changed === false && r.removedLocal.length === 0 ? true : JSON.stringify(r);
});

check('Tombstone newer than the record removes it, and it is reported in removedLocal', () => {
  const r = merge([{ id: 'a', updatedAt: 1000 }], [{ id: 'a', updatedAt: 900 }], [{ id: 'a', deletedAt: 2000 }]);
  return r.merged.length === 0 && r.removedLocal.length === 1 && r.removedLocal[0].id === 'a' && r.changed === true ? true : JSON.stringify(r);
});

check('Record edited after the tombstone survives', () => {
  const r = merge([{ id: 'a', title: 'back', updatedAt: 3000 }], [], [{ id: 'a', deletedAt: 2000 }]);
  return r.merged.length === 1 && byId(r, 'a').title === 'back' && r.removedLocal.length === 0 ? true : JSON.stringify(r);
});

check('Tombstone also removes a cloud-only copy that is older than the delete', () => {
  const r = merge([], [{ id: 'a', updatedAt: 1000 }], [{ id: 'a', deletedAt: 2000 }]);
  return r.merged.length === 0 && r.removedLocal.length === 0 ? true : JSON.stringify(r);
});

check('Tombstone for an id that is absent everywhere: no throw, no phantom record', () => {
  const r = merge([{ id: 'x', updatedAt: 1 }], [], [{ id: 'ghost', deletedAt: 5 }]);
  return r.merged.length === 1 && r.merged[0].id === 'x' && r.changed === false ? true : JSON.stringify(r);
});

check('mergeRecords does not mutate its inputs and tolerates non-array input', () => {
  const l = [{ id: 'a', updatedAt: 1 }]; const c = [{ id: 'a', updatedAt: 2 }];
  const snap = JSON.stringify([l, c]);
  merge(l, c, [{ id: 'a', deletedAt: 9 }]);
  const r = app.mergeRecords(undefined, null, undefined, keyOf);
  return JSON.stringify([l, c]) === snap && Array.isArray(r.merged) && r.merged.length === 0 ? true : snap;
});

check('pruneTombstones drops a 31-day-old entry and keeps a 29-day-old one', () => {
  const now = Date.now();
  const r = app.pruneTombstones([{ id: 'old', deletedAt: now - 31 * DAY }, { id: 'new', deletedAt: now - 29 * DAY }], now);
  return r.length === 1 && r[0].id === 'new' ? true : JSON.stringify(r);
});

check('pruneTombstones caps at 200 keeping the newest', () => {
  const now = Date.now();
  const t = []; for (let i = 0; i < 250; i++) t.push({ id: 't' + i, deletedAt: now - 1000 - i });
  const r = app.pruneTombstones(t, now);
  const ids = new Set(r.map(x => x.id));
  return r.length === 200 && ids.has('t0') && ids.has('t199') && !ids.has('t200') ? true : `${r.length}`;
});

check('mergeTombstones: union by id, larger deletedAt wins', () => {
  const r = app.mergeTombstones([{ id: 'a', deletedAt: 5 }, { id: 'b', deletedAt: 9 }], [{ id: 'a', deletedAt: 7 }, { id: 'c', deletedAt: 1 }]);
  const m = Object.fromEntries(r.map(x => [x.id, x.deletedAt]));
  return r.length === 3 && m.a === 7 && m.b === 9 && m.c === 1 ? true : JSON.stringify(r);
});

check('nextStamp called twice in the same millisecond is strictly increasing and persisted', () => {
  delete store.cos_sync_clock;
  const a = app.nextStamp(), b = app.nextStamp(), c = app.nextStamp();
  return a < b && b < c && Number(store.cos_sync_clock) === c ? true : JSON.stringify([a, b, c, store.cos_sync_clock]);
});

check('After observeStamp(now + 1000) the next nextStamp is greater', () => {
  delete store.cos_sync_clock;
  const target = Date.now() + 1000;
  app.observeStamp(target);
  return app.nextStamp() > target ? true : 'not greater';
});

check('observeStamp clamps a far-future stamp (3 days) to about now + 24 h, and never lowers the clock', () => {
  delete store.cos_sync_clock;
  app.observeStamp(Date.now() + 3 * DAY);
  const v = Number(store.cos_sync_clock);
  const capped = v <= Date.now() + DAY + 1000 && v >= Date.now() + DAY - 5000;
  app.observeStamp(5);
  return capped && Number(store.cos_sync_clock) === v ? true : String(v);
});

check('A corrupt cos_sync_clock value does not break nextStamp', () => {
  store.cos_sync_clock = 'garbage';
  const a = app.nextStamp();
  return Number.isFinite(a) && a > 0 ? true : String(a);
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ SYNC MERGE TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL SYNC MERGE TESTS PASSED! 🚀');
process.exit(0);
