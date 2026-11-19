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
const stub = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, addEventListener() {} });
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
const app = new Function(`${code}\n return { deriveShortForms, stripLabelCandidates, layoutStrip, getCanonicalSubjectCode };`)();
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

if (fails) { console.error(`${fails} strip check(s) failed`); process.exit(1); }
console.log('All strip label checks passed.');
