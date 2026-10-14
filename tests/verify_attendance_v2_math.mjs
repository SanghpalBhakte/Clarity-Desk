// ==================================================================
// Clarity Desk: ATTENDANCE v2 MATH MATCHES THE COLLEGE ERP EXACTLY
// ==================================================================
// Step 1 of the attendance redesign: the new pure functions in app.js
// (computeErpPercent, computeOverallErpPercent, computeNowGuidance,
// computeSemesterProjection, computeMonthlyAttendance,
// tallyAttendanceSessions). Every number below was read off a real ERP
// summary table and day-wise lists; subject names and codes are made up.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

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
const app = new Function(`${code}\n return { tallyAttendanceSessions, computeErpPercent, computeOverallErpPercent, computeNowGuidance, computeSemesterProjection, computeMonthlyAttendance };`)();

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

// ERP summary rows: [name, planned Total Sessions, Present, Total Count, ERP %]
// (Total Count = Present + Absent; the ERP's Absent already holds Not Entered.)
const ERP_ROWS = [
  ['Subject A',       30, 17, 18, '94.44'],
  ['Subject B',       60,  6, 10, '60.00'],
  ['Subject C',       30, 19, 25, '76.00'],
  ['Subject D',       60, 14, 18, '77.78'],
  ['Subject E',       60, 19, 32, '59.38'],
  ['Subject E Lab',   60, 10, 16, '62.50'],
  ['Subject F',       60, 22, 31, '70.97'],
  ['Subject F Lab',   30,  9, 15, '60.00'],
  ['Subject G',       60,  4,  9, '44.44'],
  ['Subject H',       30,  0,  0, null],
  ['Subject I',       60, 22, 30, '73.33'],
  ['Subject J Lab',   30,  9, 14, '64.29']
];

// Day-wise lists, as the ERP shows them (one row per session).
const d = (date, status) => ({ date, status });
const LAB_E = [   // Tuesday 10:00-12:00 lab, one session each; 18 Aug cancelled (no ERP row)
  d('2026-06-16', 'absent'), d('2026-06-23', 'absent'), d('2026-06-30', 'absent'),
  d('2026-07-07', 'absent'), d('2026-07-14', 'present'), d('2026-07-21', 'present'), d('2026-07-28', 'absent'),
  d('2026-08-04', 'present'), d('2026-08-11', 'present'), d('2026-08-25', 'present'),
  d('2026-09-01', 'absent'), d('2026-09-08', 'present'), d('2026-09-15', 'present'), d('2026-09-22', 'present'), d('2026-09-29', 'present'),
  d('2026-10-06', 'present')
];
const SUBJ_A = [  // Monday 12:45-14:45, one absence on 24 Aug
  '2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27',
  '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
  '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'
].map(date => d(date, date === '2026-08-24' ? 'absent' : 'present'));
const SUBJ_C = [  // 25 sessions in ERP order: 19 P, 5 A, 1 Not Entered -> ERP 19 / 25, Absent column 6
  ...'APPPPAANPPAPPPPPPAPPPPPPP'.split('')
].map((c, i) => d(`2026-07-${String(i + 1).padStart(2, '0')}`, c === 'P' ? 'present' : c === 'N' ? 'notEntered' : 'absent'));

console.log('==================================================================');
console.log('📐 ATTENDANCE v2 MATH MATCHES THE COLLEGE ERP');
console.log('==================================================================');

check('Every subject row matches the ERP % to 2 decimals (12 of 12)', () => {
  const bad = ERP_ROWS.filter(([name, , p, t, pct]) => app.computeErpPercent(p, t, 75).display !== pct)
    .map(([name, , p, t, pct]) => `${name}: ${app.computeErpPercent(p, t, 75).display} vs ${pct}`);
  return bad.length === 0 ? true : bad.join('; ');
});

check('Rounding is half up like the ERP (19/32 = 59.375 -> 59.38, 22/31 -> 70.97)', () => {
  const a = app.computeErpPercent(19, 32, 75).display, b = app.computeErpPercent(22, 31, 75).display;
  return a === '59.38' && b === '70.97' ? true : `${a}, ${b}`;
});

check('Overall row: every subject summed, labs included = 151 / 218 = 69.27', () => {
  const o = app.computeOverallErpPercent(ERP_ROWS.map(([, , p, t]) => ({ attended: p, held: t })), 75);
  return o.attended === 151 && o.held === 218 && o.display === '69.27' ? true : `${o.attended}/${o.held} = ${o.display}`;
});

check('74.50% is NOT safe at a 75% target (the defaulter list flags it)', () => {
  const r = app.computeErpPercent(149, 200, 75);
  return r.display === '74.50' && r.isSafe === false ? true : `${r.display} isSafe=${r.isSafe}`;
});

check('Exactly 75.00% is safe; 74.99% is not', () => {
  const ok = app.computeErpPercent(3, 4, 75).isSafe === true && app.computeErpPercent(7499, 10000, 75).isSafe === false;
  return ok ? true : 'boundary wrong';
});

check('No sessions yet: no %, not "0%" and not "safe"', () => {
  const r = app.computeErpPercent(0, 0, 75);
  return r.pct === null && r.isSafe === null ? true : JSON.stringify(r);
});

check('Day-wise lab list: 2-hour lab = 1 session, cancelled day absent from list -> 10 / 16 = 62.50', () => {
  const t = app.tallyAttendanceSessions(LAB_E);
  const r = app.computeErpPercent(t.attended, t.held, 75);
  return t.attended === 10 && t.held === 16 && r.display === '62.50' ? true : `${t.attended}/${t.held} = ${r.display}`;
});

check('Not Entered counts as absent (19 P, 5 A, 1 NE = 19 / 25 = 76.00)', () => {
  const t = app.tallyAttendanceSessions(SUBJ_C);
  const r = app.computeErpPercent(t.attended, t.held, 75);
  return t.held === 25 && t.notEntered === 1 && r.display === '76.00' ? true : `${t.attended}/${t.held} NE ${t.notEntered} = ${r.display}`;
});

check('A cancelled class counts for nothing; a block the teacher split counts twice', () => {
  const t = app.tallyAttendanceSessions([d('2026-08-18', 'cancelled'), { date: '2026-08-07', status: 'absent', count: 2 }, d('2026-08-14', 'present')]);
  return t.held === 3 && t.attended === 1 && t.cancelled === 1 ? true : JSON.stringify(t);
});

check('OD waiting stays absent (ERP shows A); accepted OD becomes present', () => {
  const base = SUBJ_C.map(s => s.status === 'notEntered' ? { ...s } : s);
  const firstAbsent = base.findIndex(s => s.status === 'absent');
  const pending = base.map((s, i) => i === firstAbsent ? { ...s, status: 'od_pending' } : s);
  const accepted = base.map((s, i) => i === firstAbsent ? { ...s, status: 'od_accepted' } : s);
  const tp = app.tallyAttendanceSessions(pending), ta = app.tallyAttendanceSessions(accepted);
  const now = app.computeErpPercent(tp.attended, tp.held, 75).display;
  const ifAccepted = app.computeErpPercent(tp.attended + tp.odPending, tp.held, 75).display;
  const after = app.computeErpPercent(ta.attended, ta.held, 75).display;
  return now === '76.00' && tp.odPending === 1 && ifAccepted === '80.00' && after === '80.00'
    ? true : `now ${now}, pending ${tp.odPending}, if accepted ${ifAccepted}, after ${after}`;
});

check('Now guidance: 19/32 needs 20 classes in a row to reach 75%; 17/18 can miss 4', () => {
  const a = app.computeNowGuidance(19, 32, 75), b = app.computeNowGuidance(17, 18, 75);
  // 39/52 = 75.00 exactly; 17/22 = 77.27, 17/23 = 73.91
  return a.classesToAttend === 20 && b.safeSkips === 4 ? true : `need ${a.classesToAttend}, skips ${b.safeSkips}`;
});

check('Now guidance at 74.50% asks for 4 classes in a row, never says "safe"', () => {
  const g = app.computeNowGuidance(149, 200, 75);
  // 152/203 = 74.88 is still short; 153/204 = 75.00
  return g.isSafe === false && g.classesToAttend === 4 ? true : JSON.stringify(g);
});

check('Semester projection: 19/32 of 60 planned -> must attend 26 of 28 left, can miss 2', () => {
  const p = app.computeSemesterProjection(19, 32, 60, 75);
  return p.remaining === 28 && p.mustAttend === 26 && p.canMiss === 2 && p.reachable ? true : JSON.stringify(p);
});

check('Semester projection: lab 10/16 of 60 -> can miss 9; 4/9 of 60 -> can miss 10', () => {
  const lab = app.computeSemesterProjection(10, 16, 60, 75), g = app.computeSemesterProjection(4, 9, 60, 75);
  return lab.canMiss === 9 && g.canMiss === 10 ? true : `lab ${lab.canMiss}, G ${g.canMiss}`;
});

check('Semester projection says when 75% is no longer possible', () => {
  const p = app.computeSemesterProjection(4, 20, 30, 75);   // best case 14/30 = 46.67
  return p.reachable === false && p.canMiss === 0 && p.bestFinal.display === '46.67' ? true : JSON.stringify(p);
});

check('Semester projection is null when the planned count is unknown or already passed', () => {
  return app.computeSemesterProjection(5, 10, 0, 75) === null && app.computeSemesterProjection(5, 10, 8, 75) === null
    ? true : 'expected null';
});

check('Monthly: one subject, running total at each month end matches the ERP history', () => {
  const by = { labE: LAB_E };
  const got = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(m => app.computeMonthlyAttendance(by, m, 75).overall.display);
  const want = ['0.00', '28.57', '50.00', '60.00', '62.50'];
  return JSON.stringify(got) === JSON.stringify(want) ? true : `${got} vs ${want}`;
});

check('Monthly defaulter check uses the overall % across subjects (Aug 72.73 flagged, Sep 77.42 clear)', () => {
  const by = { labE: LAB_E, subjA: SUBJ_A };
  const aug = app.computeMonthlyAttendance(by, '2026-08', 75), sep = app.computeMonthlyAttendance(by, '2026-09', 75);
  // Aug: lab 5/10 + subject A 11/12 = 16/22; Sep: lab 9/15 + subject A 15/16 = 24/31
  const ok = aug.overall.display === '72.73' && aug.overall.isSafe === false
    && sep.overall.display === '77.42' && sep.overall.isSafe === true;
  return ok ? true : `Aug ${aug.overall.display} ${aug.overall.isSafe}, Sep ${sep.overall.display} ${sep.overall.isSafe}`;
});

check('Monthly: that month on its own is reported too; a month with no classes has no %', () => {
  const by = { labE: LAB_E, subjA: SUBJ_A };
  const aug = app.computeMonthlyAttendance(by, '2026-08', 75), may = app.computeMonthlyAttendance(by, '2026-05', 75);
  // Aug alone: lab 3/3 + subject A 4/5 = 7/8 = 87.50
  return aug.monthOnly.display === '87.50' && may.overall.pct === null && may.monthOnly.pct === null
    ? true : `Aug only ${aug.monthOnly.display}, May ${may.overall.pct}`;
});

check('The v2 functions never write to storage', () => {
  const before = JSON.stringify(store);
  app.computeMonthlyAttendance({ labE: LAB_E }, '2026-09', 75);
  app.computeSemesterProjection(19, 32, 60, 75);
  return JSON.stringify(store) === before ? true : 'storage changed';
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ ATTENDANCE v2 MATH TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ATTENDANCE v2 MATH TESTS PASSED! 🚀');
process.exit(0);
