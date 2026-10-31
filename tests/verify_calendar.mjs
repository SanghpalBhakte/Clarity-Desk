// ==================================================================
// Clarity Desk: CALENDAR (read-only month view)
// ==================================================================
// getCalendarItems() is the calendar's only data source. Locked down here:
//  - classes come from the saved timetable, repeated weekly, and keep only
//    General + the student's own group (shouldKeepClassForUserBatch);
//  - items land on the right dates (weekday mapping in IST);
//  - times are 12-hour AM/PM;
//  - empty input gives an empty list;
//  - it only reads: storage is byte-for-byte the same afterwards.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const RealDate = Date;
let NOW = new RealDate('2026-10-20T10:00:00+05:30').getTime();
class FakeDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;

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
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const makeApp = () => new Function(`${code}\n return { state, getCalendarItems, renderCalendar, getCalendarAgenda, refreshIfDayChanged, showAddTaskModal, navigate };`)();

// Monday: a General lecture, a lab for A2 and a lab for B1, plus recess.
const LECTURE = { subject: 'Data Structures', code: 'DS', time: '09:00', end: '10:00', type: 'lecture', batches: [] };
const LAB_A2  = { subject: 'DS Lab', code: 'DSL', time: '13:30', end: '15:30', type: 'lab', batches: ['A2'] };
const LAB_B1  = { subject: 'Web Lab', code: 'WDL', time: '13:30', end: '15:30', type: 'lab', batches: ['B1'] };
const RECESS  = { subject: 'Recess', code: 'REC', time: '11:00', end: '11:15', type: 'break' };
const TT = { 0: [], 1: [LAB_A2, LECTURE, RECESS, LAB_B1], 2: [], 3: [], 4: [], 5: [], 6: [] };

const TASKS = [
  { id: 'c-1', title: 'DBMS assignment', taskType: 'assignment', dueDate: '2026-10-14', status: 'pending' },
  { id: 'c-2', title: 'Revise trees', taskType: 'study', dueDate: '2026-10-14', status: 'submitted' },
  { id: 'c-3', title: 'Viva (from WhatsApp)', taskType: 'exam', dueDate: '2026-10-26', startTime: '18:00', source: 'whatsapp', status: 'pending' },
  { id: 'c-4', title: 'Next month quiz', taskType: 'quiz', dueDate: '2026-11-02', status: 'pending' },
  { id: 'c-5', title: 'Read every day', taskType: 'mission', noDeadline: true, status: 'pending' },
];

function seed({ tt = TT, tasks = TASKS, batch = 'A2' } = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {};
  if (tt) store.cos_custom_timetable = JSON.stringify(tt);
  if (tasks) store.cos_custom_tasks = JSON.stringify(tasks);
  store.cos_profile = JSON.stringify({ name: 'Test', batch });
  store.cos_onboarding_dismissed = 'true';
}
const OCT = ['2026-10-01', '2026-10-31'];

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
console.log('📅 CALENDAR ADAPTER');
console.log('==================================================================');

check('Group filtering: General + own group only (batch read from the profile); recess left out', () => {
  seed({ batch: 'A2' });
  const items = makeApp().getCalendarItems('2026-10-05', '2026-10-05');
  const titles = items.filter(i => i.type === 'class').map(i => i.title).join(',');
  return titles === 'Data Structures,DS Lab' ? true : titles;
});

check('Group filtering: another group sees its own lab, not A2\'s', () => {
  seed({ batch: 'B1' });
  const titles = makeApp().getCalendarItems('2026-10-05', '2026-10-05').map(i => i.title).join(',');
  return titles === 'Data Structures,Web Lab' ? true : titles;
});

check('Dates: Monday classes land on every Monday of the month, and nowhere else', () => {
  seed();
  const dates = [...new Set(makeApp().getCalendarItems(...OCT).filter(i => i.type === 'class').map(i => i.date))].join(',');
  return dates === '2026-10-05,2026-10-12,2026-10-19,2026-10-26' ? true : dates;
});

check('Dates: tasks land on their due date; out-of-range and no-deadline tasks are left out', () => {
  seed();
  const t = makeApp().getCalendarItems(...OCT).filter(i => i.type !== 'class').map(i => `${i.date}:${i.sourceId}`).join(',');
  return t === '2026-10-14:c-1,2026-10-14:c-2,2026-10-26:c-3' ? true : t;
});

check('Types: assignment/exam are deadlines, study is a task; completed tasks are marked done', () => {
  seed();
  const by = Object.fromEntries(makeApp().getCalendarItems(...OCT).filter(i => i.type !== 'class').map(i => [i.sourceId, i]));
  const ok = by['c-1'].type === 'deadline' && by['c-3'].type === 'deadline' && by['c-2'].type === 'task'
    && by['c-2'].done === true && !('done' in by['c-1']);
  return ok ? true : JSON.stringify(by);
});

check('Times are 12-hour AM/PM; untimed tasks have no time and sort after timed items', () => {
  seed();
  const day = makeApp().getCalendarItems('2026-10-26', '2026-10-26');
  const got = day.map(i => `${i.title}@${i.time ?? '-'}`).join(' | ');
  const want = 'Data Structures@9:00 AM | DS Lab@1:30 PM | Viva (from WhatsApp)@6:00 PM';
  const untimed = makeApp().getCalendarItems('2026-10-14', '2026-10-14').every(i => !('time' in i));
  return got === want && untimed ? true : got;
});

check('Classes carry their weekday as sourceId (opens that day on Timetable)', () => {
  seed();
  const c = makeApp().getCalendarItems('2026-10-05', '2026-10-05')[0];
  return c.sourceId === '1' ? true : c.sourceId;
});

check('Empty input returns an empty list', () => {
  seed({ tt: null, tasks: null });
  const app = makeApp();
  const a = app.getCalendarItems(...OCT);
  const b = app.getCalendarItems(...OCT, { tt: {}, tasks: [] });
  const c = app.getCalendarItems('', '');
  const d = app.getCalendarItems('2026-10-31', '2026-10-01');
  return [a, b, c, d].every(x => Array.isArray(x) && x.length === 0) ? true : JSON.stringify([a, b, c, d]);
});

check('Read-only: the adapter and the page leave storage exactly as it was', () => {
  seed();
  const before = JSON.stringify(store);
  const app = makeApp();
  app.getCalendarItems(...OCT);
  app.state.currentPage = 'calendar';
  app.renderCalendar();
  return JSON.stringify(store) === before ? true : 'storage changed';
});

check('Page: month grid with dots, today highlighted, and the selected day\'s list', () => {
  seed();
  const app = makeApp(); app.renderCalendar();
  const h = domCache['page-calendar'].innerHTML;
  const ok = h.includes('October 2026') && h.includes('cal-cell today selected')
    && h.includes('aria-label="19 October, 2 classes"') && h.includes('aria-label="14 October, 1 deadline, 1 task"')
    && h.includes('aria-label="20 October, today, nothing scheduled"')
    && h.includes('Tuesday, 20 Oct') && h.includes('Nothing on this day.');
  return ok ? true : 'calendar markup missing pieces';
});

check('Page: a student with no data sees the empty state with the add-deadline and timetable links', () => {
  seed({ tt: null, tasks: null });
  const app = makeApp(); app.renderCalendar();
  const h = domCache['page-calendar'].innerHTML;
  return h.includes('Nothing on your calendar yet') && h.includes('showAddTaskModal()') && h.includes("navigateTo('timetable')") ? true : 'empty state missing';
});

const setNow = (iso) => { NOW = new RealDate(iso).getTime(); };
const cellFor = (h, key) => (h.match(new RegExp(`<button type="button" class="cal-cell[^"]*" onclick="calSelectDate\\('${key}'\\)"[\\s\\S]*?</button>`)) || [''])[0];

console.log('\n📅 CALENDAR V2');

check('B1: a tab left open past midnight comes back on the current month with today selected', () => {
  seed(); setNow('2026-10-20T23:50:00+05:30');
  const app = makeApp();
  app.state.currentPage = 'calendar';
  app.renderCalendar();
  window.calShiftMonth(1);                     // e.g. a Next tap before midnight
  const before = `${app.state.calMonth}/${app.state.calSelected}`;
  setNow('2026-10-21T00:05:00+05:30');          // day changes while the view is open
  const changed = app.refreshIfDayChanged();
  const h = domCache['page-calendar'].innerHTML;
  setNow('2026-10-20T10:00:00+05:30');
  const ok = before === '2026-11/2026-11-01' && changed === true
    && app.state.calMonth === '2026-10' && app.state.calSelected === '2026-10-21'
    && h.includes('October 2026') && h.includes('aria-label="21 October, today, nothing scheduled"')
    && cellFor(h, '2026-10-21').includes('today selected') && cellFor(h, '2026-10-20').includes('past');
  return ok ? true : `${before} -> ${app.state.calMonth}/${app.state.calSelected}, changed=${changed}`;
});

check('B1: month arrows never overflow (31 Jan -> Feb, 31 Mar -> Feb)', () => {
  seed(); setNow('2027-01-31T10:00:00+05:30');
  const app = makeApp(); app.renderCalendar();
  window.calShiftMonth(1); const a = app.state.calMonth;
  app.state.calMonth = '2027-03'; window.calShiftMonth(-1); const b = app.state.calMonth;
  setNow('2026-10-20T10:00:00+05:30');
  return a === '2027-02' && b === '2027-02' ? true : `${a}, ${b}`;
});

check('B2: the floating + is hidden on the Calendar page', () => {
  seed();
  const app = makeApp();
  const fab = { style: {}, setAttribute() {}, querySelector: () => null };
  const realQS = document.querySelector;
  document.querySelector = (sel) => (sel === '.fab' ? fab : null);
  globalThis.scrollTo = () => {};
  globalThis.location ||= { hash: '', pathname: '/', search: '', protocol: 'http:' };
  globalThis.history ||= { pushState() {}, replaceState() {} };
  try { app.navigate('calendar'); } finally { document.querySelector = realQS; }
  const onCal = fab.style.display;
  document.querySelector = (sel) => (sel === '.fab' ? fab : null);
  try { app.navigate('resources'); } finally { document.querySelector = realQS; }
  return onCal === 'none' && fab.style.display === '' ? true : `calendar=${onCal}, resources=${fab.style.display}`;
});

const AGENDA_TASKS = [...TASKS,
  { id: 'a-0', title: 'Yesterday task', taskType: 'study', dueDate: '2026-10-19', status: 'pending' },
  { id: 'a-1', title: 'Read chapter 4', taskType: 'study', dueDate: '2026-10-20', startTime: '19:30', status: 'pending' },
  { id: 'a-7', title: 'Day after range', taskType: 'assignment', dueDate: '2026-10-27', status: 'pending' },
];

check('F2 adapter: next 7 days = today..today+6, deadlines and tasks only, grouped by day in order', () => {
  seed({ tasks: AGENDA_TASKS });
  const groups = makeApp().getCalendarAgenda('2026-10-20');
  const got = groups.map(g => `${g.date}:${g.items.map(i => `${i.sourceId}@${i.time ?? '-'}`).join('+')}`).join(' | ');
  const want = '2026-10-20:a-1@7:30 PM | 2026-10-26:c-3@6:00 PM';
  return got === want ? true : got;
});

check('F2 page: agenda shows under the grid with 12-hour times and opens items; hidden when empty', () => {
  seed({ tasks: AGENDA_TASKS });
  let app = makeApp(); app.renderCalendar();
  const h = domCache['page-calendar'].innerHTML;
  const agenda = h.slice(h.indexOf('aria-label="Next 7 days"'));
  const shown = h.indexOf('cal-grid') < h.indexOf('Next 7 days') && agenda.includes('>Today<')
    && agenda.includes('Mon, 26 Oct') && agenda.includes('6:00 PM') && agenda.includes('7:30 PM')
    && agenda.includes('calOpenItem(this.dataset.type, this.dataset.id)') && !agenda.includes('Data Structures')
    && !agenda.includes('Day after range');
  seed({ tasks: [TASKS[3]] });                 // only a November quiz: nothing in the next 7 days
  app = makeApp(); app.renderCalendar();
  const hidden = !domCache['page-calendar'].innerHTML.includes('Next 7 days');
  return shown && hidden ? true : `shown=${shown}, hidden=${hidden}`;
});

check('F1: quick-add opens the existing Add Task form with the tapped date prefilled', () => {
  seed();
  const app = makeApp(); app.renderCalendar();
  const h = domCache['page-calendar'].innerHTML;
  const hasAction = h.includes(`calQuickAdd('2026-10-20')`) && h.includes('+ Add for Tue, 20 Oct');
  window.calSelectDate('2026-10-14');            // past day: quick-add too
  const pastHidden = domCache['page-calendar'].innerHTML.includes(`calQuickAdd('2026-10-14')`);
  const before = JSON.stringify(store);
  const opened = [];
  const realAppend = document.body.appendChild;
  document.body.appendChild = (n) => { opened.push(n); };
  try { window.calQuickAdd('2026-10-25'); app.showAddTaskModal(); } finally { document.body.appendChild = realAppend; }
  const due = (n) => ((n && n.innerHTML || '').match(/id="task-due"[^>]*value="([^"]*)"/) || [])[1];
  const ok = hasAction && pastHidden && opened.length === 2 && opened[0].id === 'add-task-backdrop'
    && due(opened[0]) === '2026-10-25' && due(opened[1]) === '2026-10-21' && JSON.stringify(store) === before;
  return ok ? true : `action=${hasAction} past=${pastHidden} n=${opened.length} due=${due(opened[0])}/${due(opened[1])}`;
});

check('F1b: double-tapping a date opens that day\'s card (agenda + Add on any date)', () => {
  seed();
  const app = makeApp(); app.renderCalendar();
  const opened = [];
  const realAppend = document.body.appendChild;
  document.body.appendChild = (n) => { opened.push(n); };
  let afterOne;
  try {
    window.calSelectDate('2026-10-20');          // one tap: only selects
    afterOne = opened.length;
    window.calSelectDate('2026-10-20');          // second tap: card
    window.calSelectDate('2026-10-14');          // other day, one tap
    window.calSelectDate('2026-10-14');          // past day, double tap
  } finally { document.body.appendChild = realAppend; }
  const [future, past] = opened.map(n => n.innerHTML || '');
  const ok = afterOne === 0 && opened.length === 2 && opened[0].id === 'cal-day-backdrop'
    && future.includes('Tuesday, 20 Oct') && future.includes(`calQuickAdd('2026-10-20')`)
    && past.includes('Wednesday, 14 Oct') && past.includes(`calQuickAdd('2026-10-14')`);
  return ok ? true : `afterOne=${afterOne} n=${opened.length} future=${future.slice(0, 120)} past=${past.slice(0, 120)}`;
});

check('F3: one dot per item up to 3, then "+N"; past days marked; labels list counts', () => {
  const many = [1, 2, 3, 4, 5].map(i => ({ id: `m-${i}`, title: `Item ${i}`, taskType: i < 3 ? 'quiz' : 'study', dueDate: '2026-10-28', status: 'pending' }));
  seed({ tasks: [...TASKS, ...many] });
  const app = makeApp(); app.renderCalendar();
  const h = domCache['page-calendar'].innerHTML;
  const c28 = cellFor(h, '2026-10-28');
  const dots = (c28.match(/class="cal-dot /g) || []).length;
  const ok = dots === 3 && c28.includes('+2</span>') && c28.includes('aria-label="28 October, 2 deadlines, 3 tasks"')
    && cellFor(h, '2026-10-14').includes('past') && !cellFor(h, '2026-10-22').includes('past');
  return ok ? true : `dots=${dots} cell=${c28.slice(0, 200)}`;
});

check('F3: calendar styles have no hover/active transforms', () => {
  const css = fs.readFileSync(`${ROOT}/style.css`, 'utf8');
  const rules = css.match(/[^{}]*\.cal-[^{}]*\{[^}]*\}/g) || [];
  const bad = rules.filter(r => /transform\s*:/.test(r));
  return rules.length > 0 && bad.length === 0 ? true : bad.join('\n');
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (passed === total) { console.log('🏆 ALL CALENDAR TESTS PASSED! 🚀'); }
else { console.error('Failures:', JSON.stringify(errors, null, 2)); process.exit(1); }
