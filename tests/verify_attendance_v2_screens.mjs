// ==================================================================
// Clarity Desk: SCREENS SWITCH TO ERP-EXACT ATTENDANCE (step 3a)
// ==================================================================
// getSubjectAttendance / getOverallAttendance route to the v2 numbers
// (derived from the v1 stores) once this device has chosen them, keeping
// their return shape so every screen follows. Locks down: the choice and
// its defaults, the ERP numbers on cards and overall, exact "safe",
// guidance and the weekly target, the on-device alert, the preview,
// switching back, today's marks surviving a timetable re-save, and a
// scan replacing the +1 taps it covers. Course names are generic; codes
// and dates are made up.
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
const notes = [];
globalThis.Notification = function (title, opts) { notes.push({ title, body: opts && opts.body }); };
globalThis.Notification.permission = 'granted';
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
const app = new Function(`${code}\n return { state, getSubjectList, getSubjectAttendance, getSubjectAttendanceV1, getOverallAttendance, getOverallAttendanceV1, isAttendanceV2Active, calculateSmartAttendanceGuidance, renderWeeklyAttendanceTracker, checkScheduledNotifications, buildAttendanceV2PreviewData, checkAttendanceV2Preview, clearUpcomingAttendanceForNewSchedule, clearUndatedTapsCoveredBy };`)();
globalThis.showToast = () => {};
app.state.currentPage = 'none';

const tt = (days) => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...days });
const cls = (subject, code, time, type = 'lecture') => ({ subject, code, time, end: `${String(+time.slice(0, 2) + 1).padStart(2, '0')}:${time.slice(3)}`, type });
function seed({ attendance = {}, baselines = {}, live = {}, timetable = tt({}), mode, target } = {}) {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_attendance = JSON.stringify(attendance);
  store.cos_attendance_baseline = JSON.stringify(baselines);
  store.cos_attendance_live = JSON.stringify(live);
  store.cos_custom_timetable = JSON.stringify(timetable);
  if (mode) store.cos_att_v2_state = JSON.stringify({ mode, decidedAt: '2026-10-14T00:00:00.000Z' });
  if (target) store.cos_att_target = String(target);
}
const card = (name) => app.getSubjectList().find(s => s.name === name);
const ERP_ROWS = [
  ['Art of Public Speaking', 17, 1, 0], ['Business Management and Financial Accounting', 6, 4, 0],
  ['Community Engagement', 19, 6, 1], ['Constitution of India', 14, 4, 0], ['Data Structures', 19, 13, 0],
  ['Data Structures Lab', 10, 6, 0], ['Digital Electronics and Microprocessors', 22, 9, 0],
  ['Digital Electronics and Microprocessors Lab', 9, 6, 0], ['Introduction to Business Analytics', 4, 5, 0],
  ['Personality Development', 0, 0, 0], ['Probability and Statistics', 22, 8, 0], ['Web Development Lab', 9, 5, 0]
];
const erpBaselines = () => {
  const b = {};
  ERP_ROWS.forEach(([n, p, a, ne], i) => { b[`X${100 + i}`] = { subjectName: n, subjectCode: `X${100 + i}`, present: p, absent: a, leave: 0, notEntered: ne, totalSessions: 60, updatedAt: '2026-10-13T20:00:00.000Z' }; });
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
console.log('🖥️  SCREENS USE ERP-EXACT ATTENDANCE (step 3a)');
console.log('==================================================================');

check('No choice yet: a student with attendance data stays on the old numbers', () => {
  seed({ baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 149, absent: 51 } } });
  const s = card('Data Structures');
  return app.isAttendanceV2Active() === false
    && JSON.stringify(app.getSubjectAttendance(s)) === JSON.stringify(app.getSubjectAttendanceV1(s)) ? true : 'not on v1';
});

check('Start-up with no attendance data: the new math is chosen and kept after the first mark', () => {
  seed({});
  app.checkAttendanceV2Preview();
  store.cos_attendance = JSON.stringify({ '2026-10-12': { DS_1000: 'attended' } });
  return app.isAttendanceV2Active() === true && JSON.parse(store.cos_att_v2_state).mode === 'v2' ? true : 'not kept on v2';
});

check('Subject cards keep the old return shape (every old field is still there)', () => {
  seed({ baselines: erpBaselines(), mode: 'v2' });
  const s = card('Data Structures');
  const v1Keys = Object.keys(app.getSubjectAttendanceV1(s));
  const v2 = app.getSubjectAttendance(s);
  const missing = v1Keys.filter(k => !(k in v2));
  return missing.length === 0 ? true : `missing: ${missing.join(', ')}`;
});

check('ERP table on screen: card %, lab line, lab-only card and overall 69.27 (151/218)', () => {
  seed({ baselines: erpBaselines(), mode: 'v2' });
  const ds = app.getSubjectAttendance(card('Data Structures'));
  const wd = app.getSubjectAttendance(card('Web Development'));
  const o = app.getOverallAttendance();
  const ok = ds.pctLabel === '59.38' && ds.attended === 19 && ds.total === 32
    && ds.labPart && ds.labPart.pctLabel === '62.50'
    && wd.pctLabel === '64.29'
    && o.pctLabel === '69.27' && o.attended === 151 && o.total === 218;
  return ok ? true : `DS ${ds.pctLabel} lab ${ds.labPart && ds.labPart.pctLabel}, WD ${wd.pctLabel}, overall ${o.attended}/${o.total} ${o.pctLabel}`;
});

check('74.50% is not safe: card, guidance and dashboard numbers all say so', () => {
  seed({ baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 149, absent: 51, updatedAt: '2026-10-01T10:00:00.000Z' } }, mode: 'v2' });
  const a = app.getSubjectAttendance(card('Data Structures'));
  const g = app.calculateSmartAttendanceGuidance(149, 51, 75);
  const o = app.getOverallAttendance();
  const ok = a.pctLabel === '74.50' && a.isSafe === false && a.classesToAttend === 4
    && /Need to attend 4 classes/.test(a.insightMessage)
    && g.isSafe === false && g.message.includes('74.50%') && g.classesToAttend === 4
    && o.isSafe === false;
  return ok ? true : JSON.stringify({ label: a.pctLabel, safe: a.isSafe, need: a.classesToAttend, msg: a.insightMessage, g: g.message, o: o.isSafe });
});

check('Weekly review uses your own target (85%), not a fixed 75%', () => {
  // 4 of 5 this week = 80.00%: safe at 75%, but 3 classes short of 85%.
  const mon = ['09:00', '10:00', '11:00', '12:00', '13:00'].map(t => cls('Data Structures', 'DS', t));
  const marks = { DS_0900: 'attended', DS_1000: 'attended', DS_1100: 'attended', DS_1200: 'attended', DS_1300: 'skipped' };
  seed({ timetable: tt({ 1: mon }), attendance: { '2026-10-12': marks }, mode: 'v2', target: 85 });
  const html = app.renderWeeklyAttendanceTracker();
  return html.includes('reach the 85% target') && html.includes('80.00%') ? true : 'weekly guidance does not use 85%';
});

check('On-device alert uses the overall % (baseline included), not daily marks alone', () => {
  seed({
    timetable: tt({ 1: [cls('Data Structures', 'DS', '10:00')] }),
    attendance: { '2026-10-12': { DS_1000: 'skipped' } },
    baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 90, absent: 5, updatedAt: '2026-10-01T10:00:00.000Z' } },
    mode: 'v2'
  });
  notes.length = 0;
  app.checkScheduledNotifications();
  const noFalseAlarm = !notes.some(n => /Attendance Alert/.test(n.title));
  seed({ baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 149, absent: 51, updatedAt: '2026-10-01T10:00:00.000Z' } }, mode: 'v2' });
  notes.length = 0;
  app.checkScheduledNotifications();
  const alert = notes.find(n => /Attendance Alert/.test(n.title));
  return noFalseAlarm && alert && alert.title === 'Attendance Alert: 74.50%'
    ? true : `false alarm: ${!noFalseAlarm}, alert: ${alert && alert.title}`;
});

check('Preview lists what changes and why (marks before the scan not counted twice)', () => {
  const att = {};
  ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']
    .forEach((d, i) => { att[d] = { DS_1000: i < 4 ? 'attended' : 'skipped' }; });
  seed({
    timetable: tt({ 1: [cls('Data Structures', 'DS', '10:00')] }),
    attendance: att,
    baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 8, updatedAt: '2026-10-13T12:30:00.000Z' } }
  });
  const p = app.buildAttendanceV2PreviewData();
  const row = p.changed.find(r => r.name === 'Data Structures');
  return row && row.oldPct === 70.59 && row.newLabel === '71.43' && /already in it/.test(row.reasons.join(' '))
    ? true : JSON.stringify(p.changed);
});

check('Start-up with data: the preview is shown and nothing is chosen until the student picks', () => {
  seed({ baselines: erpBaselines() });
  appended.length = 0;
  app.checkAttendanceV2Preview();
  return store.cos_att_v2_state === undefined && app.isAttendanceV2Active() === false ? true : `state ${store.cos_att_v2_state}`;
});

check('Start-up with data but nothing would change: switches quietly', () => {
  seed({ baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 5, updatedAt: '2026-10-01T10:00:00.000Z' } } });
  app.checkAttendanceV2Preview();
  return app.isAttendanceV2Active() === true ? true : 'did not switch';
});

check('"Keep old numbers" gives back exactly the old results', () => {
  seed({ baselines: erpBaselines() });
  window.setAttendanceMathMode(false);
  const s = card('Data Structures');
  const same = JSON.stringify(app.getSubjectAttendance(s)) === JSON.stringify(app.getSubjectAttendanceV1(s))
    && JSON.stringify(app.getOverallAttendance()) === JSON.stringify(app.getOverallAttendanceV1());
  return same && JSON.parse(store.cos_att_v2_state).mode === 'v1' ? true : 'v1 numbers differ';
});

check('Re-saving the timetable keeps marks already taken today (only later dates are cleared)', () => {
  const wed = tt({ 3: [cls('Data Structures', 'DS', '10:00')] });
  seed({ timetable: wed, attendance: { '2026-10-14': { DS_1000: 'attended' }, '2026-10-21': { DS_1000: 'skipped' } } });
  app.clearUpcomingAttendanceForNewSchedule(wed);
  const a = JSON.parse(store.cos_attendance);
  return a['2026-10-14'] && a['2026-10-14'].DS_1000 === 'attended' && !a['2026-10-21'] ? true : JSON.stringify(a);
});

check('A new scan replaces the +1 taps it covers (theory only, on the new math only)', () => {
  seed({ live: { DS: { present: 2 }, OS: { present: 1 } }, mode: 'v2' });
  const n1 = app.clearUndatedTapsCoveredBy([{ name: 'Data Structures', code: 'X104' }]);
  const after = JSON.parse(store.cos_attendance_live);
  seed({ live: { DS: { present: 2 } }, mode: 'v2' });
  const nLab = app.clearUndatedTapsCoveredBy([{ name: 'Data Structures Lab', code: 'X105' }]);
  seed({ live: { DS: { present: 2 } }, mode: 'v1' });
  const nOld = app.clearUndatedTapsCoveredBy([{ name: 'Data Structures', code: 'X104' }]);
  return n1 === 1 && !after.DS && after.OS && nLab === 0 && nOld === 0
    ? true : `cleared ${n1} (left ${JSON.stringify(after)}), lab ${nLab}, v1 ${nOld}`;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ ATTENDANCE v2 SCREEN TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ATTENDANCE v2 SCREEN TESTS PASSED! 🚀');
process.exit(0);
