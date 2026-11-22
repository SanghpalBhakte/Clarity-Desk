// The offline copy matches what the page loads: every precached file exists,
// every file index.html and app.js load is precached (or listed as cached on
// first use), and index.html and sw.js agree on the cache version and the
// jsDelivr commit. A mismatch means a student opens a broken app offline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sw = read('sw.js');
const html = read('index.html');
const app = read('app.js');

// Loaded only when a student uses the feature; sw.js caches them on first use.
const CACHED_ON_FIRST_USE = ['deadline-import-worker.js', 'vendor/jszip.min.js'];

let passed = 0, failed = 0;
function check(name, problems) {
  if (problems.length === 0) { passed++; console.log(`✓ ${name}`); }
  else { failed++; console.log(`✗ [FAIL] ${name}\n    ${problems.join('\n    ')}`); }
}

const CDN_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\/SanghpalBhakte\/Clarity-Desk@([0-9a-f]{40})\/(.+)$/;
const listStart = sw.indexOf('PRECACHE_ASSETS = [');
const precache = [...sw.slice(listStart, sw.indexOf('];', listStart)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
// The file a precache entry stands for, relative to the repo root.
const fileOf = (u) => {
  const cdn = u.match(CDN_RE);
  const p = (cdn ? cdn[2] : u).split('?')[0].replace(/^\.\//, '');
  return p === '' ? 'index.html' : p;
};
const precachedFiles = new Set(precache.map(fileOf));

check('every precached file exists',
  precache.filter((u) => !fs.existsSync(path.join(ROOT, fileOf(u)))).map((u) => `${u}: no ${fileOf(u)} in the repo`));

const htmlRefs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1])
  .filter((u) => !/^(https?:|data:|mailto:|\/\/)/.test(u) && u !== 'firebase-config.local.js');
const precacheSpelled = new Set(precache.map((u) => u.replace(/^\.\//, '')));
check('every local file index.html loads is precached, spelled the same way',
  htmlRefs.filter((u) => !precacheSpelled.has(u.replace(/^\.\//, ''))).map((u) => `${u} is loaded by index.html but not in PRECACHE_ASSETS`));

const cdnInHtml = [...html.matchAll(/https:\/\/cdn\.jsdelivr\.net\/gh\/SanghpalBhakte\/Clarity-Desk@[0-9a-f]{40}\/[^"'\s]+/g)].map((m) => m[0]);
check('every jsDelivr file index.html loads is precached with the same URL',
  cdnInHtml.filter((u) => !precache.includes(u)).map((u) => `${u} is not in PRECACHE_ASSETS`));

const lazy = [...app.matchAll(/import\(['"]\.\/([^'"]+)['"]\)|new Worker\(['"]\.\/([^'"]+)['"]/g)].map((m) => m[1] || m[2]);
check('every file app.js loads later is precached or listed as cached on first use',
  [...new Set(lazy)].filter((f) => !precachedFiles.has(f) && !CACHED_ON_FIRST_USE.includes(f)).map((f) => `${f}: add it to PRECACHE_ASSETS (works offline) or to CACHED_ON_FIRST_USE here`));

check('files cached on first use are not also precached',
  CACHED_ON_FIRST_USE.filter((f) => precachedFiles.has(f)).map((f) => `${f} is in both lists`));

const version = (sw.match(/CACHE_NAME = 'clarity-desk-v(\d+)'/) || [])[1];
const versions = new Set([...`${html}\n${sw}`.matchAll(/\?v=(\d+)/g)].map((m) => m[1]));
check('index.html and sw.js use the cache version in CACHE_NAME',
  !version ? ['no CACHE_NAME version in sw.js'] : [...versions].filter((v) => v !== version).map((v) => `?v=${v} differs from CACHE_NAME v${version}`));

const pins = new Set([...`${html}\n${sw}`.matchAll(/Clarity-Desk@([0-9a-f]{40})\//g)].map((m) => m[1]));
check('index.html and sw.js pin one jsDelivr commit', pins.size === 1 ? [] : [`found ${pins.size} commits: ${[...pins].map((p) => p.slice(0, 7)).join(', ')}`]);

const manifest = JSON.parse(read('manifest.json'));
const manifestFiles = [...(manifest.icons || []), ...(manifest.screenshots || []), ...(manifest.shortcuts || []).flatMap((s) => s.icons || [])]
  .map((i) => i.src.split('?')[0].replace(/^\.?\//, ''));
check('every manifest icon and screenshot exists',
  manifestFiles.filter((f) => !fs.existsSync(path.join(ROOT, f))).map((f) => `${f} is in manifest.json but missing`));

console.log(`\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failed) process.exit(1);
console.log('All PWA consistency checks passed.');
