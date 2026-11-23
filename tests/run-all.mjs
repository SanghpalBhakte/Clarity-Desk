// npm test: runs every file in tests/unit-tests.json in order, keeps going after a
// failure, prints the output of failing files only, and ends with one list of the
// files that failed. `npm test -- --verbose` prints every file's output.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
// An optional argument names another list file (used to try the runner itself).
const listArg = args.find(a => a !== '--verbose');
const listFile = listArg ? path.resolve(listArg) : path.join(ROOT, 'tests', 'unit-tests.json');
const files = JSON.parse(fs.readFileSync(listFile, 'utf8'));

const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [f], {
    cwd: ROOT,
    stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status === 0) continue;
  failed.push(`${f} (${r.status === null ? r.signal : 'exit ' + r.status})`);
  if (!verbose) {
    console.log(`\n──── ${f} failed; its output: ────`);
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.error) console.error(r.error);
  }
}

console.log(`\n${files.length - failed.length}/${files.length} test files passed`);
if (failed.length) {
  console.error(`FAILED:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
