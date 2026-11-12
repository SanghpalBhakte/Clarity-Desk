import { test, expect } from '@playwright/test';

// While Welcome is open the app behind it is inert: Tab stays on the sheet.
// When Welcome closes, the app answers again.

test('Welcome traps Tab on the sheet and gives the app back on close', async ({ page }) => {
  await page.goto('/');
  const box = page.locator('#onboarding-modal-box');
  await expect(box).toBeVisible();
  await page.waitForTimeout(800);

  expect(await page.evaluate(() => ['.skip-link', '.app-shell', '.bottom-nav', '.fab', '#cd-assistant-panel']
    .every(s => (document.querySelector(s) as HTMLElement).inert))).toBe(true);

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#onboarding-backdrop'))).toBe(true);
  }

  await page.getByRole('button', { name: 'Close welcome' }).click();
  await expect(page.locator('#onboarding-backdrop')).toHaveCount(0);
  expect(await page.evaluate(() => !document.querySelector('.app-shell, .bottom-nav, .skip-link, .fab')!.hasAttribute('inert')
    && !(document.querySelector('.app-shell') as HTMLElement).inert)).toBe(true);

  await page.evaluate(() => (window as any).navigateTo('assignments'));
  await expect(page.locator('#page-assignments')).toBeVisible();
});
