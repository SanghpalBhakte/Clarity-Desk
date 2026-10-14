// ==================================================================
// Clarity Desk: OD, CANCELLED, EXTRA CLASSES, UNMATCHED MARKS (step 4)
// ==================================================================
// New values in cos_attendance: od_pending (absent, as the ERP shows it),
// od_accepted (present), od_rejected (absent), cancelled (not counted).
// Extra classes are ordinary marks whose key ends in "x". Unmatched old
// marks can be moved to a subject (key renamed, with an undo log). Locks
// down the counting, that the v1 math and older versions ignore the new
// values, the weekly page, and that nothing is lost. Course names are
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
const app = new Function(`${code}\n return { getSubjectList, getSubjectAttendance, getSubjectAttendanceV1, renderWeeklyAttendanceTracker, buildAttendanceV2FromV1, attendanceV1FromBackup, addExtraClassMark, listUnmatchedAttendanceMarks, reassignAttendanceMark, undoLastAttendanceReassign, calculateAttendanceStreak };`)();

const tt = (days) => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...days });
const cls = (subject, code, time, type = 'lecture') => ({ subject, code, time, end: `${String(+time.slice(0, 2) + 1).padStart(2, '0')}:${time.slice(3)}`, type });
const DS_MON = tt({ 1: [cls('Data Structures', 'DS', '10:00')] });
function seed({ attendance = {}, baselines = {}, timetable = DS_MON, mode = 'v2' } = {}) {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_attendance = JSON.stringify(attendance);
  store.cos_attendance_baseline = JSON.stringify(baselines);
  store.cos_attendance_live = '{}';
  store.cos_custom_timetable = JSON.stringify(timetable);
  store.cos_att_v2_state = JSON.stringify({ mode, decidedAt: '2026-10-14T00:00:00.000Z' });
}
const card = (name) => app.getSubjectList().find(s => s.name === name);
const FIVE_MONDAYS = {
  '2026-09-07': { DS_1000: 'attended' },
  '2026-09-14': { DS_1000: 'skipped' },
  '2026-09-21': { DS_1000: 'od_pending' },
  '2026-09-28': { DS_1000: 'od_accepted' },
  '2026-10-05': { DS_1000: 'cancelled' }
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
console.log('🏷️  OD · CANCELLED · EXTRA CLASSES · UNMATCHED MARKS (step 4)');
console.log('==================================================================');

check('Counting: accepted OD present, waiting OD absent, cancelled not counted (2/4 = 50.00)', () => {
  seed({ attendance: FIVE_MONDAYS });
  const a = app.getSubjectAttendance(card('Data Structures'));
  return a.attended === 2 && a.total === 4 && a.pctLabel === '50.00' ? true : `${a.attended}/${a.total} ${a.pctLabel}`;
});

check('A waiting OD is listed with the % if accepted (3/4 = 75.00)', () => {
  seed({ attendance: FIVE_MONDAYS });
  const a = app.getSubjectAttendance(card('Data Structures'));
  return a.odWaiting.length === 1 && a.odWaiting[0].date === '2026-09-21' && a.odWaiting[0].key === 'DS_1000' && a.ifAcceptedLabel === '75.00'
    ? true : JSON.stringify({ w: a.odWaiting, ifA: a.ifAcceptedLabel });
});

check('A rejected OD counts as absent', () => {
  seed({ attendance: { ...FIVE_MONDAYS, '2026-09-21': { DS_1000: 'od_rejected' } } });
  const a = app.getSubjectAttendance(card('Data Structures'));
  return a.attended === 2 && a.total === 4 && a.odWaiting.length === 0 ? true : `${a.attended}/${a.total}, waiting ${a.odWaiting.length}`;
});

check('An OD older than a newer ERP scan is not listed as waiting (the scan has the answer)', () => {
  seed({ attendance: FIVE_MONDAYS, baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 10, absent: 2, updatedAt: '2026-10-01T12:00:00.000Z' } } });
  const a = app.getSubjectAttendance(card('Data Structures'));
  return a.odWaiting.length === 0 && a.attended === 10 && a.total === 12 ? true : `waiting ${a.odWaiting.length}, ${a.attended}/${a.total}`;
});

check('The old math (and older app versions) ignore the new values without errors', () => {
  seed({ attendance: FIVE_MONDAYS, mode: 'v1' });
  const a = app.getSubjectAttendanceV1(card('Data Structures'));
  const streak = app.calculateAttendanceStreak();
  return a.dailyAttended === 1 && a.dailySkipped === 1 && Number.isFinite(streak) ? true : `${a.dailyAttended}/${a.dailySkipped}`;
});

check('Extra class: counted for its subject on both maths; a second one at the same time is refused', () => {
  seed({ attendance: { '2026-10-12': { DS_1000: 'attended' } } });
  const r1 = app.addExtraClassMark('2026-10-13', 'Data Structures', '15:30', 'attended');
  const r2 = app.addExtraClassMark('2026-10-13', 'Data Structures', '15:30', 'skipped');
  const v2 = app.getSubjectAttendance(card('Data Structures'));
  seed({ attendance: JSON.parse(store.cos_attendance), mode: 'v1' });
  const v1 = app.getSubjectAttendanceV1(card('Data Structures'));
  return r1.ok && r1.key === 'DataStructures_1530x' && !r2.ok && v2.attended === 2 && v2.total === 2 && v1.dailyAttended === 2
    ? true : JSON.stringify({ r1, r2: r2.ok, v2: `${v2.attended}/${v2.total}`, v1: v1.dailyAttended });
});

check('Extra lab class goes to the lab even when lab and theory share a code', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')], 2: [cls('Data Structures Lab', 'DS', '14:00', 'lab')] });
  seed({ timetable, attendance: { '2026-10-12': { DS_1000: 'attended' } } });
  app.addExtraClassMark('2026-10-14', 'Data Structures Lab', '15:00', 'skipped');
  const a = app.getSubjectAttendance(card('Data Structures'));
  return a.attended === 1 && a.total === 1 && a.labPart && a.labPart.attended === 0 && a.labPart.total === 1
    ? true : `theory ${a.attended}/${a.total}, lab ${a.labPart && `${a.labPart.attended}/${a.labPart.total}`}`;
});

check('Unmatched old mark: listed, moved to the chosen subject, counted, and no longer listed', () => {
  seed({ attendance: { '2026-10-12': { DS_1000: 'attended', DSA_0900: 'skipped' } } });
  const before = app.listUnmatchedAttendanceMarks();
  const res = app.reassignAttendanceMark('2026-10-12', 'DSA_0900', 'datastructures');
  const day = JSON.parse(store.cos_attendance)['2026-10-12'];
  const a = app.getSubjectAttendance(card('Data Structures'));
  const after = app.listUnmatchedAttendanceMarks();
  return before.length === 1 && before[0].key === 'DSA_0900' && res.ok && res.newKey === 'DataStructures_0900'
    && day.DataStructures_0900 === 'skipped' && !('DSA_0900' in day) && a.attended === 1 && a.total === 2 && after.length === 0
    ? true : JSON.stringify({ before, res, day, a: `${a.attended}/${a.total}`, after });
});

check('Moving a mark onto a class the subject already has is refused, nothing overwritten', () => {
  seed({ attendance: { '2026-10-12': { DataStructures_1000: 'attended', ZZQ_1000: 'skipped' } } });
  const res = app.reassignAttendanceMark('2026-10-12', 'ZZQ_1000', 'datastructures');
  const day = JSON.parse(store.cos_attendance)['2026-10-12'];
  return !res.ok && day.DataStructures_1000 === 'attended' && day.ZZQ_1000 === 'skipped' ? true : JSON.stringify({ res, day });
});

check('Undo puts the moved mark back exactly', () => {
  seed({ attendance: { '2026-10-12': { DS_1000: 'attended', DSA_0900: 'skipped' } } });
  const before = store.cos_attendance;
  app.reassignAttendanceMark('2026-10-12', 'DSA_0900', 'datastructures');
  const u = app.undoLastAttendanceReassign();
  return u.ok && store.cos_attendance === before && JSON.parse(store.cos_att_reassign_log).length === 0 ? true : `${JSON.stringify(u)} ${store.cos_attendance}`;
});

check('Nothing lost: every mark with a new value is a session or an unmatched mark; backup converts the same', () => {
  const att = { ...FIVE_MONDAYS, '2026-10-12': { DS_1000: 'attended', ZZQ_1000: 'od_pending', DataStructures_1530x: 'attended' } };
  const v1 = { attendance: att, baselines: {}, live: {} };
  const a = app.buildAttendanceV2FromV1(v1, DS_MON, { now: 'x', targetPct: 75 });
  const b = app.buildAttendanceV2FromV1(app.attendanceV1FromBackup(JSON.parse(JSON.stringify({ attendance: att }))), DS_MON, { now: 'x', targetPct: 75 });
  const c = a.report.counts;
  return c.v1Marks === 8 && c.sessions + c.unmatchedMarks === 8 && c.unmatchedMarks === 1 && JSON.stringify(a) === JSON.stringify(b)
    ? true : JSON.stringify(c);
});

check('Weekly page: OD chip with Accepted / Rejected, the ⋯ menu, and totals that follow the statuses', () => {
  const mon = ['09:00', '10:00', '11:00', '12:00', '13:00'].map(t => cls('Data Structures', 'DS', t));
  seed({ timetable: tt({ 1: mon }), attendance: { '2026-10-12': { DS_0900: 'attended', DS_1000: 'od_accepted', DS_1100: 'skipped', DS_1200: 'od_pending', DS_1300: 'cancelled' } } });
  const h = app.renderWeeklyAttendanceTracker();
  const ok = h.includes('OD · waiting for teacher') && h.includes("'od_accepted')") && h.includes("'od_rejected')")
    && h.includes("Didn't happen") && h.includes('OD (waiting for teacher)') && h.includes('50.00%');
  return ok ? true : 'weekly page missing OD controls or wrong totals';
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ ATTENDANCE v2 STATUS TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ATTENDANCE v2 STATUS TESTS PASSED! 🚀');
process.exit(0);
