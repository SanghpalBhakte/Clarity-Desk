import { test, expect, Page } from '@playwright/test';

// The welcome is one phone screen: Add, the other ways in, and the two quiet
// exits (Show me around, Log in) are all visible without scrolling. A "New
// version ready" strip never covers it: it waits until the welcome closes.

const sizes = [{ width: 375, height: 812 }, { width: 375, height: 667 }];

async function freshWelcome(page: Page) {
  await page.goto('/');
  await expect(page.locator('#onboarding-modal-box')).toBeVisible();
  // Let the entrance motion settle before measuring.
  await page.waitForTimeout(1200);
}

for (const size of sizes) {
  test(`welcome fits one screen at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await freshWelcome(page);
    for (const name of ['Add deadline', 'Paste a class-group message', 'Use a photo', 'Show me around', 'Log in']) {
      await expect(page.locator('#onboarding-modal-box').getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    const overflow = await page.evaluate(() => {
      const b = document.getElementById('onboarding-backdrop')!;
      return { scroll: b.scrollHeight - b.clientHeight, wide: document.documentElement.scrollWidth - innerWidth };
    });
    expect(overflow.scroll).toBeLessThanOrEqual(1);
    expect(overflow.wide).toBeLessThanOrEqual(0);
  });
}

test('the smallest phones (320x640) scroll down, never sideways, to both exits', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await freshWelcome(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  for (const name of ['Show me around', 'Log in']) {
    const b = page.locator('#onboarding-modal-box').getByRole('button', { name, exact: true });
    await b.scrollIntoViewIfNeeded();
    await expect(b).toBeInViewport({ ratio: 1 });
  }
});

test('an update strip waits until the welcome closes, then shows', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await freshWelcome(page);
  await page.evaluate(() => (window as any).showUpdateAvailableBanner());
  await expect(page.locator('#update-available-banner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close welcome' }).click();
  await expect(page.locator('#onboarding-backdrop')).toHaveCount(0);
  await expect(page.locator('#update-available-banner')).toBeVisible();
  await expect(page.locator('#update-available-banner')).toContainText('New version ready');
});

test('a returning student still gets the update strip at once', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).showUpdateAvailableBanner === 'function');
  await page.evaluate(() => (window as any).showUpdateAvailableBanner());
  await expect(page.locator('#update-available-banner')).toBeVisible();
});
