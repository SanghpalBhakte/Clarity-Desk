import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');
const cssSrc = fs.readFileSync(`${ROOT}/style.css`, 'utf8');

// Mock browser environment
const localStorageData = {};
globalThis.localStorage = {
  getItem: (k) => localStorageData[k] !== undefined ? localStorageData[k] : null,
  setItem: (k, v) => { localStorageData[k] = String(v); },
  removeItem: (k) => { delete localStorageData[k]; },
  clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); }
};

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = globalThis;

globalThis.document = {
  getElementById: (id) => ({
    id,
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    remove: () => {},
    focus: () => {}
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => ({
    tagName: tag,
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  }),
  body: { appendChild: () => {} }
};

let codeToRun = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = [];
  const NOTICES = [];
  const QUICK_LINKS = [];
`);

const sandboxCode = `
  ${codeToRun}
  
  return {
    getCanonicalSubjectName,
    getCanonicalSubjectKey,
    isLikelyGarbledSubjectName,
    isNonSubjectSlotName,
    getSubjectList,
    saveAttendanceBaselines,
    saveTimetable,
    loadCustomLinks,
    syncSubjectsAfterTimetableSave,
    safeSetStorage,
    safeGetStorage,
    KEY_HIDDEN_SUBJECTS,
    KEY_CUSTOM_LINKS,
    state
  };
`;

// Verifies that a confirmed timetable scan drives Subject Hub and Study
// Vault: only the scanned subjects show, non-subject cells stay out, old
// subjects are offered (never auto-hidden), and vault files are never lost.
const mod = new Function(sandboxCode)();
let passed = 0, total = 0;
function check(name, fn) {
  total++;
  try {
    const r = fn();
    if (r === true || r === undefined) { console.log(`✓ [PASS] ${name}`); passed++; }
    else console.error(`✗ [FAIL] ${name}: ${r}`);
  } catch (e) { console.error(`✗ [FAIL] ${name}: ${e.message}`); }
}
const reset = () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); mod.state.customTasks = []; };
const slot = (subject, extra = {}) => ({ time: '10:00', end: '11:00', subject, code: '', room: '', teacher: '', type: 'lecture', batches: [], ...extra });
const tt = (rows) => ({ 1: rows, 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] });
const names = () => mod.getSubjectList().map(s => s.name).sort();

console.log('VERIFICATION: SCANNED SUBJECTS -> SUBJECT HUB + STUDY VAULT\n');

check('Real subjects are never flagged as non-subjects', () => {
  const real = ['Data Structures', 'Operating Systems', 'Database Management Systems', 'Machine Learning',
    'Mathematics-III', 'Personality Development', 'Art of Public Speaking', 'Open Elective 1',
    'AI & DS', 'OS', 'DBMS', 'CN', 'C', 'R', 'M3', 'IoT', 'CS401', 'Mini Project', 'Seminar', 'Project', 'Tutorial',
    'Web Development', 'Constitution of India', 'Multi Disciplinary Minor', 'MS Office'];
  const bad = real.filter(n => mod.isLikelyGarbledSubjectName(n) || mod.isNonSubjectSlotName(n));
  return bad.length ? 'flagged: ' + bad.join(', ') : true;
});

check('Room, teacher, batch, time and OCR scraps are flagged', () => {
  const junk = ['Room 304', 'Rm 12', 'LH-101', 'G-12', 'Prof Sharma', 'Dr. Patil', 'B1 B2 B3', 'A1', 'Batch A2',
    '10:00', '11-12', 'Rm l1 2x'];
  const missed = junk.filter(n => !mod.isLikelyGarbledSubjectName(n));
  return missed.length ? 'missed: ' + missed.join(', ') : true;
});

check('Free periods are marked as non-subject slots', () => {
  const slots = ['Library', 'Sports', 'Mentoring', 'T&P', 'Training and Placement', 'NSS', 'Library Period', 'Short Break'];
  const missed = slots.filter(n => !mod.isNonSubjectSlotName(n));
  return missed.length ? 'missed: ' + missed.join(', ') : true;
});

check('A 5-subject scan gives exactly those 5 in Subject Hub and Study Vault', () => {
  reset();
  const t = tt([slot('Machine Learning'), slot('ML Lab', { type: 'lab' }), slot('DBMS'), slot('Operating Systems'),
    slot('Mathematics-III'), slot('Personality Development'), slot('Lunch', { type: 'off' }), slot('Library', { type: 'off' })]);
  mod.saveTimetable(t);
  const res = mod.syncSubjectsAfterTimetableSave(t);
  const want = ['Database Management Systems', 'Machine Learning', 'Mathematics-III', 'Operating Systems', 'Personality Development'];
  const hub = names();
  const vault = mod.loadCustomLinks().map(l => l.subject).sort();
  if (JSON.stringify(hub) !== JSON.stringify(want)) return 'hub: ' + hub.join(', ');
  if (JSON.stringify(vault) !== JSON.stringify(want)) return 'vault: ' + vault.join(', ');
  if (res.added !== 5) return 'added ' + res.added;
  if (res.stale.length) return 'unexpected stale: ' + res.stale.map(s => s.name).join(', ');
  return mod.loadCustomLinks().every(l => Array.isArray(l.resources)) || 'vault entry without resources array';
});

check('Rescan never duplicates or touches an existing vault folder with files', () => {
  reset();
  mod.safeSetStorage(mod.KEY_CUSTOM_LINKS, [{ subject: 'Operating Systems', code: 'OS', color: '#123456', resources: [{ label: 'Notes', url: 'https://x.test' }] }]);
  const t = tt([slot('OS'), slot('DBMS')]);
  mod.saveTimetable(t);
  mod.syncSubjectsAfterTimetableSave(t);
  mod.syncSubjectsAfterTimetableSave(t);
  const links = mod.loadCustomLinks();
  const os = links.filter(l => l.subject === 'Operating Systems');
  if (links.length !== 2) return 'expected 2 folders, got ' + links.length;
  if (os.length !== 1 || os[0].resources.length !== 1 || os[0].color !== '#123456') return 'existing folder changed';
  return true;
});

check('Old subjects are offered as stale, attendance is flagged, nothing is hidden automatically', () => {
  reset();
  mod.saveAttendanceBaselines({ 'Computer Networks': { subjectName: 'Computer Networks', attended: 8, total: 10 } });
  mod.state.customTasks = [{ id: 't1', subject: 'Web Development', status: 'pending', dueDate: '2026-11-01', title: 'x' }];
  const t = tt([slot('DBMS'), slot('Operating Systems')]);
  mod.saveTimetable(t);
  const res = mod.syncSubjectsAfterTimetableSave(t);
  const stale = res.stale.map(s => s.name).sort().join(', ');
  if (stale !== 'Computer Networks, Web Development') return 'stale: ' + stale;
  if (!res.stale.find(s => s.name === 'Computer Networks').hasAttendance) return 'CN baseline not flagged as attendance';
  if (res.stale.find(s => s.name === 'Web Development').hasAttendance) return 'WD wrongly flagged';
  if ((mod.safeGetStorage(mod.KEY_HIDDEN_SUBJECTS, []) || []).length) return 'something was hidden automatically';
  return true;
});

check('A subject hidden earlier comes back when the new scan includes it', () => {
  reset();
  mod.safeSetStorage(mod.KEY_HIDDEN_SUBJECTS, ['operatingsystems', 'computernetworks']);
  const t = tt([slot('Operating Systems')]);
  mod.saveTimetable(t);
  mod.syncSubjectsAfterTimetableSave(t);
  const hidden = mod.safeGetStorage(mod.KEY_HIDDEN_SUBJECTS, []);
  if (hidden.includes('operatingsystems')) return 'OS still hidden';
  if (!hidden.includes('computernetworks')) return 'unrelated hidden key removed';
  return names().includes('Operating Systems') || 'OS missing from hub';
});

check('Junk-named slots saved as lectures stay out of Subject Hub and Study Vault', () => {
  reset();
  const t = tt([slot('DBMS'), slot('Room 304'), slot('Prof Sharma'), slot('B1 B2 B3'), slot('General Subject')]);
  mod.saveTimetable(t);
  mod.syncSubjectsAfterTimetableSave(t);
  const hub = names().join(', ');
  if (hub !== 'Database Management Systems') return 'hub: ' + hub;
  const vault = mod.loadCustomLinks().map(l => l.subject).join(', ');
  return vault === 'Database Management Systems' || 'vault: ' + vault;
});

console.log(`\nResult: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
