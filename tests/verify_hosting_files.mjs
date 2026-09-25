// ==================================================================
// Clarity Desk: HOSTING FILE LIST (what `firebase deploy` publishes)
// ==================================================================
// firebase.json publishes the whole project folder ("public": ".") minus
// its "ignore" globs. Until v163 that leaked the .git folder, internal
// notes (PROJECT_MEMORY.md), the timetable test kit with faculty names,
// test files and a 520 KB Playwright report onto the live site.
//
// This test replays the ignore rules over the working folder and fails if
// anything outside RUNTIME_FILES would be published, or if a runtime file
// would be left out. Adding a new file the app loads? Add it below.
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RUNTIME_FILES = [
  '404.html', 'index.html', 'app.js', 'data.js', 'style.css', 'sw.js', 'manifest.json',
  'firebase-config.js', 'firebase-config.local.js',
  'favicon.ico', 'favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-192-maskable.png', 'icon-512.png', 'icon-512-maskable.png', 'badge-96.png',
  'og-image.png'
];
// firebase-config.local.js is gitignored, so a fresh clone may not have it.
const OPTIONAL = new Set(['firebase-config.local.js']);

const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting;
const ignore = ['**/firebase-debug.log', '**/firebase-debug.*.log', '.firebase/*', ...hosting.ignore];

// Matcher for the glob shapes firebase.json uses (same results as the
// `glob` package firebase-tools calls, checked when this test was written).
// Unknown shapes fail loudly rather than being guessed at.
function toMatcher(pattern) {
  let m;
  if (pattern === '**/.*') return p => p.split('/').pop().startsWith('.');
  if (pattern === '**/.*/**') return p => p.split('/').slice(0, -1).some(seg => seg.startsWith('.'));
  if ((m = pattern.match(/^\*\*\/([^*/]+)\/\*\*$/))) return p => p.split('/').slice(0, -1).includes(m[1]);
  if ((m = pattern.match(/^\*\*\/\*(\.[A-Za-z0-9]+)$/))) return p => p.endsWith(m[1]);
  if ((m = pattern.match(/^\*\*\/([^*/]+)$/))) return p => p.split('/').pop() === m[1];
  if ((m = pattern.match(/^([^*]+)\/\*\*$/))) return p => p.startsWith(m[1] + '/');
  if ((m = pattern.match(/^([^*]+)\/\*$/))) return p => p.startsWith(m[1] + '/') && !p.slice(m[1].length + 1).includes('/');
  if ((m = pattern.match(/^\*\*\/([^*/]+)\.\*\.([A-Za-z0-9]+)$/))) return p => { const b = p.split('/').pop(); return b.startsWith(m[1] + '.') && b.endsWith('.' + m[2]); };
  if (!pattern.includes('*')) return p => p === pattern;
  throw new Error(`verify_hosting_files: unsupported ignore pattern "${pattern}" -- extend toMatcher()`);
}
const matchers = ignore.map(toMatcher);

function walk(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), r));
    else out.push(r);
  }
  return out;
}

let total = 0, passed = 0; const errors = [];
function scenario(name, fn) {
  total++;
  const res = fn();
  if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
  else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
}

console.log('==================================================================');
console.log('🌐 HOSTING FILE LIST: only app files are published');
console.log('==================================================================');

const published = walk(ROOT).filter(p => !matchers.some(match => match(p))).sort();

scenario('Nothing outside the app runtime files is published', () => {
  const extra = published.filter(p => !RUNTIME_FILES.includes(p));
  return extra.length === 0 ? true : `would publish ${extra.length} extra file(s): ${extra.slice(0, 15).join(', ')}${extra.length > 15 ? ' …' : ''} -- add an ignore glob in firebase.json, or add the file to RUNTIME_FILES if the app really loads it`;
});
scenario('Every runtime file is published', () => {
  const missing = RUNTIME_FILES.filter(f => !OPTIONAL.has(f) && !published.includes(f));
  return missing.length === 0 ? true : `would NOT publish: ${missing.join(', ')}`;
});
scenario('.git, internal notes, test kits and tests are never published', () => {
  const leaks = ['.git/config', 'PROJECT_MEMORY.md', 'CLAUDE.md', 'timetable-test-kit/README.md', 'timetable-test-kit.zip', 'tests/verify_master.mjs', 'ai-proxy/.dev.vars', 'playwright-report/index.html']
    .filter(p => !matchers.some(match => match(p)));
  return leaks.length === 0 ? true : `these would be public: ${leaks.join(', ')}`;
});
scenario('Every precached service-worker file is published', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('['), sw.indexOf(']') + 1);
  const files = [...list.matchAll(/'\.?\/?([^']*)'/g)].map(m => m[1]).filter(Boolean);
  const missing = [...new Set(files)].filter(f => !published.includes(f));
  return files.length && missing.length === 0 ? true : `precached but not published: ${missing.join(', ') || '(no precache list found)'}`;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${errors.length}`);
console.log('========================================');
if (errors.length) process.exit(1);
console.log('🏆 ALL HOSTING FILE LIST TESTS PASSED! 🚀\n');
