// ==================================================================
// Clarity Desk: A BACKGROUND RE-RENDER MUST NOT CLOSE AN OPEN DROPDOWN
// ==================================================================
// A dropdown with its own onchange used to be skipped by the "page is in
// use" check, so a cloud sync or timer render could rebuild the page and
// close it. It is now held while open; a pick, losing focus or 15 s of
// quiet releases it, and the pick's own re-render is never held.
// Runs the real code from app.js (isPickerField .. flushDeferredRender).
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const from = src.indexOf('let __renderDeferred = null;');
const to = src.indexOf('function renderPage(page)');
if (from < 0 || to < from) { console.error('❌ could not find the dropdown-hold code in app.js'); process.exit(1); }

const listeners = {};
const mkSelect = (withOnchange) => ({ tagName: 'SELECT', options: [], hasAttribute: (a) => withOnchange && a === 'onchange' });
const select = mkSelect(true);
const plain = mkSelect(false);
const page = { classList: { contains: () => true }, contains: (n) => n === select || n === plain, querySelector: () => null };
let active = null, now = 1000;
const document = {
  getElementById: () => page, get activeElement() { return active; },
  addEventListener: (t, f, cap) => { (listeners[t] = listeners[t] || []).push({ f, cap: !!cap }); }
};
const fire = (type, target) => (listeners[type] || []).forEach(({ f }) => f({ target }));
const api = new Function('document', 'Date', 'setTimeout', 'renderPage', `${src.slice(from, to)}; return { isDatePromptOpen, setActive: () => {} };`)(
  document, { now: () => now }, () => {}, () => {});

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? '✓ [PASS]' : '✗ [FAIL]'} ${name}`); if (!ok) failed++; };

check('Nothing touched: the page is not held', api.isDatePromptOpen('x') === false);
active = select; fire('focusin', select);
check('Dropdown with its own onchange, just opened: renders are held', api.isDatePromptOpen('x') === true);
fire('change', select);
check('After a pick the hold is released, so its own onchange re-render runs', api.isDatePromptOpen('x') === false);
fire('pointerdown', select);
check('Touched again: held again', api.isDatePromptOpen('x') === true);
now += 15001;
check('Held no longer than 15 s without a touch (dismissed with Escape)', api.isDatePromptOpen('x') === false);
fire('pointerdown', select); fire('focusout', select); active = null;
check('Losing focus releases it', api.isDatePromptOpen('x') === false);
fire('pointerdown', select);
check('Held only while that dropdown still has focus', api.isDatePromptOpen('x') === false);
active = plain; fire('focusin', plain);
check('A plain dropdown (no onchange) is still held by the existing rule', api.isDatePromptOpen('x') === true);

console.log(failed ? `\n❌ ${failed} FAILED` : '\n🏆 ALL DROPDOWN HOLD TESTS PASSED');
process.exit(failed ? 1 : 0);
