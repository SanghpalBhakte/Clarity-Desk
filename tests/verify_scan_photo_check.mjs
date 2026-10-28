// ==================================================================
// Clarity Desk: PHOTO CHECK BEFORE A SCAN (real pixels, headless Chromium)
// ==================================================================
// Runs app.js's real scanPhotoProblem on every test-kit image (timetable,
// practice and attendance kits). Each one scans fine today, so none may be
// flagged; blurred and shrunk copies of the same images must be flagged.
// Needs Chromium: `npx playwright install chromium` (CI does this).
//
//   node tests/verify_scan_photo_check.mjs
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');
const start = appSrc.indexOf('const SCAN_PHOTO_MIN_DETAIL');
const end = appSrc.indexOf('// Shows the reason from scanPhotoProblem');
if (start < 0 || end < start) {
  console.error('✗ could not find scanPhotoProblem in app.js');
  process.exit(1);
}
const checkSrc = appSrc.slice(start, end);

const KIT_DIRS = ['timetable-test-kit/images', 'scanner-practice-kit/images', 'scanner-practice-kit/attendance/images'];
const images = KIT_DIRS.flatMap(dir => fs.readdirSync(`${ROOT}/${dir}`)
  .filter(f => /\.(png|jpe?g)$/i.test(f))
  .map(f => ({ name: f, url: `data:${/png$/i.test(f) ? 'image/png' : 'image/jpeg'};base64,${fs.readFileSync(`${ROOT}/${dir}/${f}`).toString('base64')}` })));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: `${checkSrc}\nwindow.scanPhotoProblem = scanPhotoProblem;` });

// Redraws an image with a canvas filter and/or a new size, as a JPEG.
// A 'blur(Npx)' filter is scaled to the image so it equals N px at the
// 1000px the check reads at (a 2px blur on a 4000px photo barely shows).
const variant = (url, filter, maxSide) => page.evaluate(async ({ url, filter, maxSide }) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const s = maxSide ? Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  const ctx = c.getContext('2d');
  const k = Math.max(1, Math.max(img.naturalWidth, img.naturalHeight) / 1000);
  if (filter) ctx.filter = filter.replace(/blur\((\d+)px\)/, (_, n) => `blur(${n * k}px)`);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}, { url, filter, maxSide });
const problem = (url) => page.evaluate(u => window.scanPhotoProblem(u), url);

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`✓ [PASS] ${name}`); }
  else { failures.push(name); console.error(`✗ [FAIL] ${name}: ${detail}`); }
}

for (const img of images) {
  const asIs = await problem(img.url);
  check(`${img.name}: scans fine, not flagged`, asIs === null, asIs);
  const blurred = await problem(await variant(img.url, 'blur(2px)'));
  check(`${img.name}: blurred copy is flagged`, /blurry/.test(blurred || ''), blurred);
  const tiny = await problem(await variant(img.url, '', 400));
  check(`${img.name}: 400px copy is flagged`, /small/.test(tiny || ''), tiny);
}
check('an unreadable image never blocks the scan', (await problem('data:image/png;base64,AAAA')) === null, 'flagged');

await browser.close();
console.log(`\nPHOTO CHECK: ${passed}/${passed + failures.length} passed`);
if (failures.length) process.exit(1);
