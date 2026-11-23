// ==================================================================
// Clarity Desk: "Last backup" line in Settings (#434)
// ==================================================================
// Making a Backup records the day on this phone only (cos_last_backup):
// Settings says "Last backup: never" or the date, or "Saved to your
// account" when signed in. The Backup file itself does not change, so
// restore stays exactly as it was.
// ==================================================================
import { loadApp } from './app-loader.mjs';

let passed = 0, total = 0;
const check = (name, fn) => {
  total++;
  let r; try { r = fn(); } catch (e) { r = e.message; }
  if (r === true) { passed++; console.log(`  ✓ ${name}`); } else console.error(`  ✗ ${name} -- ${r}`);
};
const J = JSON.stringify;
const NAMES = ['lastBackupLine', 'downloadBackupFile', 'deskBackupSnapshot'];

console.log('\n"Last backup" line');
{
  const app = loadApp(NAMES);
  check('A fresh desk says "Last backup: never"', () => app.lastBackupLine() === 'Last backup: never' || app.lastBackupLine());
  const before = J(app.deskBackupSnapshot());
  app.downloadBackupFile({ profile: {} });
  check('Making a Backup records today on this phone', () => String(app.store.cos_last_backup).includes('2026-11-10') || String(app.store.cos_last_backup));
  check('...and the line shows the date', () => app.lastBackupLine() === 'Last backup: 10 Nov 2026' || app.lastBackupLine());
  check('The Backup file does not carry it (same contents as before)', () => J(app.deskBackupSnapshot()) === before || 'snapshot changed');
  const again = loadApp(NAMES, { store: { ...app.store } });
  check('Still shown after a reload', () => again.lastBackupLine() === 'Last backup: 10 Nov 2026' || again.lastBackupLine());
  again.eval('currentUser = { uid: "u1" }');
  check('Signed in: "Saved to your account"', () => again.lastBackupLine() === 'Saved to your account' || again.lastBackupLine());
  const damaged = loadApp(NAMES, { store: { cos_last_backup: J('not a date') } });
  check('A damaged value reads as never', () => damaged.lastBackupLine() === 'Last backup: never' || damaged.lastBackupLine());
}

console.log(`\nPASSED: ${passed}/${total}`);
if (passed !== total) process.exit(1);
