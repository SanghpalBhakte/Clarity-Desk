// The line shown on the attendance toast and the live class row: "82% · can miss 3".
// Display only: reads counts, writes nothing. Pure helper, so it is cut out of app.js and run directly.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const m = src.match(/function attendanceStandingLine\(a\) \{[\s\S]*?\n\}\n/);
if (!m) { console.log('✗ [FAIL] attendanceStandingLine not found'); process.exit(1); }
const standing = new Function(`${m[0]}; return attendanceStandingLine;`)();

let failed = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? '✓ [PASS]' : '✗ [FAIL]'} ${name}${ok ? '' : `\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

eq('safe with a buffer', standing({ pct: 82, pctLabel: '82', isSafe: true, safeSkips: 3, targetPct: 75 }), '82% · can miss 3');
eq('safe, no buffer yet', standing({ pct: 75, pctLabel: '75', isSafe: true, safeSkips: 0, targetPct: 75 }), '75% · on target');
eq('below the line', standing({ pct: 71, pctLabel: '71', isSafe: false, classesToAttend: 4, targetPct: 75 }), '71% · attend the next 4 to reach 75%');
eq('uses the subject own target', standing({ pct: 71, pctLabel: '71', isSafe: false, classesToAttend: 2, targetPct: 70 }), '71% · attend the next 2 to reach 70%');
eq('decimal label wins over the rounded number', standing({ pct: 82, exactPct: 81.6, pctLabel: '81.6', isSafe: true, safeSkips: 1, targetPct: 75 }), '81.6% · can miss 1');
eq('falls back to exactPct, then pct', standing({ pct: 82, exactPct: 81.6, isSafe: true, safeSkips: 1, targetPct: 75 }), '81.6% · can miss 1');
eq('unreachable shows just the percentage', standing({ pct: 40, pctLabel: '40', isSafe: false, classesToAttend: null, targetPct: 100 }), '40%');
eq('a very long climb shows just the percentage', standing({ pct: 30, pctLabel: '30', isSafe: false, classesToAttend: 90, targetPct: 75 }), '30%');
eq('no counts yet: nothing', standing({ pct: null, isSafe: null, targetPct: 75 }), '');
eq('missing result: nothing', standing(null), '');
eq('zero is a real percentage', standing({ pct: 0, pctLabel: '0', isSafe: false, classesToAttend: 3, targetPct: 75 }), '0% · attend the next 3 to reach 75%');

eq('two-decimal labels lose trailing zeros', standing({ pct: 75, pctLabel: '75.00', isSafe: true, safeSkips: 0, targetPct: 75 }), '75% · on target');
eq('keeps a real decimal', standing({ pct: 81, pctLabel: '81.60', isSafe: true, safeSkips: 2, targetPct: 75 }), '81.6% · can miss 2');

// The write path must stay as it was: the helper never touches storage.
const body = m[0];
eq('helper does not write', /safeSetStorage|localStorage|setItem/.test(body), false);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\n🏆 ALL ATTENDANCE STANDING TESTS PASSED');
