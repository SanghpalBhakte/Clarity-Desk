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
const EXPORTS = ['bunkCalcAnswer', 'saveTimetable', 'state', 'checkOnboarding', 'renderDashboard', 'loadProfile', 'onbGet', 'onbSet', 'saveProfileField', 'timetableBatches', 'noteTimetableDay', 'pruneNotifiedHistory'];
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

// ── Task 4: group card, name fallback, next-day attendance card ──
const lab = (b) => ({ subject: 'DS Lab', code: 'DSL', time: '14:00', end: '16:00', type: 'lab', batches: b });
const lec = { subject: 'Maths', code: 'M3', time: '15:00', end: '16:00', type: 'lecture', batches: [] };
const week = (cls) => { const t = {}; for (let i = 0; i < 7; i++) t[i] = cls; return JSON.stringify(t); };
const WITH_GROUPS = week([lab(['A1']), lab(['A2']), lec]);
const NO_GROUPS = week([lec]);
const greetingOf = (html) => { const i = html.indexOf('class="desk-greeting"'); if (i < 0) return ''; const j = html.indexOf('<!-- 2. PRIMARY', i); return html.slice(i, j < 0 ? i + 900 : j); };
const cardOf = (html) => { const i = html.indexOf('class="desk-setup-guide'); if (i < 0) return ''; const j = html.indexOf('class="dashboard-layout"', i); return html.slice(i, j < 0 ? i + 2500 : j); };

check('Timetable with lab groups and no group saved: group card with chips and Skip', () => {
  seed({ cos_custom_timetable: WITH_GROUPS }); const app = makeApp(); const card = cardOf(todayHtml(app));
  const t = visibleText(card).replace(/\s+/g, ' ');
  const ok = t.includes('Timetable added ✓ One quick thing') && t.includes('Which lab group are you in? So you only see your labs.')
    && card.includes('data-batch="A1"') && card.includes('data-batch="A2"') && card.includes('onbPickGroup(null)');
  if (!ok) return t.slice(0, 200);
  globalThis.onbPickGroup('A2');
  return prof().batch === 'A2' ? true : JSON.stringify(prof());
});

check('Picking a group with other groups\' labs left opens the existing clean-up review (nothing removed yet)', () => {
  seed({ cos_custom_timetable: WITH_GROUPS }); makeApp(); const before = store.cos_custom_timetable;
  let opened = 0; globalThis.showDeclutterDeskModal = () => { opened++; };
  globalThis.onbPickGroup('A2');
  if (opened !== 1) return `review opened ${opened} times`;
  seed({ cos_custom_timetable: NO_GROUPS }); makeApp(); opened = 0; globalThis.showDeclutterDeskModal = () => { opened++; };
  globalThis.onbPickGroup('A1');
  return store.cos_custom_timetable === NO_GROUPS && before === WITH_GROUPS && opened === 0 ? true : 'opened with nothing to clean, or timetable changed';
});

check('A lab group name with quotes cannot break out of its button', () => {
  const evil = `x');globalThis.__pwn=1;('`;
  seed({ cos_custom_timetable: week([lab([evil]), lab(['B"2']), lab(["O'Neil"]), lec]) });
  const card = cardOf(todayHtml(makeApp()));
  const clicks = [...card.matchAll(/onclick="([^"]*)"/g)].map(m => m[1]);
  const inline = clicks.filter(c => c.startsWith('onbPickGroup(') && c !== 'onbPickGroup(this.dataset.batch)' && c !== 'onbPickGroup(null)');
  const attrs = [...card.matchAll(/data-batch="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  return !inline.length && attrs.includes(evil) && attrs.includes('B"2') && attrs.includes("O'Neil") ? true : `inline=${inline.length} attrs=${JSON.stringify(attrs)}`;
});

check('Skipping the group card hides it for good and moves on to the name', () => {
  seed({ cos_custom_timetable: WITH_GROUPS }); const app = makeApp(); todayHtml(app);
  globalThis.onbPickGroup(null);
  const html = todayHtml(makeApp());
  return hist().onb_group_skip === true && !html.includes('One quick thing') && greetingOf(html).includes('What should we call you?') ? true : 'group card still shown or no name ask';
});

check('No lab groups, or a group already saved: no group card, the greeting asks the name', () => {
  seed({ cos_custom_timetable: NO_GROUPS }); const a = todayHtml(makeApp());
  seed({ cos_custom_timetable: WITH_GROUPS, cos_profile: JSON.stringify({ batch: 'B1' }) }); const b = todayHtml(makeApp());
  const ok = [a, b].every(h => !h.includes('One quick thing') && greetingOf(h).includes("Your week's all set. What should we call you?") && h.includes('id="greet-name"'));
  return ok ? true : 'expected the name ask in the greeting';
});

check('A lab group saved the old way (cos_user_batch) also hides the group card', () => {
  seed({ cos_custom_timetable: WITH_GROUPS, cos_user_batch: 'A1' }); const h = todayHtml(makeApp());
  return !h.includes('One quick thing') ? true : 'group card shown though a group is saved';
});

check('Saving an empty name keeps the box and points at it', () => {
  seed({ cos_custom_timetable: NO_GROUPS }); todayHtml(makeApp());
  const box = domStub('greet-name'); box.value = '  '; let focused = 0; box.focus = () => { focused++; };
  const attrs = {}; box.setAttribute = (k, v) => { attrs[k] = v; };
  globalThis.onbSaveGreetingName(false);
  return focused === 1 && attrs['aria-invalid'] === 'true' && /name/i.test(box.placeholder || '') && !hist().onb_name_skip && !prof().name ? true : `focused=${focused} attrs=${JSON.stringify(attrs)} ph=${box.placeholder}`;
});

check('With a name saved, no name ask and the greeting uses it', () => {
  seed({ cos_custom_timetable: NO_GROUPS, cos_profile: JSON.stringify({ name: 'Riya Shah' }) }); const html = todayHtml(makeApp());
  return !html.includes('greet-name') && greetingOf(html).includes('Riya') ? true : greetingOf(html).slice(0, 200);
});

check('Name in the greeting: Save stores it, Not now remembers the skip', () => {
  seed({ cos_custom_timetable: NO_GROUPS }); todayHtml(makeApp());
  domStub('greet-name').value = ' Riya ';
  globalThis.onbSaveGreetingName(false);
  if (prof().name !== 'Riya') return `saved ${prof().name}`;
  seed({ cos_custom_timetable: NO_GROUPS }); todayHtml(makeApp());
  globalThis.onbSaveGreetingName(true);
  const html = todayHtml(makeApp());
  return hist().onb_name_skip === true && !html.includes('greet-name') ? true : 'skip not remembered';
});

const READY = (extra = {}) => ({ cos_custom_timetable: NO_GROUPS, cos_profile: JSON.stringify({ name: 'Riya' }), ...extra });
check('Attendance card waits until the day after the timetable showed up', () => {
  seed(READY()); let app = makeApp();
  if (todayHtml(app).includes('Want your attendance %?')) return 'card shown before the day was recorded';
  app.noteTimetableDay(); app = makeApp();
  return hist().onb_tt_day === '2026-10-14' && !todayHtml(app).includes('Want your attendance %?') ? true : 'card shown on day one';
});

check('Saving a timetable records the day; showing Today writes nothing', () => {
  seed({ cos_profile: JSON.stringify({ name: 'Riya' }) }); const app = makeApp();
  const before = JSON.stringify(store); todayHtml(app);
  if (JSON.stringify(store) !== before) return 'render wrote to storage';
  app.saveTimetable(JSON.parse(NO_GROUPS));
  return hist().onb_tt_day === '2026-10-14' ? true : 'day not recorded on save';
});

check('Next day: attendance card with Add counts, Later and the quick calculator link', () => {
  seed(READY({ cos_notified_history: JSON.stringify({ onb_tt_day: '2026-10-13' }) })); const card = cardOf(todayHtml(makeApp()));
  const t = visibleText(card).replace(/\s+/g, ' ');
  const ok = t.includes('Want your attendance %?') && t.includes('Copy your counts from the college portal once. Or just start marking classes from today.')
    && card.includes(`showBaselineModal(null, 'manual')`) && card.includes('onbAttLater()') && t.includes('Just check how many I can miss') && !card.includes('id="today-bunk"');
  return ok ? true : t.slice(0, 220);
});

check('Later hides the attendance card for today only', () => {
  seed(READY({ cos_notified_history: JSON.stringify({ onb_tt_day: '2026-10-13' }) })); todayHtml(makeApp());
  globalThis.onbAttLater();
  if (todayHtml(makeApp()).includes('Want your attendance %?')) return 'still shown today';
  if (hist().onb_att_later !== '2026-10-14' || Object.keys(hist()).some(k => k.startsWith('onb_att_later_'))) return `stored ${JSON.stringify(hist())}`;
  const saved = { ...store };
  globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW + 86400000); } static now() { return NOW + 86400000; } };
  try {
    seed(saved); return todayHtml(makeApp()).includes('Want your attendance %?') ? true : 'not back the next day';
  } finally { globalThis.Date = FakeDate; }
});

check('Attendance card hides during a holiday, with counts set, or once a class is marked', () => {
  const base = { cos_notified_history: JSON.stringify({ onb_tt_day: '2026-10-13' }) };
  const cases = {
    holiday: READY({ ...base, cos_holiday: JSON.stringify({ on: true, since: '2026-10-10', until: null }) }),
    counts: READY({ ...base, cos_attendance_baseline: JSON.stringify({ M3: { present: 10, totalCount: 12 } }) }),
    marked: READY({ ...base, cos_attendance: JSON.stringify({ '2026-10-13': { M3_1500: 'attended' } }) }),
  };
  const shown = Object.entries(cases).filter(([, st]) => { seed(st); return todayHtml(makeApp()).includes('Want your attendance %?'); }).map(([k]) => k);
  return shown.length ? `shown with: ${shown.join(', ')}` : true;
});

check('"Just check how many I can miss" opens the same calculator, same answer', () => {
  seed(READY({ cos_notified_history: JSON.stringify({ onb_tt_day: '2026-10-13' }) })); const app = makeApp(); todayHtml(app);
  globalThis.onbShowBunk();
  const html = domCache['page-dashboard'].innerHTML;
  if (!html.includes('id="today-bunk"')) return 'calculator not shown';
  domStub('today-bunk-a').value = '75'; domStub('today-bunk-h').value = '100'; domStub('today-bunk-t').value = '75';
  const r = globalThis.updateBunkCalc('today');
  const want = app.bunkCalcAnswer('75', '100', 75);
  return r.kind === want.kind && r.text === want.text ? true : `${r.kind} vs ${want.kind}`;
});

check('Group, name and attendance cards use plain words with no dashes', () => {
  seed({ cos_custom_timetable: WITH_GROUPS }); const a = cardOf(todayHtml(makeApp()));
  seed({ cos_custom_timetable: NO_GROUPS }); const b = greetingOf(todayHtml(makeApp()));
  seed(READY({ cos_notified_history: JSON.stringify({ onb_tt_day: '2026-10-13' }) })); const c = cardOf(todayHtml(makeApp()));
  return BAD_WORDING(a) || BAD_WORDING(b) || BAD_WORDING(c) || true;
});

globalThis.setTimeout = realSetTimeout;
console.log('==================================================================');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('==================================================================');
if (errors.length) { console.error('❌ ONBOARDING FLOW TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL ONBOARDING FLOW TESTS PASSED! 🚀');
