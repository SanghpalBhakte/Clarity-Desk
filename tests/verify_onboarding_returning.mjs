// ==================================================================
// Clarity Desk: FIRST VISIT vs RETURNING STUDENT
// ==================================================================
// Locked down here:
//  - a brand-new phone (empty storage) gets the welcome;
//  - a returning student with ANY saved data never sees it again, even
//    without a name or the dismissed flag (e.g. restored from a backup);
//  - deciding that only reads: no cos_* key is written or changed;
//  - an empty Today shows one setup card and no row of dashes/zeros, and
//    the stat tiles come back as soon as there is a timetable;
//  - built-in sample notices drop off after their date; others never do.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const RealDate = Date;
const NOW = new RealDate('2026-10-14T10:20:00+05:30').getTime();
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
const timers = [];
const realSetTimeout = setTimeout;
globalThis.setTimeout = (fn, ms) => { timers.push(fn); return 0; };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
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
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
  const NOTICES = globalThis.__TEST_NOTICES__ || [];
`);
const makeApp = () => new Function(`${code}\n return { state, checkOnboarding, hasExistingUserData, getVisibleNotices, renderDashboard };`)();

const CLASS = { subject: 'Data Structures', code: 'DS', time: '10:00', end: '11:00', room: 'SF-31', teacher: 'Prof. VJM', type: 'lecture' };
const RETURNING = {
  'a name':                    { cos_profile: JSON.stringify({ name: 'Asha Patil' }) },
  'only a group (batch)':      { cos_profile: JSON.stringify({ name: '', batch: 'A2' }) },
  'a saved timetable':         { cos_custom_timetable: JSON.stringify({ 0: [], 1: [CLASS], 2: [], 3: [], 4: [], 5: [], 6: [] }) },
  'the built-in sample timetable': { cos_timetable_choice: '"aids"' },
  'tasks':                     { cos_custom_tasks: JSON.stringify([{ id: 't1', title: 'Lab journal', dueDate: '2026-10-20', status: 'pending' }]) },
  'attendance marks':          { cos_attendance: JSON.stringify({ '2026-10-13': { 'DS_1000': 'attended' } }) },
  'attendance starting counts':{ cos_attendance_baseline: JSON.stringify({ DS: { present: 10, totalCount: 12 } }) },
  'study links':               { cos_custom_links: JSON.stringify([{ subject: 'DS', resources: [] }]) },
};

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; timers.length = 0;
  Object.assign(store, extra);
}
const welcomeScheduled = () => timers.some((fn) => fn === globalThis.showOnboardingModal);

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
console.log('👋 FIRST VISIT vs RETURNING STUDENT');
console.log('==================================================================');

check('A brand-new phone (empty storage) gets the welcome', () => {
  seed(); const app = makeApp(); timers.length = 0;
  app.checkOnboarding();
  return welcomeScheduled() ? true : 'welcome was not scheduled';
});

for (const [label, data] of Object.entries(RETURNING)) {
  check(`Returning student with ${label} (no dismissed flag) does not see the welcome`, () => {
    seed(data); const app = makeApp(); timers.length = 0;
    app.checkOnboarding();
    return !welcomeScheduled() ? true : 'welcome was scheduled';
  });
}

check('Dismissed flag alone still keeps the welcome away', () => {
  seed({ cos_onboarding_dismissed: 'true' }); const app = makeApp(); timers.length = 0;
  app.checkOnboarding();
  return !welcomeScheduled() ? true : 'welcome was scheduled';
});

check('Deciding is read-only: no cos_* key is added or changed for a returning student', () => {
  const all = Object.assign({}, ...Object.values(RETURNING));
  seed(all); const app = makeApp();
  const before = JSON.stringify(store);
  app.checkOnboarding(); app.hasExistingUserData();
  return JSON.stringify(store) === before ? true : 'storage changed';
});

check('Returning student loses nothing when Today renders', () => {
  const all = Object.assign({}, ...Object.values(RETURNING));
  seed(all); const app = makeApp();
  const keep = ['cos_profile', 'cos_custom_timetable', 'cos_custom_tasks', 'cos_attendance', 'cos_attendance_baseline', 'cos_custom_links'];
  const before = keep.map((k) => store[k]);
  app.state.currentPage = 'dashboard'; app.renderDashboard();
  const after = keep.map((k) => store[k]);
  return JSON.stringify(after) === JSON.stringify(before) ? true : 'a saved value changed';
});

check('Empty Today: one setup card with the scan first, no stat tiles, no repeated schedule buttons', () => {
  seed(); const app = makeApp(); app.state.currentPage = 'dashboard'; app.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  if (html.includes('vitals-strip')) return 'stat tiles shown on an empty desk';
  if ((html.match(/class="desk-setup-guide/g) || []).length !== 1) return 'expected exactly one setup card';
  if (!html.includes("Let's add your timetable") || !html.includes('showAddTimetableChoice()')) return 'setup card missing its button';
  if (html.includes('Set Schedule') || html.includes('Add your schedule')) return 'old repeated schedule prompt still shown';
  if (html.includes('chrono-beacon is-free')) return 'rest-day card shown with no timetable';
  if (html.includes('No classes today. Good time')) return 'misleading "no classes today" line';
  return true;
});

check('With a timetable: no repeated stat tiles, the schedule shows, and the name is asked only then', () => {
  seed(RETURNING['a saved timetable']); const app = makeApp(); app.state.currentPage = 'dashboard'; app.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  if (html.includes('vitals-strip')) return 'stat tiles are back (they only repeated the sections below)';
  if (!html.includes("Today's Schedule") || !html.includes('Attendance') || !html.includes('Tasks &amp; Deadlines')) return 'a Today section is missing';
  if (html.includes("Let's add your timetable")) return 'still asking to scan';
  return html.includes('What should we call you?') ? true : 'name ask missing after timetable';
});

check('Built-in sample notices drop off after their date; dated-today, future and non-built-in ones stay', () => {
  globalThis.__TEST_NOTICES__ = [
    { id: 'old',    builtIn: true, date: '2026-07-20', title: 'old', category: 'Exam', content: '' },
    { id: 'today',  builtIn: true, date: '2026-10-14', title: 'today', category: 'Exam', content: '' },
    { id: 'future', builtIn: true, date: '2026-12-01', title: 'future', category: 'Exam', content: '' },
    { id: 'mine',   date: '2026-01-01', title: 'mine', category: 'Academic', content: '' },
  ];
  try {
    seed(); const app = makeApp();
    const ids = app.getVisibleNotices().map((n) => n.id).join(',');
    return ids === 'today,future,mine' ? true : ids;
  } finally { delete globalThis.__TEST_NOTICES__; }
});

globalThis.setTimeout = realSetTimeout;
console.log('==================================================================');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('==================================================================');
if (errors.length) { console.error('❌ ONBOARDING TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ONBOARDING TESTS PASSED! 🚀');
