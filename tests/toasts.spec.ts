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
    update: () => Promise.resolve(),
    onSnapshot: () => noop,
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
