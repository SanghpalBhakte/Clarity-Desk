// ==================================================================
// Clarity Desk: DAILY BRIEFING summary line and Tomorrow card
// ==================================================================
// Locked down here:
//  - the one-line summary matches the counts (busy, quiet, all done,
//    overdue, singular/plural) and never says "nothing urgent" when
//    something is overdue;
//  - Tomorrow counts real classes (no Recess/off), shows the earliest
//    start in 12-hour time, and shows none on a holiday date;
//  - the rendered briefing carries the line, the next class and Tomorrow.
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
const makeApp = () => new Function(`${code}\n return { briefingHeadline, briefingTomorrow, renderSummaryContent };`)();

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
check('busy day', () => eq(a.briefingHeadline({ classesToday: 5, left: 2, due: 1 }), '2 classes left, 1 task due, nothing urgent.'));
check('singular and an important notice', () => eq(a.briefingHeadline({ classesToday: 1, left: 1, due: 1, notices: 1 }), '1 class left, 1 task due, 1 important notice.'));
check('empty day', () => eq(a.briefingHeadline({}), 'No classes today, nothing due today, nothing urgent.'));
check('all classes done, overdue wins over "nothing urgent"', () => eq(a.briefingHeadline({ classesToday: 3, left: 0, due: 0, overdue: 2, notices: 1 }), 'Classes done for today, nothing due today, 2 overdue.'));

localStorage.setItem('cos_custom_timetable', JSON.stringify({ 0: [], 1: [C('Data Structures', '10:00', '11:00')], 2: [C('Maths', '11:00', '12:00'), C('Recess', '12:00', '12:30', 'off'), C('Physics', '09:00', '10:00')], 3: [], 4: [], 5: [], 6: [] }));
check('tomorrow: real classes, earliest first, 12-hour time', () => eq(a.briefingTomorrow(), '2 classes, first at 9:00 AM'));
check('tomorrow on a holiday shows no classes', () => {
  localStorage.setItem('cos_holiday', JSON.stringify({ on: true, since: '2026-10-20', until: null }));
  const r = a.briefingTomorrow();
  localStorage.removeItem('cos_holiday');
  return eq(r, 'No classes');
});
check('rendered briefing: line, next class, tomorrow, no emoji', () => {
  const box = { innerHTML: '' }; makeApp().renderSummaryContent(box);
  const h = box.innerHTML;
  if (!h.includes('1 class left, nothing due today, nothing urgent.')) return 'summary line missing';
  if (!h.includes('Next: <strong>Data Structures</strong>')) return 'next class missing';
  if (!h.includes('2 classes, first at 9:00 AM')) return 'tomorrow missing';
  if (!h.includes("Today's Schedule")) return 'schedule heading missing';
  if (/[\u{1F300}-\u{1FAFF}]/u.test(h)) return 'emoji left in briefing';
  return true;
});
check('quiet day: one combined line, no empty cards', () => {
  localStorage.setItem('cos_custom_timetable', JSON.stringify({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }));
  const box = { innerHTML: '' }; makeApp().renderSummaryContent(box);
  const h = box.innerHTML;
  if (!h.includes('No classes today · nothing due today · nothing overdue · no urgent notices')) return 'combined line missing';
  if (h.includes("Today's Schedule") || h.includes('Key Notices') || h.includes('stat-card')) return 'empty sections still shown';
  return h.includes('No classes') ? true : 'tomorrow card missing';
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ DAILY BRIEFING TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL DAILY BRIEFING TESTS PASSED! 🚀');
process.exit(0);
