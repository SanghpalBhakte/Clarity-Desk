// ==================================================================
// Clarity Desk: DAILY BRIEFING, the week ahead
// ==================================================================
// Locked down here:
//  - the headline is about today while classes remain, then the next day
//    with classes ("Tomorrow's a light one / lab day / long one");
//  - only real classes count (no Recess/off), earliest first, 12-hour time;
//  - a holiday date has no classes; nothing ahead gives "A clear week";
//  - the rendered briefing has the focus day, the week, Due and Watch,
//    shows no empty week section and no emoji.
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
const makeApp = () => new Function(`${code}\n return { briefingWeek, briefingFocus, briefingFocusHeadline, renderSummaryContent, timeToMinutes };`)();

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}
const eq = (got, want) => got === want ? true : `got "${got}", want "${want}"`;
const C = (subject, time, end, type = 'lecture') => ({ subject, code: subject.slice(0, 2), time, end, type, room: 'R1', teacher: 'T', batches: [] });

const a = makeApp();
localStorage.setItem('cos_custom_timetable', JSON.stringify({ 0: [], 1: [C('Data Structures', '10:00', '11:00')], 2: [C('Maths', '11:00', '12:00'), C('Recess', '12:00', '12:30', 'off'), C('Physics', '09:00', '10:00')], 3: [], 4: [], 5: [], 6: [] }));
const focusAt = (iso) => { at(iso); const m = new Date().getHours() * 60 + new Date().getMinutes(); return a.briefingFocus(a.briefingWeek(new Date()), m); };

check('week: Monday to Sunday, real classes only, earliest first', () => {
  at('2026-10-19T09:50:00');
  const w = a.briefingWeek(new Date());
  if (w.length !== 7 || w[0].day !== 1 || w[6].day !== 0) return 'not Mon..Sun';
  if (!w[0].isToday || w[0].past) return 'today flags wrong';
  return eq(w[1].classes.map(c => c.subject).join(','), 'Physics,Maths');
});
check('classes left today: headline is about today', () => {
  const f = focusAt('2026-10-19T09:50:00');
  const h = a.briefingFocusHeadline(f);
  return eq(`${f.label} | ${h.html} | ${h.sub}`, 'Today | <em>1 class</em> left today. | Next at 10:00 AM, done by 11:00 AM.');
});
check('after the last class: tomorrow, light day, 12-hour times', () => {
  const f = focusAt('2026-10-19T18:30:00');
  const h = a.briefingFocusHeadline(f);
  return eq(`${f.label} | ${h.html} | ${h.sub}`, "Tomorrow | Tomorrow's a <em>light one</em>. | 2 classes, 9:00 AM to 12:00 PM.");
});
check('a lab makes it a lab day; four classes a long one', () => {
  const lab = a.briefingFocusHeadline({ label: 'Tomorrow', classes: [C('DS', '10:00', '12:00', 'lab')], isToday: false }).html;
  const four = a.briefingFocusHeadline({ label: 'Thursday', classes: [1, 2, 3, 4].map(i => C('S' + i, `${9 + i}:00`, `${10 + i}:00`)), isToday: false }).html;
  return eq(`${lab} | ${four}`, "Tomorrow's a <em>lab day</em>. | Thursday's a <em>long one</em>.");
});
check('a holiday from tomorrow: nothing ahead, a clear week', () => {
  localStorage.setItem('cos_holiday', JSON.stringify({ on: true, since: '2026-10-20', until: null }));
  const f = focusAt('2026-10-19T18:30:00');
  localStorage.removeItem('cos_holiday');
  return f === null ? eq(a.briefingFocusHeadline(f).html, 'A <em>clear</em> week.') : `focus ${f.label}`;
});
check('rendered briefing: focus class, the week, due, watch, no emoji', () => {
  at('2026-10-19T09:50:00');
  const box = { innerHTML: '' }; makeApp().renderSummaryContent(box);
  const h = box.innerHTML;
  if (!h.includes('This morning')) return 'kicker missing';
  if (!h.includes('10:00 AM') || !h.includes('Data Structures')) return 'focus class missing';
  if (!h.includes('The week') || !h.includes('bw-block')) return 'week missing';
  if (!h.includes('Nothing. Rare. Enjoy it.')) return 'empty due line missing';
  if (!h.includes('closest to the 75% line')) return 'watch line missing';
  if (/[\u{1F300}-\u{1FAFF}]/u.test(h)) return 'emoji left in briefing';
  return true;
});
check('no timetable: a clear week, no empty week or focus section', () => {
  localStorage.setItem('cos_custom_timetable', JSON.stringify({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }));
  const box = { innerHTML: '' }; makeApp().renderSummaryContent(box);
  const h = box.innerHTML;
  if (!h.includes('A <em>clear</em> week.')) return 'clear-week headline missing';
  if (h.includes('bf-focus') || h.includes('The week')) return 'empty sections still shown';
  return true;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ DAILY BRIEFING TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL DAILY BRIEFING TESTS PASSED! 🚀');
process.exit(0);
