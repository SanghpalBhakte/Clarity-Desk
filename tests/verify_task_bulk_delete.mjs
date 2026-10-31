// ==================================================================
// Clarity Desk: TASKS SELECT MODE + BULK DELETE
// ==================================================================
// Press-and-hold (or the Select button) starts select mode on the Tasks
// page. Picks live in a Set so a background re-render (cloud sync) cannot
// untick them. Only the student's own completed tasks are deleted, with one
// confirm, one save, and an Undo that puts exactly those tasks back.
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

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
let confirmAnswer = true, confirmCalls = 0;
globalThis.confirm = () => { confirmCalls++; return confirmAnswer; };
// appConfirm replaces confirm() in the app: answer it exactly as this stub does.
{ const mk = document.createElement, body = document.body;
  document.createElement = (tag) => { const o = mk(tag); let h; o.querySelector = () => ({}); o.addEventListener = (t, f) => { if (t === 'click') h = f; }; o._click = (act) => h && h({ target: { closest: () => ({ dataset: { act } }) } }); return o; };
  const ap = body.appendChild; body.appendChild = (n) => { ap.call(body, n); if (n && n.id === 'app-confirm-backdrop') n._click(globalThis.confirm() ? 'yes' : 'no'); }; }

const code = appSrc
  .replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = [{ id: 'built-1', subject: 'Physics', code: 'PHY', title: 'Built-in', status: 'submitted', dueDate: '2020-01-01', taskType: 'assignment', priority: 'medium', description: '—', marks: 0 }];
  const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`)
  .replace('function showUndoToast(msg, onUndo) {', 'function showUndoToast(msg, onUndo) { globalThis.__undo = onUndo;');
const app = new Function(`${code}\n return { state, renderAssignments, localDateKey, getSelection: () => taskSelection, mode: () => taskSelectMode };`)();

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return app.localDateKey(d); };
const task = (id, over = {}) => ({ id, subject: 'Physics', code: 'PHY', title: `Task ${id}`, taskType: 'assignment', dueDate: daysAgo(-3), status: 'pending', priority: 'medium', description: '—', marks: 0, isCustom: true, ...over });
function setup() {
  app.state.currentPage = 'assignments';
  app.state.assignFilter = 'all';
  app.state.assignSubjectFilter = 'all';
  app.state.assignTypeFilter = 'all';
  app.state.customTasks = [
    task('p1'),                                            // pending, upcoming
    task('d-new', { status: 'submitted', dueDate: daysAgo(2) }),   // done, recent
    task('d-old', { status: 'submitted', dueDate: daysAgo(10) }),  // done, 10 days past due
    task('d-nodl', { status: 'submitted', noDeadline: true, dueDate: '' }),
  ];
  app.getSelection().clear();
  window.exitTaskSelect();
  confirmAnswer = true; confirmCalls = 0; globalThis.__undo = null;
  app.renderAssignments();
}
const html = () => els['page-assignments'].innerHTML;
const ids = () => app.state.customTasks.map(t => t.id).sort().join(',');

console.log('==================================================================');
console.log('🗑️  TASKS: SELECT MODE + BULK DELETE');
console.log('==================================================================');

check('Completed tasks sit in a "Completed (N)" section that is closed by default', () => {
  setup();
  const h = html();
  return /<details[^>]*tk-fold[^>]*>/.test(h) && !/<details[^>]*tk-fold[^>]* open/.test(h) && h.includes('Completed (4)') ? true : 'completed section missing, open, or wrong count';
});

check('Entering select mode shows the toolbar and no completion checkboxes', () => {
  setup(); window.enterTaskSelect();
  const h = html();
  return app.mode() && h.includes('tk-selectbar') && !h.includes('assignment-checkbox') ? true : 'select bar missing or checkboxes still shown';
});

check('Tapping a task picks it, tapping again unpicks it', () => {
  setup(); window.enterTaskSelect();
  window.toggleTaskSelect('p1');
  const a = app.getSelection().has('p1');
  window.toggleTaskSelect('p1');
  return a && !app.getSelection().has('p1') ? true : 'toggle failed';
});

check('Picks survive a background re-render (cloud sync) and a task edit', () => {
  setup(); window.enterTaskSelect(); window.toggleTaskSelect('p1'); window.toggleTaskSelect('d-new');
  app.state.customTasks[0].title = 'Renamed on another device';
  app.renderAssignments(); app.renderAssignments();
  return app.getSelection().has('p1') && app.getSelection().has('d-new') && html().includes('2 selected') ? true : 'selection lost on re-render';
});

check('A pick whose task vanished is dropped, nothing else is', () => {
  setup(); window.enterTaskSelect(); window.toggleTaskSelect('p1'); window.toggleTaskSelect('d-new');
  app.state.customTasks = app.state.customTasks.filter(t => t.id !== 'p1');
  app.renderAssignments();
  return !app.getSelection().has('p1') && app.getSelection().has('d-new') ? true : 'stale pick kept or good pick lost';
});

check('Built-in tasks cannot be selected', () => {
  setup(); app.state.assignFilter = 'submitted'; app.renderAssignments(); window.enterTaskSelect();
  window.toggleTaskSelect('built-1');
  return !app.getSelection().has('built-1') ? true : 'built-in task was selectable';
});

check('"Select all completed" picks only completed tasks of the student', () => {
  setup(); window.enterTaskSelect(); window.selectAllCompletedTasks();
  const got = [...app.getSelection()].sort().join(',');
  return got === 'd-new,d-nodl,d-old' ? true : `picked ${got}`;
});

check('"Older than 7 days" picks only completed tasks due more than 7 days ago', () => {
  setup(); window.enterTaskSelect(); window.selectOldCompletedTasks();
  const got = [...app.getSelection()].join(',');
  return got === 'd-old' ? true : `picked ${got}`;
});

check('Delete asks once, removes only the picked tasks, and leaves the rest', () => {
  setup(); window.enterTaskSelect(); window.selectAllCompletedTasks();
  window.deleteSelectedTasks();
  return confirmCalls === 1 && ids() === 'p1' && !app.mode() ? true : `confirm ${confirmCalls}, left ${ids()}, mode ${app.mode()}`;
});

check('Saying no at the confirm deletes nothing and stays in select mode', () => {
  setup(); window.enterTaskSelect(); window.selectAllCompletedTasks(); confirmAnswer = false;
  window.deleteSelectedTasks();
  return ids() === 'd-new,d-nodl,d-old,p1' && app.mode() && app.getSelection().size === 3 ? true : `left ${ids()}`;
});

check('Delete with nothing picked does nothing and does not ask', () => {
  setup(); window.enterTaskSelect(); window.deleteSelectedTasks();
  return confirmCalls === 0 && ids() === 'd-new,d-nodl,d-old,p1' ? true : 'deleted or asked with empty selection';
});

check('Undo puts back exactly the deleted tasks, even ones the clean-up rule would remove', () => {
  setup(); window.enterTaskSelect(); window.selectAllCompletedTasks();
  const before = JSON.stringify(app.state.customTasks.filter(t => t.id === 'd-old'));
  window.deleteSelectedTasks();
  if (typeof globalThis.__undo !== 'function') return 'no undo offered';
  globalThis.__undo();
  const back = JSON.stringify(app.state.customTasks.filter(t => t.id === 'd-old').map(({ updatedAt, ...t }) => t));   // restored tasks get a fresh sync stamp; everything else is unchanged
  const saved = JSON.parse(store['cos_custom_tasks'] || '[]').map(t => t.id).sort().join(',');
  return ids() === 'd-new,d-nodl,d-old,p1' && back === before && saved === 'd-new,d-nodl,d-old,p1' ? true : `after undo ${ids()}, saved ${saved}`;
});

check('Leaving the Tasks page ends select mode', () => {
  setup(); window.enterTaskSelect(); window.toggleTaskSelect('p1');
  const nav = /function navigate\([^)]*\) \{\n  if \(page !== 'assignments' && \(taskSelectMode/.test(appSrc);
  return nav ? true : 'navigate() does not reset select mode';
});

check('Esc and Enter are wired (Esc cancels, Enter deletes picked tasks), and skip typing fields and open dialogs', () => {
  const ok = appSrc.includes("if (e.key === 'Escape') { e.preventDefault(); exitTaskSelect(); }")
    && appSrc.includes("e.key === 'Enter' && taskSelection.size")
    && appSrc.includes("t.closest('input, textarea, select, [contenteditable=\"true\"]')")
    && appSrc.includes("document.querySelector('.modal-backdrop')");
  return ok ? true : 'keyboard handler missing a guard';
});

check('Press-and-hold ignores the checkbox, the menu and links, and cancels on move/scroll', () => {
  const ok = appSrc.includes("e.target.closest('.assignment-checkbox, .tk-more, .tk-subj, button, a, summary')")
    && appSrc.includes("Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE_PX")
    && appSrc.includes("['pointerup', 'pointercancel', 'scroll']");
  return ok ? true : 'long-press guard missing';
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ TASK BULK DELETE TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL TASK BULK DELETE TESTS PASSED! 🚀');
process.exit(0);
