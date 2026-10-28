// ==================================================================
// Clarity Desk: COUNTDOWN LABEL, CHEER AND SELF-STUDY MODE
// ==================================================================
// Locked down here:
//  - a student who never set a label still sees "End-Sem" wording;
//  - a custom label (GATE, Boards...) shows on Today, escaped;
//  - the cheer line changes with days left (reminders and the milestone
//    card use it; Today shows the countdown as a plain fact, no cheer);
//  - self-study: Today asks for a countdown, never for a timetable scan
//    or attendance counts; the college path is unchanged and offers the
//    "I study on my own" choice;
//  - the new profile fields survive a reload;
//  - countdown reminders fire on milestone days only, once.
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
const realSetTimeout = setTimeout;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
const sent = [];
globalThis.Notification = class { constructor(title) { sent.push(title); } };
globalThis.Notification.permission = 'granted';
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
  const NOTICES = [];
`);
const makeApp = () => new Function(`${code}\n return { state, renderDashboard, loadProfile, getCountdownLabel, countdownCheer, buildDashboardContextLine, checkScheduledNotifications, showOnboardingModal };`)();

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; sent.length = 0;
  Object.assign(store, extra);
}
const profile = (p) => ({ cos_profile: JSON.stringify(p), cos_onboarding_dismissed: 'true' });
const today = (app) => { app.state.currentPage = 'dashboard'; app.renderDashboard(); return domCache['page-dashboard'].innerHTML; };

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
console.log('🎯 COUNTDOWN & SELF-STUDY');
console.log('==================================================================');

check('No label set: Today keeps the End-Sem wording', () => {
  seed(profile({ name: 'Asha', examDate: '2026-12-13' })); const app = makeApp();
  const html = today(app);
  return html.includes('60 days to End-Sem exams') ? true : 'End-Sem countdown missing';
});

check('Custom label shows on Today as a plain fact, with no cheer line', () => {
  seed(profile({ name: 'Asha', examDate: '2026-11-03', examLabel: 'GATE' })); const app = makeApp();
  const html = today(app);
  if (!html.includes('20 days to GATE')) return 'GATE countdown missing';
  return !html.includes('One topic at a time. You can do this.') ? true : 'cheer still on Today';
});

check('Custom label is escaped (no HTML injection)', () => {
  seed(profile({ name: 'Asha', examDate: '2026-11-03', examLabel: '<b>x</b>' })); const app = makeApp();
  const html = today(app);
  return !html.includes('<b>x</b>') && html.includes('&lt;b&gt;') ? true : 'label not escaped';
});

check('Cheer changes with days left', () => {
  seed(); const app = makeApp();
  const got = [0, 1, 5, 20, 45, 120, -1].map((d) => app.countdownCheer(d));
  if (got[6] !== '') return 'past date should have no cheer';
  return new Set(got.slice(0, 6)).size === 6 ? true : got.join(' | ');
});

check('Final week context line uses the label', () => {
  seed(profile({ examLabel: 'Boards' })); const app = makeApp();
  const line = app.buildDashboardContextLine({ attendancePct: null, overdue: 0, pending: 1, examDaysLeft: 3, examLabel: 'Boards', dayClasses: [] });
  return line.includes('3 days</strong> to Boards') ? true : line;
});

check('Self-study Today: asks for a countdown, not a scan or attendance', () => {
  seed(profile({ name: 'Ravi', studyMode: 'self' })); const app = makeApp();
  const html = today(app);
  if (html.includes('Scan your timetable')) return 'still asking to scan a timetable';
  if (html.includes('Set your attendance so far')) return 'still asking for attendance';
  if (html.includes('Add your timetable to see your day here')) return 'timetable line shown';
  if (!html.includes('Set your exam countdown')) return 'countdown step missing';
  if ((html.match(/class="dashboard-panel" style="display:none"/g) || []).length !== 2) return 'schedule/attendance panels not hidden';
  return true;
});

check('Self-study context line never mentions classes', () => {
  seed(profile({ name: 'Ravi', studyMode: 'self' })); const app = makeApp();
  const line = app.buildDashboardContextLine({ attendancePct: null, overdue: 0, pending: 2, classesLeft: 0, totalClasses: 0, examDaysLeft: null, dayClasses: [], selfStudy: true, hasTimetable: false });
  return /class/i.test(line) ? line : true;
});

const withTimetable = { cos_custom_timetable: JSON.stringify({ 1: [], 2: [{ subject: 'Physics', time: '09:00', end: '10:00', type: 'lecture' }], 3: [], 4: [], 5: [], 6: [], 0: [] }) };

check('College student with a timetable still sees schedule and attendance panels', () => {
  seed(withTimetable); const app = makeApp();
  const html = today(app);
  return html.includes('class="dashboard-panel" style="display:none"') ? 'panels hidden for college student' : true;
});

check('No timetable yet: Today hides schedule, attendance, notices and the subtitle', () => {
  seed(profile({ name: 'Asha', batch: 'A2' })); const app = makeApp();
  const html = today(app);
  if (!html.includes('Get started')) return 'Get started card missing';
  if (!html.includes('id="quick-add-input"')) return 'quick-add missing';
  if ((html.match(/class="dashboard-panel" style="display:none"/g) || []).length !== 2) return 'schedule/attendance panels not hidden';
  if (html.includes('Notice Board') || html.includes('today-focus')) return 'extra cards shown';
  if (html.includes('Add your timetable to see your day here') || html.includes('desk-greeting-sub')) return 'duplicate subtitle shown';
  return true;
});

check('Self-study with a timetable: attendance stays hidden, schedule shows', () => {
  seed({ ...profile({ name: 'Ravi', studyMode: 'self' }), ...withTimetable }); const app = makeApp();
  const html = today(app);
  const hidden = html.match(/<div class="dashboard-panel" style="display:none">[\s\S]*?panel-title">([^<]+)/g) || [];
  if (hidden.length !== 1) return `expected 1 hidden panel, got ${hidden.length}`;
  return hidden[0].includes('Attendance') ? true : 'wrong panel hidden';
});

check('Self-study with a date set: no setup card left', () => {
  seed(profile({ name: 'Ravi', studyMode: 'self', examDate: '2027-02-01', examLabel: 'GATE' })); const app = makeApp();
  const html = today(app);
  if (html.includes('desk-setup-guide')) return 'setup card still shown';
  return html.includes('days to GATE') ? true : 'countdown missing';
});

check('College path unchanged and offers "I study on my own"', () => {
  seed(); const app = makeApp();
  const html = today(app);
  if (!html.includes('Scan your timetable') || !html.includes('Add classes myself')) return 'college options missing';
  return html.includes('I study on my own') ? true : 'self-study choice missing';
});

check('Welcome is Explore / Log in only; self-study is a Today setup choice', () => {
  const start = appSrc.indexOf('window.showOnboardingModal');
  const tpl = appSrc.slice(start, appSrc.indexOf('id="onboarding-step-2"'));
  if (tpl.includes('onboardingSelfStudy') || !tpl.includes('onboardingExplore()') || !tpl.includes('onboardingLogin()')) return 'welcome buttons wrong';
  return appSrc.includes('onclick="setupSelfStudy()"') && appSrc.includes("trackUsage('welcome_choice', 'self')") ? true : 'Today button missing';
});

check('New profile fields survive a reload; old profiles get blanks', () => {
  seed(profile({ name: 'Ravi', studyMode: 'self', examLabel: 'GATE' })); let app = makeApp();
  const a = app.loadProfile();
  seed(profile({ name: 'Old' })); app = makeApp();
  const b = app.loadProfile();
  if (a.studyMode !== 'self' || a.examLabel !== 'GATE') return JSON.stringify(a);
  return b.studyMode === '' && b.examLabel === '' && app.getCountdownLabel() === 'End-Sem exams' ? true : JSON.stringify(b);
});

check('Countdown reminder fires on a milestone day, once', () => {
  seed(profile({ name: 'Ravi', examDate: '2026-11-13', examLabel: 'GATE' })); const app = makeApp();
  app.checkScheduledNotifications(); app.checkScheduledNotifications();
  const cd = sent.filter((t) => t.includes('GATE'));
  return cd.length === 1 && cd[0] === '30 days to GATE' ? true : JSON.stringify(sent);
});

check('No countdown reminder on a non-milestone day', () => {
  seed(profile({ name: 'Ravi', examDate: '2026-11-12', examLabel: 'GATE' })); const app = makeApp();
  app.checkScheduledNotifications();
  return !sent.some((t) => t.includes('GATE')) ? true : JSON.stringify(sent);
});

globalThis.setTimeout = realSetTimeout;
console.log('==================================================================');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('==================================================================');
if (errors.length) { console.error('❌ COUNTDOWN TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL COUNTDOWN TESTS PASSED! 🚀');
