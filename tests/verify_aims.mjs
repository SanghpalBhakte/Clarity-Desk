// ==================================================================
// Clarity Desk: YOUR AIM (cos_aims)
// ==================================================================
// Locked down here:
//  - with no cos_aims (every phone before this), the aim is read from
//    cos_att_target and nothing is written just by reading;
//  - saving keeps cos_att_target in step, so attendance sums are unchanged;
//  - a subject's own line is used only for that subject;
//  - old backups / cloud copies without `aims` change nothing; new ones
//    bring subject lines back; the sync hash notices a subject line change.
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

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
const domStub = (id) => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
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
const app = new Function(`${code}\n return { loadAims, saveAims, applyAimsFromData, getSubjectTarget, getAttendanceTarget, calculatePayloadHash };`)();

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}
const reset = (extra = {}) => { for (const k of Object.keys(store)) delete store[k]; Object.assign(store, extra); };
const aims = () => JSON.parse(store.cos_aims || 'null');

check('No cos_aims: the aim is the saved target and reading writes nothing', () => {
  reset({ cos_att_target: '80' });
  const a = app.loadAims();
  return a.line === 80 && a.kind === 'line' && !Object.keys(a.subjects).length && !('cos_aims' in store) ? true : JSON.stringify([a, store]);
});

check('Brand new phone: the aim starts at 75', () => {
  reset();
  return app.loadAims().line === 75 ? true : app.loadAims().line;
});

check('Saving keeps cos_att_target in step and drops bad subject lines', () => {
  reset({ cos_att_target: '75' });
  app.saveAims({ line: 70, subjects: { DS: 80, PS: 'high', WD: 40, '  ': 90, CN: '85' } });
  const a = aims();
  return store.cos_att_target === '70' && a.line === 70 && JSON.stringify(a.subjects) === JSON.stringify({ DS: 80, CN: 85 }) ? true : JSON.stringify([store.cos_att_target, a]);
});

check('A bad overall line keeps the current one', () => {
  reset({ cos_att_target: '72' });
  app.saveAims({ line: 300, subjects: {} });
  return store.cos_att_target === '72' ? true : store.cos_att_target;
});

check("A subject's own line applies to that subject only (by code, then name)", () => {
  reset({ cos_att_target: '75', cos_aims: JSON.stringify({ v: 1, kind: 'line', line: 75, subjects: { DSL: 80, 'Physics': 65 } }) });
  const r = [app.getSubjectTarget({ code: 'DSL', name: 'DS Lab' }), app.getSubjectTarget({ code: '', name: 'Physics' }), app.getSubjectTarget({ code: 'DS', name: 'Data Structures' }), app.getSubjectTarget(null)];
  return JSON.stringify(r) === '[80,65,75,75]' ? true : JSON.stringify(r);
});

check('The overall target ignores subject lines (attendance sums unchanged)', () => {
  reset({ cos_att_target: '75', cos_aims: JSON.stringify({ v: 1, kind: 'line', line: 75, subjects: { DS: 90 } }) });
  return app.getAttendanceTarget() === 75 ? true : app.getAttendanceTarget();
});

check('An old backup or cloud copy without aims changes nothing', () => {
  reset({ cos_att_target: '75', cos_aims: JSON.stringify({ v: 1, kind: 'line', line: 75, subjects: { DS: 80 } }) });
  const before = JSON.stringify(store);
  app.applyAimsFromData(undefined); app.applyAimsFromData(null); app.applyAimsFromData([1]);
  return JSON.stringify(store) === before ? true : JSON.stringify(store);
});

check('A new backup brings subject lines back with its line', () => {
  reset({ cos_att_target: '75' });
  app.applyAimsFromData({ v: 1, kind: 'line', line: 80, subjects: { CN: 85 } });
  return store.cos_att_target === '80' && aims().subjects.CN === 85 ? true : JSON.stringify(store);
});

check('Sync notices a subject line change', () => {
  const base = { attTarget: 75, aims: { v: 1, kind: 'line', line: 75, subjects: {} } };
  const changed = { attTarget: 75, aims: { v: 1, kind: 'line', line: 75, subjects: { DS: 80 } } };
  const old = { attTarget: 75 };
  const H = app.calculatePayloadHash;
  return H(base) !== H(changed) && H(old) !== H(changed) ? true : 'hash unchanged';
});

console.log(`\n========================================\nTOTAL SCENARIOS CHECKED: ${total}\nPASSED: ${passed}\nFAILED: ${total - passed}\n========================================`);
if (errors.length) process.exit(1);
