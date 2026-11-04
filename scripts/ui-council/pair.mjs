// =====================================================================
// UI Council — blind A/B contact sheets
// =====================================================================
// For each view shot in two council rounds, randomly decides which round
// is "A", and lays the pairs out on a few contact sheets (two phone views
// per sheet, one laptop view per sheet), so the reviewer reads 2-4 images
// instead of a dozen. Views whose PNGs are byte-identical in both rounds
// are skipped and listed as unchanged. The key goes to <out>.key.json,
// beside the folder, so a reviewer listing the folder can't unblind.
//
//   node scripts/ui-council/pair.mjs --a <kept dir> --b <new dir> --out <dir>
//     Writes <out>/sheet.html, then screenshots each sheet to
//     <out>/sheet-N.png with Chromium.
//   ... --mcp
//     When Chromium can't start (the Claude Code Bash sandbox): writes
//     <out>/sheet-job.js instead, for the Playwright MCP tool
//     (browser_run_code_unsafe with `filename`), against the 4179 server.
// =====================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = {};
process.argv.slice(2).forEach((a, i, all) => {
  if (a.startsWith('--')) args[a.slice(2)] = all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true;
});
if (!args.a || !args.b || !args.out) {
  console.error('Usage: node scripts/ui-council/pair.mjs --a <kept dir> --b <new dir> --out <dir> [--mcp] [--port 4179]');
  process.exit(1);
}
const OUT = path.resolve(args.out);
fs.mkdirSync(OUT, { recursive: true });

const key = {};
const unchanged = [];
const phone = [];
const other = [];
for (const file of fs.readdirSync(args.a).filter((f) => f.endsWith('.png')).sort()) {
  const bFile = path.join(args.b, file);
  if (!fs.existsSync(bFile)) continue;
  const view = file.replace(/\.png$/, '');
  const aBuf = fs.readFileSync(path.join(args.a, file));
  const bBuf = fs.readFileSync(bFile);
  if (aBuf.equals(bBuf)) { unchanged.push(view); continue; }
  const newIsA = Math.random() < 0.5;
  fs.writeFileSync(path.join(OUT, `${newIsA ? 'B' : 'A'}-${file}`), aBuf);
  fs.writeFileSync(path.join(OUT, `${newIsA ? 'A' : 'B'}-${file}`), bBuf);
  key[view] = { new: newIsA ? 'A' : 'B' };
  (view.includes('mobile') ? phone : other).push(view);
}

// Sheets: phone views two to a sheet (A|B A|B), other views one each.
const sheets = [];
for (let i = 0; i < phone.length; i += 2) sheets.push(phone.slice(i, i + 2));
other.forEach((v) => sheets.push([v]));
const cell = (v) => {
  const w = v.includes('mobile') ? 300 : 680;
  return `<figure><figcaption>${v}</figcaption><div class="ab">${['A', 'B'].map((s) => `<div><b>${s}</b><img width="${w}" src="${s}-${v}.png"></div>`).join('')}</div></figure>`;
};
fs.writeFileSync(path.join(OUT, 'sheet.html'), `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#888;font:600 15px system-ui}.sheet{display:inline-flex;gap:24px;padding:12px;background:#888}
figure{margin:0}figcaption{color:#fff;margin-bottom:6px}.ab{display:flex;gap:8px}.ab b{display:block;color:#fff;font-size:20px}
img{display:block;height:auto;outline:1px solid #222}</style>
${sheets.map((s) => `<div class="sheet">${s.map(cell).join('')}</div>`).join('<br>')}\n`);

const keyFile = `${OUT.replace(/\/+$/, '')}.key.json`;
fs.writeFileSync(keyFile, JSON.stringify(key, null, 2));
console.log(`Paired ${Object.keys(key).length} views on ${sheets.length} sheets (key: ${path.relative(ROOT, keyFile)})`);
if (unchanged.length) console.log(`Unchanged, not sent to review: ${unchanged.join(', ')}`);

// Screenshot each .sheet element to <out>/sheet-N.png.
async function shootSheets(browser, url, out) {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  const n = await page.locator('.sheet').count();
  for (let i = 0; i < n; i++) await page.locator('.sheet').nth(i).screenshot({ path: `${out}/sheet-${i + 1}.png` });
  await page.close();
  return `${n} sheets`;
}

if (sheets.length) {
  const rel = path.relative(ROOT, OUT).split(path.sep).join('/');
  if (args.mcp) {
    const url = `http://127.0.0.1:${args.port || '4179'}/${rel}/sheet.html`;
    const job = path.join(OUT, 'sheet-job.js');
    fs.writeFileSync(job, `async (page) => (${shootSheets.toString()})(page.context().browser(), ${JSON.stringify(url)}, ${JSON.stringify(OUT)})\n`);
    console.log(`Run with browser_run_code_unsafe filename: ${rel}/sheet-job.js`);
  } else {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    try {
      console.log(await shootSheets(browser, `file://${OUT}/sheet.html`, OUT));
    } finally {
      await browser.close();
    }
  }
}
