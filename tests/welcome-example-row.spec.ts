import { test, expect } from '@playwright/test';

// "See an example day" (under Set up more later) opens a read-only sample day over the welcome.
// Nothing is saved and the welcome stays, so closing the sample lands back on it.

test.describe('Welcome example day', () => {
  test('opens the sample day, saves nothing and returns focus', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('#onboarding-backdrop');
    await expect(welcome).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try a sample day' })).toHaveCount(0);
    await expect(welcome.getByText('Physics assignment')).toHaveCount(0);
    await welcome.getByText('Set up more later').click();
    const row = welcome.getByRole('button', { name: 'See an example day' });
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

  // Choosing self-study on the welcome must change Today straight away: the
  // timetable ask goes and the countdown ask takes its place.
  test('study without one: Today stops asking for a timetable at once', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('#onboarding-backdrop');
    await welcome.getByText('Set up more later').click();
    await welcome.getByRole('button', { name: 'Study without a timetable' }).click();
    await expect(welcome).toHaveCount(0);
    await expect(page.getByText('Set your exam countdown')).toBeVisible();
    await expect(page.getByText('Have a timetable?')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cos_profile') || '{}').studyMode)).toBe('self');
  });
});
