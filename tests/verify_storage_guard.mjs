// safeGetStorage: a saved value of the wrong shape returns the default
// instead of crashing the screen, and the raw value is kept once.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const grab = (name) => {
  const start = app.indexOf(`function ${name}(`);
  return app.slice(start, app.indexOf('\n}\n', start) + 2);
};

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
const warn = console.warn; console.warn = () => {};
const { safeGetStorage } = new Function(`${grab('storageShapeOk')}\n${grab('safeGetStorage')}\nreturn { safeGetStorage };`)();

let fails = 0;
const check = (name, ok) => { if (!ok) { fails++; console.error('FAIL', name); } else console.log('ok  ', name); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

store.cos_custom_tasks = '[{"id":1}]';
check('a good list comes back', eq(safeGetStorage('cos_custom_tasks', []), [{ id: 1 }]));
store.cos_attendance = '{"a":1}';
check('a good record comes back', eq(safeGetStorage('cos_attendance', {}), { a: 1 }));

store.cos_custom_tasks = '[{"id":1},{"id"';
check('cut-off JSON gives the list default', eq(safeGetStorage('cos_custom_tasks', []), []));
check('the raw value is kept under cos_corrupt_', store.cos_corrupt_cos_custom_tasks === '[{"id":1},{"id"');
store.cos_custom_tasks = 'other junk';
safeGetStorage('cos_custom_tasks', []);
check('the first kept copy is never overwritten', store.cos_corrupt_cos_custom_tasks === '[{"id":1},{"id"');

store.cos_attendance = '[1,2]';
check('a list where a record belongs gives the record default', eq(safeGetStorage('cos_attendance', {}), {}));
store.cos_profile = 'null';
check('null where a record belongs gives the record default', eq(safeGetStorage('cos_profile', {}), {}));

store.cos_user_batch = 'A1';
check('a plain string still comes back with a string default', safeGetStorage('cos_user_batch', '') === 'A1');
store.cos_user_batch = '2';
check('a saved "2" with a string default comes back as the string "2"', safeGetStorage('cos_user_batch', '') === '2');
store.cos_custom_links = 'x';
check('a null default never checks the shape', safeGetStorage('cos_custom_links', null) === 'x');
check('a missing key gives the default', eq(safeGetStorage('cos_missing', []), []));

console.warn = warn;
if (fails) { console.error(`${fails} storage guard check(s) failed`); process.exit(1); }
console.log('All storage guard checks passed.');
