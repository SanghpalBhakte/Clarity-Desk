import { test, expect, Page } from '@playwright/test';

// "Photo as reference" on the welcome: the photo is shown in a check sheet,
// then pinned in the Add Task form. It lives in memory only and is never saved.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = (name = 'notice.png') => ({ name, mimeType: 'image/png', buffer: PNG });

async function welcome(page: Page) {
  await page.goto('/');
  await expect(page.locator('#onboarding-backdrop')).toBeVisible();
}
async function pick(page: Page, file: any) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Use a photo' }).click()]);
  await chooser.setFiles(file);
}
const sheet = (page: Page) => page.locator('#photo-step-backdrop');

test.describe('Photo as reference', () => {
  test('sits beside Paste a class-group message, below the primary action, with honest copy', async ({ page }) => {
    await welcome(page);
    const add = await page.locator('#onboarding-backdrop').getByRole('button', { name: 'Add deadline' }).boundingBox();
    const paste = await page.getByRole('button', { name: 'Paste a class-group message' }).boundingBox();
    const ref = await page.getByRole('button', { name: 'Use a photo' }).boundingBox();
    expect(Math.abs(paste!.y - ref!.y)).toBeLessThan(6);
    expect(ref!.y).toBeGreaterThan(add!.y + add!.height);
    expect(ref!.height).toBeLessThan(add!.height);
    await expect(page.locator('.ob-lede')).toContainText('Add one deadline, message, or photo. Clarity Desk puts it in order, so you know what to do first.');
  });

  test('a non-image is rejected and the welcome stays', async ({ page }) => {
    await welcome(page);
    await pick(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
    await expect(page.getByText('That file is not a photo')).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('#onboarding-backdrop')).toBeVisible();
  });

  test('sheet is a labelled dialog, traps Tab, hides the welcome, and Escape/Cancel return focus', async ({ page }) => {
    await welcome(page);
    await pick(page, photo());
    const dlg = sheet(page).getByRole('dialog', { name: 'Keep this notice open' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute('aria-describedby', 'photo-step-desc');
    await expect(page.locator('#onboarding-backdrop')).toHaveJSProperty('inert', true);
    await expect(page.getByRole('button', { name: 'Continue to the Add Task form' })).toBeFocused();
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('#photo-step-backdrop'))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#photo-step-backdrop'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('#onboarding-backdrop')).toHaveJSProperty('inert', false);
    await expect(page.getByRole('button', { name: 'Use a photo' })).toBeFocused();
    await pick(page, photo());
    await sheet(page).getByRole('button', { name: 'Cancel and go back' }).click();
    await expect(page.getByRole('button', { name: 'Use a photo' })).toBeFocused();
    await expect(page.locator('#onboarding-backdrop')).toBeVisible();
  });

  test('retake replaces the temporary image and frees the old one', async ({ page }) => {
    await welcome(page);
    await pick(page, photo());
    const first = await sheet(page).locator('img').getAttribute('src');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), sheet(page).getByRole('button', { name: 'Retake the photo' }).click()]);
    await chooser.setFiles(photo('second.png'));
    await expect(sheet(page).locator('img')).toBeVisible();
    const second = await sheet(page).locator('img').getAttribute('src');
    expect(second).not.toBe(first);
    const stillLoads = await page.evaluate((u) => fetch(u!).then(() => true, () => false), first);
    expect(stillLoads).toBe(false);
  });

  test('Continue pins the photo in Add Task; hide, show, remove, and closing the form release it; nothing is persisted', async ({ page }) => {
    await welcome(page);
    const dbsBefore = await page.evaluate(async () => (await indexedDB.databases()).length);
    await pick(page, photo());
    await sheet(page).getByRole('button', { name: 'Continue to the Add Task form' }).click();
    const ref = page.locator('#add-task-backdrop .ob-ref');
    await expect(ref.locator('img')).toBeVisible();
    await expect(ref).toContainText('Not saved');
    const src = await ref.locator('img').getAttribute('src');
    await ref.getByRole('button', { name: 'Hide reference photo' }).click();
    await expect(ref.locator('img')).toBeHidden();
    await ref.getByRole('button', { name: 'Show reference photo' }).click();
    await expect(ref.locator('img')).toBeVisible();
    const persisted = await page.evaluate(async () => {
      const ls = Object.keys(localStorage).some(k => /blob:|data:image/.test(localStorage.getItem(k) || ''));
      return { ls, dbs: (await indexedDB.databases()).length };
    });
    expect(persisted.ls).toBe(false);
    expect(persisted.dbs).toBe(dbsBefore);
    await page.locator('#add-task-backdrop .modal-close').click();
    await expect(page.locator('.ob-ref')).toHaveCount(0);
    expect(await page.evaluate((u) => fetch(u!).then(() => true, () => false), src)).toBe(false);
  });

  test('Remove drops the photo but keeps the form', async ({ page }) => {
    await welcome(page);
    await pick(page, photo());
    await sheet(page).getByRole('button', { name: 'Continue to the Add Task form' }).click();
    const src = await page.locator('#add-task-backdrop .ob-ref img').getAttribute('src');
    await page.getByRole('button', { name: 'Remove reference photo' }).click();
    await expect(page.locator('.ob-ref')).toHaveCount(0);
    await expect(page.locator('#task-title')).toBeVisible();
    expect(await page.evaluate((u) => fetch(u!).then(() => true, () => false), src)).toBe(false);
  });

  test('Paste a message still opens the message import', async ({ page }) => {
    await welcome(page);
    await page.getByRole('button', { name: 'Paste a class-group message' }).click();
    await expect(page.getByTestId('wa-import-modal')).toBeVisible();
  });

  test('390px: the form with a photo has no sideways scroll and a bounded preview', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await welcome(page);
    await pick(page, photo());
    await sheet(page).getByRole('button', { name: 'Continue to the Add Task form' }).click();
    const img = await page.locator('#add-task-backdrop .ob-ref img').boundingBox();
    expect(img!.height).toBeLessThanOrEqual(780 * 0.22 + 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
