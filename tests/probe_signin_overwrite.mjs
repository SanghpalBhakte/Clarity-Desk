// ==================================================================
// PROBE (not part of npm test): does a cloud doc overwrite local tasks
// on first sign-in? Local cos_custom_tasks=[A], cloud doc {customTasks:[B]}.
// Calls the real subscribeUserCloudData('u1') against a fake Firestore and
// prints the resulting local tasks and whether a push happened.
// Run: node tests/probe_signin_overwrite.mjs
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
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = globalThis;
const domStub = (id) => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, addEventListener() {} });
globalThis.document = {
  getElementById: domStub, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};


// ── Fake Firestore: doc with get(cache) + onSnapshot; records every write ──
const DELETE = { __delete: true };
class FieldPath { constructor(...segs) { this.segs = segs; } }
globalThis.firebase = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => 'ts' }, FieldPath } };
const mkTask = (id, title) => ({ id, subject: 'General', code: 'GEN', title, taskType: 'general', noDeadline: true, dueDate: '', priority: 'medium', status: 'pending', marks: 0, isCustom: true });
const A = mkTask('c-A', 'Local task A');
const B = mkTask('c-B', 'Cloud task B');
let cloud = { customTasks: [B] };
let writes = [];
const snap = () => ({ exists: true, data: () => JSON.parse(JSON.stringify(cloud)), metadata: { hasPendingWrites: false } });
const fakeDb = { collection: () => ({ doc: () => ({
  get: () => Promise.resolve({ exists: false, data: () => ({}) }),     // empty IndexedDB cache on a fresh sign-in
  onSnapshot: (opts, onNext) => { setTimeout(() => onNext(snap()), 0); return () => {}; },
  set: (payload) => { writes.push(JSON.parse(JSON.stringify(payload))); return Promise.resolve(); },
  update: (...args) => { writes.push({ update: args.length }); return Promise.resolve(); }
}) }) };

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const app = new Function('__fakeDb', `${code}\n db = __fakeDb;\n return { state, subscribeUserCloudData };`)(fakeDb);
globalThis.showToast = () => {};
app.state.currentPage = 'none';

store.cos_custom_tasks = JSON.stringify([A]);     // tasks made on this device before signing in
app.state.customTasks = [A];
console.log('BEFORE  local tasks:', JSON.parse(store.cos_custom_tasks).map(t => t.title));
console.log('        cloud tasks:', cloud.customTasks.map(t => t.title));

app.subscribeUserCloudData('u1');
await new Promise(r => setTimeout(r, 50));

const after = JSON.parse(store.cos_custom_tasks || '[]').map(t => t.title);
console.log('AFTER   local tasks:', after);
console.log('        in-memory  :', app.state.customTasks.map(t => t.title));
console.log('        cloud tasks:', cloud.customTasks.map(t => t.title));
console.log('        pushes to cloud:', writes.length);
const overwritten = !after.includes(A.title);
console.log(`\nFINDING: cloud doc overwrites local tasks on first sign-in: ${overwritten ? 'YES' : 'NO'}`
  + (overwritten ? ` (local task "${A.title}" ${writes.length ? 'pushed' : 'NOT pushed'} before being replaced)` : ''));
process.exit(0);
