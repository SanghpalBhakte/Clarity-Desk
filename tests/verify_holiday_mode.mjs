// ==================================================================
// Clarity Desk: HOLIDAY MODE (cos_holiday, display-only switch)
// ==================================================================
// Locked down here:
//  - the guard: on / off / until in the future, today or the past, and
//    corrupt values all fall back to off without throwing;
//  - auto-off when `until` arrives (midnight in IST, app closed for days);
//  - Calendar hides classes on holiday dates only, tasks always show, and
//    the General + own-group filter is the same after resume;
//  - Today shows the holiday card, no class or class-based prompt;
//  - attendance numbers and stored data are byte-for-byte unchanged;
//  - reminders (app and background push job) skip classes during a break;
//  - restore and cloud sync with and without the key.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const RealDate = Date;
let NOW = 0;
class FakeDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;
const at = (iso) => { NOW = new RealDate(iso + '+05:30').getTime(); };
at('2026-10-19T09:50:00');   // a Monday

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
let sent = [];
globalThis.Notification = class { constructor(title) { sent.push(title); } static permission = 'granted'; };
let fileText = '';
globalThis.FileReader = class { readAsText() { this.onload({ target: { result: fileText } }); } };
let domCache = {};
const domStub = (id) => (domCache[id] ||= { id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
globalThis.document = {
  getElementById: domStub,
  querySelector: () => null,
  querySelectorAll: () => [],
  activeElement: null, hidden: false,
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = globalThis.__NOTICES || []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const makeApp = () => new Function(`${code}\n return { state, holidayEndedOn, isHolidayScheduled, isTaskPausedForHoliday, holidayDaysLeft, holidayBriefingHTML, renderSummaryContent, sanitizeTask, getDynamicGreeting, loadHoliday, isHolidayActive, timetableForDisplay, setHoliday, checkHolidayExpiry, holidayLabel, getCalendarItems, renderCalendar, renderDashboard, renderTimetable, getOverallAttendance, getSubjectList, getSubjectAttendance, checkScheduledNotifications, importData, applyCloudDataToLocalState, loadTimetable };`)();

const LECTURE = { subject: 'Data Structures', code: 'DS', time: '10:00', end: '11:00', type: 'lecture', batches: [] };
const LAB_A2  = { subject: 'DS Lab', code: 'DSL', time: '13:30', end: '15:30', type: 'lab', batches: ['A2'] };
const LAB_B1  = { subject: 'Web Lab', code: 'WDL', time: '13:30', end: '15:30', type: 'lab', batches: ['B1'] };
const TT = { 0: [], 1: [LECTURE, LAB_A2, LAB_B1], 2: [LECTURE], 3: [], 4: [], 5: [], 6: [] };
const TASKS = [{ id: 'h-1', title: 'DBMS assignment', taskType: 'assignment', dueDate: '2026-10-20', status: 'pending' }];
const ATT = { '2026-10-12': { DS_1000: 'attended', DSL_1330: 'skipped' }, '2026-10-13': { DS_1000: 'attended' } };

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; sent = [];
  store.cos_custom_timetable = JSON.stringify(TT);
  store.cos_custom_tasks = JSON.stringify(TASKS);
  store.cos_attendance = JSON.stringify(ATT);
  store.cos_profile = JSON.stringify({ name: 'Test', batch: 'A2' });
  store.cos_onboarding_dismissed = 'true';
  store.cos_notif_prefs = JSON.stringify({ classReminders: '15_min', attendanceAlerts: 'instant', taskUpcoming: 'off', taskOverdue: 'off', dailySummaryTime: 'off', newNotices: 'off' });
  for (const [k, v] of Object.entries(extra)) store[k] = typeof v === 'string' ? v : JSON.stringify(v);
}
const H = (since, until = null) => ({ cos_holiday: { on: true, since, until } });
const classTitles = (items) => items.filter(i => i.type === 'class').map(i => `${i.date}:${i.title}`).join(',');
const without = (o, k) => { const c = { ...o }; delete c[k]; return c; };

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
console.log('🌴 HOLIDAY MODE');
console.log('==================================================================');

// ── Guard ────────────────────────────────────────────────────────
check('Guard: missing key is off', () => {
  seed(); at('2026-10-19T09:50:00');
  const a = makeApp();
  return a.loadHoliday() === null && a.isHolidayActive() === false ? true : 'expected off';
});

check('Guard: on with no end date is active today and later, not before `since`', () => {
  seed(H('2026-10-19')); at('2026-10-19T09:50:00');
  const a = makeApp();
  return a.isHolidayActive() && a.isHolidayActive('2027-01-01') && !a.isHolidayActive('2026-10-18') ? true : 'wrong range';
});

check('Guard: `until` is the first day back (exclusive)', () => {
  seed(H('2026-10-19', '2026-10-21')); at('2026-10-19T09:50:00');
  const a = makeApp();
  return a.isHolidayActive('2026-10-20') && !a.isHolidayActive('2026-10-21') ? true : 'wrong end';
});

check('Guard: until = today and until in the past are not active', () => {
  seed(H('2026-10-10', '2026-10-19')); at('2026-10-19T09:50:00');
  const a = makeApp();
  const today = a.isHolidayActive();
  seed(H('2026-10-01', '2026-10-05'));
  return !today && !makeApp().isHolidayActive() ? true : 'still active';
});

check('Guard: off value is off', () => {
  seed({ cos_holiday: { on: false, since: null, until: null } });
  return makeApp().isHolidayActive() === false ? true : 'active';
});

check('Guard: corrupt or partial values fall back to off, never throw', () => {
  const bad = ['abc', '{"on":', '[]', 'null', '42', { on: 'yes', since: '2026-10-19' }, { on: true }, { on: true, since: '19/10/2026' }, { on: true, since: '2026-10-19', until: 'soon' }, { on: true, since: '2026-10-19', until: 5 }];
  for (const v of bad) {
    seed({ cos_holiday: v });
    const a = makeApp();
    if (a.isHolidayActive() !== false || a.loadHoliday() !== null) return `active for ${JSON.stringify(v)}`;
    a.renderDashboard(); a.renderCalendar();
  }
  return true;
});

check('Guard: setHoliday ignores an end date that is not after today', () => {
  seed(); at('2026-10-19T09:50:00');
  const a = makeApp();
  a.setHoliday(true, '2026-10-19');
  const h1 = a.loadHoliday();
  a.setHoliday(true, '2026-11-03');
  const h2 = a.loadHoliday();
  return h1.until === null && h1.since === '2026-10-19' && h2.until === '2026-11-03' && a.holidayLabel() === 'Back on 3 Nov' ? true : JSON.stringify([h1, h2]);
});

// ── Auto-off ─────────────────────────────────────────────────────
check('Expiry: stays on until midnight IST, turns off just after', () => {
  seed(H('2026-10-19', '2026-10-21')); at('2026-10-20T23:59:30');
  const before = makeApp().checkHolidayExpiry();
  at('2026-10-21T00:00:30');
  const a = makeApp();
  const after = a.checkHolidayExpiry();
  return before === false && after === true && a.isHolidayActive() === false ? true : `${before}/${after}`;
});

check('Expiry: app not opened for days turns it off on the next open', () => {
  seed(H('2026-10-19', '2026-10-21')); at('2026-10-25T08:00:00');
  const a = makeApp();
  return a.checkHolidayExpiry() === true && JSON.parse(store.cos_holiday).on === false ? true : store.cos_holiday;
});

check('Expiry: no end date never turns off by itself', () => {
  seed(H('2026-10-19')); at('2027-03-01T08:00:00');
  return makeApp().checkHolidayExpiry() === false ? true : 'turned off';
});

// ── Calendar ─────────────────────────────────────────────────────
check('Calendar: classes hidden on holiday dates only, tasks still show', () => {
  seed(H('2026-10-19', '2026-10-26')); at('2026-10-19T09:50:00');
  const items = makeApp().getCalendarItems('2026-10-12', '2026-10-27');
  const classes = classTitles(items);
  const want = '2026-10-12:Data Structures,2026-10-12:DS Lab,2026-10-13:Data Structures,2026-10-26:Data Structures,2026-10-26:DS Lab,2026-10-27:Data Structures';
  const task = items.some(i => i.sourceId === 'h-1' && i.date === '2026-10-20');
  return classes === want && task ? true : `${classes} task:${task}`;
});

check('Calendar: banner shows during holiday mode only', () => {
  seed(H('2026-10-19')); at('2026-10-19T09:50:00');
  let a = makeApp(); a.renderCalendar();
  const on = domCache['page-calendar'].innerHTML.includes('Classes hidden during holiday mode');
  seed(); a = makeApp(); a.renderCalendar();
  const off = domCache['page-calendar'].innerHTML.includes('Classes hidden during holiday mode');
  return on && !off ? true : `${on}/${off}`;
});

check('Calendar: after resume, classes and the General + own-group filter are exactly as before', () => {
  seed(); at('2026-10-19T09:50:00');
  const before = classTitles(makeApp().getCalendarItems('2026-10-19', '2026-10-25'));
  const a = makeApp();
  a.setHoliday(true); a.setHoliday(false);
  const after = classTitles(makeApp().getCalendarItems('2026-10-19', '2026-10-25'));
  return before === after && after === '2026-10-19:Data Structures,2026-10-19:DS Lab,2026-10-20:Data Structures' ? true : `${before} | ${after}`;
});

// ── Today ────────────────────────────────────────────────────────
check('Today: holiday banner with End early, quiet empty state, no class names or countdown', () => {
  seed(H('2026-10-19', '2026-11-03')); at('2026-10-19T09:50:00');
  const a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  const ok = html.includes('holiday-banner') && html.includes('Holiday mode') && html.includes('Back on 3 Nov') && html.includes('15 days to go') && html.includes('endHolidayEarly()') && html.includes('End early')
    && /<div class="dashboard-panel" style="display:none">\s*<div class="panel-header">\s*<div class="panel-title">Today's Schedule/.test(html)
    && !html.includes('Data Structures') && !html.includes('data-beacon=') && !html.includes('classes remaining')
    && !html.includes('today-focus is-unmarked') && !html.includes('today-focus is-risk');
  return ok ? true : 'holiday Today markup wrong';
});

check('Today: without holiday mode the class card is unchanged', () => {
  seed(); at('2026-10-19T09:50:00');
  const a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  return html.includes('Data Structures') && html.includes('data-beacon="next"') && !html.includes('Holiday mode') ? true : 'normal Today changed';
});

check('Today: after a break, no pile of unmarked holiday days appears', () => {
  seed(H('2026-10-12', '2026-10-19')); at('2026-10-19T09:50:00');
  const a = makeApp(); a.checkHolidayExpiry(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  return !html.includes("aren't marked yet") && !html.includes('today-focus is-unmarked') ? true : 'unmarked prompt shown';
});

check('Timetable page: grid still shows, with a holiday banner', () => {
  seed(H('2026-10-19')); at('2026-10-19T09:50:00');
  const a = makeApp(); a.state.ttDay = 1; a.state.currentPage = 'timetable'; a.renderTimetable();
  const html = domCache['page-timetable'].innerHTML;
  return html.includes('Holiday mode is on') && html.includes('Data Structures') ? true : 'timetable page wrong';
});

// ── Date range, paused tasks, briefing (CD-04) ───────────────────
const ONGOING = { id: 'h-2', title: 'Read one paper a week', taskType: 'mission', noDeadline: true, dueDate: '', status: 'pending' };
const KEPT    = { id: 'h-3', title: 'Gym streak', taskType: 'general', noDeadline: true, dueDate: '', status: 'pending', keepInHoliday: true };
const INSIDE  = { id: 'h-4', title: 'Lab journal', taskType: 'lab', dueDate: '2026-10-23', status: 'pending' };
const AFTER   = { id: 'h-5', title: 'Mini project', taskType: 'project', dueDate: '2026-12-01', status: 'pending' };
const LATE    = { id: 'h-6', title: 'Old quiz', taskType: 'quiz', dueDate: '2026-10-15', status: 'pending' };
const ALL_TASKS = [...TASKS, ONGOING, KEPT, INSIDE, AFTER, LATE];

check('Range: a future start is planned, not active, and starts by itself on the day', () => {
  seed(); at('2026-10-19T09:50:00');
  const a = makeApp();
  a.setHoliday(true, '2026-10-29', '2026-10-24');
  const h = a.loadHoliday();
  const planned = a.isHolidayScheduled() && !a.isHolidayActive() && h.since === '2026-10-24' && h.until === '2026-10-29';
  at('2026-10-24T07:00:00');
  const b = makeApp();
  const started = b.isHolidayActive() && !b.isHolidayScheduled() && b.holidayDaysLeft() === 5;
  at('2026-10-29T00:01:00');
  const c = makeApp();
  const ended = c.checkHolidayExpiry() === true && !c.isHolidayActive();
  return planned && started && ended ? true : `${planned}/${started}/${ended}`;
});

check('Range: a start in the past or an end not after the start are refused', () => {
  seed(); at('2026-10-19T09:50:00');
  const a = makeApp();
  a.setHoliday(true, '2026-10-24', '2026-10-01');
  const h1 = a.loadHoliday();
  a.setHoliday(true, '2026-10-24', '2026-10-24');
  const h2 = a.loadHoliday();
  return h1.since === '2026-10-19' && h1.until === '2026-10-24' && h2.since === '2026-10-24' && h2.until === null ? true : JSON.stringify([h1, h2]);
});

check('Tasks: ongoing tasks rest during the break unless kept; dated tasks never rest', () => {
  seed({ cos_custom_tasks: ALL_TASKS, ...H('2026-10-19', '2026-10-26') }); at('2026-10-19T09:50:00');
  const a = makeApp();
  const during = ALL_TASKS.filter(t => a.isTaskPausedForHoliday(t)).map(t => t.id).join(',');
  const after = ALL_TASKS.filter(t => a.isTaskPausedForHoliday(t, '2026-10-26')).map(t => t.id).join(',');
  return during === 'h-2' && after === '' ? true : `${during} | ${after}`;
});

check('Tasks: keepInHoliday survives save, only as true, and old tasks keep their shape', () => {
  seed(); const a = makeApp();
  const kept = a.sanitizeTask(KEPT);
  const plain = a.sanitizeTask(ONGOING);
  const junk = a.sanitizeTask({ ...ONGOING, keepInHoliday: 'yes' });
  return kept.keepInHoliday === true && !('keepInHoliday' in plain) && !('keepInHoliday' in junk) ? true : JSON.stringify([kept, plain, junk]);
});

check('Today: resting tasks leave the list, every real deadline stays, attendance panel rests', () => {
  seed({ cos_custom_tasks: ALL_TASKS, ...H('2026-10-19', '2026-10-26') }); at('2026-10-19T09:50:00');
  const a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  // Four rows max: the overdue and dated tasks come first, the kept ongoing one is "+1 more".
  const ok = !html.includes('Read one paper a week') && html.includes('+1 more task')
    && /<div class="dashboard-panel" style="display:none">\s*<div class="panel-header">\s*<div class="panel-title">Attendance/.test(html) && html.includes('Lab journal') && html.includes('Old quiz') && html.includes('DBMS assignment')
    && html.includes('1 ongoing task is resting');
  return ok ? true : 'Today task list wrong';
});

check('Today: a planned break shows a quiet "starts on" line, no banner yet', () => {
  seed({ cos_holiday: { on: true, since: '2026-10-24', until: '2026-10-29' } }); at('2026-10-19T09:50:00');
  const a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  return html.includes('Holiday starts on Sat, 24 Oct') && !html.includes('holiday-banner') && html.includes('Data Structures') ? true : 'planned Today wrong';
});

check('Greeting: holiday words while the break is on', () => {
  seed(H('2026-10-19')); at('2026-10-19T09:50:00');
  const g = makeApp().getDynamicGreeting('Asha', { holiday: true });
  return /Happy holidays|Enjoy the break|Easy day/.test(g) ? true : g;
});

check('Briefing: holiday view lists deadlines inside the break (and overdue) plus kept tasks only', () => {
  seed({ cos_custom_tasks: ALL_TASKS, ...H('2026-10-19', '2026-10-26') }); at('2026-10-19T09:50:00');
  const a = makeApp();
  const box = { innerHTML: '' }; a.renderSummaryContent(box);
  const html = box.innerHTML;
  const ok = html.includes('Deadlines during your break') && html.includes('Lab journal') && html.includes('DBMS assignment')
    && html.includes('Old quiz') && html.includes('Gym streak') && html.includes('endHolidayEarly()')
    && !html.includes('Read one paper a week') && !html.includes('Mini project') && !html.includes("Today's Schedule");
  return ok ? true : 'holiday briefing wrong';
});

check('Briefing: normal view unchanged when the break is off', () => {
  seed({ cos_custom_tasks: ALL_TASKS }); at('2026-10-19T09:50:00');
  const box = { innerHTML: '' }; makeApp().renderSummaryContent(box);
  return box.innerHTML.includes("Today's Schedule") && box.innerHTML.includes('Read one paper a week') && !box.innerHTML.includes('holiday-banner') ? true : 'normal briefing changed';
});

check('Reminders (app): deadline reminders still come during the break', () => {
  seed({ cos_custom_tasks: ALL_TASKS, ...H('2026-10-19', '2026-10-26'),
    cos_notif_prefs: { classReminders: '15_min', attendanceAlerts: 'off', taskUpcoming: 'day_before', taskOverdue: 'instant', dailySummaryTime: '08:00', newNotices: 'off' } });
  at('2026-10-19T09:50:00');
  makeApp().checkScheduledNotifications();
  const ok = sent.some(t => /DBMS assignment/.test(t)) && sent.some(t => /Old quiz/.test(t)) && sent.includes('Clarity Desk: Holiday check-in') && !sent.some(t => /Class Starting Soon/.test(t));
  return ok ? true : JSON.stringify(sent);
});

const backup = (extra = {}) => JSON.stringify({ customTimetable: TT, attendance: ATT, customTasks: TASKS, ...extra });
const restore = (a, text) => { fileText = text; a.importData({ target: { files: [{}] } }); };

// ── Quieter Today and welcome back (CD-04 follow-up) ─────────────
check('Today during a break: no countdown line, syllabus line or weekly review; normal day keeps the countdown', () => {
  seed({ cos_profile: { name: 'Test', batch: 'A2', examDate: '2026-12-15' }, ...H('2026-10-17') }); at('2026-10-18T09:50:00');   // a Sunday
  let a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const during = domCache['page-dashboard'].innerHTML;
  seed({ cos_profile: { name: 'Test', batch: 'A2', examDate: '2026-12-15' } });
  a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const normal = domCache['page-dashboard'].innerHTML;
  const ok = !during.includes('days to End-Sem') && !during.includes('Weekly Review')
    && normal.includes('days to End-Sem') && normal.includes('Weekly Review');
  return ok ? true : `during:${during.includes('days to End-Sem')}/${during.includes('Weekly Review')} normal:${normal.includes('days to End-Sem')}`;
});

check('Today during a break: an exam in the final week still shows', () => {
  seed({ cos_profile: { name: 'Test', batch: 'A2', examDate: '2026-10-22' }, ...H('2026-10-19') }); at('2026-10-19T09:50:00');
  const a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  return domCache['page-dashboard'].innerHTML.includes('3 days</strong> to End-Sem') ? true : 'final-week exam hidden';
});

check('Countdown alerts: 30-day nudge rests during a break, 3-day one still comes', () => {
  const prefs = { classReminders: 'off', attendanceAlerts: 'off', taskUpcoming: 'off', taskOverdue: 'off', dailySummaryTime: '08:00', newNotices: 'off' };
  seed({ cos_profile: { name: 'Test', examDate: '2026-11-18' }, cos_notif_prefs: prefs, ...H('2026-10-19') }); at('2026-10-19T09:50:00');
  makeApp().checkScheduledNotifications();
  const far = sent.some(t => /30 days/.test(t));
  seed({ cos_profile: { name: 'Test', examDate: '2026-10-22' }, cos_notif_prefs: prefs, ...H('2026-10-19') }); at('2026-10-19T09:50:00');
  makeApp().checkScheduledNotifications();
  const near = sent.some(t => /3 days/.test(t));
  return !far && near ? true : `far:${far} near:${near}`;
});

check('Notice card during a break: only an important real notice shows (no setup nudges); normal days show the latest', () => {
  const n = (id, title, important) => ({ id, title, content: 'Details', date: '2026-10-19', category: 'general', important });
  globalThis.__NOTICES = [n('n1', 'Library timings changed', false)];
  seed(H('2026-10-19')); at('2026-10-19T09:50:00');
  let a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const plainDuring = domCache['page-dashboard'].innerHTML.includes('Library timings changed');
  globalThis.__NOTICES = [n('n1', 'Library timings changed', false), n('n2', 'Exam form deadline', true)];
  seed(H('2026-10-19'));
  a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const importantDuring = domCache['page-dashboard'].innerHTML.includes('Exam form deadline');
  globalThis.__NOTICES = [{ ...n('n3', 'Set your exam date', true), builtIn: true, date: '2026-12-01' }];
  seed(H('2026-10-19'));
  a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const setupNudge = domCache['page-dashboard'].innerHTML.includes('Set your exam date');
  globalThis.__NOTICES = [n('n1', 'Library timings changed', false)];
  seed();
  a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const plainNormal = domCache['page-dashboard'].innerHTML.includes('Library timings changed');
  delete globalThis.__NOTICES;
  return !plainDuring && importantDuring && !setupNudge && plainNormal ? true : `${plainDuring}/${importantDuring}/${setupNudge}/${plainNormal}`;
});

check('Welcome back: ending a started break records endedOn; cancelling a planned one does not', () => {
  seed(H('2026-10-12', '2026-10-26')); at('2026-10-19T09:50:00');
  let a = makeApp(); a.setHoliday(false);
  const ended = JSON.parse(store.cos_holiday).endedOn;
  seed({ cos_holiday: { on: true, since: '2026-10-24', until: '2026-10-29' } });
  a = makeApp(); a.setHoliday(false);
  const planned = JSON.parse(store.cos_holiday);
  return ended === '2026-10-19' && !('endedOn' in planned) && a.loadHoliday() === null ? true : `${ended} ${JSON.stringify(planned)}`;
});

check('Welcome back: card on the first day back after auto-end, gone after Got it and the next day', () => {
  seed(H('2026-10-12', '2026-10-19')); at('2026-10-19T09:50:00');
  let a = makeApp(); a.checkHolidayExpiry(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const first = domCache['page-dashboard'].innerHTML;
  globalThis.dismissHolidayWelcome();
  a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const afterGotIt = domCache['page-dashboard'].innerHTML;
  const kept = store.cos_holiday;
  seed({ cos_holiday: kept }); at('2026-10-20T09:50:00');
  a = makeApp(); a.state.currentPage = 'dashboard'; a.renderDashboard();
  const nextDay = domCache['page-dashboard'].innerHTML;
  const ok = first.includes('Welcome back, Test') && first.includes('next one at 10:00 AM (Data Structures)')
    && !afterGotIt.includes('holiday-welcome') && !nextDay.includes('holiday-welcome');
  return ok ? true : `first:${first.includes('Welcome back')} after:${afterGotIt.includes('holiday-welcome')} next:${nextDay.includes('holiday-welcome')}`;
});

check('Welcome back: endedOn survives backup restore and sync; junk values show no card', () => {
  seed(); at('2026-10-19T09:50:00');
  let a = makeApp(); restore(a, backup({ holiday: { on: false, since: null, until: null, endedOn: '2026-10-19' } }));
  const restored = a.holidayEndedOn();
  a.applyCloudDataToLocalState({ holiday: { on: false, since: null, until: null, endedOn: 'soon' } });
  const junk = a.holidayEndedOn();
  return restored === '2026-10-19' && junk === '' ? true : `${restored}/${junk}`;
});

// ── Attendance and data safety ───────────────────────────────────
check('Attendance: numbers identical before, during and after holiday mode', () => {
  seed({ cos_attendance_baseline: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 4, totalCount: 24 } } });
  at('2026-10-19T09:50:00');
  const snap = () => { const a = makeApp(); return JSON.stringify([a.getOverallAttendance(), a.getSubjectList().map(s => a.getSubjectAttendance(s))]); };
  const before = snap();
  makeApp().setHoliday(true, '2026-10-26');
  at('2026-10-23T16:00:00');
  const during = snap();
  at('2026-10-26T09:00:00');
  makeApp().checkHolidayExpiry();
  const after = snap();
  return before === during && during === after ? true : `${before}\n${during}\n${after}`;
});

check('Data safety: rendering every screen in holiday mode writes nothing but the holiday key', () => {
  seed(H('2026-10-19')); at('2026-10-19T09:50:00');
  const snapshot = JSON.stringify(without(store, 'cd_focus_dismissed'));
  const a = makeApp();
  a.state.currentPage = 'dashboard'; a.renderDashboard(); a.renderCalendar(); a.state.ttDay = 1; a.renderTimetable();
  const ttSame = JSON.stringify(a.loadTimetable()) === JSON.stringify(TT);
  const keep = (o) => JSON.stringify(without(without(o, 'cd_focus_dismissed'), 'cos_notified_history'));
  return keep(store) === keep(JSON.parse(snapshot)) && ttSame ? true : 'storage changed';
});

check('Data safety: turning on and off leaves timetable, attendance, group and tasks untouched', () => {
  seed(); at('2026-10-19T09:50:00');
  const keys = ['cos_custom_timetable', 'cos_attendance', 'cos_profile', 'cos_custom_tasks'];
  const before = keys.map(k => store[k]).join('|');
  const a = makeApp(); a.setHoliday(true, '2026-11-03'); a.setHoliday(false);
  return keys.map(k => store[k]).join('|') === before ? true : 'data changed';
});

// ── Reminders ────────────────────────────────────────────────────
check('Reminders (app): class reminder and attendance alert skipped during holiday mode', () => {
  seed({ cos_att_target: 90, ...H('2026-10-19') }); at('2026-10-19T09:50:00');
  makeApp().checkScheduledNotifications();
  const during = sent.slice();
  seed({ cos_att_target: 90 });
  makeApp().checkScheduledNotifications();
  const normal = sent.slice();
  const ok = during.length === 0 && normal.some(t => /Class Starting Soon/.test(t)) && normal.some(t => /Attendance Alert/.test(t));
  return ok ? true : `during ${JSON.stringify(during)} normal ${JSON.stringify(normal)}`;
});

// ── Restore and sync ─────────────────────────────────────────────

check('Restore: backup from before this feature (no key) restores fine and stays off', () => {
  seed(); at('2026-10-19T09:50:00');
  const a = makeApp(); restore(a, backup());
  return a.isHolidayActive() === false && store.cos_holiday === undefined && store.cos_custom_timetable === JSON.stringify(TT) ? true : 'restore failed';
});

check('Restore: backup taken during holiday mode brings it back; an expired one turns off', () => {
  seed(); at('2026-10-19T09:50:00');
  let a = makeApp(); restore(a, backup({ holiday: { on: true, since: '2026-10-18', until: '2026-11-03' } }));
  const on = a.isHolidayActive();
  seed(); a = makeApp(); restore(a, backup({ holiday: { on: true, since: '2026-10-01', until: '2026-10-10' } }));
  const expired = JSON.parse(store.cos_holiday).on === false;
  seed(); a = makeApp(); restore(a, backup({ holiday: 'garbage' }));
  return on && expired && a.isHolidayActive() === false ? true : `${on}/${expired}`;
});

check('Sync: cloud data with and without the key', () => {
  seed(); at('2026-10-19T09:50:00');
  const a = makeApp();
  a.applyCloudDataToLocalState({ attTarget: 75 });
  const none = a.isHolidayActive();
  a.applyCloudDataToLocalState({ holiday: { on: true, since: '2026-10-19', until: null } });
  const on = a.isHolidayActive();
  a.applyCloudDataToLocalState({ holiday: [] });
  return none === false && on === true && a.isHolidayActive() === true ? true : `${none}/${on}`;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ HOLIDAY MODE TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL HOLIDAY MODE TESTS PASSED! 🚀');
process.exit(0);
