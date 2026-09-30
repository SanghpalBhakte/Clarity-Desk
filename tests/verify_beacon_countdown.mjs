// ==================================================================
// Clarity Desk: CLASS COUNTDOWN (Today's Next Up / In Session card)
// ==================================================================
// v169: the card only knew the time range. It now shows "1h 20m until it
// starts" / "35 min left in class" (+ a progress line and a "Then ..." line),
// updated once a minute by tickBeacon().
// Locked down here:
//  - the numbers: whole minutes, never "0 min", 60+ reads "1h 05m";
//  - the card's state and countdown agree at every boundary minute;
//  - tickBeacon() only edits text while nothing changed, rebuilds Today
//    exactly once when a class starts or ends, and never rebuilds it under
//    someone who is typing.
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
const makeApp = () => new Function(`${code}\n return { state, formatCountdown, beaconProgressPct, tickBeacon, renderDashboard, findNextClassDay };`)();

// Tuesday: a 2-hour lab, then a 2-hour lecture.
const DSL = { subject: 'Data Structures Lab', code: 'DSL', time: '10:00', end: '12:00', room: 'FF-28', teacher: 'Prof. VJM', type: 'lab' };
const OE2 = { subject: 'Open Elective 2', code: 'OE2', time: '12:45', end: '14:45', room: 'SF-31', teacher: 'Faculty', type: 'lecture' };
function seed() {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; cardStub = null; document.activeElement = null;
  store.cos_custom_timetable = JSON.stringify({ 0: [], 1: [], 2: [DSL, OE2], 3: [], 4: [], 5: [], 6: [] });
  store.cos_onboarding_dismissed = 'true';
}
function today(iso) {                       // render Today at a moment, return its markup
  seed(); at(iso);
  const app = makeApp();
  app.renderDashboard();
  return { app, html: domCache['page-dashboard'].innerHTML };
}
const attr = (html, name) => (html.match(new RegExp(`class="chrono-beacon[^>]*\\b${name}="([^"]*)"`)) || [])[1];
const countText = (html) => (html.match(/data-beacon-count>([^<]*)</) || [])[1];

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
console.log('⏱  CLASS COUNTDOWN');
console.log('==================================================================');

check('formatCountdown: whole minutes, hours from 60, never negative', () => {
  seed(); const { formatCountdown: f } = makeApp();
  const got = [0, 1, 59, 60, 65, 95, 605, -4].map(f).join(' | ');
  const want = '0 min | 1 min | 59 min | 1h 00m | 1h 05m | 1h 35m | 10h 05m | 0 min';
  return got === want ? true : `${got} != ${want}`;
});

check('beaconProgressPct: 0 at start, 50 halfway, 100 at end, clamped, safe on empty span', () => {
  seed(); const { beaconProgressPct: p } = makeApp();
  const got = [p(600, 720, 600), p(600, 720, 660), p(600, 720, 720), p(600, 720, 500), p(600, 720, 900), p(600, 600, 600)].join(',');
  return got === '0,50,100,0,100,0' ? true : got;
});

check('Before class: Next Up card counts down to the start ("1h 20m until it starts")', () => {
  const { html } = today('2026-09-29T08:40:00');
  if (attr(html, 'data-beacon') !== 'next') return `state ${attr(html, 'data-beacon')}`;
  if (attr(html, 'data-start') !== '600' || attr(html, 'data-end') !== '720') return `data ${attr(html, 'data-start')}-${attr(html, 'data-end')}`;
  if (countText(html) !== '1h 20m') return `count ${countText(html)}`;
  return html.includes('until it starts') && !html.includes('chrono-beacon-progress') ? true : 'label/progress wrong';
});

check('In class: counts down to the end, progress line, "Then <next class> at 12:45 PM"', () => {
  const { html } = today('2026-09-29T10:25:00');
  if (attr(html, 'data-beacon') !== 'live') return `state ${attr(html, 'data-beacon')}`;
  if (countText(html) !== '1h 35m') return `count ${countText(html)}`;
  if (!html.includes('left in class')) return 'label';
  if (!/aria-valuenow="21"[^>]*><span style="width:21%"/.test(html)) return 'progress not 21%';
  return /Then <strong>Open Elective 2<\/strong> at 12:45 PM · SF-31/.test(html) ? true : '"Then" line missing/wrong';
});

check('Boundary minutes: 09:59 = "1 min" until start, 10:00 = in class, 11:59 = "1 min" left, 12:00 = between classes', () => {
  const a = today('2026-09-29T09:59:00').html, b = today('2026-09-29T10:00:00').html;
  const c = today('2026-09-29T11:59:00').html, d = today('2026-09-29T12:00:00').html;
  if (attr(a, 'data-beacon') !== 'next' || countText(a) !== '1 min') return `09:59 → ${attr(a, 'data-beacon')} ${countText(a)}`;
  if (attr(b, 'data-beacon') !== 'live' || countText(b) !== '2h 00m') return `10:00 → ${attr(b, 'data-beacon')} ${countText(b)}`;
  if (attr(c, 'data-beacon') !== 'live' || countText(c) !== '1 min') return `11:59 → ${attr(c, 'data-beacon')} ${countText(c)}`;
  return attr(d, 'data-beacon') === 'next' && countText(d) === '45 min' ? true : `12:00 → ${attr(d, 'data-beacon')} ${countText(d)}`;
});

check('Last class has no "Then" line; finished day and rest day carry no countdown', () => {
  const last = today('2026-09-29T13:00:00').html;
  if (attr(last, 'data-beacon') !== 'live' || last.includes('chrono-beacon-then')) return 'last class shows a Then line';
  const done = today('2026-09-29T15:30:00').html, free = today('2026-09-27T11:00:00').html;   // Sunday
  return !done.includes('data-beacon') && !free.includes('data-beacon') && !done.includes('data-beacon-count') ? true : 'countdown on a finished/free card';
});

check('A class with no end time gets no countdown or progress (nothing to count to)', () => {
  seed(); at('2026-09-29T10:30:00');
  store.cos_custom_timetable = JSON.stringify({ 0: [], 1: [], 2: [{ subject: 'Seminar', code: 'SEM', time: '10:00', type: 'lecture' }], 3: [], 4: [], 5: [], 6: [] });
  const app = makeApp(); app.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  return html.includes('In Session') && !html.includes('data-beacon') && !html.includes('chrono-beacon-progress') ? true : 'countdown/progress shown without an end time';
});

// ── Look-ahead: what the card says when today has nothing left ─────────
const OS  = { subject: 'Operating Systems', code: 'OS', time: '09:00', end: '10:00', room: 'B-104', type: 'lecture' };
const DM  = { subject: 'Discrete Mathematics', code: 'DM', time: '08:00', end: '09:00', room: 'B-105', type: 'lecture' };
const REC = { subject: 'Recess', code: 'REC', time: '13:00', end: '13:45', type: 'break' };
function todayWith(iso, tt) {
  seed(); at(iso);
  store.cos_custom_timetable = JSON.stringify({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...tt });
  const app = makeApp(); app.renderDashboard();
  return domCache['page-dashboard'].innerHTML;
}
const nextLine = (html) => (html.match(/Next class: <strong>([^<]*)<\/strong> at ([^·]*) · ([^<]*)</) || []).slice(1).join(' | ');

check("Day finished: card points at tomorrow's earliest class (not just the first listed)", () => {
  const got = nextLine(todayWith('2026-09-29T15:30:00', { 2: [DSL, OE2], 3: [OS, DM] }));   // Tue evening; Wed lists OS before DM
  return got === 'Tomorrow | 8:00 AM | Discrete Mathematics' ? true : got;
});

check('Rest day: card names the weekday of the next class ("Tuesday"), later than tomorrow', () => {
  const got = nextLine(todayWith('2026-09-27T11:00:00', { 2: [DSL, OE2], 3: [OS] }));       // Sunday
  return got === 'Tuesday | 10:00 AM | Data Structures Lab' ? true : got;
});

check('Recess/breaks are not classes: a day with only a break is skipped', () => {
  const got = nextLine(todayWith('2026-09-29T15:30:00', { 2: [DSL], 3: [REC], 4: [OS] }));  // Wed only a break -> Thursday
  return got === 'Thursday | 9:00 AM | Operating Systems' ? true : got;
});

check('Only one teaching day in the week: after the last class it says "Next Tuesday"', () => {
  const got = nextLine(todayWith('2026-09-29T15:30:00', { 2: [DSL, OE2] }));
  return got === 'Next Tuesday | 10:00 AM | Data Structures Lab' ? true : got;
});

check('Nothing scheduled anywhere: no look-ahead line, and no crash', () => {
  const html = todayWith('2026-09-27T11:00:00', {});
  return html.includes('No Classes Today') && !html.includes('Next class:') ? true : 'look-ahead shown for an empty timetable';
});

check('While a class is running or coming up the look-ahead stays out of the way', () => {
  const a = todayWith('2026-09-29T10:25:00', { 2: [DSL, OE2], 3: [OS] });
  const b = todayWith('2026-09-29T08:40:00', { 2: [DSL, OE2], 3: [OS] });
  return !a.includes('Next class:') && !b.includes('Next class:') ? true : 'look-ahead shown mid-day';
});

function fakeCard(kind, start, end) {
  const num = { textContent: '' }, bar = { firstElementChild: { style: {} }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  cardStub = { dataset: { beacon: kind, start: String(start), end: String(end) }, querySelector: (s) => (s === '[data-beacon-count]' ? num : s === '[data-beacon-bar]' ? bar : null) };
  return { num, bar };
}
function tickAt(iso, kind, start, end, opts = {}) {
  seed(); at(iso);
  const app = makeApp(); app.state.currentPage = 'dashboard';
  const { num, bar } = fakeCard(kind, start, end);
  domCache['page-dashboard'] = { ...domStub('page-dashboard'), innerHTML: 'UNTOUCHED' };
  if (opts.typing) document.activeElement = { tagName: 'INPUT', closest: (s) => (s === '#page-dashboard' ? {} : null) };
  app.tickBeacon();
  return { num, bar, rebuilt: domCache['page-dashboard'].innerHTML !== 'UNTOUCHED', html: domCache['page-dashboard'].innerHTML };
}

check('tick mid-class: only the number and the bar change, Today is NOT rebuilt', () => {
  const t = tickAt('2026-09-29T10:30:00', 'live', 600, 720);
  return !t.rebuilt && t.num.textContent === '1h 30m' && t.bar.firstElementChild.style.width === '25%' && t.bar.attrs['aria-valuenow'] === '25'
    ? true : `rebuilt=${t.rebuilt} num=${t.num.textContent} width=${t.bar.firstElementChild.style.width}`;
});

check('tick before class: countdown text updates, Today is NOT rebuilt', () => {
  const t = tickAt('2026-09-29T09:15:00', 'next', 600, 720);
  return !t.rebuilt && t.num.textContent === '45 min' ? true : `rebuilt=${t.rebuilt} num=${t.num.textContent}`;
});

check('tick at the start minute: Next Up card is rebuilt into In Session (once)', () => {
  const t = tickAt('2026-09-29T10:00:00', 'next', 600, 720);
  return t.rebuilt && attr(t.html, 'data-beacon') === 'live' ? true : `rebuilt=${t.rebuilt} state=${attr(t.html, 'data-beacon')}`;
});

check('tick at the end minute: In Session card is rebuilt into the next state', () => {
  const t = tickAt('2026-09-29T12:00:00', 'live', 600, 720);
  return t.rebuilt && attr(t.html, 'data-beacon') === 'next' && attr(t.html, 'data-start') === '765' ? true : `rebuilt=${t.rebuilt} state=${attr(t.html, 'data-beacon')}`;
});

check('tick never rebuilds Today underneath someone typing (Ask Desk); it catches up on the next tick', () => {
  const t = tickAt('2026-09-29T10:00:00', 'next', 600, 720, { typing: true });
  return !t.rebuilt ? true : 'rebuilt while typing';
});

check('tick does nothing on other pages, or when the card has no countdown', () => {
  seed(); at('2026-09-29T10:00:00');
  const app = makeApp(); app.state.currentPage = 'timetable';
  fakeCard('next', 600, 720);
  domCache['page-dashboard'] = { ...domStub('page-dashboard'), innerHTML: 'UNTOUCHED' };
  app.tickBeacon();
  const off = domCache['page-dashboard'].innerHTML === 'UNTOUCHED';
  app.state.currentPage = 'dashboard'; cardStub = null;
  app.tickBeacon();
  return off && domCache['page-dashboard'].innerHTML === 'UNTOUCHED' ? true : 'ticked when it should not';
});

console.log('\n==================================================================');
console.log(`RESULT: ${passed}/${total} passed`);
if (errors.length) { console.error(JSON.stringify(errors, null, 2)); process.exit(1); }
