import { test, expect, Page, Browser } from '@playwright/test';
// @ts-ignore -- plain .mjs fixture shared with node tests
import { MESSY_DESK, MESSY_FLAGS, MESSY_AT } from './messy-desk.mjs';

// Big screens (#476): the real app with the messy desk at laptop (1280) and PC (1920) widths, judged by what a
// student sees: panes side by side, the open item beside the list, focus and Esc, and phones left as they were.

test.describe.configure({ mode: 'serial' });

async function open(browser: Browser, baseURL: string | undefined, width: number, hash: string) {
  const ctx = await browser.newContext({ baseURL, viewport: { width, height: width > 800 ? 900 : 852 }, isMobile: width < 800, hasTouch: width < 800, timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(MESSY_AT) });
  await page.addInitScript((d) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v as string);
  }, { ...MESSY_DESK, ...MESSY_FLAGS });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  await page.waitForTimeout(600);
  await page.evaluate((x) => (window as any).navigate(x), hash);
  await page.waitForTimeout(450);
  return { ctx, page };
}

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test.describe('Tasks on a laptop (#477)', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium-desktop', 'sets its own widths'); });

  for (const width of [1280, 1920]) {
    test(`${width}px: the list and the task sheet sit side by side, first Late task shown`, async ({ browser, baseURL }) => {
      const { ctx, page } = await open(browser, baseURL, width, 'assignments');
      const pane = page.getByTestId('task-pane');
      await expect(pane).toBeVisible();
      const list = await box(page, '#page-assignments .tk-main');
      const side = await box(page, '[data-testid="task-pane"]');
      expect(side.x).toBeGreaterThanOrEqual(list.x + list.width);
      expect(side.y).toBeLessThan(list.y + list.height);
      // Nothing opened yet: the first Late task, not an empty box.
      await expect(pane.getByRole('heading')).toHaveText('Pipelining hazards, assignment 3');
      // Lines stay short: the sheet is no wider than about 70 characters of its own text.
      const em = await pane.evaluate((el) => el.getBoundingClientRect().width / parseFloat(getComputedStyle(el).fontSize));
      expect(em).toBeLessThanOrEqual(40);
      await ctx.close();
    });
  }

  test('opening a task swaps the sheet, keeps the page, and Esc gives focus back', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'assignments');
    const pane = page.getByTestId('task-pane');
    const row = page.locator('#ac-m5 .assignment-body');
    await row.click();
    await expect(pane.getByRole('heading')).toHaveText('Trees and graphs quiz (unit 3)');
    expect(new URL(page.url()).hash).toBe('#assignments');
    // The row stays one row: its actions live in the sheet, not under it.
    await expect(page.locator('#ac-m5 .tk-row-actions')).toHaveCount(0);
    await expect(pane).toContainText('Data Structures');
    // Focus moved into the sheet; Esc closes it and returns focus to the row.
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="task-pane"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(pane.getByRole('heading')).toHaveText('Pipelining hazards, assignment 3');
    expect(await page.evaluate(() => document.activeElement?.closest('.tk-card')?.id)).toBe('ac-m5');
    await ctx.close();
  });

  test('Done in the sheet ticks the task through the usual toggle', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'assignments');
    await page.locator('#ac-m4 .assignment-body').click();
    await page.getByTestId('task-pane').getByRole('button', { name: 'Done', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]').find((t: any) => t.id === 'm4')?.status)).toBe('submitted');
    await ctx.close();
  });

  test('Move in the sheet opens the usual Move sheet', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'assignments');
    await page.locator('#ac-m4 .assignment-body').click();
    await page.getByTestId('task-pane').getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.locator('#c2-sheet')).toContainText('Move to');
    await ctx.close();
  });

  test('clicking the open row again closes it and keeps focus on that row', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'assignments');
    const row = page.locator('#ac-m5 .assignment-body');
    await row.click();
    await row.click();
    await expect(page.getByTestId('task-pane').getByRole('heading')).toHaveText('Pipelining hazards, assignment 3');
    expect(await page.evaluate(() => document.activeElement?.closest('.tk-card')?.id)).toBe('ac-m5');
    await ctx.close();
  });

  test("Today's task link lands in the sheet, with focus there", async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'dashboard');
    await page.evaluate(() => (window as any).openTaskFromToday('m6'));
    await expect(page.getByTestId('task-pane').getByRole('heading')).toHaveText('8085 lab write-up, experiments 4 to 7');
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="task-pane"]'))).toBe(true);
    await ctx.close();
  });

  test('393px: no sheet; a tapped row opens under itself as before', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 393, 'assignments');
    await expect(page.getByTestId('task-pane')).toHaveCount(0);
    await page.locator('#ac-m5 .assignment-body').click();
    await expect(page.locator('#ac-m5 .tk-row-actions')).toBeVisible();
    await ctx.close();
  });

  test('1024px (small laptop): no sheet, rows open in place', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1024, 'assignments');
    await expect(page.getByTestId('task-pane')).toHaveCount(0);
    await ctx.close();
  });
});

test.describe('Subjects on a laptop (#478)', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium-desktop', 'sets its own widths'); });
  const row = (page: Page, name: string) => page.locator(`.sj-row[title="${name}"]`);

  for (const width of [1280, 1920]) {
    test(`${width}px: the list and the subject sheet sit side by side, first At risk subject shown`, async ({ browser, baseURL }) => {
      const { ctx, page } = await open(browser, baseURL, width, 'subjects');
      const pane = page.getByTestId('subject-pane');
      await expect(pane).toBeVisible();
      const list = await box(page, '#page-subjects .sj-list');
      const side = await box(page, '[data-testid="subject-pane"]');
      expect(side.x).toBeGreaterThanOrEqual(list.x + list.width);
      expect(side.y).toBeLessThan(list.y + list.height);
      await expect(pane.getByRole('heading')).toHaveText('Universal Human Values');
      const em = await pane.evaluate((el) => el.getBoundingClientRect().width / parseFloat(getComputedStyle(el).fontSize));
      expect(em).toBeLessThanOrEqual(40);
      // PC: that subject's week is a third column.
      const week = page.getByTestId('subject-week');
      if (width >= 1600) {
        await expect(week).toBeVisible();
        expect((await box(page, '[data-testid="subject-week"]')).x).toBeGreaterThanOrEqual(side.x + side.width);
      } else {
        await expect(week).toBeHidden();
      }
      await ctx.close();
    });
  }

  test('opening a subject swaps the sheet, keeps the page, and its numbers match the Subject page', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'subjects');
    const pane = page.getByTestId('subject-pane');
    await row(page, 'Digital Electronics and Microprocessors').click();
    await expect(pane.getByRole('heading')).toHaveText('Digital Electronics and Microprocessors');
    expect(new URL(page.url()).hash).toBe('#subjects');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="subject-pane"]'))).toBe(true);
    const pct = (await pane.getByTestId('subject-pane-pct').textContent())!.trim();
    await pane.getByRole('button', { name: /full page/i }).click();
    await expect(page.locator('.hub-title')).toHaveText('Digital Electronics and Microprocessors');
    await expect(page.locator('.hub-ring-pct')).toHaveText(pct);
    await ctx.close();
  });

  test('Esc gives focus back to the row; Rename saves the short name', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'subjects');
    const pane = page.getByTestId('subject-pane');
    await row(page, 'Engineering Mathematics III').click();
    await pane.getByRole('button', { name: 'Rename' }).click();
    await pane.getByRole('textbox').fill('Maths 3');
    await pane.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cos_strip_labels') || '')).toContain('Maths 3');
    await expect(pane.getByRole('heading')).toHaveText('Engineering Mathematics III');
    await pane.getByRole('heading').focus();
    await page.keyboard.press('Escape');
    await expect(pane.getByRole('heading')).toHaveText('Universal Human Values');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement)?.title)).toBe('Engineering Mathematics III');
    await ctx.close();
  });

  test('Esc in the Rename field closes the field, not the sheet', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'subjects');
    const pane = page.getByTestId('subject-pane');
    await row(page, 'Data Structures').click();
    await pane.getByRole('button', { name: 'Rename' }).click();
    await pane.getByRole('textbox').press('Escape');
    await expect(pane.getByRole('textbox')).toBeHidden();
    await expect(pane.getByRole('heading')).toHaveText('Data Structures');
    await ctx.close();
  });

  test('a direct link still opens the full Subject page on a laptop', async ({ browser, baseURL }) => {
    const { ctx, page } = await open(browser, baseURL, 1280, 'dashboard');
    await page.evaluate(() => (window as any).openSubjectHub('Data Structures'));
    await expect(page.locator('.hub-title')).toHaveText('Data Structures');
    await ctx.close();
  });

  test('393px and 1024px: no sheet; a row opens the full Subject page as before', async ({ browser, baseURL }) => {
    for (const width of [393, 1024]) {
      const { ctx, page } = await open(browser, baseURL, width, 'subjects');
      await expect(page.getByTestId('subject-pane')).toHaveCount(0);
      await row(page, 'Data Structures').click();
      await expect(page.locator('.hub-title')).toHaveText('Data Structures');
      await ctx.close();
    }
  });
});
