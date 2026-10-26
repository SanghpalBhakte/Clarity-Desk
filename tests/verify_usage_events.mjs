// ==================================================================
// Clarity Desk: ANONYMOUS USAGE COUNTS (GoatCounter)
// ==================================================================
// Locked down here:
//  - the shipped build counts to the Clarity Desk site (sanghpal), and
//    with no code it sends nothing and writes nothing to storage;
//  - only fixed event names and lowercase parts go out (no names, emails
//    or typed text can become an event);
//  - only on the live sites, never in automated browsers or locally;
//  - "off" in Settings stops it and drops anything waiting;
//  - offline events wait (latest 30 kept) and go out when back online;
//  - "came back on a later day" is sent once; a student who already had a
//    desk when counting began is not counted as new;
//  - cos_usage is the only key written, is left out of backups and sync,
//    and never stops the old-address redirect.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const RealDate = Date;
let NOW = new RealDate('2026-10-27T10:00:00+05:30').getTime();
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

const sent = [];
const nav = { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile', platform: 'Linux armv8l', maxTouchPoints: 5, onLine: true, webdriver: false, sendBeacon: (url) => { sent.push(url); return true; } };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { hostname: 'claritydesk.web.app', search: '', hash: '' }, configurable: true, writable: true });

const stubImports = (src) => src.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const EXPORTS = 'return { trackUsage, trackUsageOnce, trackAppOpen, flushUsageQueue, onUsageToggle, loadUsage, addressMoveAction, GOATCOUNTER_CODE };';
const CODE_RE = /const GOATCOUNTER_CODE = '[^']*';/;
if (!CODE_RE.test(appSrc)) throw new Error('GOATCOUNTER_CODE line not found in app.js');
const shipped = new Function(`${stubImports(appSrc)}\n${EXPORTS}`)();
const off = new Function(`${stubImports(appSrc.replace(CODE_RE, "const GOATCOUNTER_CODE = '';"))}\n${EXPORTS}`)();
const app = new Function(`${stubImports(appSrc.replace(CODE_RE, "const GOATCOUNTER_CODE = 'testsite';"))}\n${EXPORTS}`)();

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, extra);
  sent.length = 0;
  nav.onLine = true; nav.webdriver = false;
  location.hostname = 'claritydesk.web.app';
  NOW = new RealDate('2026-10-27T10:00:00+05:30').getTime();
}
const paths = () => sent.map(u => decodeURIComponent(new URL(u).searchParams.get('p')));

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
console.log('📊 ANONYMOUS USAGE COUNTS');
console.log('==================================================================');

check('Shipped build counts to the Clarity Desk GoatCounter site (sanghpal)', () => {
  seed();
  shipped.trackUsage('welcome_shown');
  const u = sent[0] && new URL(sent[0]);
  return shipped.GOATCOUNTER_CODE === 'sanghpal' && u && u.origin === 'https://sanghpal.goatcounter.com' && u.pathname === '/count'
    ? true : `code="${shipped.GOATCOUNTER_CODE}" sent=${sent.join(', ')}`;
});

check('With no code: nothing sent, nothing stored', () => {
  seed();
  off.trackAppOpen(); off.trackUsage('welcome_choice', 'scan'); off.trackUsageOnce('firstClass', 'first_class_saved');
  return sent.length === 0 && Object.keys(store).length === 0 ? true : `sent=${sent.length} keys=${Object.keys(store)}`;
});

check('With a code, an event goes to that GoatCounter site as an event', () => {
  seed();
  app.trackUsage('welcome_choice', 'scan');
  const u = sent[0] && new URL(sent[0]);
  return u && u.hostname === 'testsite.goatcounter.com' && u.pathname === '/count' && u.searchParams.get('e') === 'true' && paths()[0] === 'welcome_choice/scan'
    ? true : `sent: ${sent.join(', ')}`;
});

check('Unknown event names, emails, capitals, spaces or long text never go out', () => {
  seed();
  app.trackUsage('student_name', 'x');
  app.trackUsage('welcome_choice', 'asha@college.edu');
  app.trackUsage('welcome_choice', 'Asha');
  app.trackUsage('welcome_choice', 'data structures');
  app.trackUsage('welcome_choice', 'a'.repeat(25));
  return sent.length === 0 ? true : `sent: ${paths()}`;
});

check('Nothing is sent locally, on other sites, or in automated browsers', () => {
  seed();
  for (const h of ['localhost', '127.0.0.1', 'sanghpalbhakte.github.io', 'claritydesk--pr1-x.web.app']) { location.hostname = h; app.trackUsage('welcome_shown'); }
  location.hostname = 'claritydesk.web.app'; nav.webdriver = true; app.trackUsage('welcome_shown');
  return sent.length === 0 ? true : `sent: ${paths()}`;
});

check('Old Firebase address still counts (students with a desk there)', () => {
  seed(); location.hostname = 'campusos-83365.web.app';
  app.trackUsage('welcome_shown');
  return paths()[0] === 'welcome_shown' ? true : `sent: ${paths()}`;
});

check('Turning it off in Settings stops events and drops waiting ones', () => {
  seed();
  nav.onLine = false; app.trackUsage('welcome_shown'); nav.onLine = true;
  app.onUsageToggle({ checked: false });
  app.trackUsage('scan_started');
  const u = app.loadUsage();
  const offOk = sent.length === 0 && u.optOut && u.queue.length === 0;
  app.onUsageToggle({ checked: true });
  app.trackUsage('scan_started');
  return offOk && paths()[0] === 'scan_started' ? true : `offOk=${offOk} sent=${paths()}`;
});

check('Offline events wait (latest 30 kept) and go out when back online', () => {
  seed();
  nav.onLine = false;
  for (let i = 0; i < 35; i++) app.trackUsage('scan_started');
  app.trackUsage('welcome_choice', 'look');
  const waiting = app.loadUsage().queue;
  nav.onLine = true;
  app.flushUsageQueue();
  return waiting.length === 30 && waiting[29] === 'welcome_choice/look' && sent.length === 30 && app.loadUsage().queue.length === 0
    ? true : `waiting=${waiting.length} sent=${sent.length} left=${app.loadUsage().queue.length}`;
});

check('"Came back on a later day" is sent exactly once', () => {
  seed();
  app.trackAppOpen(); app.trackAppOpen();
  NOW += 86400000; app.trackAppOpen();
  NOW += 86400000; app.trackAppOpen();
  const d2 = paths().filter(p => p === 'day2_return').length;
  const opens = paths().filter(p => p.startsWith('app_open/')).length;
  return d2 === 1 && opens === 4 ? true : `day2=${d2} opens=${opens}`;
});

check('App open says the device kind only (android/browser), nothing else', () => {
  seed(); app.trackAppOpen();
  return paths()[0] === 'app_open/android/browser' ? true : `got ${paths()[0]}`;
});

check('A student who already had a desk is not counted as new', () => {
  seed({ cos_custom_tasks: JSON.stringify([{ id: 't1', title: 'Lab journal', dueDate: '2026-10-28' }]) });
  app.trackAppOpen();
  NOW += 86400000; app.trackAppOpen();
  app.trackUsageOnce('firstClass', 'first_class_saved');
  return !paths().includes('day2_return') && !paths().includes('first_class_saved') ? true : `sent: ${paths()}`;
});

check('First class saved is sent once per device', () => {
  seed();
  app.trackAppOpen();
  app.trackUsageOnce('firstClass', 'first_class_saved'); app.trackUsageOnce('firstClass', 'first_class_saved');
  return paths().filter(p => p === 'first_class_saved').length === 1 ? true : `sent: ${paths()}`;
});

check('cos_usage is the only key written', () => {
  seed();
  nav.onLine = false; app.trackUsage('welcome_shown'); nav.onLine = true;
  app.trackAppOpen(); app.trackUsageOnce('firstClass', 'first_class_saved'); app.onUsageToggle({ checked: true });
  const keys = Object.keys(store);
  return keys.length === 1 && keys[0] === 'cos_usage' ? true : `keys: ${keys}`;
});

check('cos_usage never stops the old-address redirect', () => {
  seed({ cos_usage: JSON.stringify({ firstOpen: '2026-10-27', queue: ['welcome_shown'] }) });
  const a = app.addressMoveAction({ hostname: 'campusos-83365.web.app' }, Object.keys(store));
  return a === 'redirect' ? true : `got ${a}`;
});

check('cos_usage is left out of backups and cloud sync', () => {
  const body = (name) => { const i = appSrc.indexOf(`function ${name}(`); return appSrc.slice(i, appSrc.indexOf('\n}\n', i)); };
  const bad = ['exportData', 'pushLocalDataToCloud'].filter(n => /KEY_USAGE|cos_usage/.test(body(n)));
  return bad.length === 0 ? true : `found in ${bad}`;
});

check('Every event that can be sent is a fixed lowercase path', () => {
  seed();
  for (const [n, p] of [['welcome_shown'], ['welcome_choice', 'self'], ['scan_review_shown', 'under30s'], ['scan_failed', 'over60s'], ['signin_started', 'google', 'inapp'], ['signin_done', 'email_link']]) app.trackUsage(n, ...(p ? [p] : []));
  app.trackUsage('signin_started', 'password_new', 'browser');
  return paths().every(p => /^[a-z0-9_/-]+$/.test(p)) && sent.length === 7 ? true : `sent: ${paths()}`;
});

check('Every event is wired to the screen it measures', () => {
  const need = {
    welcome_shown: "trackUsage('welcome_shown')",
    'welcome_choice scan/manual/self/look': ["'welcome_choice', 'scan'", "'welcome_choice', 'manual'", "'welcome_choice', 'self'", "'welcome_choice', 'look'"],
    scan: ["trackUsage('scan_started')", "trackUsage('scan_review_shown'", "trackUsage('scan_failed'"],
    first_class_saved: "trackUsageOnce('firstClass', 'first_class_saved')",
    signin: ["'signin_started', 'google'", "'signin_started', 'email_link'", "'signin_started', create ? 'password_new' : 'password'", "'signin_done', 'google'", "'signin_done', 'email_link'", "'signin_done', 'password'"],
    app_open: 'try { trackAppOpen(); }',
    look_button: 'onclick="onboardingLookAround()"',
    settings_toggle: 'onchange="onUsageToggle(this)"',
    online_flush: 'flushUsageQueue();\n  });'
  };
  const missing = Object.entries(need).flatMap(([k, v]) => [].concat(v).filter(s => !appSrc.includes(s)).map(s => `${k}: ${s}`));
  return missing.length === 0 ? true : missing.join('; ');
});

console.log('\n========================================');
console.log(`USAGE COUNTS: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
