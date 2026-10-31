// A cleared timetable must not come back: while a local change is still waiting to reach
// the cloud, neither the cached read nor the live listener may apply the (older) cloud copy.
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const src = fs.readFileSync(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'app.js'), 'utf8');
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) failed++; };
const guards = src.split('if (cloudApplyDeferred()) return;').length - 1;
check('both cloud read paths (cache + listener) skip while a local push is pending', guards === 2);
check('guard sits before the payload hash is remembered',
  [...src.matchAll(/if \(cloudApplyDeferred\(\)\) return;[^\n]*\n\s*lastCloudPayloadHash = currentHash;/g)].length === 2);
check('syncToCloud marks the pending change', /if \(!currentUser\) return;\n  localPushPendingAt = Date\.now\(\);/.test(src));
check('a landed push (or nothing to push) clears the flag',
  /function onCloudPushOk\(\) \{\n  localPushPendingAt = 0;/.test(src) && src.includes('{ localPushPendingAt = 0; return; }'));
check('backgrounding the app flushes the push immediately', /document\.hidden\) \{[^]*?pushLocalDataToCloud\(currentUser\.uid\)/.test(src));
check('the flag expires so a stuck push cannot block the cloud for good', src.includes('< 60000'));
console.log(`FAILED: ${failed}`);
process.exit(failed ? 1 : 0);
