// Settings Today picture (#479, docs/ARCHITECTURE.md): the picture is a copy of Today, so every Today
// style rule is written `:is(#page-dashboard, .today-preview) …`. A rule that names #page-dashboard alone
// styles Today but not the picture, and the two quietly drift apart. This check finds those rules.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAIR = ':is(#page-dashboard, .today-preview)';

// Lines of style.css (comments blanked, line numbers kept) that name #page-dashboard outside the pair.
function loneSelectors(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  return noComments.split('\n')
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => /#page-dashboard(?![\w-])/.test(line.split(PAIR).join('')));
}

let fails = 0;
const check = (name, ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${msg}`}`); if (!ok) fails++; };

// The check itself: it must catch a lone selector and pass the pair and comments.
check('catches a lone #page-dashboard rule', loneSelectors('#page-dashboard .c2-now { color: red; }').length === 1, 'missed it');
check('passes the pair and comments', loneSelectors(`${PAIR} .c2-now { color: red; }\n/* #page-dashboard */`).length === 0, 'flagged a good rule');

const found = loneSelectors(fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8'));
check('every Today rule also styles the Settings picture', found.length === 0,
  `write these as ${PAIR} …:\n${found.map(({ n, line }) => `  style.css:${n}: ${line.trim().slice(0, 120)}`).join('\n')}`);
if (fails) process.exit(1);
console.log('Today picture selector checks passed.');
