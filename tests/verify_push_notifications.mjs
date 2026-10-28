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
console.log('📲 CLARITY DESK: PUSH SET-UP (old Firebase push removed)');
console.log('==================================================================\n');

const appSrc = read('app.js');
const swSrc = read('sw.js');
const htmlSrc = read('index.html');
const html404Src = read('404.html');
const fbConfigSrc = read('firebase-config.js');
const rulesSrc = read('firestore.rules');

check('app.js: the old Firebase (FCM) push path is gone', () => {
  for (const bit of ['function registerBackgroundPush', 'function getMessaging', 'function isPushRegistered', 'function initForegroundPushListener', 'initForegroundPushListener();', 'registerBackgroundPush', 'firebase.messaging', "collection('fcmTokens')"]) {
    if (appSrc.includes(bit)) return `still present: ${bit}`;
  }
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

check('app.js: Settings has no "Enable Background Push" button (closed-app reminders are the one control)', () => {
  if (appSrc.includes('Background Push (works when app is closed)')) return 'old settings card still there';
  if (!appSrc.includes('Reminders when the app is closed')) return 'closed-app reminders card missing';
  return true;
});

check('firebase-config.js: no FCM VAPID key left', () => {
  if (fbConfigSrc.includes('CAMPUS_OS_FCM_VAPID_KEY') || fbConfigSrc.includes('FIREBASE_VAPID_KEY')) return 'FCM VAPID key still set';
  return true;
});

check('index.html & 404.html: load Firestore but not firebase-messaging-compat.js', () => {
  for (const [label, src] of [['index.html', htmlSrc], ['404.html', html404Src]]) {
    if (src.indexOf('firebase-firestore-compat.js') === -1) return `${label}: firestore-compat script missing`;
    if (src.includes('firebase-messaging-compat.js')) return `${label}: messaging-compat still loaded`;
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

check('sw.js: no Firebase scripts or FCM handler; a stray FCM-shaped push is still skipped', () => {
  if (swSrc.includes('importScripts(')) return 'sw.js still imports scripts (gstatic)';
  if (swSrc.includes('onBackgroundMessage') || swSrc.includes('firebase.')) return 'FCM handler still in sw.js';
  if (!swSrc.includes("peek.data && typeof peek.data === 'object') return")) return 'guard for FCM-shaped pushes missing';
  return true;
});

check('firestore.rules: per-user rule unchanged (old fcmTokens documents stay owner-only)', () => {
  if (!rulesSrc.includes('match /users/{uid}/{document=**}')) return 'the wildcard per-user rule this feature relies on is missing';
  if (!rulesSrc.includes('request.auth.uid == uid')) return 'per-user ownership check missing';
  return true;
});

check('The old GitHub push job and its workflow are gone (push-worker sends reminders)', () => {
  if (fs.existsSync(path.join(ROOT, 'scripts/push-notifications'))) return 'scripts/push-notifications/ still exists';
  if (fs.existsSync(path.join(ROOT, '.github/workflows/push-notifications.yml'))) return 'push-notifications.yml still exists';
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
