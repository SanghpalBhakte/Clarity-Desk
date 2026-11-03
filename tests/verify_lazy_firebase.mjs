// ==================================================================
// Clarity Desk: FIREBASE SDK ONLY FOR PHONES THAT USE SYNC
// ==================================================================
// The ~150 KB Firebase SDK used to load on every visit. Now index.html
// (and its 404.html copy) starts it only when this phone uses sync. Locked
// down here:
//  - no plain <script src> for the SDK is left in either page;
//  - the startup check loads it for a signed-in phone, a phone an older
//    version signed in (no cos_cloud_signed_in yet), an email sign-in link
//    and a Google redirect coming back, and not for a signed-out phone;
//  - app.js records sign-in state, starts sync only after the SDK is here,
//    and loads it on demand from the sign-in buttons;
//  - sw.js keeps the saved SDK across an update.
// ==================================================================
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = read('app.js');
const sw = read('sw.js');
let total = 0, passed = 0;
function check(name, ok) {
  total++;
  if (ok === true) { passed++; console.log(`✓ [PASS] ${name}`); }
  else console.error(`✗ [FAIL] ${name}${ok ? ': ' + ok : ''}`);
}

function loaderOf(file) {
  const html = read(file);
  const m = html.match(/<script>\s*(window\.cdLoadFirebaseSdk = [\s\S]*?)<\/script>/);
  return { html, src: m ? m[1] : '' };
}

// Runs the page's startup check with the given storage and address.
function run(src, { local = {}, session = {}, search = '' } = {}) {
  const added = [];
  const store = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
  const ls = store(local);
  const win = {};
  const ctx = {
    window: win, location: { search }, sessionStorage: store(session), Promise,
    document: { createElement: () => ({}), body: { appendChild: (s) => added.push(s.src) } }
  };
  // Object.keys(localStorage) lists the stored keys, as in a browser.
  ctx.localStorage = new Proxy(ls, { ownKeys: () => Object.keys(local), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  vm.runInNewContext(src, ctx);
  return { wanted: !!win.cdFirebaseWanted, added };
}

console.log('🔥 FIREBASE SDK ONLY FOR PHONES THAT USE SYNC');
for (const file of ['index.html', '404.html']) {
  const { html, src } = loaderOf(file);
  check(`${file}: no blocking <script src> for the SDK`, !/<script src="https:\/\/www\.gstatic\.com\/firebasejs/.test(html) || 'still there');
  check(`${file}: loader found before app.js`, !!src && html.indexOf('cdLoadFirebaseSdk') < html.indexOf('type="module"') || 'missing or after app.js');
  if (!src) continue;
  const off = run(src);
  check(`${file}: signed-out phone downloads nothing`, !off.wanted && off.added.length === 0 || JSON.stringify(off));
  const on = run(src, { local: { cos_cloud_signed_in: 'true' } });
  check(`${file}: signed-in phone loads app, auth, firestore in order`,
    on.wanted && on.added.map((u) => u.match(/firebase-(\w+)-compat/)[1]).join() === 'app,auth,firestore' || JSON.stringify(on.added));
  check(`${file}: older version's sign-in counts (cos_sync_last_pushed)`, run(src, { local: { cos_sync_last_pushed: '{}' } }).wanted || 'not loaded');
  check(`${file}: older version's sign-in counts (cos_signin_seen)`, run(src, { local: { cos_signin_seen: '["u"]' } }).wanted || 'not loaded');
  check(`${file}: older version's sign-in counts (Firebase auth key)`, run(src, { local: { 'firebase:authUser:k:[DEFAULT]': '{}' } }).wanted || 'not loaded');
  check(`${file}: signed out since then wins over old signs`, !run(src, { local: { cos_cloud_signed_in: 'false', cos_sync_last_pushed: '{}' } }).wanted || 'loaded');
  check(`${file}: email sign-in link loads it`, run(src, { local: { cos_cloud_signed_in: 'false' }, search: '?apiKey=x&oobCode=abc&mode=signIn' }).wanted || 'not loaded');
  check(`${file}: Google redirect coming back loads it`, run(src, { session: { cos_auth_redirect: '1' } }).wanted || 'not loaded');
}
check('index.html and 404.html share one loader', loaderOf('index.html').src === loaderOf('404.html').src || 'copies differ');

const init = app.slice(app.indexOf('function init() {'), app.indexOf("document.addEventListener('DOMContentLoaded', init);"));
check('init() starts sync only after the SDK is here', /if \(window\.cdFirebaseWanted\) \{\s*loadFirebaseSdk\(\)\.then\(initFirebase\)/.test(init) && !/\n  initFirebase\(\);/.test(init) || 'initFirebase still called directly');
check('Sign-in state is recorded for the next start', app.includes('safeSetStorage(KEY_CLOUD_SIGNED_IN, !!user)') && app.includes("KEY_CLOUD_SIGNED_IN     = 'cos_cloud_signed_in'") || 'not written');
check('Google sign-in loads the SDK on demand', /function loginWithGoogle\(sdkTried = false\) \{[\s\S]{0,400}loadFirebaseSdk\(\)\.then\(\(\) => loginWithGoogle\(true\)\)/.test(app) || 'missing');
check('Email sign-in loads the SDK on demand', /function showEmailSignInModal\(step = 'email', sdkTried = false\) \{\s*if[^\n]*\n\s*loadFirebaseSdk\(\)\.then\(\(\) => showEmailSignInModal\(step, true\)\)/.test(app) || 'missing');
check('Redirect sign-in leaves a marker, cleared on return',
  app.includes("sessionStorage.setItem('cos_auth_redirect', '1')") && (app.match(/sessionStorage\.removeItem\('cos_auth_redirect'\)/g) || []).length === 2 || 'marker missing');
check('Settings and the welcome Log in fetch it ahead of the tap',
  (app.match(/warmFirebaseSdk\(\)/g) || []).length >= 2 && /function warmFirebaseSdk\(\) \{[\s\S]*?navigator\.onLine[\s\S]*?saveData/.test(app) || 'missing');
const exportFn = app.slice(app.indexOf('function exportData() {'), app.indexOf('\nfunction ', app.indexOf('function exportData() {') + 10));
check('cos_cloud_signed_in stays out of backups', exportFn.length > 100 && !/cos_cloud_signed_in|KEY_CLOUD_SIGNED_IN/.test(exportFn) || 'in backup');
check('It is not desk data for the old-address move check', /const MOVE_SAFE_KEYS = [^;]*KEY_CLOUD_SIGNED_IN/.test(app) || 'missing from MOVE_SAFE_KEYS');

check('sw.js keeps the saved SDK across an update',
  /carryFirebaseSdk\(old\)[\s\S]*?caches\.delete/.test(sw) && sw.includes("startsWith('https://www.gstatic.com/firebasejs/')") || 'not carried over');

console.log(`\nLAZY FIREBASE SDK: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
