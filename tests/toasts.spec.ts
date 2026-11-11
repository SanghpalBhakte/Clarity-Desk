import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: feedback voice (toasts, queue, saved-location line,
// field errors). Spec: docs/superpowers/specs/2026-11-11-feedback-voice-design.md
// Run: npx playwright test tests/toasts.spec.ts --project=chromium-desktop
// ==================================================================

async function openApp(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
    // Hidden-tab simulation: tests flip window.__hid and fire visibilitychange.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!(window as any).__hid });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => ((window as any).__hid ? 'hidden' : 'visible') });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  // Fake, paused time after start-up, so every timing check is exact; tests move it with runFor.
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 2000));
  // Clear start-up toasts (if any) before each test's own toast.
  await page.evaluate(() => {
    const w = window as any;
    if (w.toastState && w.toastState.visible && w.closeToast) w.closeToast(w.toastState.visible, true);
    document.querySelectorAll('#toast-container .toast').forEach((t) => t.remove());
  });
}

const toastCount = (page: Page) => page.locator('#toast-container .toast.toast-show').count();
const show = (page: Page, msg: string, type?: string, opts?: any) =>
  page.evaluate(([m, t, o]) => { (window as any).showToast(m, t, o); }, [msg, type, opts] as any);
const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => { (window as any).__hid = h; document.dispatchEvent(new Event('visibilitychange')); }, hidden);

test.describe('toast core', () => {
  test.beforeEach(async ({ page }) => { await openApp(page); });

  test('durations follow the table', async ({ page }) => {
    const d = await page.evaluate(() => {
      const f = (window as any).toastDuration;
      return [f('a'.repeat(10), false), f('a'.repeat(200), false), f('ab', true), f('a'.repeat(200), true), f('', false)];
    });
    expect(d).toEqual([4600, 10000, 7000, 12000, 4000]);
  });

  test('item name is text', async ({ page }) => {
    await show(page, 'is done', 'done', { item: '<img src=x onerror="window.__x=1">' });
    await expect(page.locator('.toast-line1 b')).toHaveText('<img src=x onerror="window.__x=1">');
    expect(await page.evaluate(() => (window as any).__x)).toBeUndefined();
  });

  test('ordinary toast closes on time', async ({ page }) => {
    await show(page, 'a'.repeat(20), 'note');   // 4000 + 1200 = 5200 ms
    await page.clock.runFor(5100);
    expect(await toastCount(page)).toBe(1);
    await page.clock.runFor(500);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('fail is sticky and dismissable', async ({ page }) => {
    await show(page, 'Couldn’t sync', 'fail');
    await page.clock.runFor(30000);
    expect(await toastCount(page)).toBe(1);
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await page.clock.runFor(400);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('old type names map to the new kinds', async ({ page }) => {
    await show(page, 'A', 'success');
    await expect(page.locator('.toast.toast-done')).toHaveCount(1);
    await show(page, 'B', 'info', { key: 'k2' });
    await page.clock.runFor(4300);   // A (4060 ms) closes, B shows
    await expect(page.locator('.toast.toast-note')).toHaveCount(1);
    await show(page, 'C', 'error', { key: 'k3' });
    await expect(page.locator('.toast.toast-fail')).toHaveCount(1);
  });

  test('same key updates in place', async ({ page }) => {
    await show(page, 'First text', 'done', { key: 'done:task:1' });
    await show(page, 'Second text', 'done', { key: 'done:task:1' });
    await expect(page.locator('#toast-container .toast')).toHaveCount(1);
    await expect(page.locator('.toast-line1')).toHaveText('Second text');
  });

  test('announced once, in the right region', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__writes = { polite: 0, alert: 0 };
      const watch = (id: string, k: string) => new MutationObserver(() => { (window as any).__writes[k]++; })
        .observe(document.getElementById(id)!, { childList: true, characterData: true, subtree: true });
      watch('cd-announce', 'polite'); watch('cd-alert', 'alert');
    });
    await show(page, 'Saved the note', 'note', { key: 'n1' });
    await expect(page.locator('#cd-announce')).toContainText('Saved the note');
    await expect(page.locator('#cd-alert')).not.toContainText('Saved the note');
    const before = await page.evaluate(() => ({ ...(window as any).__writes }));
    await show(page, 'Saved the note', 'note', { key: 'n1', detail: 'changed line two' });
    const after = await page.evaluate(() => ({ ...(window as any).__writes }));
    expect(after).toEqual(before);
    await show(page, 'Couldn’t sync', 'fail');
    await expect(page.locator('#cd-alert')).toContainText('Couldn’t sync');
    await expect(page.locator('#cd-announce')).not.toContainText('Couldn’t sync');
    expect(await page.locator('#toast-container').getAttribute('aria-live')).toBeNull();
  });

  test('pause: hover holds it, leaving resumes the remainder', async ({ page }) => {
    await show(page, 'a'.repeat(20), 'note');   // 5200 ms
    await page.clock.runFor(2000);
    await page.locator('#toast-container .toast').hover();
    await page.clock.runFor(10000);
    expect(await toastCount(page)).toBe(1);
    await page.mouse.move(5, 5);
    await page.clock.runFor(3000);
    expect(await toastCount(page)).toBe(1);
    await page.clock.runFor(600);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('pause: touch tap then release resumes', async ({ page }) => {
    await show(page, 'a'.repeat(20), 'note');
    const t = page.locator('#toast-container .toast');
    await t.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await page.clock.runFor(8000);
    expect(await toastCount(page)).toBe(1);
    await t.dispatchEvent('pointerup', { pointerType: 'touch' });
    await t.dispatchEvent('pointerleave', { pointerType: 'touch' });
    await page.clock.runFor(5300);
    await expect(t).toHaveCount(0);
  });

  test('pause: keyboard focus holds it, tabbing away resumes', async ({ page }) => {
    await page.evaluate(() => (window as any).showUndoToast('Lab record is done', () => {}));
    await page.locator('.toast-action').focus();
    await page.clock.runFor(20000);
    expect(await toastCount(page)).toBe(1);
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.evaluate(() => document.body.focus());
    await page.clock.runFor(12100);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('paused then updated is not left paused', async ({ page }) => {
    await show(page, 'a'.repeat(20), 'note', { key: 'p1' });
    await page.locator('#toast-container .toast').hover();
    await show(page, 'b'.repeat(20), 'note', { key: 'p1' });
    await page.mouse.move(5, 5);
    await page.clock.runFor(5300);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('pointer safety net releases a lost pointerup', async ({ page }) => {
    await show(page, 'a'.repeat(20), 'note');
    await page.locator('#toast-container .toast').dispatchEvent('pointerdown', { pointerType: 'touch' });
    await page.clock.runFor(20000 + 5300);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('hidden tab pauses and resumes the remainder', async ({ page }) => {
    await show(page, 'a'.repeat(20), 'note');   // 5200 ms
    await page.clock.runFor(2000);
    await setHidden(page, true);
    await page.clock.runFor(30000);
    expect(await toastCount(page)).toBe(1);
    await setHidden(page, false);
    await page.clock.runFor(3000);
    expect(await toastCount(page)).toBe(1);
    await page.clock.runFor(400);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('sticky fail stays across hide and show', async ({ page }) => {
    await show(page, 'Couldn’t sync', 'fail');
    await setHidden(page, true);
    await page.clock.runFor(30000);
    await setHidden(page, false);
    await page.clock.runFor(30000);
    expect(await toastCount(page)).toBe(1);
  });

  test('a toast made while hidden starts its timer when visible', async ({ page }) => {
    await setHidden(page, true);
    await show(page, 'a'.repeat(20), 'note');
    await page.clock.runFor(30000);
    expect(await toastCount(page)).toBe(1);
    await setHidden(page, false);
    await page.clock.runFor(5100);
    expect(await toastCount(page)).toBe(1);
    await page.clock.runFor(300);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('an update while hidden restarts but waits for visible', async ({ page }) => {
    await show(page, 'a'.repeat(20), 'note', { key: 'h1' });
    await page.clock.runFor(4000);
    await setHidden(page, true);
    await show(page, 'b'.repeat(20), 'note', { key: 'h1' });
    await page.clock.runFor(30000);
    expect(await toastCount(page)).toBe(1);
    await setHidden(page, false);
    await page.clock.runFor(5100);
    expect(await toastCount(page)).toBe(1);
    await page.clock.runFor(300);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('no focus steal', async ({ page }) => {
    await page.evaluate(() => document.body.focus());
    const before = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    await show(page, 'Couldn’t sync', 'fail');
    await page.evaluate(() => (window as any).showUndoToast('Lab record is done', () => {}));
    expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).toBe(before);
  });

  test('action names and reading order', async ({ page }) => {
    await page.evaluate(() => (window as any).showUndoToast('is done', () => {}, 'done', { item: 'Lab record', detail: 'On this phone only' }));
    const btn = page.locator('.toast-action');
    await expect(btn).toHaveAccessibleName('Undo');
    const described = await btn.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    await expect(page.locator(`#${described}`)).toHaveText('Lab record is done');
    const order = await page.locator('#toast-container .toast').evaluate((t) =>
      [...t.querySelectorAll('.toast-line1, .toast-line2, .toast-action, .toast-dismiss')].map((e) => e.className.split(' ')[0]));
    expect(order).toEqual(['toast-line1', 'toast-line2', 'toast-action']);
  });

  test('reduced motion stops the thread but not the timer', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await show(page, 'a'.repeat(20), 'note');
    const anims = await page.locator('.toast-thread').evaluate((el) => el.getAnimations().length);
    expect(anims).toBe(0);
    await expect(page.locator('#toast-container .toast .toast-thread')).toBeHidden();
    await page.clock.runFor(5400);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
    await show(page, 'Couldn’t sync', 'fail');
    await expect(page.locator('.toast-fail .toast-thread')).toBeVisible();
  });
});

// ---------------- Task 2: queue and failure priority ----------------
const shown = (page: Page) => page.locator('#toast-container .toast.toast-show');
const visibleLine1 = (page: Page) => shown(page).locator('.toast-line1').textContent();
const visibleLine2 = (page: Page) => shown(page).locator('.toast-line2').textContent();
const dismiss = async (page: Page) => { await page.getByRole('button', { name: 'Dismiss notification' }).click(); };

async function seedTasks(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    const mk = (id: string, title: string) => ({ id, subject: 'DBMS', code: '', title, description: '', taskType: 'assignment', noDeadline: false, dueDate: '2026-11-20', priority: 'medium', status: 'pending', marks: 0, isCustom: true });
    w.state.customTasks = [mk('t1', 'Lab record'), mk('t2', 'Tutorial 4')];
    localStorage.setItem('cos_custom_tasks', JSON.stringify(w.state.customTasks));
    w.navigate('dashboard');
  });
}
const taskStatus = (page: Page, id: string) => page.evaluate((i) =>
  (JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]') as any[]).find((t) => t.id === i)?.status, id);

test.describe('toast queue', () => {
  test.beforeEach(async ({ page }) => { await openApp(page); });

  test('one visible, two waiting, oldest waiting dropped', async ({ page }) => {
    const seen: string[] = [];
    for (const m of ['A', 'B', 'C', 'D']) await show(page, m, 'note', { key: m });
    for (let i = 0; i < 4; i++) {
      const n = await toastCount(page);
      if (!n) break;
      seen.push((await visibleLine1(page)) || '');
      await shown(page).evaluate((el) => (window as any).dismissToast(el.getAttribute('data-key')));
    }
    expect(seen).toEqual(['A', 'C', 'D']);
  });

  test('a failure shows at once over a plain toast, which is closed', async ({ page }) => {
    await show(page, 'Plain', 'note', { key: 'A' });
    await show(page, 'Waiting one', 'note', { key: 'B' });
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    expect(await visibleLine1(page)).toBe('Couldn’t sync');
    await dismiss(page);
    expect(await visibleLine1(page)).toBe('Waiting one');
  });

  test('an Undo toast steps aside and returns with its remaining time', async ({ page }) => {
    await page.evaluate(() => (window as any).showUndoToast('is done', () => {}, 'done', { item: 'Lab record', key: 'done:task:t1' }));
    await page.clock.runFor(2000);                     // 7000 ms toast, 5000 left
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    await page.clock.runFor(60000);
    expect(await visibleLine1(page)).toBe('Couldn’t sync');
    await dismiss(page);
    // The returning toast appears under the resting mouse, which would pause it.
    await page.mouse.move(1, 1);
    expect(await visibleLine1(page)).toBe('Lab record is done');
    await page.clock.runFor(4900);
    expect(await toastCount(page)).toBe(1);
    await page.clock.runFor(300);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('ordinary toasts wait while a failure is open', async ({ page }) => {
    await show(page, 'Couldn’t sync', 'fail', { key: 'f1' });
    await show(page, 'Saved', 'note', { key: 'n1' });
    expect(await visibleLine1(page)).toBe('Couldn’t sync');
    await dismiss(page);
    expect(await visibleLine1(page)).toBe('Saved');
  });

  test('three failures: newest first, count always shown, every one reachable', async ({ page }) => {
    await show(page, 'F1', 'fail', { key: 'f1' });
    await show(page, 'F2', 'fail', { key: 'f2' });
    await show(page, 'F3', 'fail', { key: 'f3', detail: 'Saved here' });
    expect(await visibleLine1(page)).toBe('F3');
    expect(await visibleLine2(page)).toBe('Saved here · 2 more issues');
    await dismiss(page);
    expect(await visibleLine1(page)).toBe('F2');
    expect(await visibleLine2(page)).toBe('1 more issue');
    await dismiss(page);
    expect(await visibleLine1(page)).toBe('F1');
    expect(await shown(page).locator('.toast-line2').count()).toBe(0);
    await dismiss(page);
    await expect(page.locator('#toast-container .toast')).toHaveCount(0);
  });

  test('the same failure twice is one toast and one announcement', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__alerts = 0;
      new MutationObserver(() => { (window as any).__alerts++; }).observe(document.getElementById('cd-alert')!, { childList: true, characterData: true, subtree: true });
    });
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    await expect(page.locator('#cd-alert')).toContainText('Couldn’t sync');
    const a = await page.evaluate(() => (window as any).__alerts);
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    await expect(page.locator('#toast-container .toast')).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).__alerts)).toBe(a);
  });

  test('a duplicate after the original was dismissed shows again', async ({ page }) => {
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    await dismiss(page);
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    expect(await visibleLine1(page)).toBe('Couldn’t sync');
  });

  test('retry resolves in place, never a second failure toast', async ({ page }) => {
    for (const ok of [true, false]) {
      await page.evaluate((good) => {
        const w = window as any;
        w.__resolve = null;
        w.showToast('Couldn’t make the backup file', 'fail', { key: 'fail:backup', action: { label: 'Retry', fn: () => w.retryToast('fail:backup', () => new Promise((r) => { w.__resolve = () => r(good); })) } });
      }, ok);
      await page.getByRole('button', { name: 'Retry' }).click();
      await expect(page.locator('#toast-container .toast.toast-wait .toast-line1')).toHaveText('Trying again…');
      expect(await page.locator('#toast-container .toast-fail').count()).toBe(0);
      await page.evaluate(() => (window as any).__resolve());
      if (ok) await expect(page.locator('#toast-container .toast')).toHaveCount(0);
      else {
        await expect(page.locator('#toast-container .toast-fail')).toHaveCount(1);
        expect(await visibleLine1(page)).toBe('Couldn’t make the backup file');
      }
    }
  });

  test('a retry that fails, then a new different failure: both kept', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any;
      w.showToast('Couldn’t make the backup file', 'fail', { key: 'fail:backup', action: { label: 'Retry', fn: () => w.retryToast('fail:backup', async () => false) } });
    });
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('#toast-container .toast-fail')).toHaveCount(1);
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    expect(await visibleLine1(page)).toBe('Couldn’t sync');
    expect(await visibleLine2(page)).toBe('1 more issue');
    await dismiss(page);
    expect(await shown(page).getAttribute('data-key')).toBe('fail:backup');
  });

  test('tick then untick: one toast, Undo reverses the last action, storage follows', async ({ page }) => {
    await seedTasks(page);
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    expect(await taskStatus(page, 't1')).toBe('submitted');
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    expect(await taskStatus(page, 't1')).toBe('pending');
    await expect(page.locator('#toast-container .toast')).toHaveCount(1);
    expect(await visibleLine1(page)).toBe('Lab record is back on your list');
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await taskStatus(page, 't1')).toBe('submitted');
    await page.evaluate(() => { (window as any).navigate('assignments'); (window as any).navigate('dashboard'); });
    expect(await taskStatus(page, 't1')).toBe('submitted');
  });

  test('Undo after navigating away and back, and after a re-render', async ({ page }) => {
    await seedTasks(page);
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    await page.evaluate(() => { const w = window as any; w.navigate('assignments'); w.navigate('dashboard'); w.navigate('dashboard'); });
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await taskStatus(page, 't1')).toBe('pending');
  });

  test('Undo after a failure was shown and dismissed', async ({ page }) => {
    await seedTasks(page);
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    await dismiss(page);
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await taskStatus(page, 't1')).toBe('pending');
  });

  test('Undo after the task date changed reverts only the tick', async ({ page }) => {
    await seedTasks(page);
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    await page.evaluate(() => {
      const w = window as any;
      const t = w.state.customTasks.find((x: any) => x.id === 't1');
      t.dueDate = '2026-12-01';
      localStorage.setItem('cos_custom_tasks', JSON.stringify(w.state.customTasks));
    });
    await page.getByRole('button', { name: 'Undo' }).click();
    const t = await page.evaluate(() => (JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]') as any[]).find((x) => x.id === 't1'));
    expect([t.status, t.dueDate]).toEqual(['pending', '2026-12-01']);
  });

  test('Undo when the task was deleted elsewhere says so', async ({ page }) => {
    await seedTasks(page);
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    await page.evaluate(() => {
      const w = window as any;
      w.state.customTasks = w.state.customTasks.filter((x: any) => x.id !== 't1');
      localStorage.setItem('cos_custom_tasks', JSON.stringify(w.state.customTasks));
    });
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await visibleLine1(page)).toBe('Couldn’t undo: that task was removed');
    expect(await taskStatus(page, 't1')).toBeUndefined();
  });
});

// ── Saved-location line and sync badge (Task 4) ──────────────────
// Fake Firebase: signed in as u-sync, the account copy was already seen,
// and every push waits until the test resolves or rejects it by hand.
const SYNC_FIREBASE = `
(() => {
  const noop = () => {};
  window.__pushes = [];
  const ref = {
    get: () => Promise.resolve({ exists: false }),
    set: () => new Promise((res, rej) => window.__pushes.push({ res, rej })),
    update: () => (window.__updFail ? Promise.reject({ code: 'unavailable' }) : Promise.resolve()),
    onSnapshot: (o, cb) => { window.__snap = cb; return noop; },
    collection: () => ({ doc: () => ref })
  };
  const firestore = () => ({ settings: noop, collection: () => ({ doc: () => ref }), enablePersistence: () => Promise.resolve() });
  firestore.FieldValue = { delete: () => ({}), serverTimestamp: () => 'ts' };
  firestore.FieldPath = function () {};
  const user = { uid: 'u-sync', email: 'student@example.test', displayName: 'Student', providerData: [] };
  window.__user = user;
  const authObj = new Proxy({
    currentUser: user,
    getRedirectResult: () => Promise.resolve(null),
    onAuthStateChanged: (cb) => { window.__authCb = cb; setTimeout(() => cb(user), 30); return noop; },
    isSignInWithEmailLink: () => false
  }, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve(null)) });
  const auth = () => authObj;
  auth.GoogleAuthProvider = function () {};
  window.firebase = { apps: [], initializeApp: function () { this.apps.push({}); }, auth, firestore };
})();
`;

async function openSignedIn(page: Page) {
  await page.route(/gstatic\.com\/firebasejs\/.*\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: SYNC_FIREBASE }));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__seeded_sync')) return;
    sessionStorage.setItem('__seeded_sync', '1');
    localStorage.setItem('cos_cloud_signed_in', 'true');
    localStorage.setItem('cos_signin_seen', JSON.stringify(['u-sync']));
  });
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).whereSavedLine === 'function' && (window as any).whereSavedLine() !== 'On this phone only');
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 2000));
  await page.evaluate(() => {
    const w = window as any;
    if (w.toastState && w.toastState.visible && w.closeToast) w.closeToast(w.toastState.visible, true);
    document.querySelectorAll('#toast-container .toast').forEach((t) => t.remove());
  });
}

const announcers = (page: Page) => page.evaluate(() => [document.getElementById('cd-announce')!.textContent, document.getElementById('cd-alert')!.textContent]);
const badge = (page: Page) => page.locator('#sync-text').textContent();
const badgeIcon = (page: Page) => page.evaluate(() => document.getElementById('sync-icon')?.textContent || '');
const NO_EMOJI = /^[^\p{Extended_Pictographic}]*$/u;

async function quickAdd(page: Page, text: string) {
  const input = page.locator('#quick-add-input:visible').first();
  await input.fill(text);
  await input.press('Enter');
}
// Let the 2.5 s push debounce run so the fake push is waiting.
const pushWaiting = async (page: Page) => {
  await page.clock.runFor(2600);
  await page.waitForFunction(() => (window as any).__pushes.length > 0);
};
const settlePush = (page: Page, ok: boolean) =>
  page.evaluate((good) => {
    const p = (window as any).__pushes.shift();
    good ? p.res() : p.rej({ code: 'unavailable' });
  }, ok);

test.describe('saved-location line', () => {
  test('signed out says On this phone only', async ({ page }) => {
    await openApp(page);
    await show(page, 'is done', 'done', { item: 'Lab record', where: true });
    expect(await visibleLine2(page)).toBe('On this phone only');
    expect(await badge(page)).toBe('On this phone only');
    expect(await badgeIcon(page)).toMatch(NO_EMOJI);
  });

  test('syncing then synced updates line 2 without a new announcement', async ({ page }) => {
    await openSignedIn(page);
    await quickAdd(page, 'Lab report due tomorrow');
    expect(await visibleLine2(page)).toBe('Saved here · syncing to your account');
    expect(await badge(page)).toBe('Syncing…');
    expect(await badgeIcon(page)).toMatch(NO_EMOJI);
    const before = await announcers(page);
    await pushWaiting(page);
    await settlePush(page, true);
    await expect(shown(page).locator('.toast-line2')).toHaveText('Saved here · synced to your account');
    expect(await announcers(page)).toEqual(before);
    expect(await badge(page)).toMatch(/^Synced · \d{1,2}:\d{2} [AP]M$/);
    expect(await badgeIcon(page)).toMatch(NO_EMOJI);
  });

  test('syncing then failed', async ({ page }) => {
    await openSignedIn(page);
    // With Undo, so it steps aside (not dropped) when the failure arrives.
    await page.evaluate(() => (window as any).showUndoToast('is done', () => {}, 'done', { item: 'Lab record', where: true, key: 'done:task:x' }));
    await page.evaluate(() => (window as any).syncToCloud());
    await pushWaiting(page);
    await settlePush(page, false);
    // The failure toast takes the front; the saved-location toast waits with the new line.
    const t = await page.evaluate(() => {
      const s = (window as any).toastState;
      const all = [s.visible, ...s.failQueue, ...s.ordinaryQueue].filter(Boolean);
      const w = all.find((x: any) => x.key === 'done:task:x');
      return w && w.el ? w.el.querySelector('.toast-line2').textContent : null;
    });
    expect(t).toBe('Saved here · couldn’t sync');
    expect(await badge(page)).toBe('Couldn’t sync · saved here');
    expect(await badgeIcon(page)).toMatch(NO_EMOJI);
  });

  test('offline after saving says waiting to sync', async ({ page, context }) => {
    await openSignedIn(page);
    await show(page, 'is done', 'done', { item: 'Lab record', where: true });
    await page.evaluate(() => (window as any).syncToCloud());
    await context.setOffline(true);
    await expect(page.locator('#toast-container .toast-line2', { hasText: 'Saved here · waiting to sync' })).toHaveCount(1);
    expect(await badge(page)).toBe('Waiting to sync');
    expect(await badgeIcon(page)).toMatch(NO_EMOJI);
    await context.setOffline(false);
  });

  test('sign out mid-push says On this phone only and a late push does not change it', async ({ page }) => {
    await openSignedIn(page);
    await show(page, 'is done', 'done', { item: 'Lab record', where: true, sticky: true });
    await page.evaluate(() => (window as any).syncToCloud());
    await pushWaiting(page);
    await page.evaluate(() => (window as any).logoutUser());
    await expect(page.locator('.toast .toast-line2', { hasText: 'On this phone only' })).toHaveCount(1);
    await settlePush(page, true);
    await page.clock.runFor(50);
    expect(await page.locator('.toast .toast-line2').first().textContent()).toBe('On this phone only');
  });

  test('sign out then in again before the old push lands keeps On this phone only', async ({ page }) => {
    await openSignedIn(page);
    await show(page, 'is done', 'done', { item: 'Lab record', where: true, sticky: true });
    await page.evaluate(() => (window as any).syncToCloud());
    await pushWaiting(page);
    await page.evaluate(() => (window as any).logoutUser());
    await expect(page.locator('.toast .toast-line2', { hasText: 'On this phone only' })).toHaveCount(1);
    await page.evaluate(() => (window as any).__authCb((window as any).__user));
    await settlePush(page, true);
    await page.clock.runFor(50);
    expect(await page.locator('.toast .toast-line2').first().textContent()).toBe('On this phone only');
  });

  test('reload with a pending change while offline says Waiting to sync', async ({ page, context }) => {
    await openSignedIn(page);
    await page.evaluate(() => (window as any).syncToCloud());
    await context.setOffline(true);
    await page.clock.runFor(2600);
    expect(await badge(page)).toBe('Waiting to sync');
    await context.setOffline(false);
  });

  test('critical failures stay in the badge after the toast is dismissed', async ({ page }) => {
    await openSignedIn(page);
    const cases: [any, string][] = [
      [{ code: 'cloud-full' }, 'Couldn’t sync · saved here'],
      [{ code: 'permission-denied' }, 'Sync blocked · saved here'],
      [{ code: 'unavailable' }, 'Couldn’t sync · saved here'],
    ];
    for (const [err, label] of cases) {
      await page.evaluate((e) => (window as any).onCloudPushError(e), err);
      if (await page.getByRole('button', { name: 'Dismiss notification' }).count()) await dismiss(page);
      await page.clock.runFor(400);
      expect(await badge(page)).toBe(label);
      expect(await badgeIcon(page)).toMatch(NO_EMOJI);
    }
  });
});

// ── The thread look and placement (Task 3) ───────────────────────
type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box | null, b: Box | null) => !!a && !!b &&
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const LONG = 'Engineering Mathematics III tutorial sheet on Laplace transforms and the inverse transform, questions 1 to 14 with the extra problems from the reference book for the internal test';
const showLong = (page: Page) => page.evaluate((item) => {
  (window as any).showToast('is done', 'done', { item, sticky: true, action: { label: 'Undo', fn: () => {} } });
}, LONG);
const toastBox = (page: Page) => shown(page).boundingBox();
const atTop = (page: Page) => page.evaluate(() => document.getElementById('toast-container')!.classList.contains('toast-at-top'));

test.describe('toast placement', () => {
  for (const vp of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    test(`does not cover bar or add button at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openApp(page);
      await showLong(page);
      const t = await toastBox(page);
      for (const sel of ['.bottom-nav', '.fab[data-testid="add-task-button"]']) {
        const el = page.locator(sel);
        if (await el.isVisible()) expect(overlaps(t, await el.boundingBox()), sel).toBe(false);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await atTop(page)).toBe(false);
    });
  }

  test('keyboard open moves it up', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'needs a coarse pointer');
    await openApp(page);
    const input = page.locator('#quick-add-input:visible').first();
    await input.focus();
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.4) });
    await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')));
    await showLong(page);
    expect(await atTop(page)).toBe(true);
    expect(overlaps(await toastBox(page), await input.boundingBox())).toBe(false);
  });

  test('sheet open moves it up', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await page.evaluate(() => (window as any).fabAction());
    await expect(page.locator('.modal-backdrop')).toHaveCount(1);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await showLong(page);
    expect(await atTop(page)).toBe(true);
    const submit = page.locator('.modal-backdrop .btn-primary:visible').last();
    expect(overlaps(await toastBox(page), await submit.boundingBox())).toBe(false);
  });

  test('closing the sheet puts it back at the bottom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await page.evaluate(() => (window as any).fabAction());
    await expect(page.locator('.modal-backdrop')).toHaveCount(1);
    await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()));
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await showLong(page);
    expect(await atTop(page)).toBe(false);
  });

  test('small desktop window with no focus stays at the bottom', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only');
    await page.setViewportSize({ width: 900, height: 500 });
    await openApp(page);
    await showLong(page);
    expect(await atTop(page)).toBe(false);
  });

  test('desktop with a focused input stays at the bottom and clear of it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'fine pointer only');
    await openApp(page);
    const input = page.locator('#quick-add-input:visible').first();
    await input.focus();
    await showLong(page);
    expect(await atTop(page)).toBe(false);
    expect(overlaps(await toastBox(page), await input.boundingBox())).toBe(false);
  });

  test('landscape phone with no focus stays at the bottom', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone only');
    await page.setViewportSize({ width: 844, height: 390 });
    await openApp(page);
    await showLong(page);
    expect(await atTop(page)).toBe(false);
  });
});

// WCAG relative-luminance contrast, colours read from the rendered toast.
const CONTRAST_FN = `
  window.__contrast = (fgEl, bgEl, prop) => {
    const parse = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] == null ? 1 : m[3] }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bg = parse(getComputedStyle(bgEl).backgroundColor);
    const raw = parse(getComputedStyle(fgEl)[prop || 'color']);
    const fg = { r: raw.r * raw.a + bg.r * (1 - raw.a), g: raw.g * raw.a + bg.g * (1 - raw.a), b: raw.b * raw.a + bg.b * (1 - raw.a) };
    const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
`;

test.describe('toast contrast', () => {
  for (const theme of ['paper-slate', 'midnight-ink']) {
    test(`contrast in ${theme}`, async ({ page }) => {
      await openApp(page);
      await page.evaluate(([th, fn]) => { document.documentElement.dataset.theme = th; eval(fn); }, [theme, CONTRAST_FN]);
      await page.evaluate(() => (window as any).showToast('is done', 'done', { item: 'Lab record', detail: 'On this phone only', action: { label: 'Undo', fn: () => {} } }));
      const done = await page.evaluate(() => {
        const t = document.querySelector('#toast-container .toast.toast-show') as HTMLElement; const c = (window as any).__contrast;
        return { l1: c(t.querySelector('.toast-line1'), t), l2: c(t.querySelector('.toast-line2'), t), act: c(t.querySelector('.toast-action'), t), thread: c(t.querySelector('.toast-thread'), t, 'backgroundColor') };
      });
      expect(done.l1).toBeGreaterThanOrEqual(4.5);
      expect(done.l2).toBeGreaterThanOrEqual(4.5);
      expect(done.act).toBeGreaterThanOrEqual(4.5);
      expect(done.thread).toBeGreaterThanOrEqual(3);
      await page.evaluate(() => (window as any).showToast('Couldn’t sync to your account', 'fail'));
      const fail = await page.evaluate(() => {
        const t = document.querySelector('#toast-container .toast.toast-fail') as HTMLElement; const c = (window as any).__contrast;
        const em = t.querySelector('.toast-line1 em');
        return { em: em ? c(em, t) : 0, thread: c(t.querySelector('.toast-thread'), t, 'backgroundColor'), bg: getComputedStyle(t).backgroundColor, l1: c(t.querySelector('.toast-line1'), t) };
      });
      expect(fail.em).toBeGreaterThanOrEqual(3);
      expect(fail.thread).toBeGreaterThanOrEqual(3);
      expect(fail.l1).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// ── Errors next to the field (Task 5) ────────────────────────────
const noteFor = (page: Page, sel: string) => page.evaluate((s) => {
  const el = document.querySelector(s) as HTMLElement | null;
  if (!el) return { missing: true } as any;
  const id = el.id ? `fe-${el.id}` : '';
  const note = id ? document.getElementById(id) : null;
  return { text: note ? note.textContent : null, invalid: el.getAttribute('aria-invalid'), describedby: el.getAttribute('aria-describedby') || '', id };
}, sel);
const setValue = (page: Page, sel: string, v: string) => page.evaluate(([s, val]) => {
  const el = document.querySelector(s) as HTMLInputElement;
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, [sel, v]);
const run = (page: Page, js: string) => page.evaluate((code) => { (0, eval)(code); }, js);
const today = () => { const d = new Date(Date.now() + 2000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

type Row = { name: string; open: string; trigger: string; field: string; note: string; valid: string | null };
const SYL = JSON.stringify([{ subjectKey: 'physics', subjectName: 'Physics', examDate: '', topics: [
  { id: 't1', title: 'Optics', status: 'todo', importance: 2 }, { id: 't2', title: 'Waves', status: 'todo', importance: 2 }] }]);
const LINKS = JSON.stringify([{ name: 'Physics', code: 'PHY', color: '#394B63', resources: [] }]);
const ROWS: Row[] = [
  { name: 'timetable row subject', open: `showTimetablePreviewModal([{ day: 'Mon', time: '09:00', end: '10:00', subject: '', type: 'lecture' }])`, trigger: `confirmSaveExtractedTimetable()`, field: '#preview-subject-0', note: 'Monday, 9:00 AM: add the subject name.', valid: 'Physics' },
  { name: 'timetable row time', open: `showTimetablePreviewModal([{ day: 'Tue', time: '25:99', end: '26:99', subject: 'Physics', type: 'lecture' }])`, trigger: `confirmSaveExtractedTimetable()`, field: '#preview-time-0', note: 'Tuesday row, start time: write it like 9:30 AM.', valid: '9:30 AM' },
  { name: 'timetable no classes', open: `showTimetablePreviewModal([])`, trigger: `confirmSaveExtractedTimetable()`, field: '#tt-preview-batch-select', note: 'Add at least one class, or pick "All batches".', valid: null },
  { name: 'holiday start', open: `showHolidayModal(); document.getElementById('holiday-start').value = '2020-01-01'`, trigger: `confirmHolidayModal()`, field: '#holiday-start', note: 'Pick a first day off from today on', valid: '__today__' },
  { name: 'holiday end', open: `showHolidayModal(); document.getElementById('holiday-start').value = '__today__'; const o = document.getElementById('holiday-open'); if (o && o.checked) o.click(); document.getElementById('holiday-end').value = '2020-01-01'`, trigger: `confirmHolidayModal()`, field: '#holiday-end', note: 'The last day off has to be on or after the first', valid: '2099-01-01' },
  { name: 'baseline subject', open: `showBaselineModal(); const s = document.getElementById('ab-subject-select'); if (s) { s.value = '__new__'; s.dispatchEvent(new Event('change', { bubbles: true })); }`, trigger: `saveSubjectBaselineFromModal()`, field: '#ab-new-subject-name', note: 'Pick the subject this baseline is for', valid: 'Physics' },
  { name: 'topic name', open: `localStorage.setItem('cos_syllabus', ${JSON.stringify(SYL)}); showEditSyllabusTopicModal('physics', 't1'); document.getElementById('syl-edit-title').value = ''`, trigger: `saveSyllabusTopicEdit('physics', 't1')`, field: '#syl-edit-title', note: 'Give the topic a name', valid: 'Optics II' },
  { name: 'topic duplicate', open: `localStorage.setItem('cos_syllabus', ${JSON.stringify(SYL)}); showEditSyllabusTopicModal('physics', 't1'); document.getElementById('syl-edit-title').value = 'Waves'`, trigger: `saveSyllabusTopicEdit('physics', 't1')`, field: '#syl-edit-title', note: 'That topic is already in the list', valid: 'Optics II' },
  { name: 'syllabus subject', open: `showAddSyllabusSubjectModal()`, trigger: `confirmAddSyllabusSubject()`, field: '#syl-subj-name', note: 'Type the subject name, like Physics', valid: 'Physics' },
  { name: 'timetable class subject', open: `showTimetableEntryModal(1, null); document.getElementById('tte-subject').value = ''`, trigger: `saveTimetableEntry(1, null)`, field: '#tte-subject', note: 'Type the subject name, like Physics', valid: 'Physics' },
  { name: 'add task title', open: `showAddTaskModal(); document.getElementById('task-subject').selectedIndex = 1`, trigger: `document.querySelector('[data-testid="task-save"]').click()`, field: '#task-title', note: 'Add a title, like "Lab record"', valid: 'Lab record' },
  { name: 'add task date', open: `showAddTaskModal(); document.getElementById('task-title').value = 'Lab record'; document.getElementById('task-subject').selectedIndex = 1; document.getElementById('task-due').value = ''`, trigger: `document.querySelector('[data-testid="task-save"]').click()`, field: '#task-due', note: 'Enter a date, like tomorrow or 12 Nov', valid: '2099-01-01' },
  { name: 'vault subject', open: `addLinkSubject()`, trigger: `saveLinkSubject(null)`, field: '#lsm-name', note: 'Type the subject name, like Physics', valid: 'Physics' },
  { name: 'vault name or link', open: `localStorage.setItem('cos_custom_links', ${JSON.stringify(LINKS)}); addLinkResource(0)`, trigger: `saveLinkResource(0, null)`, field: '#lrm-label', note: 'Add a name and a file or link', valid: 'Notes' },
  { name: 'vault bad link', open: `localStorage.setItem('cos_custom_links', ${JSON.stringify(LINKS)}); addLinkResource(0); document.getElementById('lrm-label').value = 'Notes'; document.getElementById('lrm-url').value = 'javascript:alert(1)'`, trigger: `saveLinkResource(0, null)`, field: '#lrm-url', note: 'Links need to start with http:// or https://', valid: 'https://example.com/notes' },
  { name: 'feedback message', open: `openFeedbackForm({ type: 'bug' })`, trigger: `submitFeedback()`, field: '#fb-message', note: 'Write your message first', valid: 'The timetable is wrong' },
];

test.describe('field errors', () => {
  test.beforeEach(async ({ page }) => { await openApp(page); });

  for (const r of ROWS) {
    test(`field: ${r.name}`, async ({ page }) => {
      await run(page, r.open.replace(/__today__/g, today()));
      await run(page, r.trigger);
      const n = await noteFor(page, r.field);
      expect(n.text).toBe(r.note);
      expect(n.invalid).toBe('true');
      expect(n.describedby.split(' ')).toContain(n.id);
      expect(await page.locator('#toast-container .toast.toast-show').count()).toBe(0);
      if (r.valid) {
        await setValue(page, r.field, r.valid.replace(/__today__/g, today()));
        const after = await noteFor(page, r.field);
        if (!after.missing) {
          expect(after.text).toBeNull();
          expect(after.invalid).toBeNull();
        }
      }
    });
  }

  test('empty add task: notes under each field, first focused, one summary, no toast', async ({ page }) => {
    await run(page, `showAddTaskModal(); document.getElementById('task-due').value = ''`);
    await page.locator('[data-testid="task-save"]').click();
    for (const [sel, note] of [['#task-title', 'Add a title, like "Lab record"'], ['#task-subject', 'Pick a subject or category'], ['#task-due', 'Enter a date, like tomorrow or 12 Nov']]) {
      const n = await noteFor(page, sel);
      expect(n.text).toBe(note);
      expect(n.invalid).toBe('true');
    }
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('task-title');
    expect(await page.evaluate(() => document.getElementById('cd-announce')!.textContent)).toBe('3 fields need a look: task title, subject / category and due date.');
    expect(await page.locator('#toast-container .toast').count()).toBe(0);
  });

  test('re-submitting keeps focus in the invalid field the student is in', async ({ page }) => {
    await run(page, `showAddTaskModal(); document.getElementById('task-due').value = ''`);
    await page.locator('[data-testid="task-save"]').click();
    await page.locator('#task-due').focus();
    await run(page, `submitAddTask()`);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('task-due');
  });

  test('clears only when valid', async ({ page }) => {
    await run(page, `localStorage.setItem('cos_custom_links', ${JSON.stringify(LINKS)}); addLinkResource(0); document.getElementById('lrm-label').value = 'Notes'; document.getElementById('lrm-url').value = 'javascript:x'`);
    await run(page, `saveLinkResource(0, null)`);
    const url = page.locator('#lrm-url');
    await url.focus();
    await url.fill('javascript:y');
    expect((await noteFor(page, '#lrm-url')).text).toBe('Links need to start with http:// or https://');
    await url.fill('https://example.com/a');
    const n = await noteFor(page, '#lrm-url');
    expect([n.text, n.invalid]).toEqual([null, null]);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('lrm-url');
  });

  test('keeps existing describedby', async ({ page }) => {
    await run(page, `showAddTaskModal(); document.getElementById('task-subject').selectedIndex = 1; document.getElementById('task-title').setAttribute('aria-describedby', 'hint1')`);
    await page.locator('[data-testid="task-save"]').click();
    expect((await noteFor(page, '#task-title')).describedby).toBe('hint1 fe-task-title');
    await setValue(page, '#task-title', 'Lab record');
    expect((await noteFor(page, '#task-title')).describedby).toBe('hint1');
  });

  test('note text is plain text', async ({ page }) => {
    await run(page, `showAddTaskModal(); const t = document.getElementById('task-title'); fieldError(t, '<img src=x onerror="window.__fx=1">')`);
    expect(await page.evaluate(() => document.getElementById('fe-task-title')!.textContent)).toBe('<img src=x onerror="window.__fx=1">');
    expect(await page.evaluate(() => (window as any).__fx)).toBeUndefined();
  });
});

// ── Voice review guard (Task 6) ──────────────────────────────────
// A walk through the everyday actions collects every message. Emoji, ✓, ✨
// and ↩ fail the test; everything else goes into the attached voice report
// for a person to read.
const BANNED = /\p{Extended_Pictographic}|✓|✨|↩/u;
const AVOID = [/!/, /successfully/i, /\bplease\b/i, /something went wrong/i, /try again later/i, /\boperation\b/i, /\bsuccess\b/i];
const TECH = /\b[a-z]+-[a-z]+\b|Firebase|Firestore|permission/i;

test.describe('voice', () => {
  test('voice review guard', async ({ page, context }, testInfo) => {
    await openApp(page);
    await page.evaluate(() => {
      const w = window as any;
      w.__seen = [];
      const grab = (el: Element) => {
        if (!(el instanceof HTMLElement) || !(el.classList.contains('toast'))) return;
        w.__seen.push({
          text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
          line1: el.querySelector('.toast-line1')?.textContent || el.textContent || '',
          line2: el.querySelector('.toast-line2')?.textContent || '',
          item: !!el.querySelector('.toast-line1 b'),
          action: el.querySelector('.toast-action')?.textContent || '',
          kind: (el.className.match(/toast-(done|note|wait|fail)/) || [])[1] || (el.classList.contains('celebrate-card') ? 'celebrate' : ''),
        });
      };
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => grab(n as Element))))
        .observe(document.getElementById('toast-container')!, { childList: true });
    });
    test.setTimeout(120000);
    // Each step closes any sheet it opened, so the next one starts clean.
    const step = async (js: string) => {
      await run(page, js);
      await page.clock.runFor(13000);
      await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()));
    };

    // Quick add, tick, Undo.
    await quickAdd(page, 'Lab report due tomorrow');
    await page.clock.runFor(13000);
    const id = await page.evaluate(() => (window as any).state.customTasks.slice(-1)[0].id);
    await run(page, `toggleAssignment('${id}')`);
    const undo = page.getByRole('button', { name: 'Undo' });
    if (await undo.count()) await undo.first().click();
    await page.clock.runFor(13000);
    // Add a subject in the hub, a vault subject and a link.
    await step(`showAddSyllabusSubjectModal(); document.getElementById('syl-subj-name').value = 'Physics'; confirmAddSyllabusSubject()`);
    await step(`addLinkSubject(); document.getElementById('lsm-name').value = 'Physics'; saveLinkSubject(null)`);
    await step(`addLinkResource(0); document.getElementById('lrm-label').value = 'Notes'; document.getElementById('lrm-url').value = 'https://example.com/notes'; saveLinkResource(0, null)`);
    // Settings, backup.
    await step(`saveSettings()`);
    await step(`exportData()`);
    // Offline and back.
    await context.setOffline(true);
    await page.clock.runFor(13000);
    await context.setOffline(false);
    await page.clock.runFor(13000);
    // Mark a class Present when one is on Today.
    await run(page, `navigateTo('dashboard')`);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.beacon-att')].find((x) => /Present/.test(x.textContent || '') && (x as HTMLElement).offsetParent) as HTMLElement | undefined;
      if (b) b.click();
    });
    await page.clock.runFor(13000);
    // Holiday, weekly reset, a celebration.
    await step(`showCelebration('🎉', 'All caught up', 'Every task is done.')`);

    const seen: any[] = await page.evaluate(() => (window as any).__seen);
    const rows = seen.map((t) => {
      const flags = [
        BANNED.test(t.text) ? 'EMOJI' : '',
        ...AVOID.filter((r) => r.test(t.line1 + ' ' + t.line2)).map((r) => `avoid ${r}`),
        TECH.test(t.text) ? 'technical' : '',
        t.line1.length > 60 ? `long (${t.line1.length})` : '',
        t.kind === 'fail' && !t.action ? 'fail without action' : '',
      ].filter(Boolean);
      return `${t.kind.padEnd(9)} | ${t.item ? 'item' : '    '} | ${t.line1} | ${t.line2} | ${t.action} | ${flags.join(', ')}`;
    });
    await testInfo.attach('voice-report', { body: rows.join('\n') || '(no messages)', contentType: 'text/plain' });
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.filter((t) => BANNED.test(t.text)).map((t) => t.text)).toEqual([]);
  });

  test('celebration has no emoji, a hidden ring, one polite announcement', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { document.getElementById('cd-alert')!.textContent = ''; });
    await run(page, `showCelebration('🎉', 'All caught up', 'Every task is done.')`);
    const card = page.locator('#toast-container .celebrate-card');
    await expect(card).toHaveCount(1);
    const text = await card.textContent();
    expect(text).not.toMatch(BANNED);
    await expect(card.locator('.celebrate-ring')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => document.getElementById('cd-announce')!.textContent)).toBe('All caught up. Every task is done.');
    expect(await page.evaluate(() => document.getElementById('cd-alert')!.textContent)).toBe('');
    expect(await page.evaluate(() => { const s = (window as any).toastState; return [s.visible, ...s.ordinaryQueue].filter(Boolean).length; })).toBe(0);
    // Its own box, not an ordinary toast's.
    await expect(card).toHaveClass(/celebrate-card/);
    expect(await card.evaluate((el) => [getComputedStyle(el).paddingRight, getComputedStyle(el).paddingBottom])).toEqual(['18px', '12px']);
  });

  test('a celebration waits while a failure is up', async ({ page }) => {
    await openApp(page);
    await show(page, 'Couldn’t sync', 'fail', { key: 'fail:sync:push' });
    await run(page, `showCelebration('🎉', 'All caught up', 'Every task is done.')`);
    await expect(page.locator('#toast-container .celebrate-card')).toHaveCount(0);
    await dismiss(page);
    await page.clock.runFor(400);
    await expect(page.locator('#toast-container .celebrate-card')).toHaveCount(1);
  });
});

test.describe('sync failure retry', () => {
  test('Retry pushes again, says Trying again…, and closes when the account confirms', async ({ page }) => {
    await openSignedIn(page);
    await page.evaluate(() => (window as any).syncToCloud());
    await pushWaiting(page);
    await settlePush(page, false);
    await expect(shown(page).locator('.toast-line1')).toHaveText('Couldn’t sync to your account');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(shown(page).locator('.toast-line1')).toHaveText('Trying again…');
    await page.waitForFunction(() => (window as any).__pushes.length > 0);
    await settlePush(page, true);
    await page.clock.runFor(400);
    await expect(page.locator('#toast-container .toast-fail')).toHaveCount(0);
    expect(await badge(page)).toMatch(/^Synced/);
  });

  test('a failed Retry turns back into the same failure', async ({ page }) => {
    await openSignedIn(page);
    await page.evaluate(() => (window as any).syncToCloud());
    await pushWaiting(page);
    await settlePush(page, false);
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.waitForFunction(() => (window as any).__pushes.length > 0);
    await settlePush(page, false);
    await expect(shown(page).locator('.toast-line1')).toHaveText('Couldn’t sync to your account');
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1);
  });
});

test.describe('task tick says where', () => {
  test('ticking and unticking a task show the saved-location line', async ({ page }) => {
    await openApp(page);
    await seedTasks(page);
    await run(page, `showToast('x', 'note')`);   // keeps the celebration away: a task is still pending anyway
    await page.evaluate(() => { const w = window as any; if (w.toastState.visible) w.closeToast(w.toastState.visible, true); });
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    expect(await visibleLine1(page)).toBe('Lab record is done');
    expect(await visibleLine2(page)).toBe('On this phone only');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    await page.evaluate(() => (window as any).toggleAssignment('t1'));
    expect(await visibleLine1(page)).toBe('Lab record is back on your list');
    expect(await visibleLine2(page)).toBe('On this phone only');
  });
});

test.describe('review fixes', () => {
  const failKeys = (page: Page) => page.evaluate(() => {
    const ts = (window as any).toastState;
    return [ts.visible, ...ts.failQueue, ...ts.ordinaryQueue].filter((t: any) => t && !t.closed && t.kind === 'fail').map((t: any) => t.msg);
  });

  test('a sign-in error goes away once sign-in works', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => (window as any).handleEmailAuthError({ code: 'auth/wrong-password' }));
    expect(await failKeys(page)).toHaveLength(1);
    await page.evaluate(() => (window as any).finishPasswordSignIn({}));
    expect(await failKeys(page)).toHaveLength(0);
  });

  test('an extra-class error goes away once the class is added', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => (window as any).saveExtraClassFromModal('DBMS'));
    expect(await failKeys(page)).toHaveLength(1);
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="xc-test"><input id="xc-date" value="2026-11-10"><input id="xc-time" value="10:00"><input id="xc-kind" value="lecture"><input id="xc-status" value="attended"></div>');
      (window as any).saveExtraClassFromModal('DBMS');
    });
    expect(await failKeys(page)).toHaveLength(0);
  });

  test('a file-too-big error goes away when a smaller file is picked', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const w = window as any;
      w.handleVaultFileSelect({ target: { files: [{ size: 50 * 1024 * 1024, name: 'big.pdf', type: 'application/pdf' }], value: 'x' } });
    });
    expect(await failKeys(page)).toHaveLength(1);
    await page.evaluate(() => {
      const w = window as any;
      w.handleVaultFileSelect({ target: { files: [new File(['hi'], 'small.txt', { type: 'text/plain' })], value: 'x' } });
    });
    expect(await failKeys(page)).toHaveLength(0);
  });

  test('Retry on a failed report sends the same report even after the form is closed', async ({ page }) => {
    const bodies: string[] = [];
    await page.route(/clarity-desk-feedback/, (r) => {
      bodies.push(r.request().postData() || '');
      const ok = bodies.length > 1;
      r.fulfill({ status: ok ? 200 : 500, contentType: 'application/json', body: ok ? '{"ok":true}' : '{"ok":false,"error":"Server busy"}' });
    });
    await openApp(page);
    await page.evaluate(() => (window as any).openFeedbackForm());
    await page.locator('#fb-message').fill('Timetable shows the wrong room');
    await page.evaluate(() => (window as any).submitFeedback());
    await expect(shown(page).locator('.toast-line1')).toHaveText(/send your report/);
    await page.evaluate(() => document.getElementById('feedback-backdrop')?.remove());
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect.poll(() => bodies.length).toBe(2);
    expect(bodies[1]).toContain('Timetable shows the wrong room');
    await expect(shown(page).locator('.toast-line1')).toHaveText('Report sent');
  });

  test('switching attendance to the ERP way does not claim it synced', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => (window as any).setAttendanceMathMode(true));
    expect(await visibleLine1(page)).toBe('Attendance now matches your ERP');
    expect(await shown(page).locator('.toast-line2').count()).toBe(0);
  });

  test('a change made while an older push is on its way is not shown as synced', async ({ page }) => {
    await openSignedIn(page);
    await quickAdd(page, 'Lab report due tomorrow');
    await pushWaiting(page);
    await quickAdd(page, 'Viva on Friday');
    await settlePush(page, true);
    expect(await badge(page)).toBe('Syncing…');
    expect(await visibleLine2(page)).toBe('Saved here · syncing to your account');
    await pushWaiting(page);
    await settlePush(page, true);
    await page.waitForFunction(() => /^Synced/.test(document.getElementById('sync-text')!.textContent || ''));
  });

  test('a change undone before it is sent does not leave Syncing stuck', async ({ page }) => {
    await openSignedIn(page);
    await quickAdd(page, 'Lab report due tomorrow');
    await pushWaiting(page);
    await settlePush(page, true);
    await page.waitForFunction(() => /^Synced/.test(document.getElementById('sync-text')!.textContent || ''));
    await page.evaluate(() => (window as any).syncToCloud());   // nothing changed since the last push
    expect(await badge(page)).toBe('Syncing…');
    await page.clock.runFor(2600);
    expect(await page.evaluate(() => (window as any).__pushes.length)).toBe(0);
    expect(await badge(page)).toMatch(/^Synced/);
  });

  test('finishing the last task clears its own back-on-your-list message', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const w = window as any;
      const mk = (id: string, title: string) => ({ id, subject: 'DBMS', code: '', title, description: '', taskType: 'assignment', noDeadline: false, dueDate: '2026-11-20', priority: 'medium', status: 'submitted', marks: 0, isCustom: true });
      w.state.customTasks = [mk('t1', 'Lab record')];
      localStorage.setItem('cos_custom_tasks', JSON.stringify(w.state.customTasks));
      w.navigate('dashboard');
      w.toggleAssignment('t1');   // back on the list
      w.toggleAssignment('t1');   // done again: nothing pending, so the celebration shows
    });
    const left = await page.evaluate(() => {
      const ts = (window as any).toastState;
      return [ts.visible, ...ts.failQueue, ...ts.ordinaryQueue].filter((t: any) => t && !t.closed && t.key === 'done:task:t1').length;
    });
    expect(left).toBe(0);
  });
});

test.describe('review fixes: focus, timers, reading, celebration', () => {
  const syncFail = async (page: Page) => {
    await openSignedIn(page);
    await page.evaluate(() => (window as any).syncToCloud());
    await pushWaiting(page);
    await settlePush(page, false);
    await expect(shown(page).locator('.toast-line1')).toHaveText('Couldn’t sync to your account');
  };
  const focusInToast = (page: Page) => page.evaluate(() => {
    const a = document.activeElement;
    return a && a.closest('#toast-container') ? (a.className || a.tagName) : (a ? a.tagName : 'none');
  });

  test('pressing Retry from the keyboard keeps focus in the message', async ({ page }) => {
    await syncFail(page);
    await page.getByRole('button', { name: 'Retry' }).focus();
    await page.keyboard.press('Enter');
    expect(await focusInToast(page)).toBe('toast-dismiss');
    await page.waitForFunction(() => (window as any).__pushes.length > 0);
    await settlePush(page, false);
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1);
    expect(await focusInToast(page)).toBe('toast-action');
  });

  test('a resting mouse does not use up an Undo that stepped aside', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => (window as any).showUndoToast('is done', () => {}, 'done', { item: 'Lab record' }));
    await shown(page).hover();
    await show(page, 'Couldn’t save that', 'fail');
    await page.mouse.move(5, 5);
    await page.clock.runFor(30000);
    // Still waiting its turn, with no countdown running off screen.
    expect(await page.evaluate(() => { const t = (window as any).toastState.ordinaryQueue[0]; return [t.closed, !!t.timer]; })).toEqual([false, false]);
    await dismiss(page);
    expect(await visibleLine1(page)).toBe('Lab record is done');
    expect(await page.evaluate(() => (window as any).toastState.visible?.closed)).toBe(false);
    await page.clock.runFor(1000);
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(1);
  });

  test('line 2 is read out with line 1', async ({ page }) => {
    await openApp(page);
    await show(page, 'is done', 'done', { item: 'Lab record', where: true });
    expect((await announcers(page))[0]).toBe('Lab record is done. On this phone only');
  });

  test('a celebration waits while a retry is still running', async ({ page }) => {
    await syncFail(page);
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.evaluate(() => (window as any).showCelebration('', 'All caught up', 'Every task is done.'));
    await expect(page.locator('.celebrate-card')).toHaveCount(0);
    await page.waitForFunction(() => (window as any).__pushes.length > 0);
    await settlePush(page, true);
    await expect(page.locator('.celebrate-card')).toHaveCount(1);
  });
});

test.describe('review fixes: focus when a failure takes the place', () => {
  test('focus on Undo moves to the failure that pushed it aside, then back', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => (window as any).showUndoToast('is done', () => {}, 'done', { item: 'Lab record' }));
    await page.getByRole('button', { name: 'Undo' }).focus();
    await show(page, 'Couldn’t save that', 'fail');
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('toast-dismiss');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('toast-action');
  });
});

// ── PR #308 review, round 2 ──────────────────────────────────────
test.describe('review round 2: sync truth', () => {
  // The fake Firebase is routed per page; a service worker would serve the real SDK after a reload.
  test.use({ serviceWorkers: 'block' });
  test('two pushes on their way: the first confirmation does not say Synced', async ({ page }) => {
    await openSignedIn(page);
    await quickAdd(page, 'Lab report due tomorrow');
    await pushWaiting(page);
    await quickAdd(page, 'Viva on Friday');
    await page.clock.runFor(2600);
    expect(await page.evaluate(() => (window as any).__pushes.length)).toBe(2);
    await settlePush(page, true);   // the older push
    await page.clock.runFor(50);
    expect(await badge(page)).toBe('Syncing…');
    expect(await page.evaluate(() => (window as any).whereSavedLine())).toBe('Saved here · syncing to your account');
    await settlePush(page, true);   // the newest push
    await page.waitForFunction(() => /^Synced/.test(document.getElementById('sync-text')!.textContent || ''));
  });

  test('a change saved offline still says Waiting to sync after a reload, until it is sent', async ({ page }) => {
    // navigator.onLine follows a flag that survives the reload.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => sessionStorage.getItem('__off') !== '1' });
    });
    await openSignedIn(page);
    await page.evaluate(() => { sessionStorage.setItem('__off', '1'); window.dispatchEvent(new Event('offline')); });
    await quickAdd(page, 'Lab report due tomorrow');
    expect(await badge(page)).toBe('Waiting to sync');
    await page.reload({ waitUntil: 'domcontentloaded' });
    // The fake clock stays paused across the reload: move it until sign-in has run.
    for (let i = 0; i < 50 && !(await page.evaluate(() => !!(window as any).__snap)); i++) await page.clock.runFor(200);
    expect(await badge(page)).toBe('Waiting to sync');
    expect(await page.evaluate(() => (window as any).whereSavedLine())).toBe('Saved here · waiting to sync');
    // Back online: still not synced until the account confirms the change.
    await page.evaluate(() => { sessionStorage.setItem('__off', '0'); window.dispatchEvent(new Event('online')); });
    expect(await badge(page)).toBe('Syncing…');
    // Firestore's own echo of the held write: not a confirmation.
    await page.evaluate(() => (window as any).__snap({ exists: true, metadata: { hasPendingWrites: true, fromCache: false }, data: () => ({}) }));
    expect(await badge(page)).toBe('Syncing…');
    // The account's copy arrives: the phone sends its own copy again and waits for that.
    await page.evaluate(() => (window as any).__snap({ exists: true, metadata: { hasPendingWrites: false, fromCache: false }, data: () => ({ theme: 'paper-slate' }) }));
    expect(await badge(page)).toBe('Syncing…');
    await page.waitForFunction(() => (window as any).__pushes.length > 0);
    await settlePush(page, true);
    await page.waitForFunction(() => /^Synced/.test(document.getElementById('sync-text')!.textContent || ''));
    expect(await page.evaluate(() => localStorage.getItem('cos_sync_waiting'))).toBeNull();
  });

  test('signed out, Back online says where the data is', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    expect(await visibleLine1(page)).toBe('Back online');
    expect(await visibleLine2(page)).toBe('On this phone only');
  });
});

test.describe('review round 2: one announcement per moment', () => {
  const BACK = 'Back on track. You’re at 80%, at or above your 75% target.';
  test('a mark and the back-on-target card are read together, the mark first', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const w = window as any;
      w.showUndoToast('DS · Present · 80% · on target', () => {}, 'done', { key: 'done:att:x' });
      w.showCelebration('', 'Back on track', 'You’re at 80%, at or above your 75% target.');
    });
    expect((await announcers(page))[0]).toBe(`DS · Present · 80% · on target. ${BACK}`);
  });

  test('the same when the card comes first (Mark the day)', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const w = window as any;
      w.showCelebration('', 'Back on track', 'You’re at 80%, at or above your 75% target.');
      w.showUndoToast('3 classes marked Present', () => {}, 'done', { key: 'done:att:day' });
    });
    expect((await announcers(page))[0]).toBe(`3 classes marked Present. ${BACK}`);
  });

  test('"Trying again…" next to a card is read on its own', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const w = window as any;
      w.showCelebration('', 'Back on track', 'You’re at 80%, at or above your 75% target.');
      w.showToast('Couldn’t make the backup file', 'fail', { key: 'fail:backup', action: { label: 'Retry', fn: () => w.retryToast('fail:backup', () => new Promise(() => {})) } });
    });
    await page.getByRole('button', { name: 'Retry' }).click();
    expect((await announcers(page))[0]).toBe('Trying again…');
  });

  test('the fields summary next to a card is read on its own', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const w = window as any;
      w.showCelebration('', 'All caught up', 'Every task is done.');
      const mk = (id: string, label: string) => {
        const l = document.createElement('label'); l.htmlFor = id; l.textContent = label;
        const i = document.createElement('input'); i.id = id;
        document.body.append(l, i);
        return i;
      };
      w.reportFormErrors([{ input: mk('e1', 'Title'), msg: 'Add a title' }, { input: mk('e2', 'Due date'), msg: 'Pick a date' }]);
    });
    expect((await announcers(page))[0]).toBe('2 fields need a look: title and due date.');
  });

  test('a later message is read on its own, and a failure keeps its own region', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => (window as any).showCelebration('', 'Back on track', 'You’re at 80%, at or above your 75% target.'));
    await page.clock.runFor(3000);
    await show(page, 'Lab record saved', 'done', { key: 'k-later' });
    expect((await announcers(page))[0]).toBe('Lab record saved');
    await show(page, 'Couldn’t save that', 'fail');
    await page.evaluate(() => (window as any).showCelebration('', 'All caught up', 'Every task is done.'));
    expect((await announcers(page))[1]).toBe('Couldn’t save that');
  });
});

test.describe('review round 2: names', () => {
  const PREFIX = 'Engineering Mathematics III and Numerical Methods for Computer Science Students, Unit ';
  test('two vault subjects with the same long start get two messages', async ({ page }) => {
    await openApp(page);
    const keys = await page.evaluate((prefix) => {
      const w = window as any;
      for (const end of ['One', 'Two']) {
        document.getElementById('lsm-name')?.remove();
        const input = document.createElement('input');
        input.id = 'lsm-name';
        input.value = prefix + end;
        document.body.appendChild(input);
        w.saveLinkSubject(null);
      }
      const s = w.toastState;
      return [s.visible, ...s.ordinaryQueue].filter(Boolean).map((t: any) => t.key);
    }, PREFIX);
    expect(new Set(keys).size).toBe(2);
  });

  test('long task, subject and vault names wrap on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openApp(page);
    const names = [LONG, PREFIX + 'Four, with the tutorial sheets', 'Laplace_transforms_and_inverse_transforms_question_bank_with_solutions_final_v3.pdf',
      'Notes "final" & <b>bold</b> <img src=x onerror="window.__x=1"> for  Unit  2', 'गणित 📚 数学 Ωmega lab record with a very long name that keeps going on and on'];
    for (const item of names) {
      await page.evaluate((it) => (window as any).showUndoToast('saved to the vault', () => {}, 'done', { item: it, key: 'long', where: true }), item);
      const t = await toastBox(page);
      const undo = await page.getByRole('button', { name: 'Undo' }).boundingBox();
      expect(t!.x).toBeGreaterThanOrEqual(0);
      expect(t!.x + t!.width).toBeLessThanOrEqual(320);
      expect(undo!.x + undo!.width).toBeLessThanOrEqual(320);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      expect(await page.evaluate(() => (window as any).toastState.visible.item)).toBe(item);
      expect(await shown(page).locator('.toast-line1 b').evaluate((b) => [b.textContent, b.children.length])).toEqual([item, 0]);
      expect(await page.evaluate(() => (window as any).__x)).toBeUndefined();
      expect((await announcers(page))[0]).toContain(item);
    }
  });
});

// ── PR #308 review, round 3: the waiting mark and confirmations ──
test.describe('review round 3: confirmations and the waiting mark', () => {
  test.use({ serviceWorkers: 'block' });
  const mark = (page: Page) => page.evaluate(() => localStorage.getItem('cos_sync_waiting'));
  const settleAt = (page: Page, i: number, ok: boolean) =>
    page.evaluate(([idx, good]) => { const p = (window as any).__pushes.splice(idx as number, 1)[0]; good ? p.res() : p.rej({ code: 'unavailable' }); }, [i, ok] as const);

  test('answers out of order: the older one cannot undo Synced or bring the mark back', async ({ page }) => {
    await openSignedIn(page);
    await quickAdd(page, 'Lab report due tomorrow');
    await pushWaiting(page);
    await quickAdd(page, 'Viva on Friday');
    await page.clock.runFor(2600);
    await settleAt(page, 1, true);   // the newest push first
    await page.waitForFunction(() => /^Synced/.test(document.getElementById('sync-text')!.textContent || ''));
    expect(await mark(page)).toBeNull();
    await settleAt(page, 0, true);   // then the older one
    await page.clock.runFor(50);
    expect(await badge(page)).toMatch(/^Synced/);
    expect(await mark(page)).toBeNull();
  });

  test('a failed push keeps the mark until a later push is confirmed', async ({ page }) => {
    await openSignedIn(page);
    await quickAdd(page, 'Lab report due tomorrow');
    expect(JSON.parse((await mark(page))!)).toEqual({ uid: 'u-sync' });   // only the account id
    await pushWaiting(page);
    await settlePush(page, false);
    expect(await mark(page)).not.toBeNull();
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.waitForFunction(() => (window as any).__pushes.length > 0);
    await settlePush(page, true);
    await page.waitForFunction(() => /^Synced/.test(document.getElementById('sync-text')!.textContent || ''));
    expect(await mark(page)).toBeNull();
  });

  test('a push whose delete fails is not confirmed: the mark stays', async ({ page }) => {
    await openSignedIn(page);
    await page.evaluate(() => {
      const w = window as any;
      localStorage.setItem('cos_attendance', JSON.stringify({ '2026-11-10': { a: 'attended' } }));
      localStorage.setItem('cos_sync_last_pushed', JSON.stringify({ attendance: { '2026-11-10': { a: 'attended', b: 'attended' } }, attendanceBaseline: {}, attendanceLive: {} }));
      w.__updFail = true;
      w.syncToCloud();
    });
    await pushWaiting(page);
    await settlePush(page, true);   // the main write lands, the delete does not
    await page.clock.runFor(50);
    expect(await badge(page)).toBe('Couldn’t sync · saved here');
    expect(await mark(page)).not.toBeNull();
  });

  test('Retry waits for the push that carries every change, not an older one', async ({ page }) => {
    await openSignedIn(page);
    await quickAdd(page, 'Lab report due tomorrow');
    await pushWaiting(page);
    await settlePush(page, false);                    // failure toast with Retry
    await quickAdd(page, 'Viva on Friday');
    await pushWaiting(page);                          // an older push on its way
    await quickAdd(page, 'Seminar slides due Monday'); // a newer change, not sent yet
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.waitForFunction(() => (window as any).__pushes.length === 2);
    await settleAt(page, 0, true);                    // the older push is confirmed
    await page.clock.runFor(50);
    await expect(page.locator('#toast-container .toast-line1', { hasText: 'Trying again…' })).toHaveCount(1);
    expect(await badge(page)).toBe('Syncing…');
    await settleAt(page, 0, true);                    // the Retry push
    await page.waitForFunction(() => /^Synced/.test(document.getElementById('sync-text')!.textContent || ''));
    await expect(page.locator('#toast-container .toast-line1', { hasText: 'Trying again…' })).toHaveCount(0);
  });

  test('another account’s mark is ignored', async ({ page }) => {
    await openSignedIn(page);
    await page.evaluate(() => (window as any).syncToCloud());
    await pushWaiting(page);
    await settlePush(page, true);
    await page.waitForFunction(() => /^Synced/.test(document.getElementById('sync-text')!.textContent || ''));
    await page.evaluate(() => localStorage.setItem('cos_sync_waiting', JSON.stringify({ uid: 'someone-else' })));
    expect(await page.evaluate(() => (window as any).whereSavedLine())).toBe('Saved here · synced to your account');
    await page.evaluate(() => localStorage.setItem('cos_sync_waiting', JSON.stringify({ uid: 'u-sync' })));
    expect(await page.evaluate(() => (window as any).whereSavedLine())).toBe('Saved here · syncing to your account');
  });
});
