import { test, expect, type Page } from '@playwright/test';
import { SAMPLE_DESK, OS, task } from './sample-desk.mjs';

// #457: a subject with no short name shows initials from its full name, never
// its course code, on Tasks, Subjects and Today. Codes that are already short
// names (PBST, OS) stay; a name the student set wins (the sample desk names
// Data Structures "DSA") and can be changed. Tuesday 24 Nov 2026, India time.
test.use({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });

const J = JSON.stringify;
const APS = { subject: 'Art of Public Speaking', code: 'MGM51OEL115', time: '15:00', end: '16:00', type: 'lecture', batches: [] };
const PBST = { subject: 'Probability and Statistics', code: 'PBST', time: '16:15', end: '17:15', type: 'lecture', batches: [] };
const DESK = {
  ...SAMPLE_DESK,
  cos_custom_timetable: J({ 1: [], 2: [OS, APS, PBST], 3: [], 4: [], 5: [], 6: [], 0: [] }),
  cos_custom_tasks: J([
    task('t-ds', { title: 'DS lab record', dueDate: '2026-11-27' }),
    task('t-aps', { subject: 'Art of Public Speaking', code: 'MGM51OEL115', title: 'Speech draft', dueDate: '2026-11-28' }),
    task('t-pb', { subject: 'Probability and Statistics', code: 'PBST', title: 'PBST sheet', dueDate: '2026-11-29' })
  ])
};

async function openDesk(page: Page) {
  await page.clock.install({ time: new Date('2026-11-24T15:30:00+05:30') });
  await page.addInitScript((desk) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(desk)) localStorage.setItem(k, v as string);
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_att_v2_state', JSON.stringify({ mode: 'v2', decidedAt: '2026-09-01T00:00:00Z' }));
  }, DESK);
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigateTo === 'function');
}
const go = (page: Page, where: string) => page.evaluate((w) => (window as any).navigateTo(w), where);
const chips = (page: Page) => page.locator('#page-assignments .tk-subj-name').allInnerTexts();
const rowSubjects = (page: Page) => page.locator('#page-assignments .tk-subj-text').allInnerTexts();

test('Tasks: initials instead of the course code, short names unchanged, own name wins', async ({ page }) => {
  await openDesk(page);
  await go(page, 'assignments');
  expect(await chips(page)).toEqual(expect.arrayContaining(['DSA', 'APS', 'PBST']));
  expect(await rowSubjects(page)).toEqual(expect.arrayContaining(['DSA', 'APS', 'PBST']));
  await expect(page.locator('#page-assignments')).not.toContainText('MGM51OEL115');
  // Filtering still works on the stored code.
  await page.locator('#page-assignments .tk-subj-pick', { hasText: 'APS' }).click();
  await expect(page.locator('#page-assignments .tk-subj-text')).toHaveText(['APS']);
});

test('Subjects and Today: initials in the ring and on the class sheet', async ({ page }) => {
  await openDesk(page);
  await go(page, 'subjects');
  // Rows show the full name, or the short one when it would not fit (#462); the short ones are ready on each row.
  const shorts = await page.locator('#page-subjects .sj-nm b[data-short]').evaluateAll((bs) => bs.flatMap((b) => JSON.parse((b as HTMLElement).dataset.short || '[]')));
  expect(shorts).toEqual(expect.arrayContaining(['APS', 'PBST', 'OS']));
  await expect(page.locator('#page-subjects')).not.toContainText('MGM51OEL115');

  await go(page, 'dashboard');
  const today = page.locator('#page-dashboard');
  await expect(today.locator('.c2-now h2')).toContainText('Art of Public Speaking');
  await expect(today).not.toContainText('MGM51OEL115');
  await today.locator('.c2-now [data-c2-open]').click();
  const row = page.locator('#c2-sheet').getByRole('button', { name: /^Short name/ });
  await expect(row).toContainText('APS');
  await expect(row).toContainText('Made from the name');
  await expect(page.locator('#c2-sheet')).not.toContainText('MGM51OEL115');
});

test('Rename on the subject page: the new name shows everywhere, and clearing it goes back to initials', async ({ page }) => {
  await openDesk(page);
  await page.evaluate(() => (window as any).openSubjectHub('Art of Public Speaking'));
  const hub = page.locator('#page-subjects');
  await expect(hub.locator('.hub-short b')).toHaveText('APS');
  await expect(hub).not.toContainText('MGM51OEL115');
  await hub.getByRole('button', { name: 'Rename' }).click();
  const field = hub.getByRole('textbox', { name: /^Short name for Art of Public Speaking/ });
  await expect(field).toBeFocused();
  await field.fill('Talk');
  await hub.getByRole('button', { name: 'Save' }).click();
  await expect(hub.locator('.hub-short b')).toHaveText('Talk');
  await expect(hub.locator('.hub-ring-code')).toHaveText('Talk');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('cos_strip_labels') || '{}')))
    .toEqual({ 'Data Structures': 'DSA', 'Art of Public Speaking': 'Talk' });

  await go(page, 'assignments');
  expect(await chips(page)).toEqual(expect.arrayContaining(['Talk', 'DSA', 'PBST']));

  // Attendance is stored under the course code, untouched by a rename.
  const att = await page.evaluate(() => localStorage.getItem('cos_attendance'));
  expect(att).toBe(SAMPLE_DESK.cos_attendance);

  await page.evaluate(() => (window as any).openSubjectHub('Art of Public Speaking'));
  await hub.getByRole('button', { name: 'Rename' }).click();
  await hub.getByRole('textbox', { name: /^Short name for/ }).fill('');
  await hub.getByRole('button', { name: 'Save' }).click();
  await expect(hub.locator('.hub-short b')).toHaveText('APS');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('cos_strip_labels') || '{}'))).toEqual({ 'Data Structures': 'DSA' });
});
