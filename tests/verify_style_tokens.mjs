// Polish guard (#459, docs/POLISH.md): new colours and type sizes come from tokens, not loose values.
// Counts raw hex colours and raw "font-size: Npx" used directly in a property of style.css (defining a
// --token is always fine). The counts may go down, never up. When a cleanup lowers one, lower the
// number here in the same PR.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAX = { hex: 43, fontPx: 72 };

const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const decls = css.split(/[;{}]/).map((d) => d.trim()).filter((d) => d.includes(':') && !d.startsWith('--') && !d.startsWith('@'));
const hex = decls.flatMap((d) => d.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
const fontPx = decls.filter((d) => /^font-size\s*:\s*[\d.]+px/.test(d)).length;

let fails = 0;
const check = (name, ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${msg}`}`); if (!ok) fails++; };
check('raw hex colours do not grow', hex <= MAX.hex, `${hex} > ${MAX.hex}. Use a --c2-* or Theme token instead of a new hex value.`);
check('raw px font sizes do not grow', fontPx <= MAX.fontPx, `${fontPx} > ${MAX.fontPx}. Use one of the agreed sizes through a token or an existing rule.`);
if (hex < MAX.hex || fontPx < MAX.fontPx) console.log(`note: counts fell to hex ${hex}, font-size px ${fontPx}; lower MAX in this file.`);
if (fails) process.exit(1);
console.log('Style token checks passed.');
