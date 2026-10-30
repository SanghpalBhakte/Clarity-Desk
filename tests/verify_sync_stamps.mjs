// ==================================================================
// Clarity Desk: STAMPS AND TOMBSTONES AT THE SAVE POINTS (offline-first sync, step 3)
// ==================================================================
// Every local change to a task or vault item gets updatedAt = nextStamp();
// every removed one leaves a tombstone in cos_tombstones. Runs the real
// app.js code. Ids, titles and times are made up.
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
const els = {};
const domStub = (id) => els[id] || (els[id] = { id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
globalThis.document = {
  getElementById: domStub, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
globalThis.confirm = () => true;
let readerText = '';
globalThis.FileReader = class { readAsText() { setTimeout(() => this.onload({ target: { result: readerText } }), 0); } };

const code = appSrc
  .replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`)
  .replace('function showUndoToast(msg, onUndo) {', 'function showUndoToast(msg, onUndo) { globalThis.__undo = onUndo;');
const app = new Function(`${code}\n return { state, saveCustomTasks, saveCustomLinks, sanitizeTask, loadCustomTasks, importData, renderAssignments, localDateKey, stampChanges, taskKey, vaultKey };`)();
app.state.currentPage = 'none';

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}
async function checkAsync(name, fn) {
  total++;
  try {
    const res = await fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

const task = (id, over = {}) => ({ id, subject: 'Physics', code: 'PHY', title: `Task ${id}`, taskType: 'assignment', noDeadline: false, description: '—', dueDate: '2099-01-01', priority: 'medium', status: 'pending', marks: 0, isCustom: true, ...over });
const tasksInStore = () => JSON.parse(store.cos_custom_tasks || '[]');
const stones = () => JSON.parse(store.cos_tombstones || '[]');
const byId = (id) => tasksInStore().find(t => t.id === id);
function reset() { for (const k of Object.keys(store)) delete store[k]; app.state.customTasks = []; globalThis.__undo = null; }
function seed(list) { reset(); store.cos_custom_tasks = JSON.stringify(list); app.state.customTasks = app.loadCustomTasks(); }
const section = (code, resources) => ({ subject: code + ' subj', code, color: '#394B63', resources });
const res = (label, url, over = {}) => ({ label, url, ...over });

console.log('==================================================================');
console.log('STAMPS AND TOMBSTONES AT THE SAVE POINTS (step 3)');
console.log('==================================================================');

check('Editing one task title stamps only that task', () => {
  seed([task('a'), task('b')]);
  app.state.customTasks.find(t => t.id === 'a').title = 'New title';
  app.saveCustomTasks();
  return Number.isFinite(byId('a').updatedAt) && byId('b').updatedAt === undefined && stones().length === 0 ? true : JSON.stringify(tasksInStore());
});

check('Saving without any change stamps nothing (old tasks keep their exact shape)', () => {
  seed([task('a'), task('b')]);
  const before = store.cos_custom_tasks;
  app.saveCustomTasks();
  return store.cos_custom_tasks === before && stones().length === 0 ? true : store.cos_custom_tasks;
});

check('Adding a task stamps it, and a later edit gets a larger stamp', () => {
  seed([task('a')]);
  app.state.customTasks.push(task('n'));
  app.saveCustomTasks();
  const s1 = byId('n').updatedAt;
  app.state.customTasks.find(t => t.id === 'n').status = 'submitted';
  app.saveCustomTasks();
  return Number.isFinite(s1) && byId('n').updatedAt > s1 && byId('a').updatedAt === undefined ? true : JSON.stringify(tasksInStore());
});

check('Deleting a task writes exactly one tombstone for it', () => {
  seed([task('a'), task('b')]);
  window.deleteCustomTask('a');
  const t = stones();
  return t.length === 1 && t[0].id === 'a' && Number.isFinite(t[0].deletedAt) && tasksInStore().map(x => x.id).join() === 'b' ? true : JSON.stringify({ t, tasks: tasksInStore() });
});

check('A tombstone is stamped after the deleted task\'s last edit', () => {
  seed([task('a')]);
  app.state.customTasks[0].title = 'x'; app.saveCustomTasks();
  const edit = byId('a').updatedAt;
  window.deleteCustomTask('a');
  return stones()[0].deletedAt > edit ? true : JSON.stringify({ edit, t: stones() });
});

check('Bulk delete writes one tombstone per id in one pass', () => {
  seed([task('a'), task('b'), task('c'), task('d')]);
  app.state.currentPage = 'assignments';
  app.renderAssignments();
  window.enterTaskSelect(); window.toggleTaskSelect('a'); window.toggleTaskSelect('c');
  window.deleteSelectedTasks();
  app.state.currentPage = 'none';
  const ids = stones().map(t => t.id).sort().join();
  return ids === 'a,c' && tasksInStore().map(x => x.id).sort().join() === 'b,d' ? true : JSON.stringify({ ids, tasks: tasksInStore().map(x => x.id) });
});

check('Undo of a bulk delete leaves no tombstone and the restored tasks carry a fresh stamp', () => {
  seed([task('a'), task('b'), task('c')]);
  app.state.currentPage = 'assignments';
  app.renderAssignments();
  window.enterTaskSelect(); window.toggleTaskSelect('a'); window.toggleTaskSelect('b');
  window.deleteSelectedTasks();
  const delAt = Math.max(...stones().map(t => t.deletedAt));
  globalThis.__undo();
  app.state.currentPage = 'none';
  const back = tasksInStore().filter(t => t.id === 'a' || t.id === 'b');
  return back.length === 2 && stones().length === 0 && back.every(t => t.updatedAt > delAt) ? true : JSON.stringify({ back, t: stones() });
});

await checkAsync('Restoring an old backup (no updatedAt, no tombstones) stamps every restored task and vault item at restore time', async () => {
  seed([task('gone')]);
  const t0 = Date.now();
  readerText = JSON.stringify({ customTasks: [task('r1'), task('r2')], customLinks: [section('PHY', [res('Notes', 'https://x.test/a')])] });
  app.importData({ target: { files: [{}] } });
  await new Promise(r => setTimeout(r, 30));
  const ts = tasksInStore();
  const links = JSON.parse(store.cos_custom_links || '[]');
  const r0 = links[0] && links[0].resources[0];
  const okTasks = ts.map(t => t.id).sort().join() === 'r1,r2' && ts.every(t => t.updatedAt >= t0);
  const okVault = r0 && r0.updatedAt >= t0;
  const okStone = stones().some(t => t.id === 'gone');
  return okTasks && okVault && okStone ? true : JSON.stringify({ ts, r0, st: stones() });
});

await checkAsync('A new backup carries tombstones, and importing them restores them; an old backup without the field restores as before', async () => {
  seed([task('a')]);
  window.deleteCustomTask('a');
  let blobText = '';
  const realCreate = document.createElement;
  document.createElement = (tag) => ({ ...realCreate(tag), click() {} });
  globalThis.Blob = class { constructor(parts) { blobText = parts.join(''); } };
  globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  window.exportData();
  const exported = JSON.parse(blobText);
  const hasField = Array.isArray(exported.tombstones) && exported.tombstones.some(t => t.id === 'a');
  reset();
  readerText = JSON.stringify(exported);
  app.importData({ target: { files: [{}] } });
  await new Promise(r => setTimeout(r, 30));
  const back = stones().some(t => t.id === 'a');
  reset();
  readerText = JSON.stringify({ customTasks: [task('o1')] });
  app.importData({ target: { files: [{}] } });
  await new Promise(r => setTimeout(r, 30));
  return hasField && back && tasksInStore().length === 1 && tasksInStore()[0].id === 'o1' ? true : JSON.stringify({ hasField, back, tasks: tasksInStore() });
});

check('A vault resource edit stamps just that resource', () => {
  reset();
  store.cos_custom_links = JSON.stringify([section('PHY', [res('A', 'https://x.test/a'), res('B', 'https://x.test/b')])]);
  const links = JSON.parse(store.cos_custom_links);
  links[0].resources[0].url = 'https://x.test/a2';
  app.saveCustomLinks(links);
  const out = JSON.parse(store.cos_custom_links)[0].resources;
  return Number.isFinite(out[0].updatedAt) && out[1].updatedAt === undefined ? true : JSON.stringify(out);
});

check('Removing a vault resource leaves a tombstone keyed by section|file|label', () => {
  reset();
  store.cos_custom_links = JSON.stringify([section('PHY', [res('A', 'https://x.test/a'), res('B', 'https://x.test/b')])]);
  const links = JSON.parse(store.cos_custom_links);
  links[0].resources.splice(1, 1);
  app.saveCustomLinks(links);
  const t = stones();
  return t.length === 1 && t[0].id === 'PHY|https://x.test/b|B' ? true : JSON.stringify(t);
});

check('Existing vault resources without updatedAt are not touched by an unrelated save', () => {
  reset();
  const orig = [section('PHY', [res('A', 'https://x.test/a')])];
  store.cos_custom_links = JSON.stringify(orig);
  app.saveCustomLinks(JSON.parse(store.cos_custom_links));
  return store.cos_custom_links === JSON.stringify(orig) && stones().length === 0 ? true : store.cos_custom_links;
});

check('Vault file ids are the same before and after a file moves into IndexedDB (no phantom delete)', () => {
  const dataRes = res('F', 'data:text/plain;base64,QUJD');
  const k1 = app.vaultKey(section('PHY', []), dataRes);
  const k2 = app.vaultKey(section('PHY', []), { label: 'F', url: '', fileId: 'x', idb: true });
  const id = app.vaultKey(section('PHY', []), { label: 'F', url: '', fileId: k1.split('|')[1], idb: true });
  return k1 === id && !k1.includes('base64') && k2.startsWith('PHY|x|') ? true : JSON.stringify([k1, k2, id]);
});

check('A pre-update payload with no updatedAt loads without error and sanitizeTask round-trips it unchanged', () => {
  const old = task('old');
  const out = app.sanitizeTask(old);
  return JSON.stringify(out) === JSON.stringify(old) && !('updatedAt' in out) ? true : JSON.stringify(out);
});

check('sanitizeTask keeps a finite updatedAt and drops a bad one', () => {
  const a = app.sanitizeTask({ ...task('x'), updatedAt: 12345 });
  const b = app.sanitizeTask({ ...task('x'), updatedAt: 'soon' });
  const c = app.sanitizeTask({ ...task('x'), updatedAt: NaN });
  return a.updatedAt === 12345 && !('updatedAt' in b) && !('updatedAt' in c) ? true : JSON.stringify([a, b, c]);
});

check('stampChanges: tombstones are written through the shared 200 cap / dedupe (re-adding clears the stone)', () => {
  reset();
  app.stampChanges([task('a')], [], app.taskKey);
  const had = stones().length === 1;
  app.stampChanges([], [task('a')], app.taskKey);
  return had && stones().length === 0 ? true : JSON.stringify(stones());
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ SYNC STAMP TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL SYNC STAMP TESTS PASSED! 🚀');
process.exit(0);
