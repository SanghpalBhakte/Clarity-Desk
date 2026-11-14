import { test, expect, Page } from '@playwright/test';

// While Welcome is open the app behind it is inert: Tab stays on the sheet.
// When Welcome closes, the app answers again.

// Tab once per control on the sheet: every stop stays on it (nothing behind is reachable).
async function tabThroughWelcome(page: Page) {
  const n = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#onboarding-backdrop button, #onboarding-backdrop input, #onboarding-backdrop a[href], #onboarding-backdrop summary')]
    .filter(e => e.checkVisibility() && !(e as HTMLButtonElement).disabled && e.tabIndex >= 0).length);
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#onboarding-backdrop'))).toBe(true);
  }
}

test('Welcome traps Tab on the sheet and gives the app back on close', async ({ page }) => {
  await page.goto('/');
  const box = page.locator('#onboarding-modal-box');
  await expect(box).toBeVisible();
  await page.waitForTimeout(800);

  expect(await page.evaluate(() => ['.skip-link', '.app-shell', '.bottom-nav', '.fab', '#cd-assistant-panel']
    .every(s => (document.querySelector(s) as HTMLElement).inert))).toBe(true);

  await tabThroughWelcome(page);

  await page.getByRole('button', { name: 'Close welcome' }).click();
  await expect(page.locator('#onboarding-backdrop')).toHaveCount(0);
  expect(await page.evaluate(() => ['.skip-link', '.app-shell', '.bottom-nav', '.fab']
    .every(s => !(document.querySelector(s) as HTMLElement).inert))).toBe(true);

  await page.evaluate(() => (window as any).navigateTo('assignments'));
  await expect(page.locator('#page-assignments')).toBeVisible();

  // Reopen: the app is inert again and Tab is trapped on the sheet again.
  await page.evaluate(() => (window as any).showOnboardingModal());
  await expect(box).toBeVisible();
  expect(await page.evaluate(() => (document.querySelector('.app-shell') as HTMLElement).inert)).toBe(true);
  await tabThroughWelcome(page);
  await page.getByRole('button', { name: 'Close welcome' }).click();
  expect(await page.evaluate(() => (document.querySelector('.app-shell') as HTMLElement).inert)).toBe(false);
});

// The smallest phone with the keyboard open: Add stays reachable by keyboard.
test('Welcome Add button is reachable by Tab at 320x330', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 330 });
  await page.goto('/');
  await expect(page.locator('#onboarding-modal-box')).toBeVisible();
  await page.waitForTimeout(800);
  const add = page.locator('#onboarding-modal-box').getByRole('button', { name: 'Add deadline', exact: true });
  await page.locator('#ob-due').focus();
  await page.keyboard.press('Tab');
  await expect(add).toBeFocused();
  await expect(add).toBeInViewport({ ratio: 0.95 });
});

// The one-time "Slide me sideways" tip never sits over a button or link.
test('the FAB tip never covers a control', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.removeItem('fabHintDismissed');
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigateTo === 'function');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    const hit = await page.evaluate(() => {
      const t = document.querySelector('.fab-hint');
      if (!t) return null;
      const h = t.getBoundingClientRect();
      return [...document.querySelectorAll('button, a[href], input, select, summary')].filter(c => {
        if (c.closest('.fab')) return false;
        const r = c.getBoundingClientRect();
        return r.width && r.height && r.left < h.right && r.right > h.left && r.top < h.bottom && r.bottom > h.top;
      }).length;
    });
    expect(hit === null || hit === 0).toBe(true);
  }
});
