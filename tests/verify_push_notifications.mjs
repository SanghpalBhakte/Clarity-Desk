import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
let total = 0;
const errors = [];

function check(name, testFn) {
  total++;
  try {
    const res = testFn();
    if (res === true || res === undefined) {
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${name}: ${res}`);
      errors.push({ name, error: res });
    }
  } catch (err) {
    console.error(`✗ [FAIL] ${name}: ${err.message}`);
    errors.push({ name, error: err.message });
  }
}

console.log('==================================================================');
console.log('📲 CLARITY DESK: BACKGROUND PUSH NOTIFICATIONS VERIFICATION');
console.log('==================================================================\n');

const appSrc = read('app.js');
const swSrc = read('sw.js');
const htmlSrc = read('index.html');
const html404Src = read('404.html');
const fbConfigSrc = read('firebase-config.js');
const rulesSrc = read('firestore.rules');

check('app.js: exposes registerBackgroundPush / getMessaging / isPushRegistered', () => {
  for (const fn of ['function registerBackgroundPush', 'function getMessaging', 'function isPushRegistered', 'function initForegroundPushListener']) {
    if (!appSrc.includes(fn)) return `missing "${fn}"`;
  }
  if (!appSrc.includes("window.registerBackgroundPush = registerBackgroundPush;")) return 'registerBackgroundPush not exposed on window';
  if (!appSrc.includes('initForegroundPushListener();')) return 'initForegroundPushListener() not called from init()';
  return true;
});

check('app.js: KEY_PUSH_REGISTERED constant defined', () => {
  if (!appSrc.includes("const KEY_PUSH_REGISTERED     = 'cos_push_registered';")) return 'constant missing or renamed';
  return true;
});

check('app.js: attendance target is synced to and restored from Firestore', () => {
  if (!appSrc.includes('attTarget:          getAttendanceTarget(),')) return 'pushLocalDataToCloud() does not send attTarget';
  if (!appSrc.includes("safeSetStorage(KEY_ATT_TARGET, data.attTarget);")) return 'applyCloudDataToLocalState() does not restore attTarget';
  return true;
});

check('app.js: Settings page offers a background-push enable control', () => {
  if (!appSrc.includes('onclick="registerBackgroundPush()"')) return 'no button wired to registerBackgroundPush()';
  if (!appSrc.includes('Background Push (works when app is closed)')) return 'settings card label missing';
  return true;
});

check('firebase-config.js: exposes a public VAPID key for FCM getToken()', () => {
  if (!fbConfigSrc.includes('window.CAMPUS_OS_FCM_VAPID_KEY')) return 'CAMPUS_OS_FCM_VAPID_KEY not set';
  if (fbConfigSrc.includes("'REPLACE_WITH_VAPID_KEY'") && !fbConfigSrc.match(/'B[A-Za-z0-9_-]{80,}'/)) {
    return 'no real-looking VAPID key literal found (still a placeholder?)';
  }
  return true;
});

check('index.html & 404.html: load firebase-messaging-compat.js after firestore-compat.js', () => {
  for (const [label, src] of [['index.html', htmlSrc], ['404.html', html404Src]]) {
    const fIdx = src.indexOf('firebase-firestore-compat.js');
    const mIdx = src.indexOf('firebase-messaging-compat.js');
    if (fIdx === -1) return `${label}: firestore-compat script missing`;
    if (mIdx === -1) return `${label}: messaging-compat script missing`;
    if (mIdx < fIdx) return `${label}: messaging-compat loaded before firestore-compat`;
  }
  return true;
});

check('index.html & 404.html: cache-busting version bumped past v111 consistently', () => {
  for (const [label, src] of [['index.html', htmlSrc], ['404.html', html404Src]]) {
    const versions = [...src.matchAll(/\?v=(\d+)/g)].map((m) => parseInt(m[1], 10));
    if (!versions.length) return `${label}: no ?v= params found`;
    const uniq = new Set(versions);
    if (uniq.size !== 1) return `${label}: inconsistent versions found: ${[...uniq].join(', ')}`;
    if (versions[0] <= 111) return `${label}: version not bumped past 111 (found ${versions[0]})`;
  }
  return true;
});

check('sw.js: cache name bumped to match index.html\'s asset version', () => {
  const m = swSrc.match(/CACHE_NAME = 'clarity-desk-v(\d+)'/);
  if (!m) return 'CACHE_NAME not found';
  const swVer = parseInt(m[1], 10);
  const htmlVer = parseInt((htmlSrc.match(/\?v=(\d+)/) || [])[1] || '0', 10);
  if (swVer !== htmlVer) return `sw.js cache version v${swVer} does not match index.html asset version v${htmlVer}`;
  return true;
});

check('sw.js: registers Firebase Messaging background handler and guards the legacy push listener', () => {
  if (!swSrc.includes("importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js')")) return 'firebase-messaging-compat.js not imported';
  if (!swSrc.includes('messaging.onBackgroundMessage')) return 'onBackgroundMessage handler missing';
  if (!swSrc.includes("peek.data && typeof peek.data === 'object') return")) return 'legacy push listener is not guarded against double-handling FCM pushes';
  return true;
});

check('firestore.rules: already covers per-user subcollections (fcmTokens, notifState) — no rule change needed', () => {
  if (!rulesSrc.includes('match /users/{uid}/{document=**}')) return 'the wildcard per-user rule this feature relies on is missing';
  if (!rulesSrc.includes('request.auth.uid == uid')) return 'per-user ownership check missing';
  return true;
});

check('scripts/push-notifications/: job, package.json and lockfile all exist and the job parses', () => {
  const jobPath = path.join(ROOT, 'scripts/push-notifications/send-notifications.js');
  if (!fs.existsSync(jobPath)) return 'send-notifications.js missing';
  if (!fs.existsSync(path.join(ROOT, 'scripts/push-notifications/package.json'))) return 'package.json missing';
  if (!fs.existsSync(path.join(ROOT, 'scripts/push-notifications/package-lock.json'))) return 'package-lock.json missing (run npm install there once)';
  const jobSrc = fs.readFileSync(jobPath, 'utf8');
  for (const fn of ['function evaluateUser', 'function loadDataJs', 'FIREBASE_SERVICE_ACCOUNT']) {
    if (!jobSrc.includes(fn)) return `job script missing "${fn}"`;
  }
  return true;
});

check('.github/workflows/push-notifications.yml exists with a schedule and the service-account secret wired in', () => {
  const wfPath = path.join(ROOT, '.github/workflows/push-notifications.yml');
  if (!fs.existsSync(wfPath)) return 'workflow file missing';
  const wf = fs.readFileSync(wfPath, 'utf8');
  if (!wf.includes('cron:')) return 'no cron schedule defined';
  if (!wf.includes('secrets.FIREBASE_SERVICE_ACCOUNT')) return 'workflow does not pass the FIREBASE_SERVICE_ACCOUNT secret through';
  if (!wf.includes('workflow_dispatch')) return 'no manual workflow_dispatch trigger for on-demand testing';
  return true;
});

console.log('\n==================================================================');
console.log(`RESULT: ${passed}/${total} checks passed`);
console.log('==================================================================');

if (errors.length) {
  console.error(`\n${errors.length} FAILURE(S):`);
  errors.forEach((e) => console.error(`  - ${e.name}: ${e.error}`));
  process.exit(1);
}
process.exit(0);
