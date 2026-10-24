// ==================================================================
// Clarity Desk: "Duplicate subject cards found" banner (detectDeskPollution)
// ==================================================================
// Locked down here: the Subject Hubs banner (and the red dot on Manage)
// shows only when "Clean up desk" would actually change the timetable.
//  - the A2 sample template (Load Sample Template > Batch A2 > Confirm &
//    Save) never triggers it ("Multi Disciplinary Minor" used to match the
//    junk token "no" inside "Minor");
//  - a real duplicate ("Data Structure" + "Data Structures" as separate
//    lectures) still triggers it, and stops once the cleanup is applied;
//  - another batch's lab and garbled scan text trigger it; a garbled free
//    slot (off row) and an empty timetable do not.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');
// The real sample template, so this follows data.js if the sample changes.
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
const a = new Function(`${code}\n return { state, buildFilteredAidsTimetable, saveTimetable, syncSubjectsAfterTimetableSave, getSubjectList, detectDeskPollution, generateDeclutterPlan, loadTimetable, loadAttendanceBaselines, safeSetStorage, KEY_PROFILE, setProfile: (p) => { liveProfile = p; } };`)();

function seed(tt, batch = '') {
  localStorage.clear();
  a.state.customTasks = [];
  a.setProfile({ name: 'Test Student', batch });
  a.safeSetStorage(a.KEY_PROFILE, { name: 'Test Student', batch });
  a.saveTimetable(tt);
  a.syncSubjectsAfterTimetableSave(tt);
}
const lecture = (subject, time = '10:00') => ({ subject, code: '', time, end: '11:00', type: 'lecture', batches: [] });
const week = (days) => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...days });

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

check('1. A2 sample template saved for Batch A2 shows no duplicate banner', () => {
  seed(a.buildFilteredAidsTimetable('A2'), 'A2');
  const names = a.getSubjectList().map(s => s.name);
  if (!names.includes('Multi Disciplinary Minor')) return `sample changed? subjects: ${names.join(', ')}`;
  const plan = a.generateDeclutterPlan(a.loadTimetable(), a.loadAttendanceBaselines(), [], 'A2');
  if (plan.archivedSlots.length) return `cleanup would remove ${plan.archivedSlots.length} slot(s)`;
  return a.detectDeskPollution() === false ? true : 'banner shown although cleanup changes nothing';
});

check('2. Same A2 timetable with no batch on the profile shows no banner', () => {
  seed(a.buildFilteredAidsTimetable('A2'), '');
  return a.detectDeskPollution() === false ? true : 'banner shown';
});

check('3. "Data Structure" + "Data Structures" as separate lectures shows the banner', () => {
  seed(week({ 1: [lecture('Data Structure')], 2: [lecture('Data Structures')] }));
  return a.detectDeskPollution() === true ? true : 'real duplicate not flagged';
});

check('4. Banner goes away once that cleanup is applied', () => {
  seed(week({ 1: [lecture('Data Structure')], 2: [lecture('Data Structures')] }));
  const plan = a.generateDeclutterPlan(a.loadTimetable(), {}, [], 'all');
  a.saveTimetable(plan.newTimetable);
  const subjects = a.loadTimetable()[1].concat(a.loadTimetable()[2]).map(c => c.subject);
  if (new Set(subjects).size !== 1) return `not merged: ${subjects.join(', ')}`;
  return a.detectDeskPollution() === false ? true : 'banner still shown after cleanup';
});

check('5. Another batch\'s lab shows the banner (cleanup would remove it)', () => {
  seed(week({ 1: [lecture('Data Structures'), { subject: 'Web Development', code: 'WD', time: '13:30', end: '15:30', type: 'lab', batches: ['B1'] }] }), 'A1');
  return a.detectDeskPollution() === true ? true : 'other-batch lab not flagged';
});

check('6. Garbled scan text in a class shows the banner; the same text on a free slot does not', () => {
  seed(week({ 1: [lecture('Data Structures'), lecture('ADzeame', '11:00')] }));
  if (a.detectDeskPollution() !== true) return 'garbled class not flagged';
  seed(week({ 1: [lecture('Data Structures'), { subject: 'ADzeame', time: '11:00', end: '12:00', type: 'off', batches: [] }] }));
  return a.detectDeskPollution() === false ? true : 'garbled free slot flagged';
});

check('7. Empty timetable shows no banner', () => {
  seed(week({}));
  return a.detectDeskPollution() === false ? true : 'banner on empty desk';
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ DESK POLLUTION TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL DESK POLLUTION TESTS PASSED! 🚀');
process.exit(0);
