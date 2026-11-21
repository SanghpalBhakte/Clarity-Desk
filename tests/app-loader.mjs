// ==================================================================
// Clarity Desk: one way for Node tests to load app.js
// ==================================================================
// loadApp(names, opts) runs the real app.js (plus the lazy files, as after
// their first use) as one script, with the real data.js, and hands back the
// functions named in `names`. A test asks for what it needs by name; it
// never cuts a function out of the file by text, so moving code inside
// app.js does not break it (renaming a function a test names still does).
//
// Each call is its own app: its own storage, fake page, timers and clock.
//   opts.store   initial localStorage contents ({ key: raw string })
//   opts.now     fixed clock (anything Date accepts); default 2026-11-10 10:00 India time
// Returned besides the named functions:
//   store        the raw localStorage map (read it, or set keys before a call)
//   timers       pending setTimeout/setInterval callbacks as { fn, ms, repeat };
//                nothing runs on its own, a cleared one is removed
//   eval(js)     run code inside the app's scope: read or set a `let`, swap a
//                function the test must not run (e.g. the file download)
// The fake page is small: classList.contains is false and querySelector
// finds nothing, so code that depends on what is on screen takes its empty
// path. Use Playwright for anything about the page itself.
// Time zone is India (Asia/Kolkata) for the whole test process.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_toast-dom-shim.mjs';
import { withLazyModules } from './lazy-modules.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_SRC = fs.readFileSync(`${ROOT}/data.js`, 'utf8').replace(/^export /gm, '');
const APP_SRC = fs.readFileSync(`${ROOT}/app.js`, 'utf8');
const DATA_IMPORT = /^import\s+\{[^}]*\}\s+from\s+['"]\.\/data\.js['"];?/m;
if (!DATA_IMPORT.test(APP_SRC)) throw new Error('app-loader: the data.js import line in app.js changed');

export const DEFAULT_NOW = '2026-11-10T10:00:00+05:30';

// A small fake page, enough for app.js to start and for toasts to be built.
function stubElement(id) {
  return {
    id, style: {}, dataset: {}, children: [], value: '', textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; }, remove() {}, focus() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {}
  };
}
function makeDocument() {
  const els = {};
  return {
    // Still loading: start-up code that waits for DOMContentLoaded never runs,
    // so a test starts from the stored data alone, not a booted page.
    readyState: 'loading',
    getElementById: (id) => els[id] || (els[id] = stubElement(id)),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    createElement: (tag) => Object.assign(stubElement(''), { tagName: tag }),
    body: stubElement('body'),
    documentElement: { setAttribute() {}, getAttribute: () => null, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }
  };
}
globalThis.window ??= globalThis;
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

function makeStorage(initial) {
  const store = { ...(initial || {}) };
  const api = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; }
  };
  return { store, api };
}

function fixedDate(now) {
  const RealDate = Date;
  const at = new RealDate(now).getTime();
  if (Number.isNaN(at)) throw new Error(`app-loader: bad opts.now ${now}`);
  return class FixedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(at); }
    static now() { return at; }
  };
}

export function loadApp(names = [], opts = {}) {
  const { store, api } = makeStorage(opts.store);
  const session = makeStorage().api;
  const timers = [];
  let nextId = 0;
  const queue = (repeat) => (fn, ms) => { const id = ++nextId; timers.push({ id, fn, ms, repeat }); return id; };
  const clear = (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
  // Assigned through globalThis so the toast shim fills in its DOM methods.
  globalThis.document = makeDocument();
  const doc = globalThis.document;
  const code = withLazyModules(APP_SRC.replace(DATA_IMPORT, DATA_SRC));
  const out = names.map(n => `${JSON.stringify(n)}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(',\n');
  // Test-only: app.js and data.js are this repo's own files; `names` and the
  // eval'd snippets are written by the tests themselves.
  const run = new Function('localStorage', 'sessionStorage', 'document', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date',
    `${code}\n;return { ${out}${out ? ',' : ''} eval: (__js) => eval(__js) };`);
  const app = run(api, session, doc, queue(false), clear, queue(true), clear, fixedDate(opts.now ?? DEFAULT_NOW));
  app.store = store;
  app.timers = timers;
  return app;
}
