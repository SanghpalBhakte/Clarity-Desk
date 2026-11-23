// Clarity Desk: Today C2 strip labels and strip layout (Task 4). Pure-function checks.
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
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
const stub = () => ({ click() {}, dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, addEventListener() {} });
globalThis.document = {
  getElementById: () => stub(), querySelector: () => null, querySelectorAll: () => [],
  activeElement: null, hidden: false, addEventListener() {}, removeEventListener() {},
  createElement: () => stub(), body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
  const NOTICES = [];
`);
const app = new Function(`${code}\n return { deriveShortForms, stripLabelCandidates, layoutStrip, getCanonicalSubjectCode, subjectShortName, classShortName };`)();
let fails = 0;
const check = (name, ok) => { if (!ok) { fails++; console.error('FAIL', name); } else console.log('ok  ', name); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Short forms made from a name
check('DEMP from Digital Electronics and Microprocessors', app.deriveShortForms('Digital Electronics and Microprocessors').includes('DEMP'));
check('OOP first for Object Oriented Programming', app.deriveShortForms('Object Oriented Programming')[0] === 'OOP');
check('Data Structures Lab -> DS Lab, DS', eq(app.deriveShortForms('Data Structures Lab'), ['DS Lab', 'DS']));
check('Maths III -> Maths III, M3', eq(app.deriveShortForms('Maths III'), ['Maths III', 'M3']));
check('Library stays one word', eq(app.deriveShortForms('Library'), ['Library']));
check('Thermodynamics is not split', eq(app.deriveShortForms('Thermodynamics'), ['Thermodynamics']));
check('empty name gives nothing', eq(app.deriveShortForms(''), []));

// Candidates, in order
check('code after the full name', eq(app.stripLabelCandidates({ subject: 'Database Management Systems', code: 'DBMS' }), ['Database Management Systems', 'DBMS']));
const cs = app.stripLabelCandidates({ subject: 'X', code: 'CS302' });
check('course number goes last', cs[cs.length - 1] === 'CS302' && cs.length > 1);
check('EVS from the known list when there is no code', app.stripLabelCandidates({ subject: 'Environmental Studies', code: '' }).includes('EVS'));
check('known short form gets " Lab" for a lab', app.stripLabelCandidates({ subject: 'Data Structures Lab', code: '' }).includes('DS Lab'));
check('own strip name only', eq(app.stripLabelCandidates({ subject: 'Environmental Studies', code: '' }, 'EVS2'), ['EVS2']));
check('a "Lab"/"Theory" code is not a short form', !app.stripLabelCandidates({ subject: 'Operating Systems', code: 'Lab' }).includes('Lab'));

// Attendance is stored under the subject code: the strip list must not change it
check('subject codes unchanged (ES, COAA, DBMS)', app.getCanonicalSubjectCode('Environmental Studies') === 'ES'
  && app.getCanonicalSubjectCode('Computer Organisation and Architecture') === 'COAA'
  && app.getCanonicalSubjectCode('Database Management Systems') === 'DBMS');

// Layout: 7 px per character, as the plan says
const measure = (t) => t.length * 7;
const E = (id, subject, from, to, code = '') => ({ id, subject, code, from, to });
const allFit = (r) => r.blocks.every(b => b.label === '' || measure(b.label) + 6 <= b.width);
const noDots = (r) => r.blocks.every(b => !b.label.includes('…'));

const one = app.layoutStrip([E('a', 'Data Structures', 9, 10)], { width: 340, measure, own: {} });
check('one class pads the day to 6 h', one.end - one.start === 6 && one.start === 9);
check('one class: one block', one.blocks.length === 1 && one.blocks[0].kind === 'one' && eq(one.blocks[0].ids, ['a']));

const two = app.layoutStrip([E('a', 'DS Lab A1', 9, 11), E('b', 'OS Lab A2', 9, 11), E('c', 'Maths III', 11, 12)], { width: 340, measure, own: {} });
check('two batch labs merge into "2 labs"', two.blocks.length === 2 && two.blocks[0].kind === 'group' && two.blocks[0].label === '2 labs' && eq(two.blocks[0].ids, ['a', 'b']));

const three = app.layoutStrip([E('a', 'L1', 14, 16), E('b', 'L2', 14, 16), E('c', 'L3', 15, 17)], { width: 340, measure, own: {} });
check('three overlapping -> "3 labs"', three.blocks.length === 1 && three.blocks[0].label === '3 labs');

const cn = app.layoutStrip([E('a', 'Computer Networks', 9, 9.5), E('b', 'Compiler Notes', 9.5, 10), E('c', 'Seminar', 10, 15)], { width: 340, measure, own: {} });
const [la, lb] = [cn.blocks[0].label, cn.blocks[1].label];
check('Computer Networks and Compiler Notes never share a label', la !== lb || la === '');
check('labels fit, no "…" (CN case)', allFit(cn) && noDots(cn));

const busy = app.layoutStrip([
  E('1', 'Digital Electronics and Microprocessors', 9, 10), E('2', 'Object Oriented Programming', 10, 11),
  E('3', 'Workshop', 11, 13), E('4', 'Environmental Studies', 14, 15), E('5', 'Maths III', 15, 16),
  E('6', 'Data Structures Lab', 16, 18), E('7', 'Seminar', 20.5, 22)
], { width: 340, measure, own: { 'Environmental Studies': 'EVS2' } });
check('busy day: every label fits whole, no "…"', allFit(busy) && noDots(busy));
const ownWide = app.layoutStrip([E('a', 'Environmental Studies', 9, 15)], { width: 340, measure, own: { 'Environmental Studies': 'EVS2' } });
check('own strip name wins even when the full name fits', ownWide.blocks[0].label === 'EVS2');
check('busy day: thin blocks stay plain rather than cut', busy.blocks[0].label === '' && busy.blocks[3].label === '');
check('busy day: a class after 9 PM sets the end', busy.end === 22);
check('busy day: blocks have a 2 px gap', busy.blocks.every((b, i, a) => i === 0 || b.left >= a[i - 1].left + a[i - 1].width + 2 - 1e-9));

const ownTooLong = app.layoutStrip([E('a', 'Environmental Studies', 9, 9.25), E('z', 'X', 14, 15)], { width: 340, measure, own: { 'Environmental Studies': 'VERYLONG10' } });
check('own name that does not fit leaves the block plain', ownTooLong.blocks[0].label === '');

check('gap: longest gap of 1.5 h or more', eq(busy.gap, { from: 18, to: 20.5 }));
check('gap: none under 1.5 h', app.layoutStrip([E('a', 'A', 9, 10), E('b', 'B', 11, 12)], { width: 340, measure, own: {} }).gap === null);
check('empty day', eq(app.layoutStrip([], { width: 340, measure, own: {} }).blocks, []));

// Real timetable text: batch tags, brackets, typed short names, combined lab rows
const C = (subject, code = '', type) => app.stripLabelCandidates({ subject, code, type });
check('"OS Lab (Batch A2)" -> Operating Systems Lab, OS Lab, OS (never "OLBA")', eq(C('OS Lab (Batch A2)'), ['Operating Systems Lab', 'OS Lab', 'OS']));
check('"Computer Networks Lab A1" -> CN Lab, CN', eq(C('Computer Networks Lab A1'), ['Computer Networks Lab', 'CN Lab', 'CN']));
check('typed "DBMS" finds the full name first', eq(C('DBMS'), ['Database Management Systems', 'DBMS']));
check('lab by type, not by name', eq(C('Data Structures', '', 'lab'), ['Data Structures Lab', 'DS Lab', 'DS']));
check('a batch tag code ("A2") is not a short form', !C('Maths III', 'A2').includes('A2'));
check('lowercase course number goes last', C('Signals', 'cs302').slice(-1)[0] === 'cs302');
check('hyphenated name: Object-Oriented Programming -> OOP', C('Object-Oriented Programming').includes('OOP'));
check('combined lab row -> whole text, "DS Lab + OS Lab", "2 labs"', eq(C('DS Lab A1 + OS Lab A2'), ['DS Lab A1 + OS Lab A2', 'DS + OS', '2 labs']));
check('blank own name falls back to automatic', C('DBMS').length === app.stripLabelCandidates({ subject: 'DBMS' }, '   ').length);
check('prototype names are safe', Array.isArray(C('constructor')) && !String(C('constructor')).includes('function'));

// Same subject, two raw spellings: they may share a label; different subjects may not
const same = app.layoutStrip([E('a', 'OS Lab (Batch A2)', 9, 9.4), E('b', 'Operating Systems', 10, 10.4), E('c', 'X', 14, 15)], { width: 340, measure, own: {} });
check('same subject may repeat its short form (lab and theory both "OS")', same.blocks[0].label === 'OS' && same.blocks[1].label === 'OS');
const ownCanon = app.layoutStrip([E('a', 'DBMS', 9, 15)], { width: 340, measure, own: { 'Database Management Systems': 'DB' } });
check('own name is found by the canonical subject name', ownCanon.blocks[0].label === 'DB');
check('own map with prototype keys is ignored', app.layoutStrip([E('a', 'constructor', 9, 15)], { width: 340, measure, own: {} }).blocks[0].label.indexOf('function') === -1);
check('garbage own map does not throw', app.layoutStrip([E('a', 'DBMS', 9, 15)], { width: 340, measure, own: 'oops' }).blocks.length === 1);

// Bad input
const strTimes = app.layoutStrip([E('a', 'A', '9', '10'), E('b', 'B', '10', '11')], { width: 340, measure, own: {} });
check('times given as text still sort as numbers', strTimes.start === 9 && strTimes.blocks.length === 2);
const bad = app.layoutStrip([E('a', 'A', 10, 9), E('b', 'B', NaN, 11), null, E('c', 'C', 9, 10)], { width: 340, measure, own: {} });
check('reversed, NaN and null entries are dropped', bad.blocks.length === 1 && eq(bad.blocks[0].ids, ['c']));
const tiny = app.layoutStrip([E('a', 'A', 9, 9.01), E('b', 'B', 9.01, 15)], { width: 340, measure, own: {} });
check('a sliver never gets a negative width', tiny.blocks.every(b => b.width >= 0));
check('not an array', eq(app.layoutStrip(null, { width: 340, measure }).blocks, []));

// ── Own strip names: cos_strip_labels (Task 8) ──
const own = new Function(`${code}\n showToast = () => {}; // toasts need a real DOM; this file checks storage only\n return { loadStripLabels, saveStripLabel, KEY_STRIP_LABELS, signinBackupKeys, exportData, importData };`)();
localStorage.clear();
check('key is cos_strip_labels', own.KEY_STRIP_LABELS === 'cos_strip_labels');
check('nothing saved: loadStripLabels is {}', eq(own.loadStripLabels(), {}));
own.saveStripLabel('Environmental Studies', 'EVS');
check('saved name reads back', own.loadStripLabels()['Environmental Studies'] === 'EVS');
own.saveStripLabel('Environmental Studies', 'Environmental');
check('capped at 10 characters', own.loadStripLabels()['Environmental Studies'] === 'Environmen');
own.saveStripLabel('Environmental Studies', '   ');
check('blank clears it (back to automatic)', !('Environmental Studies' in own.loadStripLabels()));
localStorage.setItem('cos_strip_labels', '["junk"]');
check('garbage store reads as {}', eq(own.loadStripLabels(), {}));
localStorage.setItem('cos_strip_labels', JSON.stringify({ A: 'ok', B: 42, C: '' }));
check('only non-empty strings survive a read', eq(own.loadStripLabels(), { A: 'ok' }));
check('the sign-in safety copy includes it', own.signinBackupKeys().includes('cos_strip_labels'));

// Backup file: exportData writes stripLabels; a restore with or without them never throws.
localStorage.clear();
own.saveStripLabel('Database Management Systems', 'DB');
let blobText = '';
globalThis.Blob = class { constructor(parts) { blobText = parts.join(''); } };
globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
try { own.exportData(); } catch (e) { /* the toast after the download has no DOM here; the file is already written */ }
check('exportData has stripLabels', (() => { try { return eq(JSON.parse(blobText).stripLabels, { 'Database Management Systems': 'DB' }); } catch (e) { return false; } })());
let fileText = '';
globalThis.FileReader = class { readAsText() { this.onload({ target: { result: fileText } }); } };
const restore = (text) => { fileText = text; let threw = false; try { own.importData({ target: { files: [{}] } }); } catch (e) { threw = true; } return !threw; };
localStorage.clear();
check('old backup without stripLabels restores without throwing', restore(JSON.stringify({ customTasks: [] })));
check('...and leaves loadStripLabels() as {}', eq(own.loadStripLabels(), {}));
restore(JSON.stringify({ customTasks: [], stripLabels: { 'Environmental Studies': 'EVS', Bad: 7, Long: 'ABCDEFGHIJKLMNOP' } }));
check('backup with stripLabels restores them (cleaned and capped)', eq(own.loadStripLabels(), { 'Environmental Studies': 'EVS', Long: 'ABCDEFGHIJ' }));

// #457: short names on Tasks, Subjects and Today. Own name wins, codes stay, course numbers become initials.
check('course number -> initials', app.subjectShortName('Art of Public Speaking', 'MGM51OEL115', {}) === 'APS');
check('spaced course number -> initials', app.subjectShortName('Data Structures', 'CS 301', {}) === 'DS');
check('short codes unchanged (DS, PBST, OS Lab, M3)', ['DS', 'PBST', 'OS Lab', 'M3'].every(c => app.subjectShortName('Anything', c, {}) === c));
check('no code -> initials from the name', app.subjectShortName('Art of Public Speaking', '', {}) === 'APS');
check('own name wins over code and initials', app.subjectShortName('Art of Public Speaking', 'MGM51OEL115', { 'Art of Public Speaking': 'Talk' }) === 'Talk');
check('Today sentence: no code keeps the full name', app.classShortName({ subject: 'Maths III', code: '' }) === 'Maths III');
check('Today sentence: course number -> initials', app.classShortName({ subject: 'Art of Public Speaking', code: 'MGM51OEL115' }) === 'APS');

if (fails) { console.error(`${fails} strip check(s) failed`); process.exit(1); }
console.log('All strip label checks passed.');
