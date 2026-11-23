// Reads inline onclick handlers in generated HTML the way a browser does, so a test
// checks which function is called with which values, not how the quotes are spelled.

// An attribute value as the browser decodes it (the entities escAttr_cd writes).
export const decodeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const decodedHandlers = (html) => [...html.matchAll(/\bonclick="([^"]*)"/g)].map((m) => decodeAttr(m[1]));

// Returns the argument lists `fnName` is called with across all handlers. Nothing runs for real:
// every name a handler uses (and `this`) resolves to a recorder, so a delete button in the same
// row cannot delete anything.
export function handlerCalls(html, fnName) {
  const calls = [];
  const event = { stopPropagation() {}, preventDefault() {} };
  const scope = new Proxy({}, {
    has: () => true,
    get: (_, name) => (name === Symbol.unscopables ? undefined : name === 'event' ? event : (...args) => { if (name === fnName) calls.push(args); }),
  });
  for (const code of decodedHandlers(html)) {
    try { new Function('scope', `with (scope) { ${code} }`).call({}, scope); } catch { /* a handler that returns early or reads a property of a recorder */ }
  }
  return calls;
}

// Handlers that are not valid JavaScript once decoded (a broken quote ends the string early).
// Compiled only, never run.
export function brokenHandlers(html) {
  const bad = [];
  for (const code of decodedHandlers(html)) {
    try { new Function('event', code); } catch (e) { bad.push(`${code} (${e.message})`); }
  }
  return bad;
}
