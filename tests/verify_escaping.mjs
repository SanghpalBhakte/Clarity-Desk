// ==================================================================
// Clarity Desk: STUDENT TEXT IS SHOWN AS TEXT (AUDIT #5)
// ==================================================================
// Task titles, subjects, rooms and notes come from typing, WhatsApp
// imports, photo scans, backups and other devices. Pages are built from
// HTML strings, so each of those values must go through escHtml_cd /
// escAttr_cd, or jsArg_cd inside an inline onclick. Locked down here:
//  - jsArg_cd survives apostrophes, quotes and markup (decoded the way a
//    browser decodes an attribute, it is one JS string with the same text);
//  - the raw forms that used to be in the templates do not come back.
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const scanners = fs.readFileSync(path.join(ROOT, 'scanners.js'), 'utf8');
let total = 0, passed = 0;
function check(name, ok) {
  total++;
  if (ok === true) { passed++; console.log(`✓ [PASS] ${name}`); }
  else console.error(`✗ [FAIL] ${name}${ok ? ': ' + ok : ''}`);
}
const fnSrc = (name) => {
  const i = app.indexOf(`function ${name}(`);
  return i < 0 ? '' : app.slice(i, app.indexOf('\n}\n', i) + 2);
};

console.log('🛡  STUDENT TEXT IS SHOWN AS TEXT');
const { escHtml_cd, escAttr_cd, jsArg_cd } = new Function(`${fnSrc('escHtml_cd')}${fnSrc('escAttr_cd')}${fnSrc('jsArg_cd')} return { escHtml_cd, escAttr_cd, jsArg_cd };`)();
const decodeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

for (const v of ["Women's Studies", 'Say "hi"', '<img src=x onerror=alert(1)>', "'); alert(1); ('", 'a\\b', 'R&D', '', null]) {
  const out = jsArg_cd(v);
  let got;
  try { got = new Function('f', `return f(${decodeAttr(out)});`)((x) => x); } catch (e) { got = `threw ${e.message}`; }
  check(`jsArg_cd keeps ${JSON.stringify(v)} as one string`, got === String(v ?? '') || `got ${JSON.stringify(got)}`);
  check(`jsArg_cd ${JSON.stringify(v)} cannot end the attribute`, !/["<>]/.test(out) || out);
}
check('escAttr_cd escapes quotes and markup', escAttr_cd(`<a href="x">'`) === '&lt;a href=&quot;x&quot;&gt;&#39;');

// Raw forms that used to put student text straight into the page.
const RAW = [
  [/>\$\{a\.title\}</, 'task title as raw HTML'],
  [/"assignment-desc">\$\{a\.description\}/, 'task description as raw HTML'],
  [/openSubjectHub\('\$\{/, "openSubjectHub('${…}') (breaks on an apostrophe)"],
  [/AttendanceAction\('\$\{subj\./, "logSubjectAttendanceAction('${subj…}')"],
  [/showBaselineModal\('\$\{subj\./, "showBaselineModal('${subj…}')"],
  [/showAssignmentModal\(null, '\$\{subj\./, "showAssignmentModal(null, '${subj.name}')"],
  [/"tt-note">\$\{c\.notes\}/, 'timetable note as raw HTML'],
  [/<strong>\$\{c\.room\}<\/strong>/, 'room as raw HTML'],
  [/aria-label="Mark \$\{c\.subject\}/, 'subject raw in an aria-label'],
  [/>\$\{n\.title\}</, 'notice title as raw HTML'],
  [/>\$\{s\.name\}</, 'subject name as raw HTML'],
];
for (const [re, what] of RAW) {
  const hits = app.split('\n').map((l, i) => re.test(l) ? i + 1 : 0).filter(Boolean);
  check(`app.js: no ${what}`, hits.length === 0 || `lines ${hits.join(', ')}`);
}
check('scanners.js: subject options are escaped', !/<option value="\$\{(s\.name|r\.subject)\}/.test(scanners) || 'raw option value');

console.log(`\nESCAPING: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
