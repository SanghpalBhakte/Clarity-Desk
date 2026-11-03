import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: STUDY VAULT DRAG AND DROP
// ==================================================================
// Locked down here:
//  - files dropped on a subject card open the review dialog for that subject;
//  - files dropped elsewhere on the Vault open it with a subject per file;
//  - nothing is saved until Add is pressed;
//  - one file dropped in the Add Material box attaches; several go to review.
// Run: npx playwright test tests/vault-dragdrop.spec.ts --project=chromium-desktop
// ==================================================================

const VAULT = [
  { subject: 'Data Structures', code: 'DS', color: '#394B63', resources: [] },
  { subject: 'Physics', code: 'PHY', color: '#7a3b3b', resources: [] }
];

async function openVault(page: Page) {
  await page.addInitScript((v) => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
    if (!localStorage.getItem('cos_custom_links')) localStorage.setItem('cos_custom_links', JSON.stringify(v));
  }, VAULT);
  await page.goto('/#links', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#link-card-0');
}

// Fires dragover + drop with real File objects at a selector.
async function dropFiles(page: Page, selector: string, names: string[]) {
  await page.evaluate(({ selector, names }) => {
    const dt = new DataTransfer();
    names.forEach((n, i) => dt.items.add(new File([`file ${i}`], n, { type: 'text/plain' })));
    const target = document.querySelector(selector)!;
    for (const type of ['dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }, { selector, names });
}

const links = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_links') || '[]'));

test('drop on a subject card reviews, then adds only on Add', async ({ page }) => {
  await openVault(page);
  await dropFiles(page, '#link-card-1', ['optics-notes.txt', 'lab-manual.txt']);
  await expect(page.locator('#vault-bulk-backdrop')).toBeVisible();
  await expect(page.locator('#vb-title')).toContainText('Physics');
  await expect(page.locator('.vault-bulk-row')).toHaveCount(2);
  expect((await links(page))[1].resources).toHaveLength(0);          // nothing saved yet
  await page.click('#vb-save');
  await expect(page.locator('#vault-bulk-backdrop')).toHaveCount(0);
  const after = await links(page);
  expect(after[1].resources).toHaveLength(2);
  expect(after[0].resources).toHaveLength(0);
});

test('drop elsewhere on the Vault opens review with a subject picker', async ({ page }) => {
  await openVault(page);
  await dropFiles(page, '#vault-grid', ['random.txt']);
  await expect(page.locator('#vault-bulk-backdrop')).toBeVisible();
  await expect(page.locator('#vb-title')).not.toContainText('·');
  await expect(page.locator('.vault-bulk-row')).toHaveCount(1);
});

test('dropping text (no files) does nothing', async ({ page }) => {
  await openVault(page);
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'hello');
    document.getElementById('link-card-0')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(page.locator('#vault-bulk-backdrop')).toHaveCount(0);
});

test('Add Material box: one file attaches, several go to review', async ({ page }) => {
  await openVault(page);
  await page.click('#link-card-0 .link-subject-toggle');           // cards start collapsed
  await page.click('#link-card-0 .btn-add-resource >> nth=0');
  await page.click('#lrm-mode-file-btn');
  await dropFiles(page, '#lrm-drop', ['one.txt']);
  await expect(page.locator('#lrm-file-label')).toContainText('one.txt');
  await expect(page.locator('#lrm-label')).toHaveValue('one.txt');
  await dropFiles(page, '#lrm-drop', ['a.txt', 'b.txt']);
  await expect(page.locator('#link-resource-modal-backdrop')).toHaveCount(0);
  await expect(page.locator('#vb-title')).toContainText('Data Structures');
  await expect(page.locator('.vault-bulk-row')).toHaveCount(2);
});

test('a file dropped outside any drop area is cancelled on the Vault only', async ({ page }) => {
  await openVault(page);
  const drop = () => page.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File(['x'], 'stray.txt'));
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    document.querySelector('.topbar, header, body')!.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(await drop()).toBe(true);
  await page.goto('/#settings');
  await page.waitForFunction(() => !document.getElementById('vault-grid')?.offsetParent);
  expect(await drop()).toBe(false);
});
