// ==================================================================
// Clarity Desk: the built-in SY AI-DS sample leaves the live app
// ==================================================================
// Locked down here:
//  - no "Load sample" button or handler is left in the app;
//  - a student who picked the sample (choice 'aids') with nothing saved
//    gets it copied once into their own timetable and links, so their view
//    is unchanged when data.js drops it;
//  - anything already saved is never overwritten; other students get nothing;
//  - the archived copy in timetable-test-kit/ matches data.js.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');
const indexSrc = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
const dataSrc = fs.readFileSync(`${ROOT}/data.js`, 'utf8').replace(/^export\s+/gm, '');

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

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, dataSrc);
const a = new Function(`${code}\n return { migrateLegacySampleTimetable, loadTimetable, loadCustomLinks, isCustomTimetableActive, TIMETABLE, QUICK_LINKS };`)();

let total = 0, passed = 0; const errors = [];
function check(name, cond) { total++; if (cond) passed++; else errors.push(name); }
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const get = (k) => (k in store ? JSON.parse(store[k]) : null);
const set = (k, v) => { store[k] = JSON.stringify(v); };

// 1. No entry point left.
check('no loadOfficialAidsTimetable in app.js', !/loadOfficialAidsTimetable/.test(appSrc));
check('no sample button in index.html', !/loadOfficialAidsTimetable|Sample Template/.test(indexSrc));

// 2. Sample-only student: copied once, same view.
localStorage.clear();
set('cos_timetable_choice', 'aids');
const before = { tt: a.loadTimetable(), links: a.loadCustomLinks() };
a.migrateLegacySampleTimetable();
check('timetable copied', same(get('cos_custom_timetable'), a.TIMETABLE));
check('links copied', same(get('cos_custom_links'), a.QUICK_LINKS));
check('timetable view unchanged', same(a.loadTimetable(), before.tt));
check('links view unchanged', same(a.loadCustomLinks(), before.links));
check('copy is not the data.js object', a.loadTimetable() !== a.TIMETABLE);
const snap = JSON.stringify(store);
a.migrateLegacySampleTimetable();
check('second run changes nothing', JSON.stringify(store) === snap);

// 3. Saved data is never overwritten.
localStorage.clear();
set('cos_timetable_choice', 'aids');
const mine = { 0: [], 1: [{ subject: 'Mine', time: '09:00', end: '10:00', type: 'lecture' }], 2: [], 3: [], 4: [], 5: [], 6: [] };
set('cos_custom_timetable', mine);
set('cos_custom_links', []);
a.migrateLegacySampleTimetable();
check('saved timetable kept', same(get('cos_custom_timetable'), mine));
check('saved (empty) links kept', same(get('cos_custom_links'), []));

// 4. Other students get nothing.
for (const choice of [null, 'clean']) {
  localStorage.clear();
  if (choice) set('cos_timetable_choice', choice);
  a.migrateLegacySampleTimetable();
  check(`choice ${choice}: no timetable written`, !('cos_custom_timetable' in store));
  check(`choice ${choice}: no links written`, !('cos_custom_links' in store));
}

// 5. Archive matches data.js.
const archive = JSON.parse(fs.readFileSync(`${ROOT}/timetable-test-kit/sample-sy-aids-sem3.json`, 'utf8'));
check('archive timetable matches', same(archive.timetable, a.TIMETABLE));
check('archive links match', same(archive.quickLinks, a.QUICK_LINKS));

console.log(`\nSample archive: ${passed}/${total} passed`);
if (errors.length) { errors.forEach(e => console.log('  ✗ ' + e)); process.exit(1); }
