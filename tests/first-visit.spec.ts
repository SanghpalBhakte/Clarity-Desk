import { test, expect } from '@playwright/test';

// First-visit fixes: the welcome can be left without choosing, an empty add
// stays put, a guessed date says it is a guess, and the tour can be replayed.

const seedReturning = () => {
  localStorage.setItem('cos_onboarding_dismissed', 'true');
  localStorage.setItem('cos_onboarding_done', '1');
  localStorage.setItem('cos_profile', JSON.stringify({ name: 'Test' }));
};

test.describe('Welcome exits', () => {
  test('Escape closes the welcome without asking anything', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('#onboarding-backdrop');
    await expect(welcome).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(welcome).toHaveCount(0);
    await expect(page.locator('#page-dashboard')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('cos_custom_tasks'))).toBeNull();
  });

  test('the close button is a full-size target and closes the welcome', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('#onboarding-backdrop');
    const close = welcome.getByRole('button', { name: 'Close welcome' });
    const box = (await close.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(welcome).toHaveCount(0);
  });

  test('adding with nothing typed keeps the welcome open', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('#onboarding-backdrop');
    await expect(welcome).toBeVisible();
    await page.locator('#ob-due').press('Enter');
    await expect(welcome).toBeVisible();
    await expect(page.locator('#ob-due')).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('cos_onboarding_dismissed'))).toBeNull();
  });
});

test.describe('Add Task', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedReturning);
    await page.goto('/');
    await page.getByRole('button', { name: 'Tasks & Deadlines' }).first().click();
  });

  test('a task with no readable date says the date is a default', async ({ page }) => {
    const bar = page.getByRole('textbox', { name: 'Type a task and press Enter' });
    await bar.fill('Read chapter 4');
    await bar.press('Enter');
    const note = page.locator('#task-due-guess');
    await expect(note).toContainText('set to tomorrow');
    await expect(page.locator('#task-title')).toHaveValue('Read chapter 4');
    await page.locator('#task-due').fill('2030-01-15');
    await expect(note).toHaveCount(0);
  });

  test('a task with a date in it shows no such note', async ({ page }) => {
    const bar = page.getByRole('textbox', { name: 'Type a task and press Enter' });
    await bar.fill('Lab report due Friday');
    await bar.press('Enter');
    await expect(page.locator('#task-title')).toHaveValue('Lab report');
    await expect(page.locator('#task-due-guess')).toHaveCount(0);
  });

  test('the title comes first and takes focus', async ({ page }) => {
    await page.locator('.tk-add').getByTestId('add-task-button').click();
    const title = page.locator('#task-title');
    await expect(title).toBeFocused();
    const titleFirst = await page.evaluate(() => {
      const t = document.getElementById('task-title')!;
      const s = document.getElementById('task-subject')!;
      return !!(t.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(titleFirst).toBe(true);
  });
});

test('Settings can start the tour again without changing first-run state', async ({ page }) => {
  await page.addInitScript(seedReturning);
  await page.goto('/');
  await page.evaluate(() => (window as any).navigateTo('settings'));
  await page.getByRole('button', { name: 'Start the tour' }).click();
  await expect(page.locator('#tour-root .tour-bubble')).toBeVisible();
  await expect(page.locator('#page-dashboard')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cos_timetable_choice'))).toBeNull();
});
