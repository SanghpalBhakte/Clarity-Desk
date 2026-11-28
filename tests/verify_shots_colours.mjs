// ui:shots contrast check (#479 retro): the browser reports colours as rgb()/rgba() with 0-255 channels,
// or as color(srgb r g b [/ a]) with 0-1 channels (color-mix() gives the second). Reading the second
// as 0-255 once made a light pink note count as near-black. This runs the colour reader from
// scripts/ui-council/shoot.mjs on one example of each.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(ROOT, 'scripts/ui-council/shoot.mjs'), 'utf8');
// The reader lives inside a function that runs in the page, so it is taken from the source as written.
const m = src.match(/const rgba = (\(s\) => \{[\s\S]*?\n {4}\});/);
let fails = 0;
const check = (name, ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${msg}`}`); if (!ok) fails++; };
check('colour reader found in shoot.mjs', !!m, 'the `const rgba = (s) => { … }` block moved; update this test');
if (!m) process.exit(1);
const rgba = (0, eval)(m[1]);
const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.01);

const cases = [
  ['rgb()', 'rgb(46, 52, 40)', [46, 52, 40]],
  ['rgba()', 'rgba(46, 52, 40, 0.5)', [46, 52, 40, 0.5]],
  ['color(srgb)', 'color(srgb 0.972078 0.938196 0.920157)', [247.88, 239.24, 234.64]],
  ['color(srgb / a)', 'color(srgb 0.5 0.25 1 / 0.4)', [127.5, 63.75, 255, 0.4]],
];
for (const [name, input, want] of cases) {
  const got = rgba(input);
  check(`reads ${name}`, near(got, want), `${input} gave [${got.join(', ')}], want [${want.join(', ')}]`);
}
if (fails) process.exit(1);
console.log('ui:shots colour reader checks passed.');
