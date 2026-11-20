// Clarity Desk: Today C2 smart line (one line under the title). Pure-function checks.
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
const app = new Function(`${code}\n return { c2SmartLine };`)();
let fails = 0;
const check = (name, got, want) => { if (got !== want) { fails++; console.error('FAIL', name, '\n  got :', got, '\n  want:', want); } else console.log('ok  ', name); };
const c = (subject, code, time, end) => ({ subject, code, time, end });
const DS = c('Data Structures', 'DS', '09:00', '10:00'), DB = c('Database Management Systems', 'DBMS', '11:00', '12:00'), OS = c('OS Practicals', 'OS Lab', '14:00', '16:00');
const day = [DS, DB, OS];
const L = (o) => app.c2SmartLine({ dayClasses: day, ...o });

check('before the first class, with a long gap', L({ currentMin: 490, nextClass: DS }), 'DS at 9:00 AM. Free from 12:00 PM to 2:00 PM.');
check('in class: minutes left, then free until the next one', L({ currentMin: 680, activeClass: DB, nextClass: OS }), '40 minutes left. Then free until OS Lab at 2:00 PM.');
check('in class: a short gap is not free', app.c2SmartLine({ dayClasses: [c('A', 'A', '10:00', '11:00'), c('B', 'B', '11:15', '12:00')], currentMin: 645, activeClass: c('A', 'A', '10:00', '11:00'), nextClass: c('B', 'B', '11:15', '12:00') }), '15 minutes left. Then B at 11:15 AM.');
check('in class: last class of the day', L({ currentMin: 900, activeClass: OS, nextClass: null }), '60 minutes left. Then you are done for today.');
check('between classes', L({ currentMin: 780, nextClass: OS }), 'Next: OS Lab at 2:00 PM.');
check('after the last class, before evening', L({ currentMin: 1000, nextClass: null }), "That's all your classes for today.");
check('evening, nothing marked', L({ mode: 'evening', unmarkedCount: 3 }), '3 classes today. Mark them in one tap.');
check('evening, some marked', L({ mode: 'evening', unmarkedCount: 1 }), '1 class left to mark.');
check('evening, all marked', L({ mode: 'evening', unmarkedCount: 0 }), "Today's classes are marked. The evening is yours.");
check('night, with something due', app.c2SmartLine({ mode: 'night', tomorrowClasses: [DB, DS], dueTomorrowTitle: 'DBMS assignment 2' }), 'Tomorrow starts at 9:00 AM with DS. DBMS assignment 2 is due.');
check('night, no classes tomorrow says nothing', app.c2SmartLine({ mode: 'night', tomorrowClasses: [] }), '');
check('no classes today says nothing', app.c2SmartLine({ dayClasses: [], currentMin: 600 }), '');
check('a class with no code uses its name', app.c2SmartLine({ dayClasses: [c('Maths III', '', '09:00', '10:00')], currentMin: 480, nextClass: c('Maths III', '', '09:00', '10:00') }), 'Maths III at 9:00 AM.');
if (fails) { console.error(`${fails} failed`); process.exit(1); }
console.log('All smart line checks passed.');
