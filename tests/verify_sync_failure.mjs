// ==================================================================
// Clarity Desk: TELLING STUDENTS WHEN CLOUD SYNC FAILS
// ==================================================================
// Locked down here:
//  - a failed push (not offline, not denied) turns the badge into
//    "Sync failed · Saved here" and shows one toast per visit;
//  - "your desk is too big" is named when Firestore rejects the size;
//  - the next successful push puts "Cloud synced" back;
//  - permission-denied and offline keep their own states;
//  - the push is wired to these handlers.
// ==================================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.window = globalThis;
globalThis.console.warn = () => {};
let dom = {};
const toasts = [];
const el = (tag) => { const o = { tagName: tag, style: {}, children: [], textContent: '', classList: { add() {}, remove() {} }, setAttribute(k, v) { o[k] = v; }, remove() {}, addEventListener() {},
  appendChild(c) { o.children.push(c); if (o.id === 'toast-container') toasts.push(c.children.map(x => x.textContent).join(' ')); } }; return o; };
globalThis.document = {
  getElementById: (id) => (dom[id] ||= Object.assign(el('div'), { id })),
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  createElement: el, body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
const nav = { onLine: true, userAgent: '' };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const make = () => new Function(`${code}\n return { onCloudPushOk, onCloudPushError, updateSyncUI, signIn(u) { currentUser = u; } };`)();
const badge = () => dom['sync-text'].textContent;
function fresh() { dom = {}; toasts.length = 0; nav.onLine = true; const a = make(); a.signIn({ uid: 'u1' }); return a; }

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try { const r = fn(); if (r === true) { passed++; console.log(`✓ [PASS] ${name}`); } else { errors.push(name); console.error(`✗ [FAIL] ${name}: ${r}`); } }
  catch (e) { errors.push(name); console.error(`✗ [ERROR] ${name}: ${e.stack}`); }
}

console.log('==================================================================');
console.log('☁️  TELLING STUDENTS WHEN SYNC FAILS');
console.log('==================================================================');

check('A failed push shows "Sync failed · Saved here" and one toast', () => {
  const a = fresh(); a.onCloudPushError({ code: 'unavailable' });
  return badge() === 'Sync failed · Saved here' && toasts.length === 1 && /still saved on this phone/.test(toasts[0]) ? true : `${badge()} ${toasts}`;
});

check('A second failure in the same visit adds no second toast; a plain redraw keeps the warning', () => {
  const a = fresh(); a.onCloudPushError({ code: 'unavailable' }); a.onCloudPushError({ code: 'unavailable' }); a.updateSyncUI();
  return toasts.length === 1 && badge() === 'Sync failed · Saved here' ? true : `${toasts.length} ${badge()}`;
});

check('Too big for Firestore: the toast says so and points at large vault files', () => {
  const a = fresh(); a.onCloudPushError({ code: 'invalid-argument' });
  return /too big/.test(toasts[0]) && /vault/.test(toasts[0]) ? true : toasts[0];
});

check('The next successful push brings back "Cloud synced"', () => {
  const a = fresh(); a.onCloudPushError({ code: 'unavailable' }); a.onCloudPushOk();
  return badge() === 'Cloud synced' ? true : badge();
});

check('Permission denied keeps its own "Sync denied" state', () => {
  const a = fresh(); a.onCloudPushError({ code: 'permission-denied' });
  return badge() === 'Sync denied' && toasts.length === 0 ? true : `${badge()} ${toasts}`;
});

check('Offline still shows "Offline · Saved" even after a failure', () => {
  const a = fresh(); a.onCloudPushError({ code: 'unavailable' }); nav.onLine = false; a.updateSyncUI();
  return badge() === 'Offline · Saved' ? true : badge();
});

check('The cloud push is wired to these handlers', () =>
  appSrc.includes('ref.set(payload, { merge: true }).then(onCloudPushOk).catch(onCloudPushError);') ? true : 'push not wired');

console.log('\n========================================');
console.log(`SYNC FAILURE NOTICE: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
