// npm test: runs every file in tests/unit-tests.json in order, keeps going after a
// failure, and ends with one list of the files that failed.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// An optional argument names another list file (used to try the runner itself).
const listFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'tests', 'unit-tests.json');
const files = JSON.parse(fs.readFileSync(listFile, 'utf8'));

const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) failed.push(`${f} (${r.status === null ? r.signal : 'exit ' + r.status})`);
}

console.log(`\n${files.length - failed.length}/${files.length} test files passed`);
if (failed.length) {
  console.error(`FAILED:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
