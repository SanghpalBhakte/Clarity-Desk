// =====================================================================
// UI Council — blind A/B pairs
// =====================================================================
// Copies each view's screenshot from two council rounds into one folder
// as A-<view>.png and B-<view>.png, randomly deciding per view which
// round is "A", and writes key.json so the result can be unblinded.
// Reviewers judge without knowing which one is the change.
//
//   node scripts/ui-council/pair.mjs --a <kept dir> --b <new dir> --out <dir>
// =====================================================================

import fs from 'fs';
import path from 'path';

const args = {};
process.argv.slice(2).forEach((a, i, all) => {
  if (a.startsWith('--')) args[a.slice(2)] = all[i + 1];
});
if (!args.a || !args.b || !args.out) {
  console.error('Usage: node scripts/ui-council/pair.mjs --a <kept dir> --b <new dir> --out <dir>');
  process.exit(1);
}

fs.mkdirSync(args.out, { recursive: true });
const key = {};
for (const file of fs.readdirSync(args.a).filter((f) => f.endsWith('.png'))) {
  if (!fs.existsSync(path.join(args.b, file))) continue;
  const view = file.replace(/\.png$/, '');
  const newIsA = Math.random() < 0.5;
  fs.copyFileSync(path.join(args.a, file), path.join(args.out, `${newIsA ? 'B' : 'A'}-${file}`));
  fs.copyFileSync(path.join(args.b, file), path.join(args.out, `${newIsA ? 'A' : 'B'}-${file}`));
  key[view] = { new: newIsA ? 'A' : 'B' };
}
fs.writeFileSync(path.join(args.out, 'key.json'), JSON.stringify(key, null, 2));
console.log(`Paired ${Object.keys(key).length} views into ${args.out}`);
