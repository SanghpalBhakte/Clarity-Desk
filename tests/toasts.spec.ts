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

const toastCount = (page: Page) => page.locator('#toast-container .toast').count();
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
    await expect(page.locator('.toast.toast-note')).toHaveCount(1);
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
