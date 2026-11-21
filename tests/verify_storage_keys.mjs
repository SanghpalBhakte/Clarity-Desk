// Every storage key is listed in tests/storage-keys.json, and the backup file
// and the sign-in Undo cover exactly the keys the list says they do. A new
// key, or a key dropped from exportData / importData, fails here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
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

function body(name) {
  const start = app.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`verify_storage_keys: ${name} not found in app.js`);
  return app.slice(start, app.indexOf('\n}\n', start));
}
const exportBody = body('exportData');
const importBody = body('importData');
const fields = Object.entries(reg.keys).filter(([, v]) => v.backup).map(([k, v]) => [k, v.backup]);

check('exportData writes every backed-up key',
  fields.filter(([, f]) => !new RegExp(`\\b${f}\\s*:`).test(exportBody)).map(([k, f]) => `${k}: no "${f}:" in exportData`));
check('importData restores every backed-up key',
  fields.filter(([, f]) => !new RegExp(`data\\.${f}\\b`).test(importBody)).map(([k, f]) => `${k}: no "data.${f}" in importData`));

const dataLiteral = exportBody.slice(exportBody.indexOf('const data = {'), exportBody.indexOf('};'));
const exported = [...dataLiteral.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).filter((f) => f !== 'exportedAt');
const known = new Set(fields.map(([, f]) => f));
check('every field in the backup file belongs to a listed key',
  exported.filter((f) => !known.has(f)).map((f) => `backup field "${f}" has no key in storage-keys.json`));

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
