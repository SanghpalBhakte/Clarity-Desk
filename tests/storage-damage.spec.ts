import { test, expect } from '@playwright/test';

// ==================================================================
// Clarity Desk: damaged saved data. A cut-off or wrong-type value in a
// list/record key must not stop the app from starting; the raw value is
// kept under cos_corrupt_<key>.
// Run: npx playwright test tests/storage-damage.spec.ts --project=chromium-desktop
// ==================================================================

const DAMAGED: Record<string, string> = {
  cos_custom_tasks: '[{"id":"t1","title":"Lab rec',
  cos_attendance: '[1,2,3]',
  cos_assignments: 'not json',
  cos_hidden_subjects: '{"a":1}',
  cos_tombstones: '"x"',
  cos_notified_history: '[]',
  cos_custom_links: '{}',
  cos_user_batch: '2',
};

test('the app starts on Today with damaged saved data, and keeps the raw values', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((damaged) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_timetable_choice', 'aids');
    for (const [k, v] of Object.entries(damaged)) localStorage.setItem(k, v);
  }, DAMAGED);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  await expect(page.locator('#page-dashboard')).toBeVisible();
  await page.evaluate(() => (window as any).navigateTo('assignments'));
  await page.evaluate(() => (window as any).navigateTo('dashboard'));
  expect(errors).toEqual([]);
  const kept = await page.evaluate(() => localStorage.getItem('cos_corrupt_cos_custom_tasks'));
  expect(kept).toBe('[{"id":"t1","title":"Lab rec');
});
