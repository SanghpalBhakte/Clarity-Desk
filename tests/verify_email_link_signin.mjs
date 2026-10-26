// ==================================================================
// Clarity Desk: EMAIL-LINK SIGN-IN (cos_email_link_pending)
// ==================================================================
// Locked down here, against a fake Firebase Auth:
//  - sending a link saves the address and asks Firebase to return to the
//    app itself; a bad address sends nothing;
//  - the browser that asked finishes on its own and the one-time code
//    leaves the address bar (the #screen is kept);
//  - a browser that did NOT ask (iPhone: Safari vs home-screen app)
//    never uses the link up until the student chooses;
//  - the paste box signs in with the saved address, rejects other links;
//  - expired/used links show a plain message;
//  - Google sign-in is unchanged; the key stays out of backups and sync.
// ==================================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = globalThis;
globalThis.alert = () => {};

const APP = 'https://claritydesk.web.app';
function setUrl(search = '', hash = '#settings') {
  globalThis.location = { origin: APP, hostname: 'claritydesk.web.app', pathname: '/index.html', search, hash, href: `${APP}/index.html${search}${hash}`, protocol: 'https:' };
}
globalThis.history = {
  replaceState: (_s, _t, url) => {
    const [p, h = ''] = url.split('#');
    const [pathname, q = ''] = p.split('?');
    location.pathname = pathname; location.search = q ? `?${q}` : ''; location.hash = h ? `#${h}` : '';
    location.href = `${APP}${location.pathname}${location.search}${location.hash}`;
  }
};
const LINK = '?apiKey=k&oobCode=CODE123&mode=signIn&lang=en';

let appended = [];
let domCache = {};
const domStub = (id) => (domCache[id] ||= { id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', disabled: false, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, addEventListener() {} });
globalThis.document = {
  getElementById: domStub,
  querySelector: () => null,
  querySelectorAll: () => [],
  activeElement: null, hidden: false,
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] }),
  body: { appendChild: (el) => { appended.push(el); } },
  documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

// ── Fake Firebase ────────────────────────────────────────────────
let calls;
let signInError = null;
function makeFirebase() {
  calls = { send: [], signIn: [], popup: [], pw: [], create: [], reset: [] };
  const authObj = {
    getRedirectResult: () => Promise.resolve(null),
    onAuthStateChanged: () => {},
    isSignInWithEmailLink: (l) => typeof l === 'string' && l.includes('mode=signIn') && l.includes('oobCode='),
    sendSignInLinkToEmail: (email, settings) => { calls.send.push({ email, settings }); return Promise.resolve(); },
    signInWithEmailLink: (email, link) => {
      calls.signIn.push({ email, link });
      return signInError ? Promise.reject(signInError) : Promise.resolve({ user: { uid: 'u1', email, providerData: [{ providerId: 'password' }] } });
    },
    signInWithEmailAndPassword: (email, pw) => { calls.pw.push({ email, pw }); return signInError ? Promise.reject(signInError) : Promise.resolve({ user: { uid: 'u2', email, providerData: [{ providerId: 'password' }] } }); },
    createUserWithEmailAndPassword: (email, pw) => { calls.create.push({ email, pw }); return Promise.resolve({ user: { uid: 'u3', email, providerData: [{ providerId: 'password' }] } }); },
    sendPasswordResetEmail: (email) => { calls.reset.push(email); return Promise.resolve(); },
    signInWithPopup: (p) => { calls.popup.push(p); return Promise.resolve({ user: null }); },
    signOut: () => Promise.resolve()
  };
  const authFn = () => authObj;
  authFn.GoogleAuthProvider = class { constructor() { this.providerId = 'google.com'; } setCustomParameters(p) { this.params = p; } };
  const firestoreFn = () => ({ settings() {}, collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }), onSnapshot: () => () => {}, set: () => Promise.resolve() }) }) });
  globalThis.firebase = { apps: [], initializeApp() { this.apps.push({}); }, auth: authFn, firestore: firestoreFn };
}

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const makeApp = () => new Function(`${code}\n return { state, initFirebase, showEmailSignInModal, sendEmailSignInLink, submitPastedEmailLink, confirmIncomingEmailLink, handleEmailLinkOnStartup, signInMethodLabel, loginWithGoogle, passwordSignIn, sendPasswordReset };`)();

function fresh({ search = '', pending = null } = {}) {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_onboarding_dismissed = 'true';
  if (pending) store.cos_email_link_pending = JSON.stringify(pending);
  domCache = {}; appended = []; signInError = null;
  setUrl(search);
  makeFirebase();
  const a = makeApp();
  a.initFirebase();   // runs the startup link check once
  return a;
}
const tick = () => new Promise(r => setTimeout(r, 0));
const modalHtml = () => appended.filter(e => e.id === 'email-signin-modal-backdrop').map(e => e.innerHTML).pop() || '';

let total = 0, passed = 0; const errors = [];
async function check(name, fn) {
  total++;
  try {
    const res = await fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

console.log('==================================================================');
console.log('✉️  EMAIL-LINK SIGN-IN');
console.log('==================================================================');

await check('Send: saves the address and returns to the app page', async () => {
  const a = fresh();
  a.showEmailSignInModal();
  domStub('email-signin-email').value = '  student@college.edu ';
  a.sendEmailSignInLink();
  await tick();
  const s = calls.send[0];
  const p = JSON.parse(store.cos_email_link_pending || 'null');
  if (!s || s.email !== 'student@college.edu') return `send calls: ${JSON.stringify(calls.send)}`;
  if (s.settings.url !== `${APP}/index.html` || s.settings.handleCodeInApp !== true) return `settings: ${JSON.stringify(s.settings)}`;
  if (!p || p.email !== 'student@college.edu' || !p.sentAt) return `pending: ${JSON.stringify(p)}`;
  return modalHtml().includes('Check your inbox') ? true : 'sent screen not shown';
});

await check('Send: a bad address sends nothing and says why', async () => {
  const a = fresh();
  a.showEmailSignInModal();
  domStub('email-signin-email').value = 'not-an-email';
  a.sendEmailSignInLink();
  await tick();
  if (calls.send.length) return 'link was sent';
  if ('cos_email_link_pending' in store) return 'pending saved';
  return domStub('email-signin-error').textContent.includes('full email') ? true : 'no error shown';
});

await check('Same browser: finishes on its own, clears code, keeps #screen', async () => {
  fresh({ search: LINK, pending: { email: 'student@college.edu', sentAt: '2026-10-26T10:00:00Z' } });
  await tick(); await tick();
  const c = calls.signIn[0];
  if (!c || c.email !== 'student@college.edu' || !c.link.includes('oobCode=CODE123')) return `signIn: ${JSON.stringify(calls.signIn)}`;
  if ('cos_email_link_pending' in store) return 'pending not cleared';
  if (location.search !== '' || location.hash !== '#settings') return `url: ${location.href}`;
  return true;
});

await check('Other browser (iPhone Safari): link is NOT used up, asks first', async () => {
  fresh({ search: LINK });
  await tick();
  if (calls.signIn.length) return 'link was used without asking';
  if (location.search !== '') return 'code left in address bar';
  const html = modalHtml();
  if (!html.includes('Finish signing in') || !html.includes('Copy link for my home-screen app')) return 'choice screen not shown';
  return true;
});

await check('Other browser: "Sign in in this browser" uses the kept link', async () => {
  const a = fresh({ search: LINK });
  await tick();
  domStub('email-signin-email').value = 'student@college.edu';
  a.confirmIncomingEmailLink();
  await tick();
  const c = calls.signIn[0];
  return c && c.email === 'student@college.edu' && c.link.includes('oobCode=CODE123') ? true : `signIn: ${JSON.stringify(calls.signIn)}`;
});

await check('Home-screen app: pasted link signs in with the saved address', async () => {
  const a = fresh({ pending: { email: 'student@college.edu', sentAt: '2026-10-26T10:00:00Z' } });
  a.showEmailSignInModal('sent');
  domStub('email-signin-paste').value = ` ${APP}/index.html${LINK} `;
  a.submitPastedEmailLink();
  await tick();
  const c = calls.signIn[0];
  if (!c || c.email !== 'student@college.edu') return `signIn: ${JSON.stringify(calls.signIn)}`;
  return !('cos_email_link_pending' in store) ? true : 'pending not cleared';
});

await check('Paste: a non-sign-in link is refused', async () => {
  const a = fresh({ pending: { email: 'student@college.edu', sentAt: 'x' } });
  a.showEmailSignInModal('sent');
  domStub('email-signin-paste').value = 'https://example.com/hello';
  a.submitPastedEmailLink();
  await tick();
  if (calls.signIn.length) return 'signed in with a wrong link';
  return domStub('email-signin-error').textContent.includes('not a Clarity Desk sign-in link') ? true : 'no error shown';
});

await check('Expired link: plain message, code still leaves the address bar', async () => {
  for (const k of Object.keys(store)) delete store[k];
  store.cos_email_link_pending = JSON.stringify({ email: 'student@college.edu', sentAt: 'x' });
  domCache = {}; appended = [];
  setUrl(LINK);
  makeFirebase();
  signInError = { code: 'auth/expired-action-code' };
  makeApp().initFirebase();
  await tick(); await tick();
  if (!calls.signIn.length) return 'sign-in not tried';
  if (location.search !== '') return `url: ${location.href}`;
  return domStub('email-signin-error').textContent.includes('expired or was already used') ? true : `error: ${domStub('email-signin-error').textContent}`;
});

await check('Startup check runs once, and does nothing on a normal URL', async () => {
  const a = fresh();
  setUrl(LINK);
  a.handleEmailLinkOnStartup();
  await tick();
  return calls.signIn.length === 0 && !modalHtml() ? true : 'ran twice or on a normal URL';
});

await check('Google sign-in is unchanged', async () => {
  const a = fresh();
  a.loginWithGoogle();
  await tick();
  const p = calls.popup[0];
  return p && p.providerId === 'google.com' && p.params && p.params.prompt === 'select_account' ? true : `popup: ${JSON.stringify(calls.popup)}`;
});

await check('Settings label names the sign-in method', async () => {
  const a = fresh();
  const g = a.signInMethodLabel({ providerData: [{ providerId: 'google.com' }] });
  const e = a.signInMethodLabel({ providerData: [{ providerId: 'password' }] });
  const n = a.signInMethodLabel(null);
  return g === 'Google' && e === 'email' && n === 'your account' ? true : `${g} / ${e} / ${n}`;
});

await check('Password: sign in and create account call the right Firebase method', async () => {
  const a = fresh();
  a.showEmailSignInModal('password');
  if (!modalHtml().includes('Forgot password?')) return 'password screen not shown';
  domStub('email-signin-email').value = 'student@college.edu';
  domStub('email-signin-password').value = 'secret12';
  a.passwordSignIn(false); a.passwordSignIn(true);
  await tick();
  return calls.pw.length === 1 && calls.create.length === 1 && calls.pw[0].email === 'student@college.edu' ? true : JSON.stringify(calls);
});

await check('Password: too short is refused before Firebase', async () => {
  const a = fresh();
  a.showEmailSignInModal('password');
  domStub('email-signin-email').value = 'student@college.edu';
  domStub('email-signin-password').value = '123';
  a.passwordSignIn(false);
  await tick();
  return !calls.pw.length && domStub('email-signin-error').textContent.includes('6 characters') ? true : 'short password sent';
});

await check('Password: wrong password shows a plain message', async () => {
  const a = fresh();
  signInError = { code: 'auth/invalid-credential' };
  a.showEmailSignInModal('password');
  domStub('email-signin-email').value = 'student@college.edu';
  domStub('email-signin-password').value = 'wrongpass';
  a.passwordSignIn(false);
  await tick(); await tick();
  return domStub('email-signin-error').textContent.includes('Email or password is wrong') ? true : domStub('email-signin-error').textContent;
});

await check('Password: Forgot password sends a reset email', async () => {
  const a = fresh();
  a.showEmailSignInModal('password');
  domStub('email-signin-email').value = 'student@college.edu';
  a.sendPasswordReset();
  await tick();
  return calls.reset[0] === 'student@college.edu' ? true : JSON.stringify(calls.reset);
});

await check('Key stays out of backups and cloud sync', async () => {
  const body = (name) => {
    const i = appSrc.indexOf(`function ${name}(`);
    return i < 0 ? null : appSrc.slice(i, appSrc.indexOf('\nfunction ', i + 10));
  };
  for (const fn of ['exportData', 'importData', 'syncToCloud', 'applyCloudDataToLocalState']) {
    const b = body(fn);
    if (b === null) return `${fn} not found`;
    if (b.includes('KEY_EMAIL_LINK_PENDING') || b.includes('cos_email_link_pending')) return `${fn} touches the key`;
  }
  return true;
});

console.log('------------------------------------------------------------------');
console.log(`Email-link sign-in: ${passed}/${total} passed`);
if (errors.length) process.exit(1);
