// ==================================================================
// Clarity Desk: SEMESTER PROJECTION, LAB TIER, MONTHLY CHECK, PUSH (3b)
// ==================================================================
// Step 3b of the attendance redesign, on the ERP-exact (v2) numbers:
// the scan keeps the ERP's Total Sessions, cards and the subject page
// show the end-of-semester projection, a lab at risk colours its card,
// the dashboard shows the monthly defaulter check, and the background
// push job alerts on the same overall % the app shows. Course names are
// generic; codes and dates are made up.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

// ── Controllable clock: Wednesday 14 Oct 2026, 12:00 IST ─────────────
const RealDate = Date;
const NOW = new RealDate('2026-10-14T12:00:00+05:30').getTime();
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
const app = new Function(`${code}\n return { getSubjectList, getSubjectAttendance, getOverallAttendance, attV2ProjectionText, attV2MonthlyCheck, buildAttendanceCloudSummary, keepPlannedSessions, renderSubjectsOverview };`)();

function seed({ baselines = {}, mode = 'v2' } = {}) {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_attendance = '{}';
  store.cos_attendance_baseline = JSON.stringify(baselines);
  store.cos_attendance_live = '{}';
  store.cos_custom_timetable = JSON.stringify({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });
  store.cos_att_v2_state = JSON.stringify({ mode, decidedAt: '2026-10-14T00:00:00.000Z' });
}
const base = (name, code, present, absent, planned = 60) => ({ subjectName: name, subjectCode: code, present, absent, leave: 0, notEntered: 0, totalSessions: planned, updatedAt: '2026-10-13T20:00:00.000Z' });
const card = (name) => app.getSubjectList().find(s => s.name === name);
const ERP_ROWS = [
  ['Art of Public Speaking', 17, 1], ['Business Management and Financial Accounting', 6, 4],
  ['Community Engagement', 19, 6], ['Constitution of India', 14, 4], ['Data Structures', 19, 13],
  ['Data Structures Lab', 10, 6], ['Digital Electronics and Microprocessors', 22, 9],
  ['Digital Electronics and Microprocessors Lab', 9, 6], ['Introduction to Business Analytics', 4, 5],
  ['Personality Development', 0, 0], ['Probability and Statistics', 22, 8], ['Web Development Lab', 9, 5]
];
const erpBaselines = () => {
  const b = {};
  ERP_ROWS.forEach(([n, p, a], i) => { b[`X${100 + i}`] = base(n, `X${100 + i}`, p, a); });
  return b;
};

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
console.log('📅 SEMESTER PROJECTION · LAB TIER · MONTHLY CHECK · PUSH (step 3b)');
console.log('==================================================================');

check('Scan keeps the ERP Total Sessions; a blank keeps the previous value', () => {
  const ok = app.keepPlannedSessions('60', { totalSessions: 30 }) === 60
    && app.keepPlannedSessions('', { totalSessions: 30 }) === 30
    && app.keepPlannedSessions(0, { totalSessions: 0 }) === 0
    && app.keepPlannedSessions('', undefined) === 0;
  return ok ? true : 'wrong planned value';
});

check('Projection: Data Structures 19/32 of 60 -> can miss 2 (attend 26 of 28 left)', () => {
  seed({ baselines: erpBaselines() });
  const att = app.getSubjectAttendance(card('Data Structures'));
  const short = app.attV2ProjectionText(att), long = app.attV2ProjectionText(att, true);
  return att.projection.canMiss === 2 && short === 'Can miss 2 more this semester'
    && long === 'Can miss 2 more this semester: attend 26 of the 28 left (if all 60 planned classes happen)'
    ? true : `${short} | ${long}`;
});

check('Projection for the lab: Data Structures Lab 10/16 of 60 -> can miss 9', () => {
  seed({ baselines: erpBaselines() });
  const lab = app.getSubjectAttendance(card('Data Structures')).labPart;
  return lab && lab.projection.canMiss === 9 && app.attV2ProjectionText(lab) === 'Can miss 9 more this semester'
    ? true : JSON.stringify(lab && lab.projection);
});

check('Projection says when 75% is no longer possible (4/20 of 30 -> best case 46.67%)', () => {
  seed({ baselines: { X1: base('Data Structures', 'X1', 4, 16, 30) } });
  const t = app.attV2ProjectionText(app.getSubjectAttendance(card('Data Structures')));
  return t === '75% is no longer possible this semester (best case 46.67%)' ? true : t;
});

check('No projection when the planned count is unknown', () => {
  seed({ baselines: { X1: base('Data Structures', 'X1', 19, 13, 0) } });
  const att = app.getSubjectAttendance(card('Data Structures'));
  return att.projection === null && app.attV2ProjectionText(att) === '' ? true : JSON.stringify(att.projection);
});

check('A lab at risk colours its card red and the line names the lab', () => {
  seed({ baselines: { X1: base('Data Structures', 'X1', 30, 2), X2: base('Data Structures Lab', 'X2', 5, 10) } });
  const el = { innerHTML: '' };
  app.renderSubjectsOverview(el, app.getSubjectList());
  const h = el.innerHTML;
  return /sj-card risk/.test(h) && /Lab: Attend the next \d+ to reach 75%/.test(h) && h.includes('Lab 33.33%')
    ? true : 'card not marked at risk by its lab';
});

check('Monthly check, below target: overall 69.27% -> defaulter list, attend the next 50', () => {
  seed({ baselines: erpBaselines() });
  const m = app.attV2MonthlyCheck(app.getOverallAttendance(), 75);
  // 151/218 -> 201/268 = 75.00% after 50 more classes
  return m && !m.isSafe && m.text === "October check: 69.27%, below 75%. You'd be on this month's defaulter list. Attend the next 50 classes to clear it."
    && m.short === 'October: defaulter list' ? true : JSON.stringify(m);
});

check('Monthly check, on track: 17/18 = 94.44% (can miss 4)', () => {
  seed({ baselines: { X1: base('Art of Public Speaking', 'X1', 17, 1) } });
  const m = app.attV2MonthlyCheck(app.getOverallAttendance(), 75);
  return m && m.isSafe && m.text === "On track for October's check: 94.44% (you can miss 4)" ? true : JSON.stringify(m);
});

check('Cloud summary carries the overall % on the new math, nothing on the old', () => {
  seed({ baselines: erpBaselines() });
  const s = app.buildAttendanceCloudSummary();
  seed({ baselines: erpBaselines(), mode: 'v1' });
  const old = app.buildAttendanceCloudSummary();
  return s && s.pct === '69.27' && s.isSafe === false && s.attended === 151 && s.held === 218 && s.target === 75 && old === null
    ? true : `${JSON.stringify(s)} / v1 ${JSON.stringify(old)}`;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ ATTENDANCE v2 EXTRAS TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ATTENDANCE v2 EXTRAS TESTS PASSED! 🚀');
process.exit(0);
