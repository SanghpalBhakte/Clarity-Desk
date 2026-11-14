// Clarity Desk: calmer Today (greeting parts, banner priority, due rows). Pure-function checks.
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const RealDate = Date;
let NOW = new RealDate('2026-10-14T10:20:00+05:30').getTime();
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
const app = new Function(`${code}\n return { getGreetingParts, chooseTodayBanner, pickDueRows, buildDashboardContextLine, state };`)();
let fails = 0;
const check = (name, ok) => { if (!ok) { fails++; console.error('FAIL', name); } else console.log('ok  ', name); };

// Greeting: 10:00 on a day whose seed picks the chai entry (date + hour) % 6 === 3.
const pickDay = (hour) => { for (let d = 1; d <= 28; d++) { NOW = new RealDate(`2026-09-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+05:30`).getTime(); if ((d + hour) % 6 === 3) return d; } };
pickDay(10);
const g = app.getGreetingParts({ name: 'Asha', calm: true });
check('title has the name and no quip', g.title.includes('Asha') && !/Chai/.test(g.title));
check('calm day shows the quip', g.quip === 'Chai first?' && g.tone === 'calm');
check('alarming day hides the quip', app.getGreetingParts({ name: 'Asha', calm: false }).quip === '' && app.getGreetingParts({ name: 'Asha' }).tone === 'alert');
check('a reached goal brings the quip back', app.getGreetingParts({ name: 'Asha', goalReached: true }).quip === 'Chai first?');
const noName = app.getGreetingParts({ name: '', calm: true });
check('no name: no comma, no undefined', !/undefined|,\s*\./.test(noName.title) && noName.title.endsWith('.'));
check('name is escaped', !app.getGreetingParts({ name: '<b>x</b>', calm: true }).title.includes('<b>x'));
NOW = new RealDate('2026-09-29T12:00:00+05:30').getTime();

// Banner priority: first true wins; every combination has exactly one winner.
const order = ['safety', 'attendanceRisk', 'setupNeeded', 'lateOrSoon', 'welcomeBack'];
const names = ['safety', 'risk', 'setup', 'late', 'welcome'];
let okAll = true;
for (let m = 0; m < 32; m++) {
  const f = {}; order.forEach((k, i) => { f[k] = !!(m & (1 << i)); });
  const want = order.findIndex(k => f[k]);
  if (app.chooseTodayBanner(f) !== (want < 0 ? null : names[want])) okAll = false;
}
check('banner priority holds for all 32 combinations', okAll);

// One attendance message.
const base = { attendancePct: 60, attendanceAtRisk: true, attTarget: 75, overdue: 2, pending: 3, examDaysLeft: null, dayClasses: [1], classesLeft: 1, totalClasses: 1, hasTimetable: true };
check('context line says attendance when no banner does', /below your 75%/.test(app.buildDashboardContextLine(base)));
check('context line moves on when the banner says it', /2 tasks slipped/.test(app.buildDashboardContextLine({ ...base, attendanceInBanner: true })));

// Due rows.
const T = (id, d) => ({ id, title: id, dueDate: d, status: 'pending' });
const day = (n) => { const x = new RealDate(NOW); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const six = [-6, -5, -4, -3, -2, -1].map(n => T('o' + n, day(n))).concat([2, 3, 4, 5].map(n => T('u' + n, day(n))));
let r = app.pickDueRows(six);
check('6 overdue + 4 upcoming: all overdue shown, exact remainder', r.rows.length === 6 && r.more === 4);
r = app.pickDueRows([T('a', day(-1)), T('b', day(0)), ...[1, 2, 3, 4, 5].map(n => T('u' + n, day(n)))]);
check('overdue and today first, then fills to three', r.rows.map(x => x.id).join() === 'a,b,u1' && r.more === 4);
r = app.pickDueRows([]);
check('nothing urgent', r.rows.length === 0 && r.more === 0);
r = app.pickDueRows([1, 2, 3, 4, 5].map(n => T('u' + n, day(n))));
check('upcoming only: three rows, order kept', r.rows.map(x => x.id).join() === 'u1,u2,u3' && r.more === 2);

console.log(fails ? `${fails} FAILED` : 'All Today calm checks passed.');
process.exit(fails ? 1 : 0);
