import { test, expect } from '@playwright/test';

// A brand-new student types their first deadline on the welcome. They have no
// subjects yet, so the form must not block on Subject, the date words must not
// stay in the title, and Today must not mention classes they never added.
test('a new student\'s first deadline saves in one tap', async ({ page }) => {
  await page.goto('/');
  await page.locator('#ob-due').fill('Lab report due Friday');
  await page.locator('#onboarding-backdrop').getByRole('button', { name: 'Add deadline' }).click();
  const form = page.getByTestId('add-task-modal');
  await expect(form).toBeVisible();
  await expect(page.getByTestId('task-subject')).toHaveValue('General|||GEN');
  await expect(page.getByTestId('task-title')).toHaveValue('Lab report');
  await form.getByRole('button', { name: 'Add Task' }).click();
  await expect(form).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]'));
  expect(stored.map((t: { title: string }) => t.title)).toContain('Lab report');
  await expect(page.locator('#page-dashboard')).not.toContainText('Classes done');
});
