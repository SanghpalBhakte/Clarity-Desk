import { test, expect, Page } from '@playwright/test';

// Tasks (Register, step 3): the headline names the task to start with,
// tasks more than 14 days late fold into "Older" (same rule as Today) and
// clear in two steps with Undo, and on phones the add line ends the list.

const task = (id: string, title: string, dueDate: string, code = 'OS') => ({ id, subject: code, code, title, taskType: 'assignment', dueDate, priority: 'medium', status: 'pending' });
const OLD = [task('o1', 'DBMS assignment 2', '2026-09-02', 'DBMS'), task('o2', 'Revise trees', '2026-09-05', 'DS'), task('o3', 'CN lab write-up', '2026-09-07', 'CN')];

// 2026-09-24 is a Thursday.
async function open(page: Page, tasks: unknown[], opts: { install?: boolean } = {}) {
  const at = new Date('2026-09-24T08:00:00');
  if (opts.install) await page.clock.install({ time: at });
  else await page.clock.setFixedTime(at);
  await page.addInitScript((tasks) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_profile', JSON.stringify({ name: 'Riya' }));
    localStorage.setItem('cos_custom_tasks', JSON.stringify(tasks));
  }, tasks);
  await page.goto('/#assignments');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  return page.locator('#page-assignments');
}

const headlines: [string, unknown[], string][] = [
  ['one late', [task('a', 'OS quiz', '2026-09-22'), task('b', 'CN worksheet', '2026-09-28', 'CN')], 'Two to do. OS quiz is late. Start there.'],
  ['two late', [task('a', 'OS quiz', '2026-09-21'), task('b', 'DS sheet', '2026-09-23', 'DS')], 'Two to do. Two are late. OS quiz first.'],
  ['due today', [task('a', 'Physics viva prep', '2026-09-24', 'PHY'), task('b', 'CN worksheet', '2026-09-28', 'CN')], 'Two to do. Physics viva prep is due today.'],
  ['next tomorrow', [task('a', 'DBMS ER diagram', '2026-09-25', 'DBMS')], 'One to do. Next: DBMS ER diagram, tomorrow.'],
  ['next later in the week', [task('a', 'CN worksheet', '2026-09-28', 'CN')], 'One to do. Next: CN worksheet, Monday.'],
  ['long title stops at a word', [task('a', 'Submit the complete Design and Analysis of Algorithms assignment 3', '2026-09-23', 'DAA')], 'One to do. Submit the complete… is late. Start there.'],
  ['only older tasks', OLD, 'Nothing needs attention right now.'],
  ['nothing at all', [], 'A clean slate.'],
];
for (const [name, tasks, text] of headlines) {
  test(`headline: ${name}`, async ({ page }) => {
    const tk = await open(page, tasks);
    await expect(tk.locator('.tk-headline')).toHaveText(text);
  });
}

test('older tasks fold into one line, are left out of the headline, and clear in two steps with Undo', async ({ page }) => {
  const tk = await open(page, [task('a', 'OS quiz', '2026-09-22'), ...OLD], { install: true });
  await expect(tk.locator('.tk-headline')).toHaveText('One to do. OS quiz is late. Start there.');
  const older = tk.locator('.tk-group-older');
  await expect(older.locator('summary')).toContainText('Older');
  await expect(older.locator('summary')).toContainText('3 tasks from September');
  await expect(tk.getByRole('button', { name: /^Mark these/ })).toBeHidden();
  await expect(tk.locator('.tk-group-now')).not.toContainText('Revise trees');

  await older.locator('summary').click();
  await expect(older).toContainText('Revise trees');
  const bulk = tk.getByRole('button', { name: 'Mark these 3 done' });
  expect((await bulk.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await bulk.click();
  await page.clock.runFor(300);
  await expect(tk.locator('.tk-group-older')).toHaveCount(0);
  await page.locator('.toast', { hasText: '3 older tasks marked done' }).getByRole('button', { name: 'Undo' }).click();
  await page.clock.runFor(300);
  await expect(tk.locator('.tk-group-older summary')).toContainText('3 tasks from September');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]').filter((t: any) => t.status === 'pending').length)).toBe(4);
});

test('one older task: no bulk button, the row\'s own check box does it', async ({ page }) => {
  const tk = await open(page, [OLD[0]]);
  await tk.locator('.tk-group-older summary').click();
  await expect(tk.locator('.tk-group-older')).toContainText('DBMS assignment 2');
  await expect(tk.getByRole('button', { name: /^Mark these/ })).toHaveCount(0);
});

for (const width of [320, 375]) {
  test(`${width}x812 phone: the add line ends the list and covers nothing`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    const tk = await open(page, [task('a', 'OS quiz', '2026-09-22'), task('b', 'CN worksheet', '2026-09-28', 'CN'), task('c', 'DBMS ER diagram', '2026-09-25', 'DBMS'), ...OLD]);
    const add = tk.locator('.tk-add');
    expect(await add.evaluate((e) => getComputedStyle(e).position)).toBe('static');
    const addBox = (await add.boundingBox())!;
    const lastRow = (await tk.locator('.tk-group-older').boundingBox())!;
    expect(addBox.y, 'add line comes after the list').toBeGreaterThanOrEqual(lastRow.y + lastRow.height - 1);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1), 'no sideways scroll').toBe(true);
    const input = tk.getByRole('textbox', { name: 'Type a task and press Enter' });
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
}

test('a task with no subject shows no "General" label', async ({ page }) => {
  const tk = await open(page, [{ id: 'g', subject: 'General', code: 'GEN', title: 'Pay hostel fee', taskType: 'assignment', dueDate: '2026-09-26', priority: 'medium', status: 'pending' }]);
  const row = tk.locator('.tk-card', { hasText: 'Pay hostel fee' });
  await expect(row.locator('.tk-meta')).not.toContainText('General');
  await expect(row.locator('.tk-meta')).toContainText('in 2 days');
});
