// ==================================================================
// Clarity Desk: ./?timing LOAD BREAKDOWN
// ==================================================================
// A diagnostic for slow first visits on phones: opening the app as
// ./?timing shows what the visit waited on. Locked down here:
//  - it only runs when ?timing is in the address;
//  - it saves nothing and sends nothing (no storage, no network calls);
//  - init() marks when the app is ready, which the report reads.
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
let total = 0, passed = 0;
function check(name, ok) {
  total++;
  if (ok === true) { passed++; console.log(`✓ [PASS] ${name}`); }
  else console.error(`✗ [FAIL] ${name}${ok ? ': ' + ok : ''}`);
}

console.log('⏱  ?timing LOAD BREAKDOWN');
const start = app.indexOf('function showTimingReport()');
const body = start > -1 ? app.slice(start, app.indexOf('\n}\n', start)) : '';
check('showTimingReport() exists', body.length > 0 || 'not found');
check('It saves nothing and sends nothing', !/localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon|XMLHttpRequest|trackUsage|caches\./.test(body) || 'storage or network call inside');
const initEnd = app.slice(app.indexOf('function init() {'), app.indexOf("document.addEventListener('DOMContentLoaded', init);"));
const guard = (initEnd.match(/if \(new URLSearchParams\(location\.search\)\.has\('timing'\)\) \{[\s\S]*?\n  \}/) || [''])[0];
check('It only runs when ?timing is in the address',
  (guard.match(/setTimeout\(showTimingReport, /g) || []).length === 2 && (app.match(/showTimingReport/g) || []).length === 3 || 'called outside the ?timing check');
check("init() marks 'cd-app-ready' for the report", initEnd.includes("performance.mark('cd-app-ready')") && body.includes("'cd-app-ready'") || 'mark missing');
check('Report text is escaped before it goes on screen', body.includes('escHtml_cd(text)') || 'unescaped');

console.log(`\nTIMING VIEW: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
