// ==================================================================
// Clarity Desk: ATTENDANCE PERCENTAGE MATCHES THE ERP + LOCAL TASK DATES
// ==================================================================
// v167: the college ERP leaves "Attendance Not Entered" sessions out of a
// course's percentage (6 present, 1 absent, 1 not entered = 6/7 = 85.71%),
// while its totals row divides by every session held, Not Entered included.
// The app used to show 6/8 = 75% for the course. Also, task due dates were
// built with toISOString() (the UTC date), so between 00:00 and 05:30 in
// India "tomorrow" came out as today. Synthetic numbers only.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

// ── Controllable clock: 00:30 IST, Tuesday 29 Sep 2026 (still the 28th in UTC)
const RealDate = Date;
const NOW = new RealDate('2026-09-29T00:30:00+05:30').getTime();
class FakeDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;

// ── Browser stubs (same pattern as the other verify_* files) ──────────
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
const appended = [];
const domStub = (id) => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
globalThis.document = {
  getElementById: domStub, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild: (el) => appended.push(el) }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const makeApp = () => new Function(`${code}\n return { state, getSubjectAttendance, getOverallAttendance, renderReviewRowsHTML, showAddTaskModal };`)();

const DS = { name: 'Data Structures', code: 'CS201' };
const OS = { name: 'Operating Systems', code: 'CS202' };
function seed(baselines) {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_attendance = JSON.stringify({});
  store.cos_attendance_baseline = JSON.stringify(baselines);
}

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
console.log('📊 ATTENDANCE % MATCHES THE ERP + LOCAL TASK DATES (Asia/Kolkata)');
console.log('==================================================================');

check('Course %: Not Entered is left out (6 present, 1 absent, 1 not entered = 85.71%)', () => {
  seed({ CS201: { subjectName: DS.name, subjectCode: DS.code, present: 6, absent: 1, leave: 0, notEntered: 1 } });
  const att = makeApp().getSubjectAttendance(DS);
  if (att.exactPct !== 85.71) return `exactPct ${att.exactPct}, expected 85.71`;
  if (att.pct !== 86) return `pct ${att.pct}, expected 86`;
  if (att.total !== 7) return `total ${att.total}, expected 7 (counted for %)`;
  return att.held === 8 ? true : `held ${att.held}, expected 8 (every session held)`;
});

check('Course %: leave still counts as a missed session (6 P, 1 A, 1 L = 75%)', () => {
  seed({ CS201: { subjectName: DS.name, subjectCode: DS.code, present: 6, absent: 1, leave: 1, notEntered: 0 } });
  const att = makeApp().getSubjectAttendance(DS);
  return att.exactPct === 75 && att.total === 8 ? true : `exactPct ${att.exactPct}, total ${att.total}`;
});

check('Overall % follows the ERP totals row: present / every session held, Not Entered included', () => {
  seed({
    CS201: { subjectName: DS.name, subjectCode: DS.code, present: 6, absent: 1, leave: 0, notEntered: 1 },
    CS202: { subjectName: OS.name, subjectCode: OS.code, present: 3, absent: 1, leave: 0, notEntered: 0 }
  });
  const o = makeApp().getOverallAttendance();
  // 9 / 12 = 75% (not 9 / 11 = 81.82%)
  return o.attended === 9 && o.total === 12 && o.exactPct === 75 ? true : `${o.attended}/${o.total} = ${o.exactPct}%`;
});

check('Scan review row shows the ERP course % (85.7%), not 6/8', () => {
  seed({});
  const html = makeApp().renderReviewRowsHTML(
    [{ subject: DS.name, code: DS.code, present: 6, absent: 1, leave: 0, notEntered: 1 }],
    [{ name: DS.name, code: DS.code }]
  );
  if (html.includes('75.0%')) return 'row still shows 75.0%';
  return html.includes('85.7%') ? true : 'row does not show 85.7%';
});

check('New task at 00:30 IST defaults to local tomorrow (30 Sep), not today', () => {
  seed({});
  appended.length = 0;
  makeApp().showAddTaskModal();
  const modal = appended.find(el => el.id === 'add-task-backdrop');
  if (!modal) return 'add-task modal not rendered';
  const m = modal.innerHTML.match(/id="task-due"[^>]*value="([\d-]*)"/);
  return m && m[1] === '2026-09-30' ? true : `due date defaults to ${m && m[1]}`;
});

check('No task/attendance date is built from toISOString() (UTC) any more', () => {
  const hits = appSrc.split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => /toISOString\(\)\.(split\('T'\)\[0\]|slice\(0,\s*10\))/.test(line) && !line.startsWith('//'));
  return hits.length === 0 ? true : `found at line(s) ${hits.map(h => h.n).join(', ')}`;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ ATTENDANCE PERCENTAGE TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ATTENDANCE PERCENTAGE TESTS PASSED! 🚀');
process.exit(0);
