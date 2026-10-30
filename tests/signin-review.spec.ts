import { test, expect } from '@playwright/test';

// ==================================================================
// Clarity Desk: FIRST SIGN-IN REVIEW (functional, no screenshots)
// ==================================================================
// A phone with its own task signs in (fake Firebase, no network) to an
// account that has a different task. The review must open with three
// choices plus "Decide later", fit a 360px screen without sideways
// scrolling, and every button must be reachable with the keyboard.
// Run: npx playwright test tests/signin-review.spec.ts --project=chromium-desktop
// ==================================================================

const FAKE_FIREBASE = `
(() => {
  const task = (id, title) => ({ id, subject: 'General', code: 'GEN', title, taskType: 'general', noDeadline: true, dueDate: '', priority: 'medium', status: 'pending', marks: 0, isCustom: true });
  const cloudDoc = { customTasks: [task('cloud-1', 'Account task')], profile: { name: 'Student' } };
  const noop = () => {};
  const ref = {
    get: () => Promise.resolve({ exists: false }),
    set: () => { window.__signinWrites = (window.__signinWrites || 0) + 1; return Promise.resolve(); },
    update: () => Promise.resolve(),
    onSnapshot: (opts, cb) => { setTimeout(() => cb({ exists: true, data: () => JSON.parse(JSON.stringify(cloudDoc)), metadata: { hasPendingWrites: false } }), 50); return noop; },
    collection: () => ({ doc: () => ref })
  };
  const firestore = () => ({ settings: noop, collection: () => ({ doc: () => ref }), enablePersistence: () => Promise.resolve() });
  firestore.FieldValue = { delete: () => ({}), serverTimestamp: () => 'ts' };
  firestore.FieldPath = function () {};
  const user = { uid: 'u-review', email: 'student@example.test', displayName: 'Student', providerData: [] };
  const authObj = new Proxy({
    currentUser: user,
    getRedirectResult: () => Promise.resolve(null),
    onAuthStateChanged: (cb) => { setTimeout(() => cb(user), 30); return noop; },
    isSignInWithEmailLink: () => false
  }, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve(null)) });
  const auth = () => authObj;
  auth.GoogleAuthProvider = function () {};
  window.firebase = { apps: [], initializeApp: function () { this.apps.push({}); }, auth, firestore };
})();
`;

test('first sign-in review: 3 choices + Decide later, fits 360px, keyboard reachable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  // Later routes win: the catch-all first, then the fake app script.
  await page.route(/gstatic\.com\/firebasejs\/.*\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_FIREBASE }));
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_custom_tasks', JSON.stringify([{ id: 'phone-1', subject: 'General', code: 'GEN', title: 'Phone task', taskType: 'general', noDeadline: true, dueDate: '', priority: 'medium', status: 'pending', marks: 0, isCustom: true }]));
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const modal = page.locator('#signin-review-backdrop .modal');
  await expect(modal).toBeVisible();
  const buttons = modal.locator('button');
  await expect(buttons).toHaveCount(4);
  await expect(buttons.nth(0)).toContainText('Keep both');
  await expect(buttons.nth(1)).toContainText("account's copy");
  await expect(buttons.nth(2)).toContainText("this phone's copy");
  await expect(buttons.nth(3)).toContainText('Decide later');

  // Fits a 360px screen: no sideways page scroll, the dialog inside the viewport.
  const fit = await page.evaluate(() => {
    const r = document.querySelector('#signin-review-backdrop .modal')!.getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, left: r.left, right: r.right };
  });
  expect(fit.sw).toBeLessThanOrEqual(fit.cw);
  expect(fit.left).toBeGreaterThanOrEqual(0);
  expect(fit.right).toBeLessThanOrEqual(360);

  // Nothing was pushed or merged while the question is open.
  expect(await page.evaluate(() => (window as any).__signinWrites || 0)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]').map((t: any) => t.id))).toEqual(['phone-1']);

  // Keyboard: Tab reaches all four buttons.
  await buttons.nth(0).focus();
  const reached = new Set<string>();
  for (let i = 0; i < 6; i++) {
    reached.add(await page.evaluate(() => (document.activeElement as HTMLElement)?.textContent?.trim().slice(0, 12) || ''));
    await page.keyboard.press('Tab');
  }
  expect([...reached].filter((t) => /Keep both|Use my acco|Use this pho|Decide later/.test(t)).length).toBe(4);

  // Enter on Keep both applies the merge and closes the review.
  await buttons.nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#signin-review-backdrop')).toHaveCount(0);
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]').map((t: any) => t.id).sort());
  expect(ids).toEqual(['cloud-1', 'phone-1']);
  await expect(page.locator('#toast-container .toast-action')).toContainText('Undo');
});
