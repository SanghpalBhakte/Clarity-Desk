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
// The rest of the native confirm() calls, moved 2026-11-03.
const win = (name) => src.slice(src.indexOf(`window.${name} = function`), src.indexOf('\n};\n', src.indexOf(`window.${name} = function`)));
check('no native confirm() is left in app.js', !src.split('\n').some((l) => /(^|[^.\w])confirm\(/.test(l) && !/appConfirm\(|^\s*\/\//.test(l)));
check('blocked Google popup offers the redirect in-app', /code === 'auth\/popup-blocked'\) \{\s*appConfirm\([^;]*, 'Continue', loginWithGoogleRedirect\)/.test(body('handleAuthError')));
check('delete subject card: asks in-app, deletes only on yes, then offers "Don\'t ask again"',
  /appConfirm\(`Delete "\$\{subjectName\}" permanently\?[^`]*`, 'Delete', \(\) => \{\s*doDelete\(\);\s*appConfirm\([^;]*KEY_SUBJECT_DELETE_SILENT, true\)\);/.test(win('deleteSubjectCard'))
  && /if \(skipWarning\) \{ doDelete\(\); return; \}/.test(win('deleteSubjectCard')));
check('bulk subject delete: deletes only inside the in-app yes', /appConfirm\(`Delete \$\{names\.length\}[\s\S]*?'Delete', \(\) => \{\s*names\.forEach\(n => permanentlyDeleteSubject\(n\)\)/.test(win('deleteSelectedSubjects'))
  && win('deleteSelectedSubjects').indexOf('permanentlyDeleteSubject') > win('deleteSelectedSubjects').indexOf('appConfirm('));
check('backup with too many vault files asks in-app, and still downloads when nothing is left out',
  /if \(plan\.left\.length\) appConfirm\([^\n]*'Download anyway', go\);\n\s*else go\(\);/.test(body('exportData')));
console.log(`FAILED: ${failed}`);
process.exit(failed ? 1 : 0);
