import { test, expect, Page } from '@playwright/test';

// Tasks page shows each item once: honest section names, subject codes on
// the two-week strip (no legend), subjects as one filter line, and a Later
// fold that says how many of each and what is next.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const at = (offset: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const dayKey = (offset: number) => { const d = at(offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shortDate = (offset: number) => { const d = at(offset); return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear()}`; };

let n = 0;
const task = (o: Record<string, unknown>) => ({ id: `c-${++n}`, subject: 'Data Structures', code: 'DS', title: 'Task', taskType: 'assignment', priority: 'medium', status: 'pending', ...o });
const DEMP = 'Digital Electronics and Microprocessors';

async function open(page: Page, tasks: unknown[]) {
  await page.addInitScript((t) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_custom_tasks', JSON.stringify(t));
  }, tasks);
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigateTo === 'function');
  await page.evaluate(() => (window as any).navigateTo('assignments'));
  await expect(page.locator('#page-assignments .tk-page')).toBeAttached();
}

const head = (page: Page, key: string) => page.locator(`#page-assignments .tk-group-${key} .tk-group-head h2`);

test('late-only first section is "Late", the next one "Next 7 days", no counts', async ({ page }) => {
  await open(page, [task({ dueDate: dayKey(-3) }), task({ dueDate: dayKey(4) })]);
  await expect(head(page, 'now')).toHaveText('Late');
  await expect(head(page, 'week')).toHaveText('Next 7 days');
  await expect(page.locator('#page-assignments .tk-group-head span')).toHaveCount(0);
});

test('today-only first section is "Today"', async ({ page }) => {
  await open(page, [task({ dueDate: dayKey(0) })]);
  await expect(head(page, 'now')).toHaveText('Today');
});

test('late and today reads "Late and today"', async ({ page }) => {
  await open(page, [task({ dueDate: dayKey(-1) }), task({ dueDate: dayKey(0) })]);
  await expect(head(page, 'now')).toHaveText('Late and today');
});

test('strip names the subject, a no-code task shows its title, no legend', async ({ page }) => {
  await open(page, [
    task({ code: 'DEMP', subject: DEMP, title: 'End sem', taskType: 'exam', dueDate: dayKey(2) }),
    task({ code: 'GEN', subject: 'General', title: 'Fee form', dueDate: dayKey(1) }),
  ]);
  const exam = page.locator('.tk-tick.is-exam', { hasText: 'DEMP' });
  await expect(exam).toHaveCount(1);
  await expect(exam).toHaveAttribute('title', /End sem.*Digital Electronics and Microprocessors/);
  await expect(page.locator('.tk-tick', { hasText: 'Fee form' })).toHaveCount(1);
  await expect(page.locator('.tk-strip-key')).toHaveCount(0);
});

test('subjects are one line with full names; picking one names it in full', async ({ page }) => {
  await open(page, [
    task({ code: 'DEMP', subject: DEMP, title: 'End sem', taskType: 'exam', dueDate: dayKey(2) }),
    task({ code: 'DS', subject: 'Data Structures', title: 'End sem', taskType: 'exam', dueDate: dayKey(3) }),
  ]);
  await expect(page.locator('.tk-side')).toHaveCount(0);
  await expect(page.locator('.tk-subj-next')).toHaveCount(0);
  // Polled: rows slide in on page entry, so measure once they settle.
  await expect.poll(() => page.locator('.tk-subj-pick').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size)).toBe(1);
  const demp = page.locator('.tk-subj-pick', { hasText: 'DEMP' });
  await expect(demp).toHaveAttribute('title', DEMP);
  await demp.click();
  await expect(page.locator('.tk-narrow')).toContainText(DEMP);
  await expect(page.locator('.tk-tick', { hasText: 'DS' })).toHaveClass(/is-dim/);
});

test('later summary counts by type and names what is next', async ({ page }) => {
  await open(page, [
    task({ code: 'PBST', subject: 'PBST', title: 'End sem', taskType: 'exam', dueDate: dayKey(9) }),
    task({ code: 'COI', subject: 'COI', title: 'End sem', taskType: 'exam', dueDate: dayKey(20) }),
    task({ title: 'Report', dueDate: dayKey(15) }),
  ]);
  await expect(page.locator('.tk-group-later .tk-fold-sum')).toHaveText(`2 exams, 1 assignment · next PBST ${shortDate(9)}`);
});

test('later with three kinds names two and counts the rest', async ({ page }) => {
  await open(page, [
    task({ code: 'PBST', subject: 'PBST', taskType: 'exam', dueDate: dayKey(9) }),
    task({ taskType: 'exam', dueDate: dayKey(12) }),
    task({ taskType: 'lab', dueDate: dayKey(13) }),
    task({ taskType: 'quiz', dueDate: dayKey(14) }),
  ]);
  await expect(page.locator('.tk-group-later .tk-fold-sum')).toHaveText(new RegExp(`^2 exams, 1 (lab|quiz) \\+ 1 more · next PBST ${shortDate(9)}$`));
});
