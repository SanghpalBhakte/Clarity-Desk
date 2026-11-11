// Node tests run app.js against a small fake page. The toast code uses a few
// standard DOM methods those fakes leave out; this fills them in as no-ops
// (append forwards to appendChild) whenever a test assigns globalThis.document.
// Import it first: `import './_toast-dom-shim.mjs';`
const fill = (e) => {
  if (!e || typeof e !== 'object') return e;
  e.dataset ??= {};
  e.style ??= {};
  e.style.setProperty ??= () => {};
  e.classList ??= { add() {}, remove() {} };
  e.classList.contains ??= () => false;
  e.setAttribute ??= () => {};
  e.replaceWith ??= () => {};
  e.contains ??= () => false;
  e.querySelector ??= () => null;
  e.append ??= function (...cs) {
    cs.forEach((c) => { if (typeof this.appendChild === 'function') this.appendChild(typeof c === 'string' ? { textContent: c } : c); });
  };
  return e;
};

let doc;
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  get: () => doc,
  set: (d) => {
    if (d && typeof d.createElement === 'function' && !d.__toastShim) {
      const make = d.createElement;
      d.createElement = (...a) => fill(make.apply(d, a));
      d.__toastShim = true;
    }
    doc = d;
  },
});

// A toast's visible text in a fake page: its own text or its children's, depth-first.
globalThis.toastText = (n) => (n && (n.textContent || (n.children || []).map(globalThis.toastText).join(' ')) || '').trim();

// Fake timers never fire in these tests. This lets "time pass" for toasts:
// the visible one closes and each waiting one shows in turn (and is captured).
globalThis.passToastTime = () => {
  const ts = globalThis.toastState;
  for (let i = 0; ts && ts.visible && i < 20; i++) globalThis.closeToast(ts.visible, true);
};
