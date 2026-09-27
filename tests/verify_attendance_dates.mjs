// ==================================================================
// Clarity Desk: ATTENDANCE DATE KEYS (India, UTC+5:30)
// ==================================================================
// v166 bug: the timetable page stored/read Present-Absent marks under
// d.toISOString() of a local-midnight Date -- the UTC date, which in India
// is the PREVIOUS day. So the Tuesday tab showed Monday's marks (and a tap
// there toggled Monday's), while Today used the correct date. Also, an app
// left open past midnight kept showing yesterday until reloaded.
// This locks down: local date keys, the one-time repair of old shifted
// marks, and the day-change refresh.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

// ── Controllable clock ────────────────────────────────────────────────
const RealDate = Date;
let NOW = new RealDate('2026-09-29T12:00:00+05:30').getTime();   // Tuesday noon, IST
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
const domCache = {};
const domStub = (id) => (domCache[id] ||= { id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
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
const makeApp = () => new Function(`${code}\n return { state, localDateKey, todayStr, fixShiftedAttendanceDates, refreshIfDayChanged, renderTimetable };`)();

// DS runs Monday AND Tuesday at 10:00; WD only on Tuesday.
const DS = { subject: 'Data Structures', code: 'DS', time: '10:00', end: '11:00', type: 'lecture' };
const WD = { subject: 'Web Development', code: 'WD', time: '11:00', end: '12:00', type: 'lecture' };
function seed(attendance) {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_custom_timetable = JSON.stringify({ 0: [], 1: [DS], 2: [DS, WD], 3: [], 4: [], 5: [], 6: [] });
  store.cos_attendance = JSON.stringify(attendance);
}
const attendance = () => JSON.parse(store.cos_attendance || '{}');

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
console.log('📅 ATTENDANCE DATE KEYS (Asia/Kolkata)');
console.log('==================================================================');

check('Premise: in India the old toISOString() key of a local-midnight date is the previous day', () => {
  const monday = new Date(2026, 8, 28);
  return monday.toISOString().slice(0, 10) === '2026-09-27' ? true : `premise not reproduced (TZ=${process.env.TZ}, got ${monday.toISOString()})`;
});

check('localDateKey gives the local calendar date, today included', () => {
  seed({});
  const app = makeApp();
  const k = app.localDateKey(new Date(2026, 8, 28));
  return k === '2026-09-28' && app.todayStr() === '2026-09-29' ? true : `${k} / ${app.todayStr()}`;
});

check("Timetable: Tuesday's tab does not show Monday's mark, and marks Tuesday's own date", () => {
  seed({ '2026-09-28': { DS_1000: 'attended' } });          // marked from Today on Monday
  const app = makeApp();
  store.cos_att_datefix_cutoff = JSON.stringify('2026-09-01');  // keep the repair out of this check
  app.state.ttDay = 2;
  app.renderTimetable();
  const html = domCache['page-timetable'].innerHTML;
  const dsButton = html.match(/setAttendance\('([\d-]+)', 'DS_1000', 'attended'\)[\s\S]*?aria-pressed="(true|false)"/);
  if (!dsButton) return 'DS Present button not rendered';
  if (dsButton[1] !== '2026-09-29') return `Tuesday tab writes to ${dsButton[1]} (should be 2026-09-29)`;
  return dsButton[2] === 'false' ? true : "Tuesday shows Monday's Present";
});

check("Timetable: Monday's tab shows the mark made on Monday", () => {
  seed({ '2026-09-28': { DS_1000: 'attended' } });
  const app = makeApp();
  app.state.ttDay = 1;
  app.renderTimetable();
  const m = domCache['page-timetable'].innerHTML.match(/setAttendance\('([\d-]+)', 'DS_1000', 'attended'\)[\s\S]*?aria-pressed="(true|false)"/);
  return m && m[1] === '2026-09-28' && m[2] === 'true' ? true : `got ${m && m.slice(1).join(' / ')}`;
});

check('Repair: a mark saved under the previous day moves to its real day; ambiguous ones stay', () => {
  seed({
    '2026-09-21': { WD_1100: 'attended', DS_1000: 'skipped' },   // Mon key: WD is Tuesday-only -> shifted; DS is on both -> ambiguous
    '2026-09-14': { WD_1100: 'attended' },                       // shifted copy ...
    '2026-09-15': { WD_1100: 'attended' }                        // ... of a mark already saved correctly
  });
  const app = makeApp();
  const moved = app.fixShiftedAttendanceDates();
  const a = attendance();
  if (moved !== 2) return `moved ${moved}, expected 2`;
  if (a['2026-09-22']?.WD_1100 !== 'attended') return 'WD not moved to Tuesday 22nd';
  if (a['2026-09-21']?.DS_1000 !== 'skipped' || a['2026-09-21']?.WD_1100) return 'Monday 21st not left with only the ambiguous DS mark';
  if (a['2026-09-14'] || a['2026-09-15']?.WD_1100 !== 'attended') return 'duplicate not collapsed onto the correct day';
  const backup = JSON.parse(store.cos_att_datefix_backup || 'null');
  if (!backup || backup['2026-09-21']?.WD_1100 !== 'attended') return 'original not backed up';
  return app.fixShiftedAttendanceDates() === 0 ? true : 'second run moved marks again';
});

check('Repair never touches marks dated on/after the day it first ran (saved with the right key)', () => {
  seed({ '2026-09-28': { WD_1100: 'attended' } });
  store.cos_att_datefix_cutoff = JSON.stringify('2026-09-28');
  const app = makeApp();
  const moved = app.fixShiftedAttendanceDates();
  return moved === 0 && attendance()['2026-09-28']?.WD_1100 === 'attended' ? true : `moved ${moved}`;
});

check('Day change while the app stays open: timetable follows the new day and pages re-render', () => {
  seed({});
  NOW = new RealDate('2026-09-29T23:59:30+05:30').getTime();   // Tuesday, just before midnight
  const app = makeApp();
  app.state.ttDay = 2;
  app.state.currentPage = 'settings';                           // no render needed for this check
  if (app.refreshIfDayChanged() !== false) return 'refreshed before midnight';
  NOW = new RealDate('2026-09-30T00:01:00+05:30').getTime();   // Wednesday
  if (app.refreshIfDayChanged() !== true) return 'did not notice the new day';
  if (app.state.ttDay !== 3) return `timetable still on day ${app.state.ttDay}`;
  return app.refreshIfDayChanged() === false ? true : 'refreshed twice for one day change';
});

check('Day change keeps a day the student picked by hand', () => {
  seed({});
  NOW = new RealDate('2026-09-29T23:59:30+05:30').getTime();
  const app = makeApp();
  app.state.ttDay = 5;                                          // viewing Friday
  app.state.currentPage = 'settings';
  NOW = new RealDate('2026-09-30T00:01:00+05:30').getTime();
  app.refreshIfDayChanged();
  return app.state.ttDay === 5 ? true : `jumped to ${app.state.ttDay}`;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${errors.length}`);
console.log('========================================');
if (errors.length) { console.error('\n❌ FAILURES:'); errors.forEach(e => console.error(`  - ${e.name}: ${e.error}`)); process.exit(1); }
console.log('🏆 ALL ATTENDANCE DATE-KEY TESTS PASSED! 🚀\n');
