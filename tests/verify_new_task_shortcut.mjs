// ==================================================================
// Clarity Desk: THE "N" KEY OPENS THE ADD-TASK DIALOG (LAPTOP SHORTCUT)
// ==================================================================
// Runs the real keydown handler from app.js (isTyping .. "More" sheet).
// "n" must open the dialog only when nothing else owns the keyboard:
// not while typing, not with a modifier, not with a dialog, the
// onboarding or the More sheet open. "[" must still toggle the sidebar.
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const from = src.indexOf('function isTyping(t) {');
const to = src.indexOf('// Mobile "More" sheet', from);
if (from < 0 || to < from) { console.error('❌ could not find the keydown handler in app.js'); process.exit(1); }

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? '✓ [PASS]' : '✗ [FAIL]'} ${name}`); if (!ok) failed++; };

function run({ key = 'n', target = { tagName: 'BODY' }, mods = {}, backdrop = false, moreOpen = false, hasFn = true }) {
  let handler = null, opened = 0, toggled = 0, prevented = 0;
  const document = {
    addEventListener: (type, fn) => { if (type === 'keydown') handler = fn; },
    querySelector: () => (backdrop ? {} : null)
  };
  const window = { toggleSidebar: () => { toggled++; }, closeMoreSheet: () => {} };
  if (hasFn) window.showAddTaskModal = () => { opened++; };
  const root = { classList: { contains: (c) => c === 'more-sheet-open' && moreOpen } };
  new Function('document', 'window', 'root', src.slice(from, to))(document, window, root);
  handler({ key, target, preventDefault: () => { prevented++; }, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...mods });
  return { opened, toggled, prevented };
}

check('n on the page opens the add-task dialog', run({}).opened === 1);
check('n is swallowed so the page does not also react', run({}).prevented === 1);
check('n inside an input does nothing', run({ target: { tagName: 'INPUT' } }).opened === 0);
check('n inside a textarea does nothing', run({ target: { tagName: 'TEXTAREA' } }).opened === 0);
check('n inside a dropdown does nothing', run({ target: { tagName: 'SELECT' } }).opened === 0);
check('n in an editable area does nothing', run({ target: { tagName: 'DIV', isContentEditable: true } }).opened === 0);
check('Ctrl+N is left to the browser', run({ mods: { ctrlKey: true } }).opened === 0);
check('Cmd+N is left to the browser', run({ mods: { metaKey: true } }).opened === 0);
check('Alt+N does nothing', run({ mods: { altKey: true } }).opened === 0);
check('Shift+N does nothing', run({ mods: { shiftKey: true } }).opened === 0);
check('Holding n does not reopen it', run({ mods: { repeat: true } }).opened === 0);
check('n with a dialog or onboarding open does nothing', run({ backdrop: true }).opened === 0);
check('n with the More sheet open does nothing', run({ moreOpen: true }).opened === 0);
check('n without the dialog function does not throw', run({ hasFn: false }).opened === 0);
check('[ still toggles the sidebar', run({ key: '[' }).toggled === 1);
check('other keys do nothing', run({ key: 'x' }).opened === 0);

if (failed) { console.error(`\n❌ ${failed} NEW-TASK SHORTCUT CHECK(S) FAILED`); process.exit(1); }
console.log('\n🏆 ALL NEW-TASK SHORTCUT TESTS PASSED');
