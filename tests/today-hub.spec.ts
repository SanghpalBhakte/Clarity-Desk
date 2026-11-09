import { test, expect, Page } from '@playwright/test';

// Today leads to the source of what it shows: a task row opens that task on
// Tasks (row open, in view), even when a Tasks filter would hide it or it sits
// in a folded section.

const inDays = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TASKS = [
  { id: 'c-near', subject: 'DS', code: 'DS', title: 'Near task', taskType: 'assignment', dueDate: inDays(2), priority: 'medium', status: 'pending' },
  { id: 'c-far', subject: 'OS', code: 'OS', title: 'Far task', taskType: 'assignment', dueDate: inDays(20), priority: 'low', status: 'pending' },
];

async function open(page: Page) {
  await page.addInitScript((t) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_custom_tasks', JSON.stringify(t));
  }, TASKS);
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).openTaskFromToday === 'function');
}

test('a Today task opens that task on Tasks, past a filter and a fold', async ({ page }) => {
  await open(page);
  // A filter that hides the far task.
  await page.evaluate(() => { (window as any).state.assignFilter = 'today'; });
  const row = page.locator('#page-dashboard [data-task="c-far"]');
  await expect(row).toBeVisible();
  await row.click();
  const card = page.locator('#ac-c-far');
  await expect(card).toBeVisible();
  await expect(card.locator('.assignment-body')).toHaveAttribute('aria-expanded', 'true');
  await expect(card).toBeInViewport();
});

test('"Why this order?" shows one line and saves nothing', async ({ page }) => {
  await open(page);
  const tasksNow = () => page.evaluate(() => [localStorage.getItem('cos_custom_tasks'), localStorage.getItem('cos_assignments')]);
  const before = await tasksNow();
  const why = page.getByRole('button', { name: 'Why this order?' });
  await expect(page.locator('#dash-why-line')).toBeHidden();
  await why.click();
  await expect(page.locator('#dash-why-line')).toHaveText('Late first, then by due date, then ongoing work.');
  await expect(why).toHaveAttribute('aria-expanded', 'true');
  expect(await tasksNow()).toEqual(before);
});
