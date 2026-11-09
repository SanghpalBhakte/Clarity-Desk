import { test, expect } from '@playwright/test';

// The empty Today setup card links to the same read-only example day as the
// welcome. It is labelled Example, saves nothing, and focus returns to the link.

test('empty Today opens the example day, saves nothing and returns focus', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add your timetable' })).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('cos_')).sort().map(k => [k, k === 'cos_usage' ? '' : localStorage.getItem(k)])));
  const link = page.getByRole('button', { name: 'See an example day' });
  await link.focus();
  await page.keyboard.press('Enter');
  const sample = page.getByRole('dialog', { name: 'A sample day' });
  await expect(sample).toBeVisible();
  await expect(sample).toContainText('Example only. Nothing here is saved to your desk.');
  await page.keyboard.press('Escape');
  await expect(sample).toHaveCount(0);
  await expect(link).toBeFocused();
  await link.click();
  await sample.getByRole('button', { name: 'Got it' }).click();
  await expect(link).toBeFocused();
  const after = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('cos_')).sort().map(k => [k, k === 'cos_usage' ? '' : localStorage.getItem(k)])));
  expect(after).toBe(before);
  await expect(page.getByRole('button', { name: 'Add your timetable' })).toBeVisible();
});
