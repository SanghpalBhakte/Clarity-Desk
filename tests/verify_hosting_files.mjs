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
  'firebase-config.js', 'deadline-import.js', 'deadline-import-worker.js', 'vendor/jszip.min.js',
  'favicon.ico', 'favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-192-maskable.png', 'icon-512.png', 'icon-512-maskable.png', 'badge-96.png',
  'og-image.png'
];
// Runtime files a fresh clone may legitimately lack (none at the moment).
const OPTIONAL = new Set();

// One entry per Hosting site (targets in .firebaserc); every site must get
// the same config, checked below, so the first entry's ignore list is the list.
const hostingRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting;
const hostings = Array.isArray(hostingRaw) ? hostingRaw : [hostingRaw];
const hosting = hostings[0];
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

scenario('Every Hosting site deploys the same config', () => {
  const strip = ({ target, ...rest }) => JSON.stringify(rest);
  const differ = hostings.filter(h => strip(h) !== strip(hosting)).map(h => h.target || '(no target)');
  return differ.length === 0 ? true : `firebase.json hosting entries differ from "${hosting.target}": ${differ.join(', ')}`;
});
scenario('Nothing outside the app runtime files is published', () => {
  const extra = published.filter(p => !RUNTIME_FILES.includes(p));
  return extra.length === 0 ? true : `would publish ${extra.length} extra file(s): ${extra.slice(0, 15).join(', ')}${extra.length > 15 ? ' …' : ''} -- add an ignore glob in firebase.json, or add the file to RUNTIME_FILES if the app really loads it`;
});
scenario('Every runtime file is published', () => {
  const missing = RUNTIME_FILES.filter(f => !OPTIONAL.has(f) && !published.includes(f));
  return missing.length === 0 ? true : `would NOT publish: ${missing.join(', ')}`;
});
scenario('.git, internal notes, test kits and tests are never published', () => {
  // firebase-config.local.js may hold AI keys; it must never deploy again.
  const leaks = ['firebase-config.local.js', '.git/config', 'PROJECT_MEMORY.md', 'CLAUDE.md', 'timetable-test-kit/README.md', 'timetable-test-kit.zip', 'tests/verify_master.mjs', 'ai-proxy/.dev.vars', 'playwright-report/index.html']
    .filter(p => !matchers.some(match => match(p)));
  return leaks.length === 0 ? true : `these would be public: ${leaks.join(', ')}`;
});
const CDN_PREFIX = /^https:\/\/cdn\.jsdelivr\.net\/gh\/SanghpalBhakte\/Clarity-Desk@[0-9a-f]{40}\//;
const CDN_ALL = /https:\/\/cdn\.jsdelivr\.net\/gh\/SanghpalBhakte\/Clarity-Desk@([0-9a-f]{40})\//g;
scenario('Every precached service-worker file is published', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('['), sw.indexOf(']') + 1);
  // jsDelivr copies must also be published here: they are the fallback.
  const files = [...list.matchAll(/'\.?\/?([^']*)'/g)].map(m => m[1].replace(CDN_PREFIX, '').replace(/\?v=\d+$/, '')).filter(Boolean);
  const missing = [...new Set(files)].filter(f => !published.includes(f));
  return files.length && missing.length === 0 ? true : `precached but not published: ${missing.join(', ') || '(no precache list found)'}`;
});
const precacheUrls = () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const start = sw.indexOf('PRECACHE_ASSETS');
  const list = sw.slice(sw.indexOf('[', start), sw.indexOf(']', start) + 1);
  return { sw, urls: [...list.matchAll(/'(?:\.\/)?([^']*)'/g)].map(m => m[1]) };
};
scenario('No duplicate precache URLs', () => {
  const { urls } = precacheUrls();
  const seen = new Set(), dupes = [];
  for (const u of urls) { if (seen.has(u)) dupes.push(u); seen.add(u); }
  return urls.length && dupes.length === 0 ? true : `listed twice: ${dupes.join(', ') || '(no precache list found)'}`;
});
scenario("Every ?v= in the precache list matches CACHE_NAME's version", () => {
  const { sw, urls } = precacheUrls();
  const cur = (sw.match(/CACHE_NAME\s*=\s*'clarity-desk-v(\d+)'/) || [])[1];
  const versioned = urls.filter(u => /\?v=/.test(u));
  const bad = versioned.filter(u => !u.endsWith(`?v=${cur}`));
  if (!cur) return 'CACHE_NAME version not found';
  if (!urls.some(u => u === `app.js?v=${cur}` || (CDN_PREFIX.test(u) && u.endsWith('/app.js')))) return 'app.js (?v=N or the jsDelivr copy) is not in the precache list';
  return bad.length === 0 ? true : `wrong version: ${bad.join(', ')}`;
});

scenario('modulepreload links match the URLs the app really loads (no double download)', () => {
  const bad = [];
  for (const f of ['index.html', '404.html']) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const pre = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map(m => m[1]);
    const app = (html.match(/<script type="module" src="([^"]+)"/) || [])[1];
    if (!app || !pre.includes(app)) bad.push(`${f}: app.js preload ${pre.join(', ') || 'missing'} vs script ${app}`);
    const data = app ? app.replace(/app\.js(\?v=\d+)?$/, 'data.js') : 'data.js';
    if (!pre.includes(data)) bad.push(`${f}: ${data} not preloaded`);
    if (!/from '\.\/data\.js'/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))) bad.push("app.js no longer imports './data.js'");
    if (html.indexOf('rel="modulepreload"') > html.indexOf('</head>')) bad.push(`${f}: preload is not in <head>`);
  }
  return bad.length === 0 ? true : bad.join('; ');
});

scenario('App files load from one jsDelivr commit, with this site as the fallback', () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const sw = read('sw.js');
  const ver = (sw.match(/CACHE_NAME\s*=\s*'clarity-desk-v(\d+)'/) || [])[1];
  const shas = new Set(['index.html', '404.html', 'sw.js'].flatMap(f => [...read(f).matchAll(CDN_ALL)].map(m => m[1])));
  if (shas.size !== 1) return `expected one jsDelivr commit in index.html, 404.html and sw.js, found ${shas.size}`;
  const cdn = `https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@${[...shas][0]}/`;
  const bad = [];
  for (const f of ['index.html', '404.html']) {
    const html = read(f);
    if (!html.includes(`<link rel="stylesheet" href="${cdn}style.css" onerror="this.onerror=null;this.href='style.css?v=${ver}'" />`)) bad.push(`${f}: style.css from jsDelivr with fallback to style.css?v=${ver}`);
    if (!html.includes(`<script type="module" src="${cdn}app.js" onerror="var s=document.createElement('script');s.type='module';s.src='app.js?v=${ver}';document.body.appendChild(s)"></script>`)) bad.push(`${f}: app.js from jsDelivr with fallback to app.js?v=${ver}`);
  }
  for (const u of ['app.js', 'style.css', 'data.js']) if (!sw.includes(`'${cdn}${u}'`)) bad.push(`sw.js does not precache the jsDelivr ${u}`);
  // Local tests must run the working tree, not the last deployed commit.
  if (!read('tests/serve.mjs').includes('Clarity-Desk@[0-9a-f]{40}')) bad.push('tests/serve.mjs does not rewrite jsDelivr URLs');
  if (!read('scripts/ship.mjs').includes("const CDN = 'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@';")) bad.push('scripts/ship.mjs uses a different jsDelivr address');
  return bad.length === 0 ? true : bad.join('; ');
});

scenario('Analytics beacon loads for real visitors on the live site only, never for automated browsers', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<!-- Cloudflare Web Analytics[\s\S]*?<script>([\s\S]*?)<\/script>/);
  if (!m) return 'Cloudflare Web Analytics snippet not found in index.html';
  const loads = (hostname, webdriver) => {
    const added = [];
    const el = { setAttribute() {} };
    new Function('location', 'navigator', 'document', m[1])(
      { hostname }, { webdriver },
      { createElement: () => el, body: { appendChild: (x) => added.push(x) } });
    return added.length > 0;
  };
  const bad = [];
  if (!loads('campusos-83365.web.app', false)) bad.push('real visitor on campusos-83365.web.app not counted');
  if (!loads('claritydesk.web.app', undefined)) bad.push('real visitor on claritydesk.web.app not counted');
  if (loads('campusos-83365.web.app', true)) bad.push('automated browser on the live site counted');
  if (loads('claritydesk.web.app', true)) bad.push('automated browser on claritydesk.web.app counted');
  if (loads('127.0.0.1', false)) bad.push('local run counted');
  return bad.length === 0 ? true : bad.join('; ');
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${errors.length}`);
console.log('========================================');
if (errors.length) process.exit(1);
console.log('🏆 ALL HOSTING FILE LIST TESTS PASSED! 🚀\n');
