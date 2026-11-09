import { test, expect } from '@playwright/test';

// The Example row on the welcome opens a read-only sample day over the welcome.
// Nothing is saved and the welcome stays, so closing the sample lands back on it.

test.describe('Welcome example row', () => {
  test('opens the sample day, saves nothing and returns focus', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('#onboarding-backdrop');
    await expect(welcome).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try a sample day' })).toHaveCount(0);
    const row = page.getByRole('button', { name: /^Example: Physics assignment, due tomorrow/ });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await row.click();
    const sample = page.locator('#sample-day-backdrop');
    await expect(sample).toBeVisible();
    await expect(welcome).toHaveJSProperty('inert', true);
    expect(await page.evaluate(() => localStorage.getItem('cos_onboarding_dismissed'))).toBeNull();
    await page.keyboard.press('Escape');
    await expect(sample).toHaveCount(0);
    await expect(welcome).toHaveJSProperty('inert', false);
    await expect(row).toBeFocused();
    await row.click();
    await sample.getByRole('button', { name: 'Got it' }).click();
    await expect(sample).toHaveCount(0);
    await expect(row).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('cos_onboarding_dismissed'))).toBeNull();
  });
});
