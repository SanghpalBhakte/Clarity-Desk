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
  again.eval('cloudPushFailed = "unavailable"');
  check('Signed in but the last sync failed: the Backup date again, not a promise', () => again.lastBackupLine() === 'Last backup: 10 Nov 2026' || again.lastBackupLine());
  const damaged = loadApp(NAMES, { store: { cos_last_backup: J('not a date') } });
  check('A damaged value reads as never', () => damaged.lastBackupLine() === 'Last backup: never' || damaged.lastBackupLine());
}

console.log('\nBackup reminder (#436): when it is due');
{
  const app = loadApp(['backupNudgeDue']);
  const base = { signedIn: false, today: '2026-11-10', firstSeen: '2026-11-03', marks: 10, tasks: 0, lastBackup: null, lastNudge: null };
  const due = (o) => app.backupNudgeDue({ ...base, ...o });
  check('All conditions hold: due', () => due({}) === true);
  check('Signed in: not due', () => due({ signedIn: true }) === false);
  check('6 days since first open: not yet', () => due({ firstSeen: '2026-11-04' }) === false);
  check('First open unknown: not due', () => due({ firstSeen: null }) === false);
  check('9 marks and 2 tasks: not enough data yet', () => due({ marks: 9, tasks: 2 }) === false);
  check('3 tasks and no marks: enough', () => due({ marks: 0, tasks: 3 }) === true);
  check('Backup 29 days ago: not due', () => due({ lastBackup: '2026-10-12' }) === false);
  check('Backup 30 days ago: due', () => due({ lastBackup: '2026-10-11' }) === true);
  check('Reminded 29 days ago: not again', () => due({ lastNudge: '2026-10-12' }) === false);
  check('Reminded 30 days ago: due again', () => due({ lastNudge: '2026-10-11' }) === true);
}

console.log('\nBackup reminder: shown once, as a toast');
{
  const marks = { '2026-11-03': { A_0900: 'attended', B_1000: 'attended', C_1100: 'skipped' }, '2026-11-04': { A_0900: 'attended', B_1000: 'attended', C_1100: 'attended' },
    '2026-11-05': { A_0900: 'attended', B_1000: 'attended', C_1100: 'attended', D_1200: 'cancelled' } };
  const seeded = { cos_first_seen: J('2026-11-01'), cos_attendance: J(marks) };
  const make = (store = seeded) => {
    const app = loadApp(['maybeShowBackupNudge', 'noteFirstSeen'], { store: { ...store } });
    app.eval('globalThis.__toasts = []; showToast = (msg, type, opts) => { globalThis.__toasts.push({ msg, opts }); }; exportData = () => { globalThis.__exported = (globalThis.__exported || 0) + 1; }; state.currentPage = "dashboard"');
    return app;
  };
  let app = make();
  app.maybeShowBackupNudge();
  const t = globalThis.__toasts;
  check('Due: one toast with a "Back up now" button', () => t.length === 1 && t[0].msg === 'Everything here is saved only on this phone.' && t[0].opts?.action?.label === 'Back up now' || J(t));
  check('...not a sticky one', () => !t[0]?.opts?.sticky || 'sticky');
  check('Showing it counts as shown', () => String(app.store.cos_backup_nudge).includes('2026-11-10') || String(app.store.cos_backup_nudge));
  t[0]?.opts?.action?.fn();
  check('"Back up now" makes a Backup', () => globalThis.__exported === 1 || globalThis.__exported);
  app.maybeShowBackupNudge();
  check('Not shown twice', () => globalThis.__toasts.length === 1 || globalThis.__toasts.length);
  app = make({ ...app.store });
  app.maybeShowBackupNudge();
  check('Not again after a reload', () => globalThis.__toasts.length === 0 || globalThis.__toasts.length);

  app = make({ ...seeded, cos_cloud_signed_in: 'true' });
  app.maybeShowBackupNudge();
  check('Was signed in last time (before sign-in has loaded): no toast', () => globalThis.__toasts.length === 0 || globalThis.__toasts.length);
  app = make();
  app.eval('state.currentPage = "settings"');
  app.maybeShowBackupNudge();
  check('Only on Today', () => globalThis.__toasts.length === 0 || globalThis.__toasts.length);
  app = make();
  app.eval('const realQ = document.querySelector.bind(document); document.querySelector = (s) => String(s).includes("#tour-root") ? {} : realQ(s)');
  app.maybeShowBackupNudge();
  check('Never during the tour', () => globalThis.__toasts.length === 0 || globalThis.__toasts.length);

  const fresh = loadApp(['noteFirstSeen'], { store: {} });
  fresh.noteFirstSeen();
  check('First open is recorded on this phone the first time', () => String(fresh.store.cos_first_seen).includes('2026-11-10') || String(fresh.store.cos_first_seen));
  const counted = loadApp(['noteFirstSeen'], { store: { cos_usage: J({ firstOpen: '2026-09-01' }) } });
  counted.noteFirstSeen();
  check('...as today even when an older usage first-open day exists (a current student waits a week too)', () => String(counted.store.cos_first_seen).includes('2026-11-10') || String(counted.store.cos_first_seen));
  const kept = loadApp(['noteFirstSeen'], { store: { cos_first_seen: J('2026-10-01') } });
  kept.noteFirstSeen();
  check('...and never moved later', () => String(kept.store.cos_first_seen).includes('2026-10-01') || String(kept.store.cos_first_seen));
}

console.log(`\nPASSED: ${passed}/${total}`);
if (passed !== total) process.exit(1);
