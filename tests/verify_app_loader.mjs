// ==================================================================
// Clarity Desk: the shared test loader (tests/app-loader.mjs)
// ==================================================================
// What a test can count on when it loads app.js through loadApp(): named
// functions back, its own storage, a fixed clock, the real data.js
// datasets, and a way to read or set app state that has no getter.
// ==================================================================
import { loadApp } from './app-loader.mjs';

let total = 0, passed = 0;
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else console.error(`✗ [FAIL] ${name}: ${res}`);
  } catch (err) { console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

check('named app functions come back', () => {
  const app = loadApp(['safeGetStorage', 'safeSetStorage', 'todayStr']);
  return ['safeGetStorage', 'safeSetStorage', 'todayStr'].every(n => typeof app[n] === 'function') || Object.keys(app).join();
});

check('two loaded apps keep separate storage', () => {
  const a = loadApp(['safeSetStorage', 'safeGetStorage']);
  const b = loadApp(['safeGetStorage']);
  a.safeSetStorage('cos_profile', { name: 'Riya' });
  const inA = a.safeGetStorage('cos_profile', {}).name;
  const inB = b.safeGetStorage('cos_profile', {}).name;
  return inA === 'Riya' && inB === undefined && a.store.cos_profile === '{"name":"Riya"}' ? true : JSON.stringify({ inA, inB, raw: a.store.cos_profile });
});

check('storage given up front is what the app reads', () => {
  const app = loadApp(['safeGetStorage'], { store: { cos_att_target: '80' } });
  return app.safeGetStorage('cos_att_target', null) === 80 || String(app.safeGetStorage('cos_att_target', null));
});

check('the clock is fixed: today is the date given, in India time', () => {
  // 20:00 UTC on 9 Nov is 01:30 on 10 Nov in India.
  const app = loadApp(['todayStr'], { now: '2026-11-09T20:00:00Z' });
  return app.todayStr() === '2026-11-10' || app.todayStr();
});

check('the real data.js datasets are loaded', () => {
  const app = loadApp([]);
  const ok = app.eval('typeof STUDENT === "object" && Array.isArray(QUICK_LINKS) && typeof TIMETABLE === "object"');
  return ok === true || String(ok);
});

check('eval reads and sets app state without a getter', () => {
  const app = loadApp([]);
  app.eval('currentUser = { uid: "u9" }');
  return app.eval('currentUser.uid') === 'u9' || String(app.eval('currentUser && currentUser.uid'));
});

console.log(`\nPASSED: ${passed}/${total}`);
if (passed !== total) process.exit(1);
