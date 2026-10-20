// ==================================================================
// Clarity Desk: SYLLABUS TRACKER
// ==================================================================
// Locked down here:
//  - pasted text is cleaned (bullets, numbering, "Unit 1:") and weightage
//    written on a line is read (10 marks, (10m), (High), ★...);
//  - nothing is saved until the preview is confirmed;
//  - bad stored / restored / cloud data is cleaned, never crashes;
//  - progress is weighted by marks when every topic has them, otherwise
//    by importance;
//  - the "subject done", "fully revised" and "whole syllabus done" cards
//    show once a day;
//  - a deleted topic stays deleted after a cloud round trip (stored as an
//    array, which set(merge:true) replaces whole);
//  - an older backup or cloud copy with no syllabus leaves it alone;
//  - topic and subject names are escaped in the HTML.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const RealDate = Date;
const NOW = new RealDate('2026-10-20T10:00:00+05:30').getTime();
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
globalThis.confirm = () => true;
const cards = [];
let domCache = {};
const domStub = (id) => (domCache[id] ||= {
  id, style: {}, classList: { add() {}, remove() {}, toggle() {} },
  appendChild(c) { if (id === 'toast-container') cards.push(c); }, remove() {}, focus() {},
  value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null
});
const el = (tag) => ({ tagName: tag, style: {}, className: '', textContent: '', classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, click() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} });
globalThis.document = {
  getElementById: domStub, querySelector: () => null, querySelectorAll: () => [],
  activeElement: null, hidden: false, addEventListener() {}, removeEventListener() {},
  createElement: el,
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

// Fake Firestore with the documented set(merge) semantics: maps deep-merge,
// arrays and other values are replaced whole.
globalThis.firebase = { firestore: { FieldValue: { delete: () => ({ __delete: true }), serverTimestamp: () => 'ts' }, FieldPath: class { constructor(...s) { this.segs = s; } } } };
let cloud = {};
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
function deepMerge(t, s) { for (const k of Object.keys(s)) { if (isObj(s[k]) && isObj(t[k])) deepMerge(t[k], s[k]); else t[k] = JSON.parse(JSON.stringify(s[k] ?? null)); } return t; }
const fakeDb = { collection: () => ({ doc: () => ({
  set: (payload, opts) => { if (opts && opts.merge) deepMerge(cloud, payload); else cloud = JSON.parse(JSON.stringify(payload)); return Promise.resolve(); },
  update: () => Promise.resolve()
}) }) };

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
  const NOTICES = [];
`);
let lastApp = null;
const makeApp = () => lastApp = new Function('__fakeDb', `${code}\n db = __fakeDb;\n return { state, AIService, topicsFromSyllabusScan, syllabusScanFileProblem, runSyllabusScan, parseSyllabusPaste, parseSyllabusLine, sanitizeSyllabus, loadSyllabus, saveSyllabus, syllabusStats, syllabusCardHTML, syllabusTodayLine, getSubjectList, renderDashboard, pushLocalDataToCloud, applyCloudDataToLocalState, exportData };`)(fakeDb);

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {}; cards.length = 0; cloud = {};
  Object.assign(store, { cos_onboarding_dismissed: 'true' }, extra);
}
const syl = () => JSON.parse(store.cos_syllabus || '[]');
const topic = (id, title, status = 'todo', extra = {}) => ({ id, title, status, importance: 2, ...extra });
const withSyllabus = (list) => ({ cos_syllabus: JSON.stringify(list) });
const keyOf = (name) => lastApp.loadSyllabus().find(e => e.subjectName === name).subjectKey;
const celebrations = () => cards.filter(c => String(c.className).includes('celebrate-card')).length;

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
console.log('📘 SYLLABUS TRACKER');
console.log('==================================================================');

// ── Paste parsing ──────────────────────────────────────────────
check('Paste: bullets, numbering and unit headings are removed', () => {
  seed(); const app = makeApp();
  const { topics } = app.parseSyllabusPaste('1. Introduction\n- ER model\n• Keys\na) Relational algebra\nUnit 3: Normalization\nii. Indexing\nModule 4 - Transactions');
  const got = topics.map(t => t.title).join('|');
  return got === 'Introduction|ER model|Keys|Relational algebra|Normalization|Indexing|Transactions' ? true : got;
});

check('Paste: marks are read in common forms', () => {
  seed(); const app = makeApp();
  const lines = ['Normalization - 10 marks', 'Joins (8m)', 'Indexing [12 Marks]', 'Hashing 6M', 'Trees: 15 mks'];
  const got = lines.map(l => { const t = app.parseSyllabusLine(l); return `${t.title}=${t.marks}`; }).join('|');
  return got === 'Normalization=10|Joins=8|Indexing=12|Hashing=6|Trees=15' ? true : got;
});

check('Paste: importance is read ((High), ★, imp, (Low))', () => {
  seed(); const app = makeApp();
  const got = ['Deadlocks (High)', 'Paging ★', 'Scheduling imp', 'History (Low)', 'Semaphores [Medium]', 'Plain topic']
    .map(l => { const t = app.parseSyllabusLine(l); return `${t.title}:${t.importance}`; }).join('|');
  return got === 'Deadlocks:3|Paging:3|Scheduling:3|History:1|Semaphores:2|Plain topic:2' ? true : got;
});

check('Paste: marks and importance together on one line', () => {
  seed(); const app = makeApp();
  const t = app.parseSyllabusLine('3. Normalization (High) - 10 marks');
  return t.title === 'Normalization' && t.importance === 3 && t.marks === 10 ? true : JSON.stringify(t);
});

check('Paste: a number that is part of the title is kept', () => {
  seed(); const app = makeApp();
  const t = app.parseSyllabusLine('Normal forms 1NF to 3NF');
  const u = app.parseSyllabusLine('8086 microprocessor');
  return t.title === 'Normal forms 1NF to 3NF' && !t.marks && u.title === '8086 microprocessor' ? true : `${t.title} / ${u.title}`;
});

check('Paste: blank lines, symbols-only lines and duplicates are skipped', () => {
  seed(); const app = makeApp();
  const r = app.parseSyllabusPaste('Keys\n\n   \n---\nkeys\nJoins; Views', ['Views']);
  return r.topics.map(t => t.title).join('|') === 'Keys|Joins' && r.duplicates === 2 ? true : JSON.stringify(r);
});

// ── Preview before save ────────────────────────────────────────
check('Preview: nothing is saved until Save is tapped', () => {
  seed(); const app = makeApp();
  window.showSyllabusPasteModal('DBMS');
  domStub('syl-paste-text').value = 'ER model\nNormalization (High) - 10 marks';
  window.previewSyllabusPaste();
  if (store.cos_syllabus) return 'saved during preview';
  if (!domStub('syl-paste-body').innerHTML.includes('2 topics to add')) return 'preview count missing';
  window.closeSyllabusPasteModal();
  return store.cos_syllabus ? 'saved on cancel' : true;
});

check('Preview: edits and removed rows are what gets saved', () => {
  seed(); const app = makeApp();
  window.showSyllabusPasteModal('DBMS');
  domStub('syl-paste-text').value = 'ER model\nNormalization - 10 marks\nJunk line';
  window.previewSyllabusPaste();
  window.setSyllabusPreviewField(0, 'title', 'ER modelling');
  window.setSyllabusPreviewField(0, 'importance', '3');
  window.removeSyllabusPreviewRow(2);
  window.confirmSyllabusPaste();
  const e = syl()[0];
  if (!e || e.subjectName !== 'DBMS') return 'entry missing';
  const got = e.topics.map(t => `${t.title}:${t.importance}:${t.marks || ''}:${t.status}`).join('|');
  return got === 'ER modelling:3::todo|Normalization:2:10:todo' ? true : got;
});

check('Preview: re-pasting adds only new topics', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys')] }])); const app = makeApp();
  window.showSyllabusPasteModal('DBMS');
  domStub('syl-paste-text').value = 'keys\nJoins';
  window.previewSyllabusPaste();
  window.confirmSyllabusPaste();
  return syl()[0].topics.map(t => t.title).join('|') === 'Keys|Joins' ? true : JSON.stringify(syl());
});

// ── Cleaning stored data ───────────────────────────────────────
check('Sanitize: junk entries dropped, bad fields fixed, duplicates merged', () => {
  seed(); const app = makeApp();
  const out = app.sanitizeSyllabus([
    null, 'x', { subjectName: '' },
    { subjectName: 'DBMS', examDate: 'soon', topics: [{ title: '  Keys ', status: 'weird', importance: 9, marks: -3 }, { title: '' }, 5] },
    { subjectName: 'dbms', topics: [{ id: 'b1', title: 'Joins', status: 'done', marks: 10 }] }
  ]);
  if (out.length !== 1) return `expected 1 entry, got ${out.length}`;
  const e = out[0];
  if (e.examDate !== '') return 'bad exam date kept';
  const t = e.topics[0];
  if (t.title !== 'Keys' || t.status !== 'todo' || t.importance !== 2 || 'marks' in t) return JSON.stringify(t);
  return e.topics.length === 2 && e.topics[1].marks === 10 && e.topics[1].status === 'done' ? true : JSON.stringify(e.topics);
});

check('Sanitize: a non-array (old or broken data) becomes an empty list', () => {
  seed({ cos_syllabus: '{"DBMS":{}}' }); const app = makeApp();
  return Array.isArray(app.loadSyllabus()) && app.loadSyllabus().length === 0 ? true : 'not empty';
});

// ── Progress ───────────────────────────────────────────────────
check('Progress: weighted by importance when marks are missing', () => {
  seed(); const app = makeApp();
  const st = app.syllabusStats({ topics: [topic('a', 'A', 'done', { importance: 3 }), topic('b', 'B', 'todo', { importance: 1 })] });
  return st.pct === 75 && st.done === 1 && st.total === 2 && !st.byMarks ? true : JSON.stringify(st);
});

check('Progress: weighted by marks when every topic has them', () => {
  seed(); const app = makeApp();
  const st = app.syllabusStats({ topics: [topic('a', 'A', 'revised', { marks: 30 }), topic('b', 'B', 'todo', { marks: 10 })] });
  return st.pct === 75 && st.byMarks && st.revised === 1 ? true : JSON.stringify(st);
});

// ── Taps and pop-ups ───────────────────────────────────────────
check('Tap cycles not started → done → revised → not started', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys'), topic('a2', 'Joins')] }])); const app = makeApp();
  const states = [];
  for (let i = 0; i < 3; i++) { window.cycleSyllabusTopic(keyOf('DBMS'), 'a1'); states.push(syl()[0].topics[0].status); }
  return states.join(',') === 'done,revised,todo' ? true : states.join(',');
});

check('Pop-up: last topic done shows "syllabus done" once', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys', 'done'), topic('a2', 'Joins')] }])); const app = makeApp();
  window.cycleSyllabusTopic(keyOf('DBMS'), 'a2');           // done → subject complete
  const first = celebrations();
  window.cycleSyllabusTopic(keyOf('DBMS'), 'a2');           // revised
  window.cycleSyllabusTopic(keyOf('DBMS'), 'a2');           // back to todo
  window.cycleSyllabusTopic(keyOf('DBMS'), 'a2');           // done again, same day
  return first === 1 && celebrations() === 1 ? true : `first=${first} total=${celebrations()}`;
});

check('Pop-up: every topic revised shows "fully revised"', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys', 'revised'), topic('a2', 'Joins', 'done')] }])); const app = makeApp();
  window.cycleSyllabusTopic(keyOf('DBMS'), 'a2');
  const seen = JSON.parse(store.cos_notified_history || '{}');
  return celebrations() === 1 && Object.keys(seen).some(k => k.startsWith('card_syllabus_rev_')) ? true : JSON.stringify(seen);
});

check('Pop-up: finishing the last subject shows "whole syllabus done"', () => {
  seed(withSyllabus([
    { subjectName: 'DBMS', topics: [topic('a1', 'Keys', 'done')] },
    { subjectName: 'Operating Systems', topics: [topic('b1', 'Paging')] }
  ])); const app = makeApp();
  window.cycleSyllabusTopic(keyOf('Operating Systems'), 'b1');
  const seen = JSON.parse(store.cos_notified_history || '{}');
  return celebrations() === 1 && Object.keys(seen).some(k => k.startsWith('card_syllabus_all')) ? true : JSON.stringify(seen);
});

check('Reset progress keeps topics, weightage and exam date', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', examDate: '2026-11-02', topics: [topic('a1', 'Keys', 'revised', { marks: 10, importance: 3 })] }])); const app = makeApp();
  window.resetSyllabusProgress(keyOf('DBMS'));
  const e = syl()[0];
  return e.topics[0].status === 'todo' && e.topics[0].marks === 10 && e.topics[0].importance === 3 && e.examDate === '2026-11-02' ? true : JSON.stringify(e);
});

check('Edit topic: rename to an existing title is refused', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys'), topic('a2', 'Joins')] }])); const app = makeApp();
  domStub('syl-edit-title').value = 'keys'; domStub('syl-edit-imp').value = '2'; domStub('syl-edit-marks').value = '';
  window.saveSyllabusTopicEdit(keyOf('DBMS'), 'a2');
  return syl()[0].topics[1].title === 'Joins' ? true : 'renamed into a duplicate';
});

// ── Subjects and screens ───────────────────────────────────────
check('A syllabus-only subject shows in Subject Hubs; a hidden one does not', () => {
  seed({ ...withSyllabus([{ subjectName: 'Physics', topics: [] }, { subjectName: 'Chemistry', topics: [topic('c1', 'Bonds')] }]), cos_hidden_subjects: JSON.stringify(['chemistry']) });
  const app = makeApp();
  const names = app.getSubjectList().map(s => s.name);
  return names.includes('Physics') && !names.includes('Chemistry') ? true : names.join(',');
});

check('Hub card escapes topic and subject names', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', '<img src=x onerror=alert(1)>')] }])); const app = makeApp();
  const html = app.syllabusCardHTML({ name: 'DBMS', code: '' });
  return !html.includes('<img src=x') && html.includes('&lt;img') ? true : 'not escaped';
});

check('Hub card shows progress and the Settings exam date when none is set', () => {
  seed({ ...withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys', 'done'), topic('a2', 'Joins')] }]), cos_profile: JSON.stringify({ examDate: '2026-10-25' }) });
  const app = makeApp(); app.renderDashboard();
  const html = app.syllabusCardHTML({ name: 'DBMS', code: '' });
  if (!html.includes('1 of 2 topics done')) return 'count missing';
  return html.includes('Exam in 5 days · 1 topic left') && html.includes('(from Settings)') ? true : 'exam line missing';
});

check('Today shows one syllabus line only when there are topics', () => {
  seed(); let app = makeApp();
  if (app.syllabusTodayLine() !== '') return 'line shown without a syllabus';
  seed(withSyllabus([
    { subjectName: 'DBMS', examDate: '2026-10-25', topics: [topic('a1', 'Keys', 'done'), topic('a2', 'Joins')] },
    { subjectName: 'Physics', topics: [topic('p1', 'Optics', 'done')] }
  ])); app = makeApp();
  const line = app.syllabusTodayLine();
  return line === 'Syllabus: 75% across 2 subjects · next exam DBMS in 5 days' ? true : line;
});

// ── Backup and cloud ───────────────────────────────────────────
check('Backup file includes the syllabus', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys')] }])); const app = makeApp();
  let blobText = '';
  const RealBlob = globalThis.Blob;
  globalThis.Blob = class { constructor(parts) { blobText = parts.join(''); } };
  const realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {};
  try { app.exportData(); } finally { globalThis.Blob = RealBlob; URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; }
  const data = JSON.parse(blobText);
  return Array.isArray(data.syllabus) && data.syllabus[0].topics[0].title === 'Keys' ? true : 'syllabus missing from backup';
});

check('Cloud: a deleted topic stays deleted after a round trip', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys'), topic('a2', 'Joins')] }])); const app = makeApp();
  app.state.customTasks = [];
  app.pushLocalDataToCloud('u1');
  const list = JSON.parse(store.cos_syllabus);
  list[0].topics = list[0].topics.filter(t => t.id !== 'a2');
  store.cos_syllabus = JSON.stringify(list);
  app.pushLocalDataToCloud('u1');
  const titles = cloud.syllabus[0].topics.map(t => t.title).join('|');
  if (titles !== 'Keys') return `cloud still has: ${titles}`;
  app.applyCloudDataToLocalState(JSON.parse(JSON.stringify(cloud)));
  return syl()[0].topics.length === 1 ? true : 'deleted topic came back';
});

check('Cloud/restore without a syllabus field leaves the local one alone', () => {
  seed(withSyllabus([{ subjectName: 'DBMS', topics: [topic('a1', 'Keys')] }])); const app = makeApp();
  app.applyCloudDataToLocalState({ profile: { name: 'Asha' } });
  return syl()[0] && syl()[0].topics[0].title === 'Keys' ? true : 'local syllabus wiped';
});

check('Cloud: broken syllabus data is cleaned on arrival', () => {
  seed(); const app = makeApp();
  app.applyCloudDataToLocalState({ syllabus: [{ subjectName: 'DBMS', topics: [{ title: 'Keys', status: 'nope' }, null] }, 7] });
  const e = syl();
  return e.length === 1 && e[0].topics.length === 1 && e[0].topics[0].status === 'todo' ? true : JSON.stringify(e);
});

// ── Scan a photo or PDF (stored AI answer, no network) ─────────
const scanFixture = JSON.parse(fs.readFileSync(`${ROOT}/tests/fixtures/syllabus-scan/dbms-answer.json`, 'utf8'));

check('Scan: AI rows are cleaned, weightage kept only when valid, duplicates dropped', () => {
  seed(); const app = makeApp();
  const { topics, duplicates } = app.topicsFromSyllabusScan(scanFixture.schedule);
  const got = topics.map(t => `${t.title}:${t.importance}:${t.marks || ''}`).join('|');
  const want = 'Introduction to DBMS:2:|ER model:2:10|Relational algebra:2:8|Normalization: 1NF, 2NF, 3NF and BCNF:3:12|Transactions:3:|Concurrency control:1:|Indexing and hashing:2:';
  return got === want && duplicates === 1 ? true : `${got} (dups ${duplicates})`;
});

check('Scan: topics already in the subject are skipped', () => {
  seed(); const app = makeApp();
  const { topics, duplicates } = app.topicsFromSyllabusScan(scanFixture.schedule, ['ER model', 'indexing and hashing']);
  return topics.length === 5 && duplicates === 3 ? true : `${topics.length} topics, ${duplicates} dups`;
});

await (async () => {
  seed(); const app = makeApp();
  app.AIService.extractStructuredFromImage = async () => JSON.parse(JSON.stringify(scanFixture));
  window.showSyllabusPasteModal('DBMS');
  await app.runSyllabusScan('AAAA', 'image/jpeg');
  const body = domStub('syl-paste-body').innerHTML;
  check('Scan → preview shows 7 topics with the "check each row" note', () =>
    body.includes('7 topics to add') && body.includes('Read by AI from your file') ? true : body.slice(0, 300));
  check('Scan → nothing saved before Save', () => store.cos_syllabus ? 'saved before Save' : true);
  window.confirmSyllabusPaste();
  const e = syl()[0];
  check('Scan → Save stores the previewed topics as not started', () =>
    e && e.topics.length === 7 && e.topics.every(t => t.status === 'todo') && e.topics[3].marks === 12 ? true : JSON.stringify(e));
})();

await (async () => {
  seed(); const app = makeApp();
  app.AIService.extractStructuredFromImage = async () => { throw new Error('All configured vision providers failed.'); };
  window.showSyllabusPasteModal('DBMS');
  await app.runSyllabusScan('AAAA', 'application/pdf');
  const body = domStub('syl-paste-body').innerHTML;
  check('Scan failure: friendly message, paste offered, nothing saved', () =>
    body.includes('read topics from that PDF') && body.includes('Paste instead') && !store.cos_syllabus ? true : body.slice(0, 300));
})();

await (async () => {
  seed(); const app = makeApp();
  let resolveScan;
  app.AIService.extractStructuredFromImage = () => new Promise(r => { resolveScan = r; });
  window.showSyllabusPasteModal('DBMS');
  const pending = app.runSyllabusScan('AAAA', 'image/png');
  window.closeSyllabusPasteModal();
  domStub('syl-paste-body').innerHTML = 'closed';
  resolveScan(JSON.parse(JSON.stringify(scanFixture)));
  await pending;
  check('Scan: closing the window while waiting ignores the late answer', () =>
    domStub('syl-paste-body').innerHTML === 'closed' && !store.cos_syllabus ? true : 'late answer was used');
})();

check('Scan: file checks (type, 8 MB limit, offline)', () => {
  seed(); const app = makeApp();
  const ok = app.syllabusScanFileProblem({ type: 'image/jpeg', size: 2e6, name: 'a.jpg' });
  const pdf = app.syllabusScanFileProblem({ type: 'application/pdf', size: 3e6, name: 'syllabus.pdf' });
  const doc = app.syllabusScanFileProblem({ type: 'application/msword', size: 1e5, name: 'a.doc' });
  const big = app.syllabusScanFileProblem({ type: 'image/png', size: 9 * 1048576, name: 'b.png' });
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  const off = app.syllabusScanFileProblem({ type: 'image/png', size: 1e5, name: 'c.png' });
  if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  if (ok || pdf) return `valid file refused: ${ok || pdf}`;
  if (!doc.includes('photo, a screenshot or a PDF')) return doc;
  if (!big.includes('8 MB')) return big;
  return off.includes('internet') ? true : off;
});

console.log('==================================================================');
console.log(`${passed} passed, ${total - passed} failed`);
if (errors.length) process.exit(1);
