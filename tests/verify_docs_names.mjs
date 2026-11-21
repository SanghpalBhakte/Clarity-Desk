// docs/ARCHITECTURE.md names real things: every function, class, id,
// constant or storage key it puts in `code` still exists in the source.
// A rename or removal that leaves the doc behind fails here. Prose can still
// go stale; this only catches names.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = 'docs/ARCHITECTURE.md';
// Placeholders the doc uses on purpose.
const NOT_NAMES = new Set(['renderX']);

const readDir = (dir, re) => fs.existsSync(path.join(ROOT, dir))
  ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)).map((f) => fs.readFileSync(path.join(ROOT, dir, f), 'utf8'))
  : [];
const source = [
  ...readDir('.', /\.(js|mjs|html|css|json)$/),
  ...readDir('scripts', /\.m?js$/),
  ...fs.readdirSync(path.join(ROOT, 'workers')).flatMap((d) => readDir(path.join('workers', d), /\.(m?js|toml)$/)),
  ...readDir('ai-proxy', /\.(m?js|toml)$/),
  ...readDir('push-worker', /\.(m?js|toml)$/),
].join('\n');

const names = new Set();
for (const m of fs.readFileSync(path.join(ROOT, DOC), 'utf8').matchAll(/`([^`\n]+)`/g)) {
  const t = m[1].trim();
  let x;
  if ((x = t.match(/^([A-Za-z_$][\w$]*)\(.*\)$/))) names.add(x[1]);            // fn(...)
  else if ((x = t.match(/^[.#]([A-Za-z][\w-]*)$/))) names.add(x[1]);          // .class / #id
  else if (/^cos_[a-z0-9_]+$/.test(t)) names.add(t);                         // storage key
  else if (/^[A-Za-z_$][\w$]*$/.test(t) && /[A-Z_]|[a-z][A-Z]/.test(t.slice(1))) names.add(t); // camelCase / CONST
}
const missing = [...names].filter((n) => !NOT_NAMES.has(n) && !source.includes(n));
if (missing.length) {
  console.log(`✗ [FAIL] ${DOC} names ${missing.length} thing(s) the source no longer has (rename them in the doc, or say what replaced them):\n    ${missing.join('\n    ')}`);
  process.exit(1);
}
console.log(`✓ all ${names.size} names in ${DOC} exist in the source`);
