// ==================================================================
// Clarity Desk: ATTENDANCE v1 -> v2 CONVERSION KEEPS EVERY RECORD
// ==================================================================
// Step 2 of the attendance redesign: buildAttendanceV2FromV1 turns the
// three v1 stores (daily marks, ERP/manual baselines, +1 taps) into the
// v2 store. It is pure and not called by any screen yet. This locks down:
// nothing is lost, clean data keeps its exact %, numbers change only
// where v1 double-counted or mixed subjects, labs become their own
// subjects, and the conversion is repeatable. Course names are generic;
// codes and dates are made up.
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
const app = new Function(`${code}\n return { getSubjectList, getSubjectAttendance, buildAttendanceV2FromV1, mergeV1MarksIntoV2, attendanceV1FromBackup };`)();

const NOW = '2026-10-15T00:00:00.000Z';
const OPTS = { now: NOW, targetPct: 75 };
const tt = (days) => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...days });
const cls = (subject, code, time, type = 'lecture') => ({ subject, code, time, end: `${String(+time.slice(0, 2) + 1).padStart(2, '0')}:${time.slice(3)}`, type });
// Seeds the v1 stores so the OLD functions can be run on the same data.
function seedV1(v1, timetable) {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_attendance = JSON.stringify(v1.attendance || {});
  store.cos_attendance_baseline = JSON.stringify(v1.baselines || {});
  store.cos_attendance_live = JSON.stringify(v1.live || {});
  store.cos_custom_timetable = JSON.stringify(timetable);
}
const convert = (v1, timetable) => app.buildAttendanceV2FromV1(v1, timetable, OPTS);

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
console.log('🔁 ATTENDANCE v1 -> v2 CONVERSION');
console.log('==================================================================');

check('Clean data: every subject keeps exactly the % the old app shows', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')], 2: [cls('Operating Systems', 'OS', '11:00')] });
  const v1 = {
    attendance: {
      '2026-09-07': { DS_1000: 'attended' }, '2026-09-08': { OS_1100: 'attended' },
      '2026-09-14': { DS_1000: 'skipped' },  '2026-09-15': { OS_1100: 'attended' },
      '2026-09-21': { DS_1000: 'attended' }, '2026-09-22': { OS_1100: 'skipped' }
    },
    baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 5, leave: 1, notEntered: 2, updatedAt: '2026-08-31T12:00:00.000Z' } }
  };
  seedV1(v1, timetable);
  const { report } = convert(v1, timetable);
  const bad = app.getSubjectList().map(s => {
    const oldPct = app.getSubjectAttendance(s).exactPct;
    const v2 = Object.values(report.subjects).find(r => r.name === s.name);
    return v2 && v2.percent.pct === oldPct ? null : `${s.name}: old ${oldPct}, new ${v2 && v2.percent.pct}`;
  }).filter(Boolean);
  return bad.length === 0 ? true : bad.join('; ');
});

check('Nothing is lost: sessions + unmatched marks = every old mark; taps add up', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')], 2: [cls('Operating Systems', 'OS', '11:00')] });
  const v1 = {
    attendance: {
      '2026-10-12': { DS_1000: 'attended', DS_0900: 'skipped', DSA_1000: 'attended', ZZQ_1000: 'attended', Weird_1000: 'maybe' },
      '2026-10-13': { OS_1100: 'skipped' },
      'not-a-date': { DS_1000: 'attended' }
    },
    live: { DS: { present: 2, missed: 1, leave: 0 }, 'No Such Subject': { present: 1 } }
  };
  const { store: v2, report } = convert(v1, timetable);
  const c = report.counts;
  const unmatchedKeys = v2.unmatched.marks.map(m => `${m.date}/${m.key}`).sort().join(',');
  const ok = c.v1Marks === 7 && c.sessions + c.unmatchedMarks === 7 && c.sessions === 3
    && unmatchedKeys === '2026-10-12/DSA_1000,2026-10-12/Weird_1000,2026-10-12/ZZQ_1000,not-a-date/DS_1000'
    && c.v1Taps === 4 && c.keptTaps === 3 && c.unmatchedTaps === 1;
  return ok ? true : `${JSON.stringify(c)} unmatched=${unmatchedKeys}`;
});

check('A mark whose class time changed still finds its subject by code (DS_0900 -> Data Structures)', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')] });
  const { store: v2 } = convert({ attendance: { '2026-10-12': { DS_0900: 'attended' } } }, timetable);
  const s = v2.sessions['2026-10-12_DS_0900'];
  return s && s.subjectId === 'datastructures' && s.slot === '09:00' ? true : JSON.stringify(s);
});

check('Double counting removed: marks made before the ERP scan are history, not extra (24/34 -> 20/28)', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')] });
  const att = {};
  ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']
    .forEach((d, i) => { att[d] = { DS_1000: i < 4 ? 'attended' : 'skipped' }; });
  const v1 = { attendance: att, baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 8, updatedAt: '2026-10-14T12:30:00.000Z' } } };
  seedV1(v1, timetable);
  const old = app.getSubjectAttendance(app.getSubjectList()[0]);
  const r = convert(v1, timetable).report.subjects.datastructures;
  return old.present === 24 && old.total === 34 && r.attended === 20 && r.held === 28 && r.percent.display === '71.43' && r.coveredByBaseline === 6
    ? true : `old ${old.present}/${old.total}, new ${r.attended}/${r.held} ${r.percent.display}, covered ${r.coveredByBaseline}`;
});

check('Same day as the scan: a class before the scan time is covered, one after it counts', () => {
  // Scan saved 14 Oct 18:00 IST (Wednesday). 10:00 class is in it; 19:00 class is not.
  const timetable = tt({ 3: [cls('Data Structures', 'DS', '10:00'), cls('Data Structures', 'DS', '19:00')] });
  const v1 = {
    attendance: { '2026-10-14': { DS_1000: 'attended', DS_1900: 'skipped' } },
    baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 8, updatedAt: '2026-10-14T12:30:00.000Z' } }
  };
  const r = convert(v1, timetable).report.subjects.datastructures;
  return r.attended === 20 && r.held === 29 && r.coveredByBaseline === 1 ? true : `${r.attended}/${r.held}, covered ${r.coveredByBaseline}`;
});

check('Each mark counts for one subject only (Java vs Advanced Java, no substring matching)', () => {
  const timetable = tt({ 1: [cls('Java', '', '10:00'), cls('Advanced Java', '', '14:00')] });
  const v1 = { attendance: { '2026-10-12': { Java_1000: 'attended', AdvancedJava_1400: 'skipped' } } };
  const { report } = convert(v1, timetable);
  const j = Object.values(report.subjects).find(s => s.name === 'Java');
  const aj = Object.values(report.subjects).find(s => s.name === 'Advanced Java');
  return j.attended === 1 && j.held === 1 && aj.attended === 0 && aj.held === 1 && report.overall.held === 2
    ? true : `Java ${j.attended}/${j.held}, Adv ${aj.attended}/${aj.held}, overall held ${report.overall.held}`;
});

check('ERP table: 12 subjects (labs separate, linked to theory), overall 151 / 218 = 69.27', () => {
  // The old app merges the two labs into their theory cards and shows 132/188 = 70.21.
  const rows = [
    ['Art of Public Speaking', 17, 1, 0], ['Business Management and Financial Accounting', 6, 4, 0],
    ['Community Engagement', 19, 6, 1], ['Constitution of India', 14, 4, 0], ['Data Structures', 19, 13, 0],
    ['Data Structures Lab', 10, 6, 0], ['Digital Electronics and Microprocessors', 22, 9, 0],
    ['Digital Electronics and Microprocessors Lab', 9, 6, 0], ['Introduction to Business Analytics', 4, 5, 0],
    ['Personality Development', 0, 0, 0], ['Probability and Statistics', 22, 8, 0], ['Web Development Lab', 9, 5, 0]
  ];
  const baselines = {};
  rows.forEach(([n, p, a, ne], i) => { baselines[`X${100 + i}`] = { subjectName: n, subjectCode: `X${100 + i}`, present: p, absent: a, leave: 0, notEntered: ne, totalSessions: 60, updatedAt: '2026-10-14T20:00:00.000Z' }; });
  const { store: v2, report } = convert({ baselines }, tt({}));
  const lab = v2.subjects['datastructures__lab'];
  const ok = Object.keys(v2.subjects).length === 12 && report.overall.attended === 151 && report.overall.held === 218
    && report.overall.display === '69.27' && lab && lab.kind === 'lab' && lab.parentId === 'datastructures'
    && report.subjects['datastructures__lab'].percent.display === '62.50';
  return ok ? true : `${Object.keys(v2.subjects).length} subjects, ${report.overall.attended}/${report.overall.held} ${report.overall.display}, lab ${JSON.stringify(lab)}`;
});

check('Lab and theory sharing a code: exact slots decide; an unknown time stays unmatched', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')], 2: [cls('Data Structures Lab', 'DS', '14:00', 'lab')] });
  const v1 = { attendance: { '2026-10-12': { DS_1000: 'attended', DS_0800: 'skipped', DSLab_0800: 'skipped' }, '2026-10-13': { DS_1400: 'skipped' } } };
  const { store: v2 } = convert(v1, timetable);
  const sub = (id) => v2.sessions[id] && v2.sessions[id].subjectId;
  const ok = sub('2026-10-12_DS_1000') === 'datastructures' && sub('2026-10-13_DS_1400') === 'datastructures__lab'
    && sub('2026-10-12_DSLab_0800') === 'datastructures__lab'
    && v2.unmatched.marks.length === 1 && v2.unmatched.marks[0].key === 'DS_0800';
  return ok ? true : JSON.stringify({ sessions: Object.values(v2.sessions).map(s => [s.id, s.subjectId]), unmatched: v2.unmatched.marks });
});

check('A baseline with no save date keeps the old behaviour: marks still add on top', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')] });
  const v1 = {
    attendance: { '2026-09-07': { DS_1000: 'attended' }, '2026-09-14': { DS_1000: 'skipped' } },
    baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 8 } }
  };
  seedV1(v1, timetable);
  const old = app.getSubjectAttendance(app.getSubjectList()[0]);
  const r = convert(v1, timetable).report.subjects.datastructures;
  return r.legacyBaseline && r.attended === old.present && r.held === old.total && r.attended === 21 && r.held === 30
    ? true : `legacy ${r.legacyBaseline}, new ${r.attended}/${r.held}, old ${old.present}/${old.total}`;
});

check('Two baselines for one subject: the newest scan is used, the older one reported', () => {
  const v1 = { baselines: {
    DS:    { subjectName: 'Data Structures', subjectCode: 'DS',    present: 10, absent: 2,  updatedAt: '2026-08-20T10:00:00.000Z' },
    CS201: { subjectName: 'Data Structures', subjectCode: 'CS201', present: 40, absent: 15, updatedAt: '2026-10-14T10:00:00.000Z' }
  } };
  const r = convert(v1, tt({})).report.subjects.datastructures;
  return r.attended === 40 && r.held === 55 && r.baselineKey === 'CS201' && JSON.stringify(r.ignoredBaselines) === '["DS"]'
    ? true : `${r.attended}/${r.held} via ${r.baselineKey}, ignored ${JSON.stringify(r.ignoredBaselines)}`;
});

check('+1 taps keep the same totals and are flagged as undated', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')] });
  const v1 = {
    attendance: { '2026-10-12': { DS_1000: 'attended' } },
    baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 10, absent: 4, updatedAt: '2026-10-01T10:00:00.000Z' } },
    live: { DS: { present: 1, missed: 0, leave: 0 } }
  };
  seedV1(v1, timetable);
  const old = app.getSubjectAttendance(app.getSubjectList()[0]);
  const r = convert(v1, timetable).report.subjects.datastructures;
  return r.attended === old.present && r.held === old.total && r.undatedTaps && r.undatedTaps.present === 1
    ? true : `new ${r.attended}/${r.held}, old ${old.present}/${old.total}, taps ${JSON.stringify(r.undatedTaps)}`;
});

check('Repeatable: converting twice gives identical output; a backup file converts the same', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')], 2: [cls('Data Structures Lab', 'DSL', '14:00', 'lab')] });
  const v1 = {
    attendance: { '2026-10-12': { DS_1000: 'attended', ZZQ_1000: 'skipped' }, '2026-10-13': { DSL_1400: 'skipped' } },
    baselines: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 5, absent: 1, updatedAt: '2026-10-01T10:00:00.000Z' } },
    live: { DS: { present: 1 } }
  };
  const a = JSON.stringify(convert(v1, timetable)), b = JSON.stringify(convert(v1, timetable));
  const backup = { attendance: v1.attendance, attendanceBaseline: v1.baselines, attendanceLive: v1.live, customTimetable: timetable };
  const c = JSON.stringify(app.buildAttendanceV2FromV1(app.attendanceV1FromBackup(backup), backup.customTimetable, OPTS));
  return a === b && a === c ? true : 'outputs differ';
});

check('Old-version device: new v1 marks are added once, existing sessions untouched', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')] });
  const v1 = { attendance: { '2026-10-12': { DS_1000: 'attended' } } };
  const { store: v2 } = convert(v1, timetable);
  const v1Later = { attendance: { '2026-10-12': { DS_1000: 'skipped' }, '2026-10-19': { DS_1000: 'attended', ZZQ_1000: 'attended' } } };
  const m1 = app.mergeV1MarksIntoV2(v2, v1Later, timetable);
  const m2 = app.mergeV1MarksIntoV2(m1.store, v1Later, timetable);
  const ok = m1.added === 2 && m1.store.sessions['2026-10-12_DS_1000'].status === 'present'
    && m1.store.sessions['2026-10-19_DS_1000'] && m1.store.unmatched.marks.length === 1
    && m2.added === 0 && JSON.stringify(m2.store) === JSON.stringify(m1.store)
    && v2.sessions['2026-10-19_DS_1000'] === undefined;
  return ok ? true : `added ${m1.added} then ${m2.added}`;
});

check('Conversion never writes to storage', () => {
  const timetable = tt({ 1: [cls('Data Structures', 'DS', '10:00')] });
  seedV1({ attendance: { '2026-10-12': { DS_1000: 'attended' } } }, timetable);
  const before = JSON.stringify(store);
  convert({ attendance: { '2026-10-12': { DS_1000: 'attended' } }, live: { DS: { present: 1 } } }, timetable);
  app.mergeV1MarksIntoV2(convert({}, timetable).store, { attendance: { '2026-10-19': { DS_1000: 'attended' } } }, timetable);
  return JSON.stringify(store) === before ? true : 'storage changed';
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ ATTENDANCE v2 MIGRATION TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ATTENDANCE v2 MIGRATION TESTS PASSED! 🚀');
process.exit(0);
