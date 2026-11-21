// ==================================================================
// Clarity Desk: every dataset survives each trip (issue #406)
// ==================================================================
// The checks come from the DESK_DATASETS table in app.js, one per row and
// trip, so a new row is covered with no new test code (it only needs a value
// in tests/sample-desk.mjs; the first check fails until it has one):
//   backup → empty phone → restore   gives the same stored values
//   cloud copy → apply on an empty phone   gives the same values (synced rows)
//   change check   dropping a row changes it, unless the row is left out of it
//   sign-in safety copy → Undo   puts back exactly the rows it holds
// The last check adds a made-up row to the table and runs the same trips.
// ==================================================================
import { loadApp } from './app-loader.mjs';
import { SAMPLE_DESK } from './sample-desk.mjs';

const J = JSON.stringify;
let passed = 0, failed = 0;
function check(name, problems) {
  if (problems.length === 0) { passed++; console.log(`✓ ${name}`); }
  else { failed++; console.log(`✗ [FAIL] ${name}\n    ${problems.join('\n    ')}`); }
}

// Restore stamps tasks and vault items with the time they came back (so an
// older cloud copy can't beat them): stamps are left out of the comparison.
const unstamped = (v) => J(v, (k, x) => (k === 'updatedAt' ? undefined : x));
const NAMES = ['DESK_DATASETS', 'deskRowsIn', 'deskBackupSnapshot', 'deskCloudCopy', 'restoreDeskFromBackup', 'applyDeskFromCloud',
  'calculatePayloadHash', 'saveSigninBackup', 'undoSignin', 'loadCustomTasks'];
// A fresh app; `extraRow` (optional) is added to its table first.
function app(store, extraRow) {
  const a = loadApp(NAMES, { store });
  a.eval('state.customTasks = loadCustomTasks(); state.currentPage = "none"; renderPage = () => {}; showSigninReviewModal = () => {}');
  if (extraRow) a.eval(`DESK_DATASETS.push(${extraRow})`);
  return a;
}
const label = (d) => d.backup || d.cloud;
// The value a row holds on this app (what it sends to the cloud, if synced).
const valueOf = (a, d) => unstamped((d.cloudRead || d.read)());

function trips(name, extraRow, store) {
  const full = app(store, extraRow);
  const rows = full.DESK_DATASETS;
  const stored = rows.filter((d) => d.key);

  check(`${name}: every stored row has a value in the sample desk`,
    stored.filter((d) => !(d.key in store)).map((d) => `${d.key}: add a value to tests/sample-desk.mjs`));

  // backup → empty phone → restore
  const backup = JSON.parse(J(full.deskBackupSnapshot()));
  const restored = app({}, extraRow);
  return restored.restoreDeskFromBackup(backup).then(() => {
    const after = new Map(restored.DESK_DATASETS.map((d) => [d.key, d]));
    check(`${name}: backup → restore gives every backed-up row back`,
      rows.filter((d) => d.backup).filter((d) => unstamped(d.read()) !== unstamped(after.get(d.key).read()))
        .map((d) => `${label(d)}: ${unstamped(d.read()).slice(0, 120)} came back as ${unstamped(after.get(d.key).read()).slice(0, 120)}`));

    // cloud copy → apply on an empty phone
    const copy = JSON.parse(J(full.deskCloudCopy()));
    const fresh = app({}, extraRow);
    fresh.applyDeskFromCloud(copy);
    const got = new Map(fresh.DESK_DATASETS.map((d) => [d.cloud, d]));
    check(`${name}: a cloud copy applied on an empty phone gives every synced row`,
      rows.filter((d) => d.cloud && d.key).filter((d) => valueOf(full, d) !== valueOf(fresh, got.get(d.cloud)))
        .map((d) => `${d.cloud}: sent ${valueOf(full, d).slice(0, 120)}, applied as ${valueOf(fresh, got.get(d.cloud)).slice(0, 120)}`));

    // change check: dropping a row's value changes it only for rows with a check name
    const base = full.calculatePayloadHash(copy);
    check(`${name}: the change check counts a change to every row with a check name, and no other`,
      rows.filter((d) => d.cloud).filter((d) => {
        const { [d.cloud]: _dropped, ...rest } = copy;
        return (full.calculatePayloadHash(rest) !== base) !== !!d.check;
      }).map((d) => `${d.cloud}: check name ${d.check || 'none'}, but dropping it ${d.check ? 'left the check as it was' : 'changed the check'}`));

    // sign-in safety copy → Undo
    const phone = app(store, extraRow);
    phone.saveSigninBackup('u1');
    const held = phone.DESK_DATASETS.filter((d) => d.at && d.at.signin);
    // Compared as each row sends it: the safety copy keeps the vault without
    // file bytes (they come back only from files still on the phone).
    const before = new Map(held.map((d) => [d.key, valueOf(phone, d)]));
    held.forEach((d) => { phone.store[d.key] = J('changed after sign-in'); });
    const outside = phone.DESK_DATASETS.filter((d) => d.key && !(d.at && d.at.signin));
    outside.forEach((d) => { phone.store[d.key] = J('changed after sign-in'); });
    const ok = phone.undoSignin();
    check(`${name}: Undo puts back exactly the rows the sign-in safety copy holds`,
      [...(ok ? [] : ['undoSignin returned false']),
       ...held.filter((d) => valueOf(phone, d) !== before.get(d.key)).map((d) => `${label(d)} (${d.key}): not put back`),
       ...outside.filter((d) => phone.store[d.key] !== J('changed after sign-in')).map((d) => `${label(d)} (${d.key}): has no sign-in place but Undo changed it`)]);
  });
}

await trips('today\'s table', null, SAMPLE_DESK);

// A made-up row, added in the test only: the same trips cover it.
const DUMMY = `{ key: 'cos_test_dummy', backup: 'testDummy', at: { restore: 99, cloud: 99, apply: 99, signin: 99 }, check: 'zz',
  read: () => safeGetStorage('cos_test_dummy', null), restore: (v) => { if (v) safeSetStorage('cos_test_dummy', v); },
  cloud: 'testDummy', whole: true, apply: (v) => { if (v) safeSetStorage('cos_test_dummy', v); } }`;
await trips('with a made-up row', DUMMY, { ...SAMPLE_DESK, cos_test_dummy: J({ note: 'made up' }) });
{
  // The made-up row really is in every output the trips used.
  const a = app({ ...SAMPLE_DESK, cos_test_dummy: J({ note: 'made up' }) }, DUMMY);
  check('the made-up row is in the backup, the cloud copy and the change check',
    [...('testDummy' in a.deskBackupSnapshot() ? [] : ['not in the backup']), ...('testDummy' in a.deskCloudCopy() ? [] : ['not in the cloud copy']),
     ...(JSON.parse(a.calculatePayloadHash(a.deskCloudCopy())).zz ? [] : ['not in the change check'])]);
}

console.log(`\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failed) process.exit(1);
console.log('All dataset round trips passed.');
