// ==================================================================
// Clarity Desk: OPENED INSIDE INSTAGRAM / FACEBOOK (in-app browsers)
// ==================================================================
// Locked down here:
//  - which user agents count as an in-app browser (and that Chrome,
//    Safari, Samsung Internet and the installed app do not);
//  - Android gets a one-tap "Open in Chrome" intent link for this page;
//    iPhone gets the "••• → Open in browser" steps; both can copy the link;
//  - Google sign-in is not attempted inside them (Google blocks it), and
//    Settings offers "open in browser first" instead.
// ==================================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear() {} };
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.window = globalThis;
const appended = [];
const el = (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, setAttribute() {}, innerHTML: '' });
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, createElement: el,
  body: { appendChild: (x) => appended.push(x) }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
const nav = { userAgent: '', platform: '', maxTouchPoints: 0 };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { protocol: 'https:', host: 'claritydesk.web.app', hostname: 'claritydesk.web.app', pathname: '/', hash: '#dashboard', search: '' }, configurable: true, writable: true });

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const app = new Function(`${code}\n return { isInAppBrowserUA, detectDevice, chromeIntentUrl, inAppBannerHtml, loginWithGoogle };`)();

const UA = {
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A145F Build/TP1A; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Instagram 312.0.0.34.111 Android',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 12; RMX3511; wv) AppleWebKit/537.36 Chrome/119.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.31.110;]',
  snapchat: 'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Snapchat/12.70.0.42',
  androidWebView: 'Mozilla/5.0 (Linux; Android 11; Redmi Note 9; wv) AppleWebKit/537.36 Version/4.0 Chrome/118.0 Mobile Safari/537.36',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
};

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try { const r = fn(); if (r === true) { passed++; console.log(`✓ [PASS] ${name}`); } else { errors.push(name); console.error(`✗ [FAIL] ${name}: ${r}`); } }
  catch (e) { errors.push(name); console.error(`✗ [ERROR] ${name}: ${e.stack}`); }
}

console.log('==================================================================');
console.log('📱 OPENED INSIDE INSTAGRAM / FACEBOOK');
console.log('==================================================================');

for (const k of ['instagramAndroid', 'instagramIos', 'facebookAndroid', 'snapchat', 'androidWebView']) {
  check(`${k} counts as an in-app browser`, () => app.isInAppBrowserUA(UA[k]) ? true : 'not detected');
}
for (const k of ['chromeAndroid', 'samsung', 'safariIos', 'chromeDesktop']) {
  check(`${k} is a normal browser`, () => !app.isInAppBrowserUA(UA[k]) ? true : 'wrongly detected');
}

check('Android: one-tap "Open in Chrome" for this exact page, plus Copy link', () => {
  nav.userAgent = UA.instagramAndroid;
  const html = app.inAppBannerHtml(app.detectDevice());
  const intent = 'intent://claritydesk.web.app/#dashboard#Intent;scheme=https;package=com.android.chrome;end';
  return app.chromeIntentUrl() === intent && html.includes(intent) && html.includes('Open in Chrome') && html.includes('copyInAppLink()') && html.includes('inside Instagram')
    ? true : html;
});

check('iPhone: "••• → Open in browser" steps and Copy link, no Chrome button', () => {
  nav.userAgent = UA.instagramIos;
  const html = app.inAppBannerHtml(app.detectDevice());
  return html.includes('Open in browser') && html.includes('copyInAppLink()') && !html.includes('intent://') ? true : html;
});

check('Google sign-in is not attempted inside Instagram; the card shows instead', () => {
  nav.userAgent = UA.instagramAndroid; appended.length = 0;
  app.loginWithGoogle();
  return appended.some(x => x.id === 'inapp-banner') ? true : 'no card shown';
});

check('Settings swaps the Google button for "open in browser first" inside in-app browsers', () =>
  appSrc.includes("${detectDevice().inApp\n                ? `<button class=\"btn btn-primary\" onclick=\"showInAppBanner()\"") ? true : 'Settings swap missing');

check('The card is shown on open in an in-app browser', () =>
  appSrc.includes('if (detectDevice().inApp) setTimeout(() => showInAppBanner(), 1200);') ? true : 'init hook missing');

console.log('\n========================================');
console.log(`IN-APP BROWSERS: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
