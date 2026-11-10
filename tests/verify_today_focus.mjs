// ==================================================================
// Clarity Desk: TODAY'S NEXT STEP (nudge row under the class card)
// ==================================================================
// v171: one line under the class card with the single most useful thing to
// do now. Locked down here:
//  - the order: an ended-but-unmarked class > a task due today/overdue >
//    the subject furthest below the attendance target;
//  - it never shows more than one, skips dismissed ones, and "Not now"
//    lasts for the day (and comes back tomorrow);
//  - it only reads: attendance and tasks are never written by showing it;
//  - bad data cannot blank Today.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const RealDate = Date;
let NOW = new RealDate('2026-09-29T12:00:00+05:30').getTime();
class FakeDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;
const at = (iso) => { NOW = new RealDate(iso + '+05:30').getTime(); };

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
let domCache = {};
const domStub = (id) => (domCache[id] ||= { id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
let cardStub = null;
globalThis.document = {
  getElementById: domStub,
  querySelector: (sel) => (cardStub && sel.includes('.chrono-beacon[data-beacon]') ? cardStub : null),
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
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const makeApp = () => new Function(`${code}\n return { state, buildTodayFocus, renderDashboard, attendanceKeyFor, todayStr, sanitizeTask };`)();

const DSL = { subject: 'Data Structures Lab', code: 'DSL', time: '10:00', end: '12:00', room: 'FF-28', teacher: 'Prof. VJM', type: 'lab' };
const OE2 = { subject: 'Open Elective 2', code: 'OE2', time: '12:45', end: '14:45', room: 'SF-31', teacher: 'Faculty', type: 'lecture' };
function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; document.activeElement = null;
  store.cos_custom_timetable = JSON.stringify({ 0: [], 1: [], 2: [DSL, OE2], 3: [], 4: [], 5: [], 6: [] });
  store.cos_onboarding_dismissed = 'true';
  Object.assign(store, extra);
}
function today(iso, extra) {
  seed(extra); at(iso);
  const app = makeApp(); app.state.currentPage = 'dashboard';
  app.renderDashboard();
  return { app, html: () => domCache['page-dashboard'].innerHTML };
}
const focusOf = (html) => (html.match(/class="today-focus is-(\w+)"/) || [])[1];
const DAY = '2026-09-29';

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
console.log('🧭 TODAY\'S NEXT STEP');
console.log('==================================================================');

check('Order: an ended, unmarked class beats a due task, which beats attendance risk', () => {
  seed(); at(DAY + 'T13:00:00'); const { buildTodayFocus: f, attendanceKeyFor: k } = makeApp();
  const base = { dayClasses: [DSL, OE2], attendanceData: {}, dateStr: DAY, currentMin: 13 * 60,
    task: { id: 't1', title: 'Lab journal', dueDate: DAY }, riskSubject: { name: 'Data Structures', pct: 52, targetPct: 75, classesToAttend: 23 } };
  const a = f(base);
  const b = f({ ...base, attendanceData: { [DAY]: { [k(DSL)]: 'attended' } } });
  const c = f({ ...base, attendanceData: { [DAY]: { [k(DSL)]: 'attended' } }, task: null });
  return a.kind === 'unmarked' && b.kind === 'task' && c.kind === 'risk' ? true : [a.kind, b.kind, c.kind].join(',');
});

check('Unmarked: only classes that ended count (running, upcoming and end-less ones do not)', () => {
  seed(); at(DAY + 'T11:00:00'); const { buildTodayFocus: f } = makeApp();
  const none = f({ dayClasses: [DSL, OE2, { subject: 'Seminar', time: '08:00' }], attendanceData: {}, dateStr: DAY, currentMin: 11 * 60 });
  return none === null ? true : 'showed ' + none.kind;
});

check('Unmarked: names the class, or counts them when there are several', () => {
  seed(); const { buildTodayFocus: f } = makeApp();
  const one = f({ dayClasses: [DSL, OE2], attendanceData: {}, dateStr: DAY, currentMin: 13 * 60 });
  const two = f({ dayClasses: [DSL, OE2], attendanceData: {}, dateStr: DAY, currentMin: 15 * 60 });
  if (one.title !== 'Data Structures Lab still needs attendance') return one.title;
  return two.title === "2 classes aren't marked yet" && two.id !== one.id ? true : two.title + ' / ' + two.id;
});

check('Task: due today and overdue are worded plainly; a future or undated task shows nothing', () => {
  seed(); at(DAY + 'T09:00:00'); const { buildTodayFocus: f } = makeApp();
  const mk = (dueDate) => f({ dayClasses: [], dateStr: DAY, currentMin: 540, task: { id: 'x', title: 'Report', dueDate } });
  const t = mk(DAY), o1 = mk('2026-09-28'), o3 = mk('2026-09-26');
  if (t.sub !== 'Due today' || o1.sub !== '1 day overdue' || o3.sub !== '3 days overdue') return [t.sub, o1.sub, o3.sub].join(' | ');
  return mk('2026-09-30') === null && f({ dayClasses: [], dateStr: DAY, task: { id: 'y', title: 'Mission' } }) === null ? true : 'future/undated task showed';
});

check('First step: a task with one comes up to 2 days early and says Start; without one it waits', () => {
  seed(); at(DAY + 'T09:00:00'); const { buildTodayFocus: f } = makeApp();
  const mk = (dueDate, firstStep) => f({ dayClasses: [], dateStr: DAY, currentMin: 540, task: { id: 'x', title: 'Lab report', dueDate, firstStep } });
  const in2 = mk('2026-10-01', 'Read the aim, 15 min'), in1 = mk('2026-09-30', 'Read the aim'), in3 = mk('2026-10-02', 'Read the aim');
  const late = mk('2026-09-28', 'Read the aim');
  if (!in2 || in2.go !== 'Start' || in2.sub !== 'Start: Read the aim, 15 min · due in 2 days') return in2 ? in2.go + ' | ' + in2.sub : 'no row in 2 days';
  if (!in1 || in1.sub !== 'Start: Read the aim · due tomorrow') return in1 ? in1.sub : 'no row tomorrow';
  if (in3 !== null) return 'showed 3 days early';
  if (!late || !/overdue/.test(late.sub)) return late ? late.sub : 'no overdue row';
  return mk('2026-09-30', '   ') === null && mk('2026-09-30') === null ? true : 'blank step still came early';
});

check('First step: an early first-step task waits behind an attendance warning', () => {
  seed(); at(DAY + 'T09:00:00'); const { buildTodayFocus: f } = makeApp();
  const risk = { name: 'DS', pct: 52, targetPct: 75, classesToAttend: 9 };
  const early = f({ dayClasses: [], dateStr: DAY, currentMin: 540, riskSubject: risk, task: { id: 'x', title: 'Lab report', dueDate: '2026-10-01', firstStep: 'Read the aim' } });
  const due = f({ dayClasses: [], dateStr: DAY, currentMin: 540, riskSubject: risk, task: { id: 'x', title: 'Lab report', dueDate: DAY, firstStep: 'Read the aim' } });
  return early.kind === 'risk' && due.kind === 'task' ? true : [early.kind, due.kind].join(',');
});

check('First step: Today picks the due-today task first, else the soonest task with a step', () => {
  const tasks = [
    { id: 'a', title: 'Essay', dueDate: '2026-09-30', status: 'pending', taskType: 'assignment', isCustom: true },
    { id: 'b', title: 'Lab report', dueDate: '2026-10-01', status: 'pending', taskType: 'assignment', isCustom: true, firstStep: 'Read the aim' },
  ];
  const { html } = today(DAY + 'T09:00:00', { cos_custom_tasks: JSON.stringify(tasks) });
  const h = html();
  return focusOf(h) === 'task' && h.includes('Lab report') && h.includes('Start: Read the aim') ? true : 'focus=' + focusOf(h);
});

check('First step: sanitizeTask keeps it trimmed and capped, drops blanks, and leaves old tasks unchanged', () => {
  seed(); const { sanitizeTask: s } = makeApp();
  const base = { id: 't', title: 'X', dueDate: DAY, status: 'pending', taskType: 'assignment' };
  const kept = s({ ...base, firstStep: '  Read the aim  ' }).firstStep;
  const capped = s({ ...base, firstStep: 'x'.repeat(200) }).firstStep.length;
  const blank = 'firstStep' in s({ ...base, firstStep: '   ' });
  const old = 'firstStep' in s(base);
  const odd = 'firstStep' in s({ ...base, firstStep: 42 });
  return kept === 'Read the aim' && capped === 80 && !blank && !old && !odd ? true : [kept, capped, blank, old, odd].join(',');
});

check('Slipped task: Today offers Done / Tomorrow / Pick a day for your own overdue task', () => {
  const tasks = [{ id: 'c-9', title: 'Lab report', dueDate: '2026-09-27', status: 'pending', taskType: 'assignment', isCustom: true }];
  const { html } = today(DAY + 'T09:00:00', { cos_custom_tasks: JSON.stringify(tasks) });
  const h = html();
  const ok = h.includes('resolveTask(this.dataset.id, { done: true })') && h.includes('moveTaskTomorrow(') && h.includes('Pick a day') && h.includes('type="date"');
  if (/need[s]? attention/.test(h)) return 'old overdue wording still shown';
  return focusOf(h) === 'task' && ok && h.includes('1 task slipped. Pick a new day or mark it done.') ? true : 'buttons or kinder line missing';
});

check('Slipped task: Done, Tomorrow and a picked day change only that task, and Undo puts it back', () => {
  const tasks = [{ id: 'c-9', title: 'Lab report', dueDate: '2026-09-27', status: 'pending', taskType: 'assignment', isCustom: true }];
  const { app } = today(DAY + 'T09:00:00', { cos_custom_tasks: JSON.stringify(tasks) });
  let undo = null;
  const realCreate = document.createElement, realGet = document.getElementById;
  document.createElement = (tag) => { const el = realCreate(tag); el.addEventListener = (ev, fn) => { if (ev === 'click') undo = fn; }; return el; };
  document.getElementById = (id) => id === 'toast-container' ? { appendChild() {}, lastElementChild: { classList: { add() {}, remove() {} }, appendChild() {}, remove() {} } } : realGet(id);
  try {
    const t = () => app.state.customTasks.find(x => x.id === 'c-9');
    const stored = () => JSON.parse(store.cos_custom_tasks).find(x => x.id === 'c-9');
    window.resolveTask('c-9', { done: true });
    if (t().status !== 'submitted' || stored().status !== 'submitted') return 'done not saved';
    undo();
    if (t().status !== 'pending' || stored().status !== 'pending') return 'undo did not restore status';
    window.moveTaskTomorrow('c-9');
    if (t().dueDate !== '2026-09-30') return 'tomorrow gave ' + t().dueDate;
    undo();
    if (t().dueDate !== '2026-09-27') return 'undo did not restore date';
    window.resolveTask('c-9', { dueDate: '2026-10-05' });
    if (stored().dueDate !== '2026-10-05') return 'picked day not saved';
    return window.resolveTask('c-9', { dueDate: 'nonsense' }) === false && window.resolveTask('nope', { done: true }) === false ? true : 'bad input changed something';
  } finally { document.createElement = realCreate; document.getElementById = realGet; }
});

check('Risk: names the subject and how many classes to attend; silly numbers are not shown', () => {
  seed(); const { buildTodayFocus: f } = makeApp();
  const r = (n) => f({ dayClasses: [], dateStr: DAY, riskSubject: { name: 'DS', pct: 52, targetPct: 75, classesToAttend: n } });
  const ok = r(9);
  if (ok.title !== 'Attend the next 9 DS classes' || ok.sub !== 'Now 52%, target 75%') return ok.title + ' / ' + ok.sub;
  return r(1).title === 'Attend the next 1 DS class' && r(0) === null && r(400) === null ? true : 'bounds wrong';
});

check('Dismissed ones are skipped and the next one takes over', () => {
  seed(); const { buildTodayFocus: f, attendanceKeyFor: k } = makeApp();
  const base = { dayClasses: [DSL], attendanceData: {}, dateStr: DAY, currentMin: 13 * 60, task: { id: 't1', title: 'Report', dueDate: DAY } };
  const first = f(base);
  const second = f({ ...base, dismissed: [first.id] });
  const third = f({ ...base, dismissed: [first.id, second.id] });
  return first.kind === 'unmarked' && second.kind === 'task' && third === null ? true : [first.kind, second && second.kind, third].join(',');
});

check('Today shows the row for an ended, unmarked class and it carries the Mark action', () => {
  const { html } = today(DAY + 'T13:00:00');
  const h = html();
  if (focusOf(h) !== 'unmarked') return 'kind ' + focusOf(h);
  return h.includes('Data Structures Lab still needs attendance') && h.includes("setTTDay(2); navigateTo('timetable')") && h.includes('dismissTodayFocus(this.dataset.id)') ? true : 'markup missing';
});

check('Marking the class clears the row; nothing shows when there is nothing to do', () => {
  const { app } = today(DAY + 'T13:00:00', {});
  seed({ cos_attendance: JSON.stringify({ [DAY]: { [makeApp().attendanceKeyFor(DSL)]: 'attended' } }) });
  at(DAY + 'T13:00:00'); const a2 = makeApp(); a2.state.currentPage = 'dashboard'; a2.renderDashboard();
  return focusOf(domCache['page-dashboard'].innerHTML) === undefined ? true : 'still showing';
});

check('"Not now" hides it for the day, survives a reload, and returns tomorrow', () => {
  const { app } = today(DAY + 'T13:00:00');
  globalThis.dismissTodayFocus(`unmarked:${app.attendanceKeyFor(DSL)}`);
  if (focusOf(domCache['page-dashboard'].innerHTML) !== undefined) return 'row still there after Not now';
  at(DAY + 'T13:30:00'); const again = makeApp(); again.state.currentPage = 'dashboard'; again.renderDashboard();
  if (focusOf(domCache['page-dashboard'].innerHTML) !== undefined) return 'came back after reload the same day';
  // next Tuesday, same unmarked situation: a fresh day, so the dismissal no longer applies
  at('2026-10-06T13:00:00'); const nextDay = makeApp(); nextDay.state.currentPage = 'dashboard'; nextDay.renderDashboard();
  return focusOf(domCache['page-dashboard'].innerHTML) === 'unmarked' ? true : 'did not return the next day';
});

check('Showing the row writes nothing: attendance and tasks are untouched', () => {
  seed({ cos_attendance: JSON.stringify({}) , cos_custom_tasks: JSON.stringify([]) });
  at(DAY + 'T13:00:00'); const before = JSON.stringify(store);
  const app = makeApp(); app.state.currentPage = 'dashboard'; app.renderDashboard();
  const after = JSON.stringify(store);
  return before === after ? true : 'storage changed while rendering';
});

check('Bad data cannot blank Today: a broken task and a corrupt dismissal list still render the page', () => {
  seed({ cos_custom_tasks: JSON.stringify([{ id: 'z', title: 'Odd', dueDate: 'not-a-date', status: 'pending', taskType: 'assignment', isCustom: true }]), cd_focus_dismissed: '{not json' });
  at(DAY + 'T13:00:00'); const app = makeApp(); app.state.currentPage = 'dashboard'; app.renderDashboard();
  const h = domCache['page-dashboard'].innerHTML;
  return h.includes('chrono-beacon') && h.includes('Today') ? true : 'Today did not render';
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (passed === total) { console.log('🏆 ALL TODAY NEXT-STEP TESTS PASSED! 🚀'); }
else { console.error('Failures:', JSON.stringify(errors, null, 2)); process.exit(1); }
