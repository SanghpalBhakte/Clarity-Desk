import { test, expect, Page } from '@playwright/test';

// Today C2, classes part (plan Task 5): the strip, class rows, the class sheet, swipe / hold / right-click.
// Marks only go through the existing setAttendance, so every check reads localStorage as well as the screen.

const cls = (subject: string, code: string, time: string, end: string, type = 'lecture') => ({ subject, code, time, end, type, batches: [] });
const DAY = [cls('Data Structures', 'DS', '09:00', '10:00'), cls('Database Management Systems', 'DBMS', '11:00', '12:00'), cls('Operating Systems Lab', 'OS', '14:00', '16:00', 'lab')];
const every = (d: unknown[]) => ({ 0: d, 1: d, 2: d, 3: d, 4: d, 5: d, 6: d });
const BASE = { DBMS: { subjectName: 'Database Management Systems', subjectCode: 'DBMS', present: 37, absent: 8, leave: 0, notEntered: 0 } };

// 2026-09-24 is a Thursday. install:true gives a clock the test can advance.
async function open(page: Page, at: string, extra: Record<string, unknown> = {}, opts: { install?: boolean } = {}) {
  if (opts.install) await page.clock.install({ time: new Date(at) });
  else await page.clock.setFixedTime(new Date(at));
  await page.addInitScript((extra) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
  }, { cos_profile: { name: 'Riya' }, cos_custom_timetable: every(DAY), cos_notified_history: { onb_tt_day: '2026-09-20' }, cos_custom_tasks: [], ...extra });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  return page.locator('#page-dashboard');
}

const marks = (page: Page) => page.evaluate(() => localStorage.getItem('cos_attendance') || '');
const sheetOpen = (page: Page) => page.evaluate(() => document.body.classList.contains('c2-sheeted'));

async function drag(page: Page, sel: string, dx: number, dy = 0, steps = 12, from?: { x: number }) {
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  const r = (await page.locator(sel).first().boundingBox())!;
  const x = from ? from.x : r.x + r.width / 2, y = r.y + r.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps); await page.waitForTimeout(12); }
  await page.mouse.up();
  await page.waitForTimeout(450);
}
async function hold(page: Page, sel: string, ms = 600) {
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  const r = (await page.locator(sel).first().boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(450);
}
const face = (today: ReturnType<Page['locator']>, name: string) => today.locator('.c2-row', { hasText: name }).locator('.c2-face');

test.describe('strip and rows', () => {
  test('the strip shows every class, never cuts or repeats a label, and is hidden from screen readers', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_attendance_baseline: BASE });
    const strip = today.locator('.c2-strip');
    await expect(strip).toHaveAttribute('aria-hidden', 'true');
    const blocks = strip.locator('.c2-blk:not(.gap)');
    await expect(blocks).toHaveCount(3);
    const labels = (await blocks.allInnerTexts()).filter(Boolean);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l).not.toContain('…');
    expect(new Set(labels).size).toBe(labels.length);
    await expect(strip.locator('.c2-nowmark')).toHaveCount(1);
    // Free gap: 12 PM to 2 PM is 2 hours.
    await expect(strip.locator('.c2-blk.gap')).toHaveCount(1);
  });

  test('every class is a row with its full name, time and status in words; the next one counts down', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    const rows = today.locator('.c2-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Data Structures');
    await expect(rows.nth(0)).toContainText('9:00 AM');
    await expect(rows.nth(0)).toContainText('Not marked');
    await expect(rows.nth(1)).toContainText('Database Management Systems');
    await expect(rows.nth(2)).toContainText('Operating Systems Lab');
    await expect(rows.nth(2)).toContainText('In 1h 20m');
    expect(((await rows.nth(0).boundingBox())!).height).toBeGreaterThanOrEqual(54);
    await expect(today.locator('.c2-row .c2-face[data-swipe]')).toHaveCount(2);
  });

  test('the attendance line says it once, in words, when there are counts', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_attendance_baseline: BASE });
    await expect(today.locator('.c2-att')).toContainText(/Overall\s+\d+(\.\d+)?%/);
  });

  test('tapping a block on the strip scrolls to its row', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    const first = today.locator('.c2-strip .c2-blk:not(.gap)').nth(1);
    const key = await first.getAttribute('data-go');
    await first.click();
    await expect(today.locator(`.c2-row[data-row="${key}"]`)).toHaveClass(/c2-flash/);
  });
});

test.describe('class sheet', () => {
  test('tap opens the sheet with focus inside; Esc closes it and focus returns to the row', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_attendance_baseline: BASE });
    const ds = face(today, 'Data Structures');
    await ds.click();
    const sheet = page.locator('.c2-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('role', 'dialog');
    await expect(sheet.locator('h3')).toContainText('Data Structures');
    expect(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.c2-sheet'))).toBe(true);
    await expect(sheet.getByRole('button', { name: /^Present/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Absent/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Didn't happen/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^On duty/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(() => document.activeElement && (document.activeElement as HTMLElement).classList.contains('c2-face'))).toBe(true);
  });

  test('Mark this class: Absent goes through setAttendance, the row says so, Clear mark puts it back', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    await face(today, 'Data Structures').click();
    await page.locator('.c2-sheet').getByRole('button', { name: /^Absent/ }).click();
    expect(JSON.parse(await marks(page))['2026-09-24']).toMatchObject({ DS_0900: 'skipped' });
    // A marked, ended class folds into "1 earlier class, marked" (kept on purpose); open it to see the row.
    await today.locator('.c2-fold-btn').click();
    await expect(today.locator('.c2-row', { hasText: 'Data Structures' })).toContainText('Absent');
    await face(today, 'Data Structures').click();
    await page.locator('.c2-sheet').getByRole('button', { name: /^Clear mark/ }).click();
    expect(JSON.parse((await marks(page)) || '{}')['2026-09-24'] || {}).not.toHaveProperty('DS_0900');
  });

  test('a later class shows "Can I skip this?" instead of marks', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_attendance_baseline: { OS: { subjectName: 'Operating Systems', subjectCode: 'OS', present: 18, absent: 2, leave: 0, notEntered: 0 } } });
    await face(today, 'Operating Systems Lab').click();
    const sheet = page.locator('.c2-sheet');
    await expect(sheet).toContainText('Can I skip this?');
    await expect(sheet).toContainText('If you go');
    await expect(sheet.getByRole('button', { name: /^Present/ })).toHaveCount(0);
  });

  test('hold opens the same sheet and never marks; right-click does too', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    const before = await marks(page);
    await hold(page, '.c2-row:has-text("Data Structures") .c2-face');
    expect(await sheetOpen(page)).toBe(true);
    expect(await marks(page)).toBe(before);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await face(today, 'Database Management Systems').click({ button: 'right' });
    expect(await sheetOpen(page)).toBe(true);
    await expect(page.locator('.c2-sheet h3')).toContainText('Database');
    expect(await marks(page)).toBe(before);
  });

  test('keyboard: Tab to a row, Enter opens its sheet', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    await face(today, 'Data Structures').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.c2-sheet')).toBeVisible();
    await expect(page.locator('.c2-sheet h3')).toContainText('Data Structures');
  });
});

test.describe('gestures', () => {
  test('swipe right marks Present through setAttendance; Undo puts localStorage back byte for byte', async ({ page }) => {
    // A desk that already has marks (the old Undo writes {} when it empties a desk that had none).
    const today = await open(page, '2026-09-24T12:40:00', { cos_attendance: { '2026-09-23': { DS_0900: 'attended' } } });
    const before = await marks(page);
    await drag(page, '.c2-row:has-text("Data Structures") .c2-face', 150);
    expect(JSON.parse(await marks(page))['2026-09-24']).toMatchObject({ DS_0900: 'attended' });
    await expect(today.locator('.c2-row', { hasText: 'Data Structures' }).or(today.locator('.c2-fold'))).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(300);
    expect(await marks(page)).toBe(before);
  });

  test('short swipe left holds the row open at -160 with Absent and More; Absent marks it', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    const sel = '.c2-row:has-text("Database Management Systems") .c2-face';
    await drag(page, sel, -90);
    expect(await page.locator(sel).evaluate((e) => (e as HTMLElement).style.transform)).toContain('-160');
    await today.locator('.c2-row', { hasText: 'Database Management Systems' }).locator('.c2-ul button', { hasText: 'Absent' }).click();
    expect(JSON.parse(await marks(page))['2026-09-24']).toMatchObject({ DBMS_1100: 'skipped' });
  });

  test('a vertical drag never slides a row', async ({ page }) => {
    await open(page, '2026-09-24T12:40:00');
    const sel = '.c2-row:has-text("Data Structures") .c2-face';
    await drag(page, sel, 8, 140);
    const t = await page.locator(sel).evaluate((e) => (e as HTMLElement).style.transform || 'none');
    expect(t).not.toMatch(/translateX\((-?[1-9])/);
  });

  test('edge guard: a drag that starts within 20 px of the screen edge does not move the row', async ({ page }) => {
    await open(page, '2026-09-24T12:40:00');
    const sel = '.c2-row:has-text("Data Structures") .c2-face';
    const before = await marks(page);
    await drag(page, sel, 150, 0, 12, { x: 10 });
    expect(await marks(page)).toBe(before);
    expect(await page.locator(sel).evaluate((e) => (e as HTMLElement).style.transform || 'none')).not.toMatch(/translateX\((-?[1-9])/);
  });

  test('an open row and an open sheet survive the minute re-render', async ({ page }) => {
    await open(page, '2026-09-24T12:40:00', {}, { install: true });
    const sel = '.c2-row:has-text("Database Management Systems") .c2-face';
    await drag(page, sel, -90);
    await page.clock.runFor(61000);
    expect(await page.locator(sel).evaluate((e) => (e as HTMLElement).style.transform)).toContain('-160');
    await page.locator('.c2-row:has-text("Data Structures") .c2-face').click();
    await expect(page.locator('.c2-sheet')).toBeVisible();
    await page.clock.runFor(61000);
    await expect(page.locator('.c2-sheet')).toBeVisible();
    await expect(page.locator('.c2-sheet h3')).toContainText('Data Structures');
  });

  test('Reduce Motion: marks still work and the face has no transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const today = await open(page, '2026-09-24T12:40:00');
    const t = await face(today, 'Data Structures').evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(t.split(',').every((x) => parseFloat(x) === 0)).toBe(true);
    await drag(page, '.c2-row:has-text("Data Structures") .c2-face', 150);
    expect(JSON.parse(await marks(page))['2026-09-24']).toMatchObject({ DS_0900: 'attended' });
  });
});

test.describe('now card', () => {
  test('in class: the one card, and a real touch swipe right marks Present', async ({ page, browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p = await ctx.newPage();
    const today = await open(p, '2026-09-24T14:30:00');
    await expect(today.locator('.c2-now')).toHaveCount(1);
    await expect(today.locator('.c2-now')).toContainText('Operating Systems Lab');
    const cdp = await ctx.newCDPSession(p);
    const r = (await today.locator('.c2-now .c2-face').boundingBox())!;
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (170 * i) / 12, y }] }); await p.waitForTimeout(14); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(500);
    expect(JSON.parse((await p.evaluate(() => localStorage.getItem('cos_attendance') || ''))!)['2026-09-24']).toMatchObject({ OS_1400: 'attended' });
    await ctx.close();
  });
});
