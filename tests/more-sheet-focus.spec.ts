import { test, expect } from '@playwright/test';

// Phone More sheet is a modal dialog: Tab stays on the sheet and the dock,
// Escape closes it and puts focus back on More, and the page answers again.
test('More sheet keeps Tab off the page behind and Escape returns to More', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');

  await page.focus('#bnav-more');
  await page.keyboard.press('Enter');
  await expect(page.locator('#more-sheet')).toHaveAttribute('aria-hidden', 'false');
  expect(await page.evaluate(() => (document.querySelector('.app-shell') as HTMLElement).inert)).toBe(true);

  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    // Tab may leave the document for the browser's own bar (body), never land in the page behind.
    expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('#more-sheet, .bottom-nav'))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(page.locator('#more-sheet')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('bnav-more');
  expect(await page.evaluate(() => ['.skip-link', '.app-shell', '.fab', '#cd-assistant-panel']
    .every(s => !(document.querySelector(s) as HTMLElement).inert))).toBe(true);

  // A sheet item still navigates, and the page is live afterwards.
  await page.click('#bnav-more');
  await page.click('#more-sheet [data-nav="settings"]');
  await expect(page.locator('#page-settings')).toBeVisible();
  expect(await page.evaluate(() => (document.querySelector('.app-shell') as HTMLElement).inert)).toBe(false);
});
