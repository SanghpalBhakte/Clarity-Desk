// ==================================================================
// Clarity Desk: ONE ADDRESS (claritydesk.web.app)
// ==================================================================
// Locked down here:
//  - an old address (campusos-83365.web.app, the firebaseapp.com names,
//    GitHub Pages) with nothing saved is sent to claritydesk.web.app;
//  - any saved desk data keeps the student where their data is, and the
//    move card is offered instead (snoozed for 3 days by "Not now");
//  - preferences alone (theme, accent, dismissed welcome) are no loss;
//  - a query (email sign-in link, WhatsApp share, reminder tap) or an
//    automated browser (the post-ship smoke test) never redirects;
//  - claritydesk.web.app, localhost and unknown hosts do nothing;
//  - deciding writes nothing to storage;
//  - the old address never offers to install itself.
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
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
const domStub = (id) => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
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
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const app = new Function(`${code}\n return { addressMoveAction, installBannerKind, CANONICAL_ORIGIN };`)();

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, extra);
}
const action = (hostname, opts = {}) => app.addressMoveAction({ hostname, ...opts }, Object.keys(store));

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
console.log('🏠 ONE ADDRESS: claritydesk.web.app');
console.log('==================================================================');

check('The new address is claritydesk.web.app', () =>
  app.CANONICAL_ORIGIN === 'https://claritydesk.web.app' ? true : app.CANONICAL_ORIGIN);

for (const host of ['campusos-83365.web.app', 'campusos-83365.firebaseapp.com', 'claritydesk.firebaseapp.com', 'sanghpalbhakte.github.io']) {
  check(`${host} with nothing saved goes to the new address`, () => {
    seed();
    return action(host) === 'redirect' ? true : `got ${action(host)}`;
  });
}

check('Preferences alone (theme, accent, dismissed welcome, clean timetable choice) still redirect', () => {
  seed({ cos_theme: 'midnight-ink', cos_accent: '"plum"', cos_onboarding_dismissed: 'true', cos_timetable_choice: '"clean"', cos_install_prompt: '{"dismissedAt":1}' });
  return action('campusos-83365.web.app') === 'redirect' ? true : `got ${action('campusos-83365.web.app')}`;
});

check('Bookkeeping the app writes on any visit (attendance mode, date-fix cutoff, notified lists) still redirects', () => {
  seed({
    cos_onboarding_dismissed: 'true', cos_timetable_choice: '"clean"', cos_theme: 'paper-slate',
    cos_att_v2_state: JSON.stringify({ mode: 'v2', decidedAt: '2026-10-25T17:54:58.744Z' }),
    cos_att_datefix_cutoff: '"2026-10-25"',
    cos_notified_history: JSON.stringify({ 'notice-1': 1761400000000 }),
    cos_notified_notices: JSON.stringify({ 'n1': true })
  });
  return action('campusos-83365.web.app') === 'redirect' ? true : `got ${action('campusos-83365.web.app')}`;
});

check('Bookkeeping next to real data (tasks) still keeps the desk and shows the card', () => {
  seed({ cos_att_v2_state: JSON.stringify({ mode: 'v2' }), cos_custom_tasks: JSON.stringify([{ id: 't1', title: 'Lab journal', dueDate: '2026-10-20' }]) });
  return action('campusos-83365.web.app') === 'card' ? true : `got ${action('campusos-83365.web.app')}`;
});

const CLASS = { subject: 'Data Structures', time: '10:00', end: '11:00', room: 'SF-31', type: 'lecture' };
const DESKS = {
  'a name': { cos_profile: JSON.stringify({ name: 'Asha Patil' }) },
  'a saved timetable': { cos_custom_timetable: JSON.stringify({ 0: [], 1: [CLASS], 2: [], 3: [], 4: [], 5: [], 6: [] }) },
  'the sample timetable': { cos_timetable_choice: '"aids"' },
  'tasks': { cos_custom_tasks: JSON.stringify([{ id: 't1', title: 'Lab journal', dueDate: '2026-10-20' }]) },
  'attendance marks': { cos_attendance: JSON.stringify({ '2026-10-13': { DS_1000: 'attended' } }) },
  'a self-study countdown only': { cos_profile: JSON.stringify({ studyMode: 'self', examDate: '2026-12-01' }) },
  'a syllabus only': { cos_syllabus: JSON.stringify({ DS: [{ topic: 'Trees', done: false }] }) },
  'holiday mode only': { cos_holiday: JSON.stringify({ on: true, since: '2026-10-20' }) },
};
for (const [label, data] of Object.entries(DESKS)) {
  check(`A desk with ${label} stays put and gets the move card`, () => {
    seed(data);
    return action('campusos-83365.web.app') === 'card' ? true : `got ${action('campusos-83365.web.app')}`;
  });
}

check('"Not now" hides the move card for 3 days, then it comes back', () => {
  seed({ ...DESKS.tasks, cos_moved_prompt: JSON.stringify({ dismissedAt: Date.now() - 86400000 }) });
  const snoozed = action('campusos-83365.web.app');
  seed({ ...DESKS.tasks, cos_moved_prompt: JSON.stringify({ dismissedAt: Date.now() - 4 * 86400000 }) });
  const back = action('campusos-83365.web.app');
  return snoozed === null && back === 'card' ? true : `snoozed=${snoozed} after=${back}`;
});

check('A query (email link, share, reminder) never redirects', () => {
  seed();
  const r = action('campusos-83365.web.app', { search: '?apiKey=x&oobCode=y&mode=signIn' });
  return r !== 'redirect' ? true : 'redirected';
});

check('An automated browser (smoke test) keeps testing the address it opened', () => {
  seed();
  return action('campusos-83365.web.app', { webdriver: true }) === null ? true : 'acted';
});

for (const host of ['claritydesk.web.app', 'localhost', '127.0.0.1', 'claritydesk--pr12-abc.web.app']) {
  check(`${host} does nothing`, () => {
    seed(DESKS.tasks);
    const a = action(host);
    seed();
    const b = action(host);
    return a === null && b === null ? true : `with data=${a} empty=${b}`;
  });
}

check('Deciding writes nothing to storage', () => {
  seed(DESKS['a name']);
  const before = JSON.stringify(store);
  action('campusos-83365.web.app'); action('sanghpalbhakte.github.io', { search: '?share=whatsapp' });
  return JSON.stringify(store) === before ? true : 'storage changed';
});

check('The old address never offers to install itself', () => {
  globalThis.location = { hostname: 'campusos-83365.web.app' };
  const old = app.installBannerKind({ os: 'ios', browser: 'safari', standalone: false, inApp: false });
  globalThis.location = { hostname: 'claritydesk.web.app' };
  const fresh = app.installBannerKind({ os: 'ios', browser: 'safari', standalone: false, inApp: false });
  delete globalThis.location;
  return old === null && fresh === 'ios' ? true : `old=${old} new=${fresh}`;
});

check('Share tags and canonical point at the new address (index.html and 404.html)', () => {
  const bad = [];
  for (const f of ['index.html', '404.html']) {
    const html = fs.readFileSync(`${ROOT}/${f}`, 'utf8');
    for (const re of [/rel="canonical" href="([^"]+)"/, /property="og:url" content="([^"]+)"/, /property="og:image" content="([^"]+)"/, /name="twitter:image" content="([^"]+)"/]) {
      const m = html.match(re);
      if (!m || !m[1].startsWith('https://claritydesk.web.app/')) bad.push(`${f}: ${re.source} -> ${m ? m[1] : 'missing'}`);
    }
  }
  return bad.length ? bad.join('; ') : true;
});

console.log('\n========================================');
console.log(`ONE ADDRESS: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
