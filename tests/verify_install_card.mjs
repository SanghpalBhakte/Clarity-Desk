// ==================================================================
// Clarity Desk: "INSTALL CLARITY DESK" CARD TIMING
// ==================================================================
// Locked down here:
//  - the card is not offered before the 3rd open (bumpInstallOpens);
//  - "Not now" snoozes it for 14 days and keeps the open count;
//  - the "New version ready" strip removes the card and holds it back
//    while the strip is up; it comes back once the strip is gone.
// Runs the real app.js code with a tiny fake DOM and a fake
// beforeinstallprompt event. Timers run only when the test says so.
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
// Timers are queued; runTimers() fires what is due (the install card's own
// delays only matter as "later", not exact).
let timers = [];
let timerId = 0;
globalThis.setTimeout = (fn, ms) => { const id = ++timerId; timers.push({ id, fn }); return id; };
globalThis.clearTimeout = (id) => { timers = timers.filter(t => t.id !== id); };
globalThis.setInterval = () => 0;
function runTimers() { const due = timers; timers = []; due.forEach(t => t.fn()); }
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
const winListeners = {};
globalThis.addEventListener = (type, fn) => { (winListeners[type] ||= []).push(fn); };
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

// Tiny DOM: body children can be found by id and removed.
const body = { children: [], appendChild(c) { c.parentNode = body; body.children.push(c); return c; } };
function el(tag) {
  return {
    tagName: tag, id: '', className: '', style: {}, innerHTML: '', textContent: '', children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    remove() { body.children = body.children.filter(x => x !== this); },
    setAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {},
    focus() {}, querySelector: () => null, querySelectorAll: () => []
  };
}
globalThis.document = {
  getElementById: (id) => body.children.find(c => c.id === id) || null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: el, hidden: false, activeElement: null, body,
  documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile', onLine: true, webdriver: false, serviceWorker: {}, sendBeacon: () => true }, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { hostname: 'claritydesk.web.app', search: '', hash: '' }, configurable: true, writable: true });

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const app = new Function(`${code}\n return { bumpInstallOpens, scheduleInstallBanner, dismissInstallBanner, showUpdateAvailableBanner, INSTALL_SNOOZE_MS };`)();

// Android Chrome offers its install prompt (the app keeps it, so the card says "Install").
(winListeners.beforeinstallprompt || []).forEach(fn => fn({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) }));

const RealDate = Date;
let nowMs = new RealDate('2026-11-04T10:00:00+05:30').getTime();
globalThis.Date = class extends RealDate {
  constructor(...a) { a.length ? super(...a) : super(nowMs); }
  static now() { return nowMs; }
};
const card = () => document.getElementById('install-banner');
const strip = () => document.getElementById('update-available-banner');
const prompt = () => JSON.parse(store.cos_install_prompt || '{}');
function open() {   // what init() does on every app start
  app.bumpInstallOpens();
  app.scheduleInstallBanner();
  runTimers();
}
function reset() {
  for (const k of Object.keys(store)) delete store[k];
  body.children = []; timers = [];
}

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  let r;
  try { r = fn(); } catch (e) { r = e.stack || String(e); }
  if (r === true) { passed++; console.log(`✅ ${name}`); }
  else { errors.push(name); console.error(`❌ ${name}\n   ${r}`); }
}

check('Premise: the stored key is cos_install_prompt', () => {
  reset(); app.bumpInstallOpens();
  return prompt().opens === 1 ? true : JSON.stringify(store);
});

check('Not offered on the 1st and 2nd open, offered on the 3rd', () => {
  reset();
  open(); const first = !!card();
  open(); const second = !!card();
  open(); const third = !!card();
  return !first && !second && third ? true : JSON.stringify({ first, second, third, opens: prompt().opens });
});

check('"Not now" keeps the open count and hides the card for 14 days', () => {
  reset();
  open(); open(); open();
  app.dismissInstallBanner();
  const kept = prompt().opens === 3 && !card();
  nowMs += 13 * 86400000; open(); const day13 = !!card();
  nowMs += 2 * 86400000; open(); const day15 = !!card();
  return kept && !day13 && day15 && prompt().opens === 5 ? true : JSON.stringify({ kept, day13, day15, p: prompt() });
});

check('The update strip removes the card and holds it back while it is up', () => {
  reset();
  open(); open(); open();
  const before = !!card();
  app.showUpdateAvailableBanner();
  const gone = !card() && !!strip();
  runTimers(); runTimers();                // re-checks while the strip stays up
  const held = !card();
  strip().remove();                        // "Later"
  runTimers();
  const back = !!card();
  return before && gone && held && back ? true : JSON.stringify({ before, gone, held, back });
});

check('With the update strip already up on the 3rd open, the card waits', () => {
  reset();
  open(); open();
  app.showUpdateAvailableBanner();
  open();
  return !card() && !!strip() ? true : JSON.stringify({ card: !!card(), strip: !!strip() });
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ INSTALL CARD TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL INSTALL CARD TESTS PASSED! 🚀');
process.exit(0);
