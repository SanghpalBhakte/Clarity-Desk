// ==================================================================
// Clarity Desk: SETTINGS CONTROLS HAVE NAMES FOR SCREEN READERS
// ==================================================================
// The reminder dropdowns, the time pickers and the exam date sit next to a
// visible caption that is not a <label>, so each needs its own aria-label
// (Lighthouse "label" / "select-name" audits flagged them on the live site).
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const ids = ['s-exam-date', 'np-task-upcoming', 'np-task-overdue', 'np-class-reminders', 'np-attendance-alerts', 'np-summary-time', 'np-ongoing-nudges', 'np-nudge-time'];
let failed = 0;
for (const id of ids) {
  const tag = (app.match(new RegExp(`<(?:input|select)[^>]*\\bid="${id}"[^>]*>`)) || [])[0] || '';
  const ok = /aria-label="[^"]+"/.test(tag);
  if (!ok) failed++;
  console.log(`${ok ? '✓ [PASS]' : '✗ [FAIL]'} #${id} has an aria-label`);
}
console.log(`\nTOTAL SCENARIOS CHECKED: ${ids.length}\nPASSED: ${ids.length - failed}\nFAILED: ${failed}`);
process.exit(failed ? 1 : 0);
