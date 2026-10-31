// Clear schedule / Delete class entry must not depend on the native confirm(), which
// installed PWAs and in-app browsers auto-cancel (the button then does nothing).
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const src = fs.readFileSync(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'app.js'), 'utf8');
const body = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));
let failed = 0;
const check = (n, ok) => { console.log(`${ok ? '✓' : '✗'} ${n}`); if (!ok) failed++; };
check('Clear schedule uses the in-app confirm', body('resetTimetableToDefault').includes('appConfirm(') && !body('resetTimetableToDefault').includes('confirm("'));
check('Delete class entry uses the in-app confirm', body('deleteTimetableEntry').includes('appConfirm(') && !/[^p]confirm\(/.test(body('deleteTimetableEntry')));
check('the real clear still stores an empty timetable and syncs', /function doResetTimetable\(\) \{\n  safeSetStorage\(KEY_CUSTOM_TIMETABLE, getEmptyTimetable\(\)\)/.test(src) && body('doResetTimetable').includes('syncToCloud()'));
check('the real delete still saves and closes the entry modal', body('doDeleteTimetableEntry').includes('saveTimetable(tt)') && body('doDeleteTimetableEntry').includes("tt-entry-modal-backdrop"));
console.log(`FAILED: ${failed}`);
process.exit(failed ? 1 : 0);
