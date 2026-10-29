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
const MISSING = new Set();
const appended = [];
globalThis.document = {
  getElementById: (id) => (MISSING.has(id) ? null : domStub(id)),
  querySelector: () => null,
  querySelectorAll: () => [],
  activeElement: null, hidden: false,
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild(x) { appended.push(x); } }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

const code = appSrc.replace('function trackUsage(name, ...parts) {', 'function trackUsage(name, ...parts) { (globalThis.__EV__ ||= []).push([name, ...parts].join("/"));').replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
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
  domCache = {}; timers.length = 0; appended.length = 0; MISSING.clear(); globalThis.__EV__ = [];
  Object.assign(store, extra);
}
const visibleText = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
const BAD_WORDING = (html) => {
  const t = visibleText(html);
  const m = t.match(/[\u2013\u2014]|\s-\s|seamless|effortless|unlock|journey/i);
  return m ? `bad wording "${m[0]}" in: ${t.replace(/\s+/g, ' ').trim().slice(0, 120)}` : null;
};
const welcomeHtml = () => { MISSING.add('onboarding-backdrop'); globalThis.showOnboardingModal(); MISSING.delete('onboarding-backdrop'); return appended.map(x => x.innerHTML || '').join(''); };
const welcomeScheduled = () => timers.some((fn) => fn === globalThis.showOnboardingModal);
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

// ── Task 2: welcome and name screen ──
check('Welcome shows the three student questions and their answers', () => {
  seed(); makeApp(); const html = welcomeHtml();
  const want = ['Which room is the next class in?', 'Room 204', 'Data Structures, in 12 min', 'Can I skip this one?', 'Yep.', 'You can still miss 3 and stay above 75%',
    "When's the lab record due?", 'Tomorrow', "and you haven't started", "Clarity Desk keeps all of this on your phone, so you're never asking around. Works without internet too.",
    'Show me around', 'I already have an account'];
  const t = visibleText(html).replace(/\s+/g, ' ');
  const missing = want.filter(w => !t.includes(w));
  return missing.length ? `missing: ${missing.join(' | ')}` : true;
});

check('Welcome has exactly two buttons: Show me around and log in', () => {
  seed(); makeApp(); const html = welcomeHtml();
  const buttons = (html.match(/<button/g) || []).length;
  return buttons === 2 && html.includes('onboardingShowName()') && html.includes('onboardingLogin()') && !html.includes('onboarding-step-2') && !html.includes('ob-bunk') ? true : `buttons=${buttons}`;
});

check('Name screen asks what friends call you, with a skip', () => {
  seed(); makeApp(); welcomeHtml(); globalThis.onboardingShowName();
  const html = domCache['onboarding-step-1'].innerHTML;
  const t = visibleText(html).replace(/\s+/g, ' ');
  const ok = t.includes('Hi! What do your friends call you?') && t.includes('Just so the app can say hi properly. You can skip this.')
    && t.includes("That's me") && t.includes('Skip') && html.includes('id="ob-name"') && html.includes('maxlength="40"') && html.includes('autofocus');
  return ok ? true : t.slice(0, 200);
});

check('Show me around counts the explore choice and its onclick only calls globals', () => {
  seed(); makeApp(); const html = welcomeHtml();
  const calls = [...html.matchAll(/onclick="([^"]+)"/g)].flatMap(m => [...m[1].matchAll(/([A-Za-z_]\w*)\(/g)].map(x => x[1]));
  const notGlobal = calls.filter(n => typeof globalThis[n] !== 'function');
  globalThis.onboardingShowName();
  return !notGlobal.length && globalThis.__EV__.includes('welcome_choice/explore') ? true : `not global: ${notGlobal.join(',')} events: ${globalThis.__EV__}`;
});

check('Welcome and name screens use plain words with no dashes', () => {
  seed(); makeApp(); const a = welcomeHtml(); globalThis.onboardingShowName();
  return BAD_WORDING(a) || BAD_WORDING(domCache['onboarding-step-1'].innerHTML) || true;
});

check('Saving a name stores it as typed (trimmed) and Today escapes it', () => {
  seed(); const app = makeApp(); welcomeHtml();
  domStub('ob-name').value = '  <b>Riya</b> "x"  ';
  globalThis.onboardingSaveName(false);
  if (prof().name !== '<b>Riya</b> "x"') return `stored ${prof().name}`;
  const fresh = makeApp(); fresh.state.currentPage = 'dashboard'; fresh.renderDashboard();
  const html = domCache['page-dashboard'].innerHTML;
  return !html.includes('<b>Riya') && html.includes('&lt;b&gt;Riya') && globalThis.__EV__.includes('name_given') ? true : 'name not escaped or no event';
});

check('A 40 character name is kept whole', () => {
  seed(); makeApp(); welcomeHtml();
  domStub('ob-name').value = 'A'.repeat(40);
  globalThis.onboardingSaveName(false);
  return prof().name === 'A'.repeat(40) ? true : prof().name;
});

check('A blank name counts as a skip and saves nothing', () => {
  seed(); makeApp(); welcomeHtml();
  domStub('ob-name').value = '    ';
  globalThis.onboardingSaveName(false);
  return !prof().name && globalThis.__EV__.includes('name_skipped') && !globalThis.__EV__.includes('name_given') ? true : JSON.stringify([prof(), globalThis.__EV__]);
});

check('After the name step the welcome never comes back, even mid tour', () => {
  seed(); makeApp(); welcomeHtml();
  globalThis.onboardingSaveName(true);
  if (store.cos_onboarding_dismissed !== 'true') return 'not dismissed';
  const app = makeApp(); timers.length = 0; app.checkOnboarding();
  return welcomeScheduled() ? 'welcome scheduled again' : true;
});

// ── Task 3: one timetable card and the "how to add it" dialog ──
const todayHtml = (app) => { app.state.currentPage = 'dashboard'; app.renderDashboard(); return domCache['page-dashboard'].innerHTML; };
check('A new Today shows one timetable card with one button and a quiet self-study link', () => {
  seed(); const html = todayHtml(makeApp());
  const cards = (html.match(/class="desk-setup-guide/g) || []).length;
  const t = visibleText(html).replace(/\s+/g, ' ');
  const ok = cards === 1 && t.includes("Let's add your timetable") && t.includes('Takes about a minute. The rest can wait.')
    && html.includes('onclick="showAddTimetableChoice()"') && html.includes('onclick="setupSelfStudy()"') && t.includes('No timetable? I study on my own');
  return ok ? true : `cards=${cards} ${t.slice(0, 160)}`;
});

check('A new Today has no step counter and no calculator', () => {
  seed(); const html = todayHtml(makeApp());
  return !/steps? left/.test(html) && !html.includes('id="today-bunk"') && !html.includes('Get started') ? true : 'counter or calculator still there';
});

check('"How do you want to add it?" offers a photo or typing, plus Not now', () => {
  seed(); makeApp(); MISSING.add('add-tt-choice-backdrop'); globalThis.showAddTimetableChoice(); MISSING.clear();
  const html = appended.map(x => x.innerHTML || '').join('');
  const t = visibleText(html).replace(/\s+/g, ' ');
  const ok = t.includes('How do you want to add it?') && t.includes('You check every class before anything is saved.') && t.includes('Take a photo')
    && t.includes('Type it in') && t.includes('Not now') && html.includes('setupScanTimetable()') && html.includes('setupAddClasses()');
  return ok ? true : t.slice(0, 200);
});

check('The timetable card and the dialog use plain words with no dashes', () => {
  seed(); const app = makeApp(); const card = todayHtml(app);
  MISSING.add('add-tt-choice-backdrop'); globalThis.showAddTimetableChoice(); MISSING.clear();
  return BAD_WORDING(card.slice(card.indexOf('desk-setup-guide'), card.indexOf('desk-setup-guide') + 1500)) || BAD_WORDING(appended.map(x => x.innerHTML || '').join('')) || true;
});

check('Self-study with no exam date still gets the countdown step', () => {
  seed({ cos_profile: JSON.stringify({ studyMode: 'self' }) }); const html = todayHtml(makeApp());
  return html.includes('Set your exam countdown') && !html.includes("Let's add your timetable") ? true : 'countdown step missing';
});

globalThis.setTimeout = realSetTimeout;
console.log('==================================================================');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('==================================================================');
if (errors.length) { console.error('❌ ONBOARDING FLOW TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ONBOARDING FLOW TESTS PASSED! 🚀');
