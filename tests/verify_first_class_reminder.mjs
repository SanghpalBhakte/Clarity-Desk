// ==================================================================
// Clarity Desk: REMINDER OFFER AFTER THE FIRST CLASS
// ==================================================================
// Locked down here:
//  - saving the first class (manual Add class, or the scan review save)
//    schedules the "Get reminders when the app is closed" sheet once;
//  - a second class, an already-prompted device, or a timetable that
//    already had classes never schedules it;
//  - both save paths keep the `!hadClasses && hasAnyTimetable()` guard.
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
const scheduled = [];
globalThis.setTimeout = (fn, ms) => { scheduled.push(ms); return 0; };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
globalThis.CAMPUS_OS_PUSH_API = 'https://push.example.com';
globalThis.PushManager = function () {};
globalThis.Notification = { permission: 'default' };
let domCache = {};
const FIELDS = { 'tte-day': '1', 'tte-time': '10:00', 'tte-end': '11:00', 'tte-subject': 'Data Structures', 'tte-code': 'DS', 'tte-room': 'SF-31', 'tte-teacher': 'Dr. Rao', 'tte-type': 'lecture', 'tte-notes': '' };
const domStub = (id) => (domCache[id] ||= { id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: FIELDS[id] ?? '', textContent: '', innerHTML: '', className: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
globalThis.document = {
  getElementById: domStub,
  querySelector: () => null,
  querySelectorAll: () => [],
  activeElement: null, hidden: false,
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120', onLine: true, webdriver: false, serviceWorker: {}, sendBeacon: () => true }, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { hostname: 'claritydesk.web.app', search: '', hash: '' }, configurable: true, writable: true });

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const makeApp = () => new Function(`${code}\n return { saveTimetableEntry, confirmSaveExtractedTimetable: window.confirmSaveExtractedTimetable, setPending: (s) => { pendingExtractedSchedule = s; selectedTimetablePreviewBatch = 'all'; } };`)();

const CLASS = { subject: 'Data Structures', code: 'DS', time: '10:00', end: '11:00', room: 'SF-31', teacher: 'Dr. Rao', type: 'lecture' };
const ONE_CLASS_TT = JSON.stringify({ 0: [], 1: [CLASS], 2: [], 3: [], 4: [], 5: [], 6: [] });
function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; scheduled.length = 0;
  Object.assign(store, extra);
}
const offers = () => scheduled.filter(ms => ms === 900).length;

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
console.log('🔔 REMINDER OFFER AFTER THE FIRST CLASS');
console.log('==================================================================');

check('Manual Add class: the first class schedules the sheet once', () => {
  seed(); const app = makeApp();
  app.saveTimetableEntry(1, null);
  return offers() === 1 ? true : `offers=${offers()}`;
});

check('Manual Add class: a second class does not schedule it again', () => {
  seed(); const app = makeApp();
  app.saveTimetableEntry(1, null);
  domStub('tte-subject').value = 'Maths'; domStub('tte-time').value = '12:00'; domStub('tte-end').value = '13:00';
  app.saveTimetableEntry(1, null);
  return offers() === 1 ? true : `offers=${offers()}`;
});

check('Manual Add class: already prompted device is not offered again', () => {
  seed({ cos_push_device: JSON.stringify({ prompted: true }) }); const app = makeApp();
  app.saveTimetableEntry(1, null);
  return offers() === 0 ? true : `offers=${offers()}`;
});

check('Manual Add class: a timetable that already had classes is not offered', () => {
  seed({ cos_custom_timetable: ONE_CLASS_TT }); const app = makeApp();
  app.saveTimetableEntry(1, null);
  return offers() === 0 ? true : `offers=${offers()}`;
});

check('Scan review save: the first scanned timetable schedules the sheet once', () => {
  seed(); const app = makeApp();
  app.setPending([{ day: 'Mon', ...CLASS }, { day: 'Tue', ...CLASS }]);
  app.confirmSaveExtractedTimetable();
  return offers() === 1 ? true : `offers=${offers()}`;
});

check('Scan review save: already prompted device is not offered again', () => {
  seed({ cos_push_device: JSON.stringify({ prompted: true }) }); const app = makeApp();
  app.setPending([{ day: 'Mon', ...CLASS }]);
  app.confirmSaveExtractedTimetable();
  return offers() === 0 ? true : `offers=${offers()}`;
});

check('Scan review save: replacing an existing timetable is not offered', () => {
  seed({ cos_custom_timetable: ONE_CLASS_TT }); const app = makeApp();
  app.setPending([{ day: 'Wed', ...CLASS }]);
  app.confirmSaveExtractedTimetable();
  return offers() === 0 ? true : `offers=${offers()}`;
});

check('Scan review save: nothing to save is not offered', () => {
  seed(); const app = makeApp();
  app.setPending([]);
  app.confirmSaveExtractedTimetable();
  return offers() === 0 ? true : `offers=${offers()}`;
});

const body = (name) => {
  const at = appSrc.search(new RegExp(`(function ${name}\\b|${name} = function)`));
  const end = appSrc.indexOf('\n}', at);
  return appSrc.slice(at, end);
};
for (const name of ['saveTimetableEntry', 'confirmSaveExtractedTimetable']) {
  check(`${name} keeps the first-class guard`, () => {
    const b = body(name);
    return b.includes('const hadClasses = hasAnyTimetable();') && b.includes('if (!hadClasses && hasAnyTimetable()) maybeOfferClosedAppReminders();')
      ? true : 'guard lines missing';
  });
}

console.log('\n========================================');
console.log(`FIRST CLASS REMINDER: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
