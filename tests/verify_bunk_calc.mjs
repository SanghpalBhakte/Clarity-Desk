// ==================================================================
// Clarity Desk: "HOW MANY CLASSES CAN YOU MISS?" (first screen)
// ==================================================================
// Locked down here:
//  - the answer always agrees with computeNowGuidance (the Subjects
//    screen's formula) for every attended/held/target combination;
//  - the wording for: buffer left, exactly on target, below target,
//    blank, attended > held, 0 held, non-numbers;
//  - typing writes nothing to storage and counts one usage event at most;
//  - it shows on the Welcome card and inside the single empty-Today setup
//    card, never once a timetable exists or for self-study students.
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
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
let domCache = {};
const MISSING = new Set();
const domStub = (id) => MISSING.has(id) ? null : (domCache[id] ||= { id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', className: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
const appended = [];
globalThis.document = {
  getElementById: domStub,
  querySelector: () => null,
  querySelectorAll: () => [],
  activeElement: null, hidden: false,
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild: (x) => appended.push(x) }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
const sent = [];
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120', onLine: true, webdriver: false, sendBeacon: (u) => { sent.push(u); return true; } }, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { hostname: 'claritydesk.web.app', search: '', hash: '' }, configurable: true, writable: true });

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const makeApp = () => new Function(`${code}\n return { state, bunkCalcAnswer, updateBunkCalc, computeNowGuidance, renderDashboard, USAGE_EVENTS };`)();

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; appended.length = 0; sent.length = 0;
  Object.assign(store, extra);
}

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
console.log('🧮 HOW MANY CLASSES CAN YOU MISS?');
console.log('==================================================================');

check('Agrees with the Subjects screen formula for every attended/held/target up to 80 held', () => {
  seed(); const app = makeApp();
  for (const t of [65, 70, 75, 80, 85]) {
    for (let h = 1; h <= 80; h++) {
      for (let a = 0; a <= h; a++) {
        const g = app.computeNowGuidance(a, h, t), r = app.bunkCalcAnswer(String(a), String(h), t);
        const want = g.isSafe ? ['safe', g.safeSkips] : ['recover', g.classesToAttend];
        const got = [r.kind, r.n];
        if (got[0] !== want[0] || got[1] !== want[1]) return `a=${a} h=${h} t=${t}: got ${got} want ${want}`;
      }
    }
  }
  return true;
});

const CASES = [
  ['42 of 50 at 75%: a buffer of 6', '42', '50', 75, 'safe', 'You can miss <strong>6</strong> more classes and stay at 75%.'],
  ['16 of 20 at 75%: a buffer of 1 (singular)', '16', '20', 75, 'safe', 'You can miss <strong>1</strong> more class and stay at 75%.'],
  ['15 of 20 at 75%: exactly on target', '15', '20', 75, 'safe', 'You’re right at 75%. Attend the next class to get a buffer.'],
  ['30 of 50 at 75%: attend 30 in a row', '30', '50', 75, 'recover', 'Attend the next <strong>30</strong> classes in a row to get back to 75%.'],
  ['Blank held', '12', '', 75, 'empty', 'Type both numbers from your college portal.'],
  ['Attended more than held', '20', '10', 75, 'invalid', 'Attended can’t be more than held.'],
  ['Zero held', '0', '0', 75, 'invalid', 'Classes held has to be more than 0.'],
  ['Not a number', '4a', '10', 75, 'empty', 'Type both numbers from your college portal.'],
  ['Four digits', '1000', '1200', 75, 'empty', 'Type both numbers from your college portal.'],
];
for (const [label, a, h, t, kind, text] of CASES) {
  check(`Wording: ${label}`, () => {
    seed(); const r = makeApp().bunkCalcAnswer(a, h, t);
    return r.kind === kind && r.text === text ? true : `got ${r.kind}: ${r.text}`;
  });
}

check('Typing writes nothing to storage and counts one usage event at most', () => {
  seed(); const app = makeApp();
  const type = (a, h) => { domStub('ob-bunk-a').value = a; domStub('ob-bunk-h').value = h; domStub('ob-bunk-t').value = '75'; return app.updateBunkCalc('ob'); };
  type('4', ''); type('42', '5'); const r = type('42', '50'); type('30', '50');
  const events = sent.map(u => decodeURIComponent(new URL(u).searchParams.get('p')));
  const box = domCache['ob-bunk-ans'];
  if (Object.keys(store).length) return `storage written: ${Object.keys(store)}`;
  if (events.length !== 1 || events[0] !== 'bunk_calc_used/safe') return `events: ${events}`;
  if (!app.USAGE_EVENTS.includes('bunk_calc_used')) return 'event not allow-listed';
  return r.kind === 'safe' && box.className === 'bunk-calc-answer is-recover' ? true : `answer=${r.kind} box=${box.className}`;
});

check('Only digits from the inputs ever reach the page', () => {
  seed(); const app = makeApp();
  domStub('ob-bunk-a').value = '<b>4'; domStub('ob-bunk-h').value = '1"0'; domStub('ob-bunk-t').value = '75';
  const r = app.updateBunkCalc('ob');
  return r.kind === 'recover' && r.n === 14 && !/[<"]/.test(domCache['ob-bunk-ans'].innerHTML.replace(/<\/?strong>/g, '')) ? true : `got ${r.kind}: ${domCache['ob-bunk-ans'].innerHTML}`;
});

check('Welcome has only Show me around and Log in (the calculator lives on Today)', () => {
  seed(); makeApp(); MISSING.add('onboarding-backdrop'); globalThis.showOnboardingModal(); MISSING.clear();
  const html = appended.map(x => x.innerHTML || '').join('');
  const step1 = html.slice(html.indexOf('id="onboarding-step-1"'));
  const buttons = (step1.match(/<button/g) || []).length;
  return !step1.includes('id="ob-bunk"') && buttons === 2 && step1.includes('onboardingShowName()') && step1.includes('onboardingLogin()') ? true : `buttons=${buttons}`;
});

check('Empty Today: calculator inside the one setup card', () => {
  seed(); const app = makeApp(); app.state.currentPage = 'dashboard'; app.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  const cards = (html.match(/class="desk-setup-guide"/g) || []).length;
  const inCard = html.indexOf('id="today-bunk"') > html.indexOf('class="desk-setup-guide"');
  return cards === 1 && html.includes('id="today-bunk"') && inCard ? true : `cards=${cards} calc=${html.includes('id="today-bunk"')}`;
});

check('Not shown once a timetable exists', () => {
  const CLASS = { subject: 'Data Structures', code: 'DS', time: '10:00', end: '11:00', room: 'SF-31', type: 'lecture' };
  seed({ cos_custom_timetable: JSON.stringify({ 0: [], 1: [CLASS], 2: [CLASS], 3: [CLASS], 4: [CLASS], 5: [CLASS], 6: [] }) });
  const app = makeApp(); app.state.currentPage = 'dashboard'; app.renderDashboard();
  return !domCache['page-dashboard'].innerHTML.includes('bunk-calc') ? true : 'calculator shown with a timetable';
});

check('Not shown for self-study students', () => {
  seed({ cos_profile: JSON.stringify({ studyMode: 'self' }) });
  const app = makeApp(); app.state.currentPage = 'dashboard'; app.renderDashboard();
  return !domCache['page-dashboard'].innerHTML.includes('bunk-calc') ? true : 'calculator shown in self-study mode';
});

console.log('\n========================================');
console.log(`CAN I MISS: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
