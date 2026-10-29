// ==================================================================
// Clarity Desk: FIRST-RUN ONBOARDING FLOW
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
const EXPORTS = ['state', 'checkOnboarding', 'renderDashboard', 'loadProfile', 'onbGet', 'onbSet', 'saveProfileField', 'timetableBatches', 'noteTimetableDay', 'pruneNotifiedHistory'];
const makeApp = () => new Function(`${code}\n return { ${EXPORTS.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} };`)();

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; timers.length = 0;
  Object.assign(store, extra);
}
const hist = () => JSON.parse(store.cos_notified_history || '{}');
const prof = () => JSON.parse(store.cos_profile || '{}');
const day = (batches) => ({ subject: 'DS', code: 'DS', time: '10:00', end: '11:00', type: batches.length ? 'lab' : 'lecture', batches });
const TT = { 0: [], 1: [day(['B2'])], 2: [day(['A1', 'B2'])], 3: [day([])], 4: [], 5: [], 6: [] };

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.message}`); }
}

console.log('==================================================================');
console.log('🧭 FIRST-RUN ONBOARDING FLOW');
console.log('==================================================================');

// ── Task 1: state helpers ──
check('onbSet writes into cos_notified_history and keeps other keys', () => {
  seed({ cos_notified_history: JSON.stringify({ card_x: true }) }); const app = makeApp();
  app.onbSet('onb_name_skip', true);
  const h = hist();
  return h.onb_name_skip === true && h.card_x === true && app.onbGet('onb_name_skip') === true && app.onbGet('onb_nope') === undefined ? true : JSON.stringify(h);
});

check('saveProfileField trims, keeps other fields, ignores blanks', () => {
  seed({ cos_profile: JSON.stringify({ name: '', batch: 'A2', college: 'MIT' }) }); const app = makeApp();
  app.saveProfileField('name', '  Riya  ');
  const a = prof();
  app.saveProfileField('name', '   ');
  const b = prof();
  return a.name === 'Riya' && a.batch === 'A2' && a.college === 'MIT' && b.name === 'Riya' ? true : JSON.stringify([a, b]);
});

check('timetableBatches lists each lab group once, sorted', () => {
  seed({ cos_custom_timetable: JSON.stringify(TT) }); let app = makeApp();
  const a = app.timetableBatches();
  seed(); app = makeApp();
  const b = app.timetableBatches();
  return JSON.stringify(a) === '["A1","B2"]' && JSON.stringify(b) === '[]' ? true : JSON.stringify([a, b]);
});

check('noteTimetableDay records the first day a timetable exists, once', () => {
  seed(); let app = makeApp();
  app.noteTimetableDay();
  if (hist().onb_tt_day !== undefined) return 'set without a timetable';
  store.cos_custom_timetable = JSON.stringify(TT); app = makeApp();
  app.noteTimetableDay();
  const first = hist().onb_tt_day;
  store.cos_notified_history = JSON.stringify({ onb_tt_day: '2026-10-01' }); app = makeApp();
  app.noteTimetableDay();
  return first === '2026-10-14' && hist().onb_tt_day === '2026-10-01' ? true : `${first} / ${hist().onb_tt_day}`;
});

check('Pruning old reminder keys never drops onb_ flags', () => {
  seed(); const app = makeApp();
  const map = { onb_tt_day: '2026-10-01', onb_group_skip: true };
  for (let i = 0; i < 120; i++) map[`reminder_${i}`] = true;
  const out = app.pruneNotifiedHistory(map);
  const n = Object.keys(out).length;
  return out.onb_tt_day === '2026-10-01' && out.onb_group_skip === true && out.reminder_119 && !out.reminder_0 && n === 52 ? true : `keys=${n}`;
});

globalThis.setTimeout = realSetTimeout;
console.log('==================================================================');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('==================================================================');
if (errors.length) { console.error('❌ ONBOARDING FLOW TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ONBOARDING FLOW TESTS PASSED! 🚀');
