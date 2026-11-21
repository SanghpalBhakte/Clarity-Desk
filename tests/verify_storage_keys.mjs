// Every storage key is listed in tests/storage-keys.json, and the backup file
// and the sign-in Undo cover exactly the keys the list says they do. A new
// key, or a backed-up key without its DESK_DATASETS row (app.js), fails here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './app-loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const J = JSON.stringify;
const reg = JSON.parse(read('tests/storage-keys.json'));
const app = read('app.js');

let passed = 0, failed = 0;
function check(name, problems) {
  if (problems.length === 0) { passed++; console.log(`✓ ${name}`); }
  else { failed++; console.log(`✗ [FAIL] ${name}\n    ${problems.join('\n    ')}`); }
}

// Keys used in the app's own files.
const sources = fs.readdirSync(ROOT).filter((f) => /\.(js|html)$/.test(f) && !f.includes('.example.'));
const used = new Map();
for (const f of sources) {
  for (const m of read(f).matchAll(/['"`](cos_[a-z0-9_]*)/g)) {
    if (m[1] === 'cos_') continue; // prefix scans like k.startsWith('cos_')
    if (!used.has(m[1])) used.set(m[1], f);
  }
}
const prefixes = Object.keys(reg.prefixes || {});
const listed = (k) => k in reg.keys || prefixes.some((p) => k.startsWith(p));

check('every storage key in the app is listed in tests/storage-keys.json',
  [...used].filter(([k]) => !listed(k)).map(([k, f]) => `${k} (${f}): add it with backup field or a reason`));
check('every listed key is still used',
  [...Object.keys(reg.keys), ...prefixes].filter((k) => ![...used.keys()].some((u) => u === k || u.startsWith(k))).map((k) => `${k} is listed but no app file uses it`));
check('every key left out of backups says why',
  Object.entries(reg.keys).filter(([, v]) => v.backup === null && !v.why).map(([k]) => k));

// The backup file and restore are built from DESK_DATASETS (one row per
// backed-up key); the rows must match the keys listed with a backup field.
const { DESK_DATASETS: rows, deskBackupSnapshot } = loadApp(['DESK_DATASETS', 'deskBackupSnapshot']);
const fields = Object.entries(reg.keys).filter(([, v]) => v.backup).map(([k, v]) => [k, v.backup]);
const rowOf = new Map(rows.map((d) => [d.key, d]));

check('every backed-up key has a DESK_DATASETS row with the same backup field',
  fields.filter(([k, f]) => rowOf.get(k)?.backup !== f).map(([k, f]) => `${k}: want backup "${f}", row has ${J(rowOf.get(k)?.backup)}`));
check('every DESK_DATASETS row is a listed key with that backup field',
  rows.filter((d) => reg.keys[d.key]?.backup !== d.backup).map((d) => `${d.key} ("${d.backup}") is not listed with that backup field in storage-keys.json`));
check('every row can be read for a backup and restored from one',
  rows.filter((d) => typeof d.read !== 'function' || typeof d.restore !== 'function').map((d) => `${d.key}: needs read() and restore()`));
check('the backup file has exactly the listed fields',
  (() => { const got = Object.keys(deskBackupSnapshot()).sort(), want = fields.map(([, f]) => f).sort(); return J(got) === J(want) ? [] : [`got ${J(got)}, want ${J(want)}`]; })());

// Sign-in Undo: SIGNIN_BACKUP_KEYS, resolved through the KEY_ constants.
const consts = Object.fromEntries([...app.matchAll(/^const (KEY_[A-Z0-9_]+)\s*=\s*'(cos_[a-z0-9_]+)'/gm)].map((m) => [m[1], m[2]]));
const sbStart = app.indexOf('const SIGNIN_BACKUP_KEYS = [');
const sbBlock = app.slice(sbStart, app.indexOf('];', sbStart));
const signin = new Set([...sbBlock.matchAll(/KEY_[A-Z0-9_]+/g)].map((m) => consts[m[0]]));
const wantSignin = new Set(Object.entries(reg.keys).filter(([, v]) => v.signinUndo).map(([k]) => k));
check('SIGNIN_BACKUP_KEYS matches the keys marked signinUndo',
  [...[...wantSignin].filter((k) => !signin.has(k)).map((k) => `${k} is signinUndo but not in SIGNIN_BACKUP_KEYS`),
   ...[...signin].filter((k) => !wantSignin.has(k)).map((k) => `${k} is in SIGNIN_BACKUP_KEYS but not marked signinUndo`)]);

console.log(`\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failed) process.exit(1);
console.log('All storage key checks passed.');
