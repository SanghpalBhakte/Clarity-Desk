// ==================================================================
// Clarity Desk: GENTLE NUDGES FOR ONGOING TASKS
// ==================================================================
// Locked down here:
//  - off by default, so nothing changes for existing students;
//  - at most one nudge a day, one task at a time, rotating;
//  - respects the chosen frequency and time, and goes quiet 3 hours
//    after that time instead of firing a stale nudge late at night;
//  - never wording like "due" or "overdue"; deadline tasks are ignored;
//  - holiday mode rests ongoing tasks; kept ones still get nudges;
//  - the ongoing_ markers survive history pruning;
//  - saved prefs without the new fields still load (no migration).
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
const scheduled = [];
globalThis.setTimeout = (fn, ms) => { scheduled.push(ms); return 0; };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
globalThis.CAMPUS_OS_PUSH_API = 'https://push.example.com';
globalThis.PushManager = function () {};
const fired = [];
globalThis.Notification = function (title, opts) { fired.push({ title, ...opts }); };
globalThis.Notification.permission = 'granted';
let domCache = {};
const FIELDS = { 'tte-day': '1', 'tte-time': '10:00', 'tte-end': '11:00', 'tte-subject': 'Data Structures', 'tte-code': 'DS', 'tte-room': 'SF-31', 'tte-teacher': 'Dr. Rao', 'tte-type': 'lecture', 'tte-notes': '' };
const domStub = (id) => (domCache[id] ||= { id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: FIELDS[id] ?? '', textContent: '', innerHTML: '', className: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
globalThis.document = {
  getElementById: domStub,
  querySelector: () => null,
  querySelectorAll: () => [],
  activeElement: null, hidden: false,
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120', onLine: true, webdriver: false, serviceWorker: {}, sendBeacon: () => true }, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { hostname: 'claritydesk.web.app', search: '', hash: '' }, configurable: true, writable: true });


const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const app = new Function(`${code}\n return { state, loadNotifPrefs, saveNotifPrefs, checkScheduledNotifications, buildOngoingNudge, pickOngoingNudgeTask, ongoingNudgeDue, pruneNotifiedHistory };`)();

const RealDate = Date;
function setNow(iso) {
  const fixed = new RealDate(iso).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...a) { a.length ? super(...a) : super(fixed); }
    static now() { return fixed; }
  };
}
const T = (id, extra = {}) => ({ id, title: `Goal ${id}`, status: 'pending', noDeadline: true, isCustom: true, ...extra });
function seed(prefs, tasks, hist = {}, extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  fired.length = 0;
  Object.assign(store, { cos_notif_prefs: JSON.stringify(prefs), cos_notified_history: JSON.stringify(hist), ...extra });
  app.state.assignments = [];
  app.state.customTasks = tasks;
}
const hist = () => JSON.parse(store.cos_notified_history || '{}');
const nudges = () => fired.filter(f => String(f.tag).startsWith('ongoing_nudge_'));
const ON = { ongoingNudges: 'daily', ongoingNudgeTime: '18:00', dailySummaryTime: 'off', taskOverdue: 'off', taskUpcoming: 'off', classReminders: 'off', attendanceAlerts: 'off' };

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

check('Defaults: off at 18:00; old saved prefs without the fields still load', () => {
  seed({}, []); store.cos_notif_prefs = JSON.stringify({ taskUpcoming: 'same_day' });
  const p = app.loadNotifPrefs();
  return p.ongoingNudges === 'off' && p.ongoingNudgeTime === '18:00' && p.taskUpcoming === 'same_day' ? true : JSON.stringify(p);
});

check('Off: nothing is sent', () => {
  setNow('2026-11-02T18:30:00'); seed({ ...ON, ongoingNudges: 'off' }, [T(1)]);
  app.checkScheduledNotifications();
  return nudges().length === 0 ? true : 'sent while off';
});

check('Daily: one nudge at the chosen time, once per day', () => {
  setNow('2026-11-02T18:05:00'); seed(ON, [T(1), T(2)]);
  app.checkScheduledNotifications(); app.checkScheduledNotifications();
  return nudges().length === 1 && hist().ongoing_last_date === '2026-11-02' ? true : `sent=${nudges().length}`;
});

check('Before the chosen time: nothing yet', () => {
  setNow('2026-11-02T17:59:00'); seed(ON, [T(1)]);
  app.checkScheduledNotifications();
  return nudges().length === 0 ? true : 'early nudge';
});

check('More than 3 hours late: skipped, not fired at night', () => {
  setNow('2026-11-02T21:30:00'); seed(ON, [T(1)]);
  app.checkScheduledNotifications();
  return nudges().length === 0 ? true : 'late nudge';
});

check('Rotates one task at a time across days', () => {
  setNow('2026-11-02T18:05:00'); seed(ON, [T(1), T(2), T(3)]);
  app.checkScheduledNotifications();
  const first = hist().ongoing_last_task;
  setNow('2026-11-03T18:05:00'); app.checkScheduledNotifications();
  const second = hist().ongoing_last_task;
  setNow('2026-11-04T18:05:00'); app.checkScheduledNotifications();
  return first === '1' && second === '2' && hist().ongoing_last_task === '3' ? true : `${first},${second},${hist().ongoing_last_task}`;
});

check('Every 2 days / weekly: honours the gap', () => {
  const p2 = { ...ON, ongoingNudges: 'every_2_days' };
  setNow('2026-11-03T18:05:00'); seed(p2, [T(1)], { ongoing_last_date: '2026-11-02' });
  app.checkScheduledNotifications();
  const tooSoon = nudges().length;
  setNow('2026-11-04T18:05:00'); app.checkScheduledNotifications();
  const wk = { ...ON, ongoingNudges: 'weekly' };
  setNow('2026-11-08T18:05:00'); seed(wk, [T(1)], { ongoing_last_date: '2026-11-02' });
  app.checkScheduledNotifications();
  const wkSoon = nudges().length;
  setNow('2026-11-09T18:05:00'); app.checkScheduledNotifications();
  return tooSoon === 0 && wkSoon === 0 && nudges().length === 1 ? true : `tooSoon=${tooSoon} wkSoon=${wkSoon} end=${nudges().length}`;
});

check('Deadline tasks and finished tasks are never nudged', () => {
  setNow('2026-11-02T18:05:00');
  seed(ON, [T(1, { noDeadline: false, dueDate: '2026-11-20' }), T(2, { status: 'done' })]);
  app.checkScheduledNotifications();
  return nudges().length === 0 ? true : 'nudged a non-ongoing task';
});

check('Wording is encouraging: no due/overdue/urgent words, tag is per day, opens the task', () => {
  const words = /due|overdue|late|missed|behind|hurry|urgent|!/i;
  for (const d of ['2026-11-01', '2026-11-02', '2026-11-03']) {
    const r = app.buildOngoingNudge(T(7, { subject: 'DSA' }), d);
    if (words.test(r.title + ' ' + r.body)) return `bad wording on ${d}: ${r.title} / ${r.body}`;
    if (r.tag !== `ongoing_nudge_${d}` || !r.url.includes('task=7')) return `bad tag/url ${r.tag} ${r.url}`;
  }
  return true;
});

check('Holiday: resting ongoing tasks are skipped, keepInHoliday ones are not', () => {
  setNow('2026-11-02T18:05:00');
  const hol = { cos_holiday: JSON.stringify({ on: true, since: '2026-11-01', until: '2026-11-10' }) };
  seed(ON, [T(1)], {}, hol); app.checkScheduledNotifications();
  const resting = nudges().length;
  seed(ON, [T(1, { keepInHoliday: true })], {}, hol); app.checkScheduledNotifications();
  return resting === 0 && nudges().length === 1 ? true : `resting=${resting} kept=${nudges().length}`;
});

check('Pruning keeps the ongoing_ markers', () => {
  const big = {}; for (let i = 0; i < 150; i++) big['k' + i] = true;
  big.ongoing_last_date = '2026-11-02'; big.ongoing_last_task = '3';
  const out = app.pruneNotifiedHistory({ ongoing_early: true, ...big });
  return out.ongoing_last_date === '2026-11-02' && out.ongoing_last_task === '3' ? true : 'markers lost';
});

check('Settings save keeps the new fields (form field ids exist in source)', () => {
  return ['np-ongoing-nudges', 'np-nudge-time'].every(id => (appSrc.match(new RegExp(id, 'g')) || []).length >= 2) && /ongoingNudges: document\.getElementById\('np-ongoing-nudges'\)\?\.value \|\| loadNotifPrefs\(\)\.ongoingNudges/.test(appSrc) ? true : 'save handler or ids missing';
});

console.log(`\n${passed}/${total} passed`);
if (errors.length) { console.error(errors); process.exit(1); }
