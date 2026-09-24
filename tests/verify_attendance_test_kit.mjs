// ==================================================================
// Clarity Desk: ATTENDANCE SCAN TEST-KIT ACCURACY (real pipeline)
// ==================================================================
// Runs the REAL attendance scanner from app.js -- real preprocessing, real
// Tesseract.js, the real vision-AI call when enabled -- in headless
// Chromium on each image in attendance-practice-kit/images that has a
// hand-checked answer in attendance-practice-kit/expected-output.
//
// Scores per course row: found (matched by course code, O/0 tolerant, or
// exact name, or a code one character off with the closest name -- so a
// single misread letter counts against the numbers, not as a lost row),
// and each of present / absent / leave / notEntered /
// totalSessions read correctly. Extra rows and rows flagged for review are
// reported too.
//
//   npm run test:attendance-kit      on-device scanner only; no API calls
//   npm run test:attendance-kit:ai   full pipeline through the live AI proxy
//   extra flags: --proxy <url>, --provider <gemini|groq|openrouter|workersai>,
//                --models <id,id>, --verbose
//
// The kit holds a real student's attendance and faculty names, so it is
// kept out of git and off the website; without it this test skips.
// ==================================================================
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const KIT = path.join(ROOT, 'attendance-practice-kit');
const argAfter = (flag) => { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : null; };
const PROXY = argAfter('--proxy');
const FORCE_PROVIDER = argAfter('--provider');
const FORCE_MODELS = argAfter('--models') ? argAfter('--models').split(',') : null;
const VERBOSE = process.argv.includes('--verbose');
const AI_MODE = !!PROXY;

// Regression floors, set just under what was measured when this test was
// written (see the commit that added it). Raise them as scans improve.
const FLOORS = AI_MODE
  ? { 'sample-01': { found: 0.9, fields: 0.9, extra: 1 } }     // measured 100% / 100% / 0 (Gemini flash-lite, Workers AI Mistral)
  : { 'sample-01': { found: 0.0, fields: 0.0, extra: 99 } };   // measured 0%: on-device OCR can't read this photo -- a crash check only

if (!fs.existsSync(path.join(KIT, 'expected-output'))) {
  console.log('⏭  attendance-practice-kit/expected-output not found -- skipping (the kit is kept local; see this file\'s header).');
  process.exit(0);
}

// ── Page with the real attendance pipeline sliced out of app.js ───────
const appLines = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split('\n');
const lineOf = (prefix) => {
  const i = appLines.findIndex(l => l.startsWith(prefix));
  if (i === -1) throw new Error(`app.js marker not found: "${prefix}" -- update verify_attendance_test_kit.mjs if this code moved`);
  return i;
};
const pipelineJs = [
  'function getSubjectList() { return []; }',            // fresh student, no saved subjects
  'function safeGetStorage(k, d) { return d; }',
  appLines.slice(lineOf('const AIService = {'), lineOf('function triggerTimetableImport')).join('\n'),
  appLines.slice(lineOf('function preprocessAttendanceImageForOCR'), lineOf('function showAttendanceScanReviewModal')).join('\n'),
  `window.__scan = async (base64Data, mimeType) => {
     const preprocessed = await preprocessAttendanceImageForOCR(base64Data, mimeType);
     const worker = await getTesseractWorker();
     const ocr = await worker.recognize(preprocessed);
     const visionDataUrl = await reencodeDataUrl(preprocessed, mimeType, 0.92);
     return await extractAttendanceRowsFromOCR(ocr?.data, visionDataUrl.split(',')[1], mimeType);
   };
   window.__AIService = AIService;`
].join('\n');
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body>${PROXY ? `<script>window.CAMPUS_OS_AI_PROXY = ${JSON.stringify(PROXY)};</script>` : ''}<script src="/__pipeline.js"></script></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
  if (url === '/') return send('text/html', pageHtml);
  if (url === '/__pipeline.js') return send('text/javascript', pipelineJs);
  const m = url.match(/^\/images\/([\w.-]+\.(jpe?g|png))$/i);
  if (m && fs.existsSync(path.join(KIT, 'images', m[1]))) {
    return send(/png$/i.test(m[1]) ? 'image/png' : 'image/jpeg', fs.readFileSync(path.join(KIT, 'images', m[1])));
  }
  res.writeHead(404); res.end();
});

// ── Scoring ───────────────────────────────────────────────────────────
const FIELDS = ['present', 'absent', 'leave', 'notEntered', 'totalSessions'];
const codeKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function score(expected, rows) {
  const unmatched = new Set(expected.rows.map((_, i) => i));
  const pairs = [];
  const extra = [];
  for (const r of rows) {
    let hit = [...unmatched].find(i => codeKey(expected.rows[i].code) && codeKey(expected.rows[i].code) === codeKey(r.code));
    if (hit === undefined) hit = [...unmatched].find(i => nameKey(expected.rows[i].subject) === nameKey(r.subject));
    if (hit === undefined && codeKey(r.code)) {
      const near = [...unmatched].filter(i => editDistance(codeKey(expected.rows[i].code), codeKey(r.code)) <= 1)
        .sort((a, b) => editDistance(nameKey(expected.rows[a].subject), nameKey(r.subject)) - editDistance(nameKey(expected.rows[b].subject), nameKey(r.subject)));
      if (near.length) hit = near[0];
    }
    if (hit === undefined) { extra.push(r); continue; }
    unmatched.delete(hit);
    pairs.push([expected.rows[hit], r]);
  }
  let fieldsOk = 0;
  const wrong = [];
  for (const [e, r] of pairs) for (const f of FIELDS) {
    if (Number(r[f]) === e[f]) fieldsOk++;
    else wrong.push(`${e.code} ${f}: got ${r[f]}, expected ${e[f]}`);
  }
  return {
    found: pairs.length / expected.rows.length,
    fields: fieldsOk / (expected.rows.length * FIELDS.length),
    extra: extra.length,
    flagged: rows.filter(r => r.isUncertain).length,
    missing: [...unmatched].map(i => expected.rows[i].code),
    wrong, extraRows: extra.map(r => `${r.code || '?'} ${r.subject || '?'}`)
  };
}

// ── Run ─────────────────────────────────────────────────────────────
console.log('==================================================================');
console.log(`📋 ATTENDANCE TEST-KIT ACCURACY: ${PROXY ? `full pipeline via AI proxy ${PROXY}` : 'on-device scanner only (no AI calls)'}`);
console.log('==================================================================');

await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', m => {
  const t = m.text();
  logs.push(t);
  if (VERBOSE && /\[AIService\]|\[Attendance/.test(t)) console.log('   · ' + t.split('\n')[0].slice(0, 180));
});
if (PROXY) {
  // Same trick as the timetable kit: open the page at the real site address
  // so the live proxy sees the Origin a student's browser sends.
  const SITE = 'https://campusos-83365.web.app';
  await page.route(`${SITE}/**`, async (route) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await r.arrayBuffer()) });
  });
  await page.goto(`${SITE}/`);
} else {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
}
if (FORCE_PROVIDER) {
  await page.evaluate(([provider, models]) => {
    const AI = window.__AIService;
    const legs = { gemini: 'generateContentFromImage', groq: 'callGroqVision', openrouter: 'callOpenRouterVision', workersai: 'callWorkersAIVision' };
    const off = async () => { throw new Error('skipped (--provider)'); };
    for (const [name, method] of Object.entries(legs)) if (name !== provider) AI[method] = off;
    if (models) {
      if (provider === 'gemini') AI.getModelsList = () => models;
      if (provider === 'groq') AI.GROQ_VISION_MODEL = models[0];
      if (provider === 'openrouter') AI.OPENROUTER_VISION_MODELS = models;
      if (provider === 'workersai') AI.WORKERS_AI_VISION_MODELS = models;
    }
  }, [FORCE_PROVIDER, FORCE_MODELS]);
  console.log(`(vision limited to ${FORCE_PROVIDER}${FORCE_MODELS ? ': ' + FORCE_MODELS.join(', ') : ''})`);
}

const samples = fs.readdirSync(path.join(KIT, 'expected-output')).filter(f => /^sample-\d+\.json$/.test(f)).sort();
let passed = 0, failed = 0;
for (const file of samples) {
  const id = file.replace('.json', '');
  const expected = JSON.parse(fs.readFileSync(path.join(KIT, 'expected-output', file), 'utf8'));
  logs.length = 0;
  const t0 = Date.now();
  let rows;
  try {
    rows = await page.evaluate(async (url) => {
      const blob = await (await fetch(url)).blob();
      const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      return await window.__scan(dataUrl.split(',')[1], blob.type);
    }, `/images/${expected.source_image}`);
  } catch (err) {
    console.error(`✗ [FAIL] ${id}: pipeline threw -- ${err.message}`); failed++; continue;
  }
  const s = score(expected, rows || []);
  const okLine = logs.find(l => /Vision extraction succeeded with/.test(l)) || '';
  const model = okLine.match(/model: ([@\w.:/-]+)/) || (okLine.includes('with Groq') ? [null, 'Groq'] : null);
  const floor = FLOORS[id] || { found: 0, fields: 0, extra: 99 };
  const ok = s.found >= floor.found && s.fields >= floor.fields && s.extra <= floor.extra;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const line = `${id}: rows found ${pct(s.found)} (floor ${pct(floor.found)}), numbers right ${pct(s.fields)} (floor ${pct(floor.fields)}), extra rows ${s.extra}, flagged for review ${s.flagged} -- ${((Date.now() - t0) / 1000).toFixed(1)}s${model ? `, AI model ${model[1]}` : AI_MODE ? ', AI not used/failed' : ''}`;
  if (ok) { console.log(`✓ [PASS] ${line}`); passed++; } else { console.error(`✗ [FAIL] ${line}`); failed++; }
  if (s.missing.length) console.log(`   missing: ${s.missing.join(', ')}`);
  if (s.wrong.length) console.log(`   wrong: ${s.wrong.slice(0, 12).join('; ')}${s.wrong.length > 12 ? ' …' : ''}`);
  if (s.extraRows.length) console.log(`   extra: ${s.extraRows.slice(0, 8).join('; ')}`);
}

await browser.close();
server.close();
console.log('========================================');
console.log(`TOTAL IMAGES CHECKED: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('========================================');
if (failed) process.exit(1);
