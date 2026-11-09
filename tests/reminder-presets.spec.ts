import { test, expect } from '@playwright/test';

// Reminder presets fill the existing choice fields. No notification is sent,
// the saved shape stays the flat cos_notif_prefs, and Undo restores the old mix.

test('presets fill the fields, save the flat prefs, show Custom and undo', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cos_onboarding_dismissed', 'true'));
  await page.goto('/');
  await page.evaluate(() => (window as any).navigate('settings'));
  const get = (id: string) => page.locator('#' + id);
  await expect(page.getByRole('button', { name: 'Balanced' })).toHaveAttribute('aria-pressed', 'true');
  expect((await page.getByRole('button', { name: 'Calm' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: 'Calm' }).click();
  await expect(get('np-class-reminders')).toHaveValue('1_hour');
  await expect(get('np-attendance-alerts')).toHaveValue('weekly');
  await expect(page.getByRole('button', { name: 'Calm' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#np-preset-note')).toContainText('Calm:');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cos_notif_prefs') || '{}'));
  expect(saved).toMatchObject({ classReminders: '1_hour', attendanceAlerts: 'weekly', taskUpcoming: 'day_before', ongoingNudges: 'off' });
  expect(Object.keys(saved).sort()).toEqual(['attendanceAlerts', 'classReminders', 'dailySummaryTime', 'newNotices', 'ongoingNudgeTime', 'ongoingNudges', 'taskOverdue', 'taskUpcoming']);

  await get('np-class-reminders').selectOption('30_min');
  await expect(page.locator('#np-custom')).toBeVisible();
  await expect(page.locator('.np-preset[aria-pressed="true"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Off' , exact: true }).first().click();
  await expect(get('np-task-upcoming')).toHaveValue('off');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(get('np-class-reminders')).toHaveValue('30_min');
  await expect(get('np-task-upcoming')).toHaveValue('day_before');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('cos_notif_prefs') || '{}'))).classReminders).toBe('30_min');
});
