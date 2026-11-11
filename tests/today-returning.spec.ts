import { test, expect, Page } from '@playwright/test';

// Today for a student coming back: the day leads, tasks long past their date
// wait in one "older tasks" line (nothing closed or deleted until the student
// picks), and attendance shows once, in its own section.

const cls = (subject: string, code: string, time: string, end: string) => ({ subject, code, time, end, type: 'lecture', batches: [] });
const DAY = [cls('Data Structures', 'DS', '09:00', '10:00'), cls('DBMS', 'DBMS', '11:00', '12:00')];
const TT = { 0: DAY, 1: DAY, 2: DAY, 3: DAY, 4: DAY, 5: DAY, 6: DAY };
const task = (id: string, title: string, dueDate: string) => ({ id, subject: 'General', title, taskType: 'assignment', dueDate, priority: 'medium', status: 'pending' });
const TASKS = [
  task('old-1', 'DBMS assignment', '2026-08-01'),
  task('old-2', 'Revise trees', '2026-08-05'),
  task('late-1', 'OS quiz', '2026-09-22'),
  task('soon-1', 'CN worksheet', '2026-09-26'),
];

async function seed(page: Page, extra: Record<string, unknown> = {}, realClock = false) {
  // A faked clock holds the page's re-render after a tap, so tap tests use the real one.
  if (!realClock) await page.clock.setFixedTime(new Date('2026-09-24T07:00:00'));
  await page.addInitScript((extra) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
  }, { cos_profile: { name: 'Riya' }, cos_custom_timetable: TT, cos_notified_history: { onb_tt_day: '2026-09-20' }, ...extra });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).toggleStaleTasks === 'function');
}

const statusOf = (page: Page, id: string) => page.evaluate((id) =>
  (JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]').find((t: any) => t.id === id) || {}).status, id);

test('older tasks fold into one line; the day and recent tasks lead', async ({ page }) => {
  await seed(page, { cos_custom_tasks: TASKS });
  const today = page.locator('#page-dashboard');
  await expect(today.locator('.desk-greeting-sub')).toHaveText('1 task slipped. Pick a new day or mark it done.');
  await expect(today.locator('.task-ledger-item')).toHaveCount(2);
  await expect(today.locator('.task-ledger-item').first()).toContainText('OS quiz');
  await expect(today.locator('.stale-line')).toContainText('2 older tasks from August');
  await expect(today).not.toContainText('DBMS assignment');
  await expect(today).not.toContainText(/\d{2,} days overdue/);
  await expect(today.locator('.stale-list')).toBeHidden();
});

test('with only older tasks late, the headline talks about the day', async ({ page }) => {
  await seed(page, { cos_custom_tasks: TASKS.filter((t) => t.id !== 'late-1') });
  await expect(page.locator('#page-dashboard .desk-greeting-sub')).toHaveText('2 classes today, first at 9:00 AM.');
});

test('"Look through" lists older tasks; Done closes one, and "Mark these N done" only appears inside the open list, with Undo', async ({ page }) => {
  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  await seed(page, { cos_custom_tasks: [task('old-1', 'DBMS assignment', inDays(-40)), task('old-2', 'Revise trees', inDays(-39)), task('old-3', 'Read chapter 4', inDays(-38)), task('soon-1', 'CN worksheet', inDays(2))] }, true);
  const today = page.locator('#page-dashboard');
  // Collapsed: no bulk action next to the summary.
  await expect(today.getByRole('button', { name: /^Mark (all|these)/ })).toHaveCount(0);
  await today.getByRole('button', { name: 'Look through' }).click();
  const list = today.locator('#stale-list');
  await expect(list).toBeVisible();
  await expect(today.locator('.stale-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(list.locator('.stale-row')).toHaveCount(3);
  await expect(list.locator('.stale-row').first()).toContainText('was due');
  // "General" is a filler subject, so the row leaves it out.
  await expect(list.locator('.stale-row').first()).not.toContainText('General');

  // A person's pace: renderPage skips a second render inside 50 ms (double-tap guard).
  const pause = () => page.waitForTimeout(120);
  await pause();
  await list.locator('.stale-row', { hasText: 'DBMS assignment' }).getByRole('button', { name: 'Done' }).click();
  // Closed; past 14 days, the existing rule also clears it from the list.
  expect(await statusOf(page, 'old-1')).not.toBe('pending');
  await expect(today.locator('.stale-line')).toContainText('2 older tasks from');

  await pause();
  await today.getByRole('button', { name: 'Mark these 2 done' }).click();
  expect(await statusOf(page, 'old-2')).not.toBe('pending');
  expect(await statusOf(page, 'old-3')).not.toBe('pending');
  await expect(today.locator('.stale-tasks')).toHaveCount(0);
  await pause();
  await page.locator('.toast', { hasText: '2 older tasks marked done' }).getByRole('button', { name: 'Undo' }).click();
  expect(await statusOf(page, 'old-2')).toBe('pending');
  expect(await statusOf(page, 'old-3')).toBe('pending');
  await expect(today.locator('.stale-line')).toContainText('2 older tasks');
  // Undo brings a cleared task back whole.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]').find((t: any) => t.id === 'old-2')?.title)).toBe('Revise trees');
});

test('attendance shows once, in its own section, with no empty bar', async ({ page }) => {
  await seed(page, { cos_custom_tasks: [] });
  const today = page.locator('#page-dashboard');
  await expect(today.getByText('Want your attendance %?')).toHaveCount(1);
  await expect(today.locator('.dashboard-right-panel > .dashboard-panel:first-child')).toContainText('Want your attendance %?');
  await expect(today.locator('.dashboard-right-panel > .dashboard-panel:first-child .att-gauge')).toHaveCount(0);
  await expect(today.locator('.dashboard-right-panel > .dashboard-panel:first-child').getByRole('button', { name: 'Add counts' })).toBeVisible();
});

test('phone: the first class and its time are on the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, { cos_custom_tasks: TASKS });
  const first = page.locator('#page-dashboard .rail-row').first();
  await expect(first).toBeVisible();
  const box = (await first.boundingBox())!;
  expect(box.y + box.height).toBeLessThan(812 - 64);   // above the tab bar
});
