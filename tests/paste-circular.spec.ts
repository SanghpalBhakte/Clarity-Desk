import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: PASTE A MESSAGE OR CIRCULAR
// ==================================================================
// Plain text (a circular, a notice, an email) goes through the same
// review list as a WhatsApp chat: dates are found, and nothing is saved
// until the student confirms.
// Run: npm run test:pwa-smoke
// ==================================================================

const CIRCULAR = 'Circular: Exam form last date is 30/10/2026 at the accounts office.\nFee receipt must be attached.';

async function openTasks(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00'));
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/#assignments', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).showWhatsAppImport === 'function');
}

const savedTasks = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]').length);

test('the empty Tasks page offers "Paste a message or circular"', async ({ page }) => {
  await openTasks(page);
  await expect(page.getByRole('button', { name: /Paste a message or circular/ })).toBeVisible();
  await expect(page.getByText('Paste from WhatsApp')).toHaveCount(0);
});

test('a pasted circular is reviewed first and saved only when confirmed', async ({ page }) => {
  await openTasks(page);
  await page.getByRole('button', { name: /Paste a message or circular/ }).click();
  await expect(page.getByTestId('wa-import-modal')).toContainText('Paste a message or circular');
  await page.getByTestId('wa-paste').fill(CIRCULAR);
  await page.getByTestId('wa-find').click();
  await expect(page.getByTestId('wa-summary')).toContainText('Found 1 upcoming');
  expect(await savedTasks(page)).toBe(0);                 // review only, nothing written yet
  // "Find deadlines" redraws the modal under the still pointer, so Chrome keeps a
  // stale :hover on Import; the global 1px hover lift then flickers while
  // Playwright waits for "stable" and the click hangs. A real tap is not affected.
  // Move the pointer away first, then click for real.
  await page.mouse.move(0, 0);
  await page.getByTestId('wa-import').click();
  await expect.poll(() => savedTasks(page)).toBe(1);
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks')!)[0]);
  expect(t.dueDate).toBe('2026-10-30');
});

test('pasted text with no date saves nothing and says so', async ({ page }) => {
  await openTasks(page);
  await page.evaluate(() => (window as any).showWhatsAppImport());
  await page.getByTestId('wa-paste').fill('Please keep your ID cards with you.');
  await page.getByTestId('wa-find').click();
  await expect(page.getByText('No deadlines found')).toBeVisible();
  expect(await savedTasks(page)).toBe(0);
});
