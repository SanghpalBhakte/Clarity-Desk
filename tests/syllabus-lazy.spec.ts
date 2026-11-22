import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: SYLLABUS SCREENS LOAD FROM syllabus-ui.js
// ==================================================================
// The paste → preview → save flow and the topic tap live in a lazy file.
// Nothing is saved before Save, a tap cycles a topic, and it all works
// with no network once the app has been opened (the file is precached).
// Run: npx playwright test tests/syllabus-lazy.spec.ts
// ==================================================================

async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/#subjects', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).showSyllabusPasteModal === 'function');
}

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('cos_syllabus') || '[]'));

async function pasteSaveAndTap(page: Page) {
  await page.evaluate(() => (window as any).showSyllabusPasteModal('Computer Networks'));
  await page.locator('#syl-paste-text').fill('Unit 1: OSI model\nUnit 2: TCP and UDP');
  await page.evaluate(() => (window as any).previewSyllabusPaste());
  expect(await saved(page)).toHaveLength(0);                // preview only, nothing written yet
  await page.evaluate(() => (window as any).confirmSyllabusPaste());
  await expect.poll(async () => (await saved(page))[0]?.topics.length).toBe(2);
  const { subjectKey, id } = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('cos_syllabus')!)[0];
    return { subjectKey: e.subjectKey, id: e.topics[0].id };
  });
  await page.evaluate(([k, i]) => (window as any).cycleSyllabusTopic(k, i), [subjectKey, id]);
  await expect.poll(async () => (await saved(page))[0].topics[0].status).toBe('done');
}

test('paste, review, save and tick a topic', async ({ page }) => {
  await open(page);
  await pasteSaveAndTap(page);
});

test('the same works with no network (syllabus-ui.js is precached)', async ({ context, page }) => {
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).showSyllabusPasteModal === 'function');
    await pasteSaveAndTap(page);
  } finally {
    await context.setOffline(false);
  }
});
