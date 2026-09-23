// ==================================================================
// Clarity Desk: OCR TEST-KIT ACCURACY (real pipeline, real images)
// ==================================================================
// Runs the REAL timetable scanner from app.js -- real image preprocessing,
// real Tesseract.js, in real headless Chromium -- on every image in
// timetable-test-kit/images that has a hand-checked answer in
// timetable-test-kit/expected-output, and scores the result.
//
// Unlike the other verify_* scripts (which feed hand-built fake OCR output),
// this catches failures that only show up on real pixels: e.g. the deskew
// bug fixed in v158 rotated a 1-degree-tilted scan by ~13 degrees and every
// mocked test still passed while real scans scored 0%.
//
// Scoring unit: (day, period, subject). Merged vs split rows score the
// same -- what counts is which subject lands in which period on which day.
//
//   npm run test:ocr-kit      on-device scanner only; no API calls
//   npm run test:ocr-kit:ai   full pipeline incl. the vision-AI fallback,
//                             using the keys in firebase-config.local.js
//                             (spends a few AI calls per image)
//   extra flags: --only sample-01   run one image
//                --verbose          stream AI provider log lines (keys redacted)
//
// Needs internet (Tesseract.js loads from jsDelivr, exactly as the app
// does) and Playwright's Chromium (already used by `npm run test:visual`).
// Not part of `npm test` for those two reasons.
// ==================================================================
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const KIT = path.join(ROOT, 'timetable-test-kit');
const AI_MODE = process.argv.includes('--ai');
const VERBOSE = process.argv.includes('--verbose');                  // stream AI provider log lines
const onlyIdx = process.argv.indexOf('--only');                        // e.g. --only sample-01
const ONLY = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;
// Never let an API key reach the terminal, even in --verbose.
const redact = (s) => String(s)
  .replace(/key=[^&\s"']+/gi, 'key=<redacted>').replace(/AIza[0-9A-Za-z_-]{20,}/g, '<redacted>')
  .replace(/sk-or-[0-9A-Za-z_-]{10,}/g, '<redacted>').replace(/gsk_[0-9A-Za-z]{10,}/g, '<redacted>')
  .replace(/Bearer\s+\S+/g, 'Bearer <redacted>');

// Floors are set just under what each image measured when this test was
// written (on-device, v158: sample-01 37% recall / 55% precision; AI grid
// format with gemini-flash-lite: 98/100, 96/100, 95/84). They exist to
// catch regressions, not to certify quality -- raise them as scans improve.
const FLOORS = AI_MODE
  ? { 'sample-01': { recall: 0.85, precision: 0.90 }, 'sample-02': { recall: 0.85, precision: 0.90 }, 'sample-03': { recall: 0.80, precision: 0.70 } }
  : { 'sample-01': { recall: 0.30, precision: 0.45 }, 'sample-02': { recall: 0.10, precision: 0.15 }, 'sample-03': { recall: 0.00, precision: 0.00 } };

// ── Build a page containing the real pipeline slice of app.js ─────────
const appLines = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split('\n');
const lineOf = (prefix) => {
  const i = appLines.findIndex(l => l.startsWith(prefix));
  if (i === -1) throw new Error(`app.js marker not found: "${prefix}" -- update verify_ocr_test_kit.mjs if this code moved`);
  return i;
};
const aiStart = lineOf('const AIService = {');
const pipelineEnd = lineOf('function triggerTimetableImport');
const ttm = lineOf('function timeToMinutes');
const pipelineJs = [
  'window.__loadingMsgs = [];',
  'function getSubjectList() { return []; }',            // fresh student, no saved subjects
  'function safeGetStorage(k, d) { return d; }',
  appLines.slice(aiStart, pipelineEnd).join('\n'),
  appLines.slice(ttm, ttm + 6).join('\n'),
  'window.__ocr = { extractTimetableFromImage, AIService };'
].join('\n');
const keyScript = AI_MODE
  ? `<script src="/firebase-config.local.js"></script>
     <script>
       window.CAMPUS_OS_GEMINI_KEY = (window.ENV || {}).GEMINI_API_KEY || null;
       window.CAMPUS_OS_GROQ_KEY = (window.ENV || {}).GROQ_API_KEY || null;
       window.CAMPUS_OS_OPENROUTER_KEY = (window.ENV || {}).OPENROUTER_API_KEY || null;
     </script>`
  : '';
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body>${keyScript}<script src="/__pipeline.js"></script></body></html>`;

if (AI_MODE && !fs.existsSync(path.join(ROOT, 'firebase-config.local.js'))) {
  console.error('✗ --ai needs firebase-config.local.js with your AI keys.');
  process.exit(1);
}

// Serves ONLY the generated page, the kit images, and (in --ai mode) the
// local key file -- nothing else from the repo.
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
  if (url === '/') return send('text/html', pageHtml);
  if (url === '/__pipeline.js') return send('text/javascript', pipelineJs);
  if (AI_MODE && url === '/firebase-config.local.js') return send('text/javascript', fs.readFileSync(path.join(ROOT, 'firebase-config.local.js')));
  const m = url.match(/^\/images\/([\w.-]+\.(jpe?g|png))$/i);
  if (m && fs.existsSync(path.join(KIT, 'images', m[1]))) {
    return send(/png$/i.test(m[1]) ? 'image/png' : 'image/jpeg', fs.readFileSync(path.join(KIT, 'images', m[1])));
  }
  res.writeHead(404); res.end();
});

// ── Scoring (same rules as the kit's README describes) ────────────────
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const APP_DAY = { Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday' };
const toMin = (t) => {
  const m = String(t || '').match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = +m[1]; const mer = (m[3] || '').toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + (+m[2]);
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = [
  [['digitalelectronic', 'demp', 'dmp'], 'DEMP'], [['datastructure'], 'DS'], [['probability', 'pbst'], 'PBST'],
  [['business', 'bussiness', 'bmfa'], 'BMFA'], [['constitution', 'coi'], 'COI'], [['webdev', 'webdevelopment'], 'WD'],
  [['communityengagement'], 'CE'], [['openelective1', 'oe1'], 'OE-1'], [['openelective2', 'oe2'], 'OE-2'], [['multidisciplinary', 'mdm'], 'MDM']
];
const key = (s) => {
  const n = norm(s);
  for (const [needles, k] of ALIASES) if (needles.some(x => n.includes(x))) return k;
  return ({ ds: 'DS', wd: 'WD', ce: 'CE' })[n] || n || '?';
};

function score(expected, schedule) {
  const periods = new Map(expected.periods.filter(p => p.type === 'class').map(p => [p.period, [toMin(p.start), toMin(p.end)]]));
  const E = new Map(); const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);
  for (const d of DAYS) for (const slot of expected.grid[d] || []) for (const p of slot.periods) {
    if (!periods.has(p)) continue;
    for (const e of slot.entries) bump(E, `${d}|${p}|${key(e.subject_abbr)}`);
  }
  const vocab = new Set([...E.keys()].map(k => k.split('|')[2]));
  const canon = (row) => {
    for (const s of [row.subject, row.code]) {
      const k = key(s); if (vocab.has(k)) return k;
      for (const c of String(s || '').match(/\(([^)]+)\)/g) || []) { const ck = key(c); if (vocab.has(ck)) return ck; }
      const n = norm(s); const hit = [...vocab].filter(v => n.endsWith(v) || (v.length >= 3 && n.includes(v))).sort((a, b) => b.length - a.length)[0];
      if (hit) return hit;
    }
    return key(row.subject);
  };
  const G = new Map();
  for (const r of schedule) {
    const d = APP_DAY[r.day]; const s = toMin(r.time), e = toMin(r.end);
    if (!d || s === null || e === null) continue;
    for (const [p, [ps, pe]] of periods) if (pe > ps && Math.min(e, pe) - Math.max(s, ps) >= 0.5 * (pe - ps)) bump(G, `${d}|${p}|${canon(r)}`);
  }
  let matched = 0; for (const [k, v] of E) matched += Math.min(v, G.get(k) || 0);
  const totalE = [...E.values()].reduce((a, b) => a + b, 0), totalG = [...G.values()].reduce((a, b) => a + b, 0);
  const perDay = DAYS.map(d => {
    const miss = [], extra = []; let ok = 0, n = 0;
    for (const [k, v] of E) if (k.startsWith(d)) { n += v; const g = G.get(k) || 0; ok += Math.min(v, g); if (g < v) miss.push(k.split('|').slice(1).join(':')); }
    for (const [k, v] of G) if (k.startsWith(d) && v > (E.get(k) || 0)) extra.push(k.split('|').slice(1).join(':'));
    return `   ${d.slice(0, 3)}: ${ok}/${n}${miss.length ? '  missing ' + miss.join(', ') : ''}${extra.length ? '  extra ' + extra.join(', ') : ''}`;
  });
  return { recall: matched / Math.max(1, totalE), precision: totalG ? matched / totalG : 0, matched, totalE, totalG, perDay };
}

// ── Run ─────────────────────────────────────────────────────────────
console.log('==================================================================');
console.log(`🔬 OCR TEST-KIT ACCURACY: ${AI_MODE ? 'full pipeline incl. vision AI' : 'on-device scanner only (no AI calls)'}`);
console.log('==================================================================');

await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', m => {
  const t = m.text();
  logs.push(t);
  if (VERBOSE && /\[AIService\]|\[ExtractionPipeline\]/.test(t)) console.log('   · ' + redact(t.split('\n')[0]).slice(0, 180));
});
await page.goto(`http://127.0.0.1:${server.address().port}/`);

const samples = fs.readdirSync(path.join(KIT, 'expected-output'))
  .filter(f => /^sample-\d+\.json$/.test(f))
  .filter(f => !ONLY || f.startsWith(ONLY))
  .sort();
let passed = 0, failed = 0;
for (const file of samples) {
  const id = file.replace('.json', '');
  const expected = JSON.parse(fs.readFileSync(path.join(KIT, 'expected-output', file), 'utf8'));
  const image = expected.source_image;
  if (!fs.existsSync(path.join(KIT, 'images', image))) { console.error(`✗ [FAIL] ${id}: image ${image} missing from timetable-test-kit/images`); failed++; continue; }
  logs.length = 0;
  const t0 = Date.now();
  let result;
  try {
    result = await page.evaluate(async (url) => {
      const blob = await (await fetch(url)).blob();
      const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      return await window.__ocr.extractTimetableFromImage(dataUrl.split(',')[1], blob.type);
    }, `/images/${image}`);
  } catch (err) {
    console.error(`✗ [FAIL] ${id}: pipeline threw -- ${err.message}`); failed++; continue;
  }
  const s = score(expected, result?.schedule || []);
  const model = (logs.find(l => l.includes('Vision extraction succeeded with model')) || '').match(/model: ([\w.:/-]+)/);
  const floor = FLOORS[id] || { recall: 0, precision: 0 };
  const ok = s.recall >= floor.recall && s.precision >= floor.precision;
  const line = `${id}: recall ${s.matched}/${s.totalE} = ${(s.recall * 100).toFixed(0)}% (floor ${(floor.recall * 100).toFixed(0)}%), precision ${(s.precision * 100).toFixed(0)}% (floor ${(floor.precision * 100).toFixed(0)}%) -- ${((Date.now() - t0) / 1000).toFixed(1)}s${model ? `, AI model ${model[1]}` : AI_MODE ? ', AI not used/failed' : ''}`;
  if (ok) { console.log(`✓ [PASS] ${line}`); passed++; } else { console.error(`✗ [FAIL] ${line}`); failed++; }
  s.perDay.forEach(l => console.log(l));
}

await browser.close();
server.close();
console.log('========================================');
console.log(`TOTAL IMAGES CHECKED: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('========================================');
if (failed) process.exit(1);
