// Damaged data kept aside (cos_corrupt_<key>): Settings → Backup shows it only
// when there is some, Clear asks first and removes only the kept copies.
import { loadApp } from './app-loader.mjs';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✓ ${name}`); }
  else { failed++; console.log(`✗ [FAIL] ${name} ${detail}`); }
}

const clean = loadApp(['corruptCopiesHTML'], { store: { cos_custom_tasks: '[]' } });
check('no kept copy: nothing is shown', clean.corruptCopiesHTML() === '');

const app = loadApp(['corruptKeptCopies', 'corruptCopiesHTML'], {
  store: { cos_custom_tasks: '[{"id":1},{"id"', cos_corrupt_cos_custom_tasks: '[{"id":1},{"id"', cos_theme: 'midnight-ink' }
});
app.eval('renderPage = () => {}; window.__toasts = []; showToast = (m) => window.__toasts.push(m); appConfirm = (msg, ok, yes) => { window.__asked = msg; window.__yes = yes; }');
check('the kept copy is read as its exact raw text', app.corruptKeptCopies().cos_custom_tasks === '[{"id":1},{"id"');
const html = app.corruptCopiesHTML();
check('shown with the data name in plain words', html.includes('(custom tasks)') && html.includes('Download the copy') && html.includes('Clear the copy'), html.slice(0, 200));
app.eval('clearCorruptCopies()');
check('Clear asks first and removes nothing yet', !!app.eval('window.__asked') && app.store.cos_corrupt_cos_custom_tasks !== undefined);
app.eval('window.__yes()');
check('after Yes the kept copy is gone', app.store.cos_corrupt_cos_custom_tasks === undefined);
check('the live data and other keys are left alone', app.store.cos_custom_tasks === '[{"id":1},{"id"' && app.store.cos_theme === 'midnight-ink');
check('the row is gone once cleared', app.corruptCopiesHTML() === '');

console.log(`\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failed) process.exit(1);
