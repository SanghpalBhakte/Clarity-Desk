import { test, expect, Page } from '@playwright/test';

// The last audit gaps: one line for exams and syllabus on Today, a Weekly
// Review that lists only the classes left to mark, a Study Vault where
// Delete sits behind a menu, and an empty Subject Hubs page with plain words.

async function seed(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript((extra) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
  }, extra);
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
}

test('Today folds the exam countdown and syllabus into one line of links', async ({ page }) => {
  const d = new Date(); d.setDate(d.getDate() + 30);
  const exam = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await seed(page, { cos_profile: { name: 'Test', studyMode: 'self', examDate: exam, examLabel: 'Finals' }, cos_custom_tasks: [] });
  const line = page.locator('#page-dashboard .desk-note-links');
  await expect(line).toHaveCount(1);
  const examLink = line.getByRole('button', { name: /days to Finals/ });
  await expect(examLink).toBeVisible();
  expect(Math.round((await examLink.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await examLink.click();
  await expect(page.locator('#s-exam-label')).toBeVisible();
});

test('Weekly Review lists only classes left to mark, and a tap marks one', async ({ page }) => {
  const cls = { subject: 'Data Structures', code: 'DS', time: '00:01', end: '00:02', type: 'lecture', batches: [] };
  await seed(page, { cos_custom_timetable: { 0: [cls], 1: [cls], 2: [cls], 3: [cls], 4: [cls], 5: [cls], 6: [cls] } });
  await page.evaluate(() => (window as any).navigate('review'));
  const review = page.locator('#page-review');
  await expect(review).toContainText('Weekly Review');
  await expect(review).not.toContainText('Weekly reflection');
  const rows = review.locator('.rv-mark-row');
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  const present = rows.first().getByRole('button', { name: /as present/ });
  expect((await present.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await present.click();
  await expect(rows).toHaveCount(before - 1);
  const marks = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('cos_attendance') || '{}')).flatMap((day: any) => Object.values(day)));
  expect(marks).toEqual(['attended']);
  // Every class of the week, with OD and "didn't happen", stays one tap away.
  await review.locator('details.rv-more').first().locator('> summary').click();
  await expect(review.locator('.att-more-menu button', { hasText: "Didn't happen" }).first()).toBeAttached();
  await expect(review.locator('.rv-att-line')).toContainText('of 1 marked class');
});

test('Study Vault keeps Edit and Delete behind a row menu', async ({ page }) => {
  await seed(page, { cos_custom_links: [{ subject: 'Maths', code: 'MA', color: '#394B63', resources: [{ label: 'Unit 1 notes', url: 'https://example.com/u1' }] }] });
  await page.evaluate(() => (window as any).navigate('links'));
  const row = page.locator('#vault-grid .resource-item-row').first();
  await expect(row).toContainText('Unit 1 notes');
  await expect(row.getByRole('button', { name: 'Delete' })).toBeHidden();
  const more = row.locator('.vault-row-menu > summary');
  expect((await more.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await more.click();
  await expect(row.getByRole('button', { name: 'Delete' })).toBeVisible();
  await row.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('#lrm-label')).toHaveValue('Unit 1 notes');
});

test('Empty Subject Hubs offers three plain ways to start', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => (window as any).navigate('subjects'));
  const hubs = page.locator('#page-subjects');
  await expect(hubs).toContainText('Your shelf is still empty.');
  await expect(hubs.locator('.hubs-empty-rows .more-sheet-item')).toHaveCount(3);
  await hubs.getByRole('button', { name: /Add a subject/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
