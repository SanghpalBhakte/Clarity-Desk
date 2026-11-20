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
  await page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));  // centre: the floating tab bar covers the bottom edge
  const r = (await page.locator(sel).first().boundingBox())!;
  const x = from ? from.x : r.x + r.width / 2, y = r.y + r.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps); await page.waitForTimeout(12); }
  await page.mouse.up();
  await page.waitForTimeout(450);
}
async function hold(page: Page, sel: string, ms = 600) {
  await page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));  // centre: the floating tab bar covers the bottom edge
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
    // innerText is what is drawn: a flex parent used to swallow the space before the bold figure ("Overall84%").
    expect(await today.locator('.c2-att').evaluate((e) => (e as HTMLElement).innerText)).toMatch(/Overall \d+(\.\d+)?%/);
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

  test('tapping the ticked mark keeps it and closes the sheet; only Clear mark clears', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    await face(today, 'Data Structures').click();
    await page.locator('.c2-sheet').getByRole('button', { name: /^Present/ }).click();
    const before = await marks(page);
    expect(JSON.parse(before)['2026-09-24']).toMatchObject({ DS_0900: 'attended' });
    await today.locator('.c2-fold-btn').click();
    await face(today, 'Data Structures').click();
    await page.locator('.c2-sheet').getByRole('button', { name: /^Present/ }).click();
    expect(await marks(page)).toBe(before);
    expect(await sheetOpen(page)).toBe(false);
  });

  test('the ring and its figure never round up to the rule: 50 of 67 (74.6%) shows 74% and is low', async ({ page }) => {
    const today = await open(page, '2026-09-24T11:30:00', { cos_attendance_baseline: { DBMS: { ...BASE.DBMS, present: 50, absent: 17 } } });
    const ring = today.locator('.c2-now .c2-ring');
    await expect(ring).toHaveClass(/\blow\b/);
    await expect(ring).toContainText('74%');
  });

  test('a later class shows "Can I skip this?" instead of marks', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_attendance_baseline: { OS: { subjectName: 'Operating Systems', subjectCode: 'OS', present: 18, absent: 2, leave: 0, notEntered: 0 } } });
    await face(today, 'Operating Systems Lab').click();
    const sheet = page.locator('.c2-sheet');
    await expect(sheet).toContainText('Can I skip this?');
    await expect(sheet).toContainText('If you go');
    await expect(sheet.getByRole('button', { name: /^Present/ })).toHaveCount(0);
  });

  test('skip check decides from exact counts: 56 of 75 is under 75%, never shown as 75%', async ({ page }) => {
    // 56 of 74 now; skipping makes it 56 of 75 = 74.67%, which used to round to 75% and read as "right on".
    const today = await open(page, '2026-09-24T12:40:00', { cos_attendance_baseline: { OS: { subjectName: 'Operating Systems', subjectCode: 'OS', present: 56, absent: 18, leave: 0, notEntered: 0 } } });
    await face(today, 'Operating Systems Lab').click();
    const sheet = page.locator('.c2-sheet');
    await expect(sheet).toContainText('Skipping puts you under the 75% rule');
    await expect(sheet.locator('.c2-cmp .low')).toContainText('74%');
  });

  test('while a sheet is open the page behind it is inert, and comes back when it closes', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    await face(today, 'Data Structures').click();
    const inert = () => page.evaluate(() => (document.getElementById('page-dashboard')!.closest('[inert]') !== null));
    expect(await inert()).toBe(true);
    await page.keyboard.press('Escape');
    expect(await inert()).toBe(false);
    await expect(face(today, 'Data Structures')).toBeFocused();
  });

  test('a swipe the system cancels puts the row back and marks nothing', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    const before = await marks(page);
    await face(today, 'Data Structures').scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const f = document.querySelector('.c2-row[data-row="DS_0900"] .c2-face') as HTMLElement;
      const r = f.getBoundingClientRect(), y = r.top + r.height / 2;
      const ev = (type: string, x: number) => f.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, button: 0 }));
      ev('pointerdown', 60);
      for (let i = 1; i <= 12; i++) ev('pointermove', 60 + i * 15);
      ev('pointercancel', 240);
    });
    await page.waitForTimeout(500);
    expect(await marks(page)).toBe(before);
    expect(await face(today, 'Data Structures').evaluate((n) => (n as HTMLElement).style.transform)).toBe('');
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

// Task tools on Today (plan Task 6): swipe to finish or move, the Move sheet, 3 rows plus "+N more", quick-add.
const T = (id: string, title: string, dueDate: string, subject = 'DBMS', extra: Record<string, unknown> = {}) =>
  ({ id, subject, title, taskType: 'assignment', dueDate, priority: 'medium', status: 'pending', ...extra });
const taskStore = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]'));
const byId = async (page: Page, id: string) => (await taskStore(page)).find((t: any) => t.id === id);
const trow = (today: ReturnType<Page['locator']>, id: string) => today.locator(`.c2-row.t[data-task="${id}"]`);
const SEED = { cos_custom_tasks: [T('t1', 'DBMS record', '2026-09-26'), T('t2', 'OS quiz prep', '2026-09-25', 'OS')] };

test.describe('tasks', () => {
  test('swipe right finishes the task and Undo brings it back', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', SEED);
    await drag(page, '.c2-row.t[data-task="t1"] .c2-face', 170);
    expect((await byId(page, 't1')).status).toBe('submitted');
    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await byId(page, 't1')).status).toBe('pending');
    await expect(trow(today, 't1')).toHaveCount(1);
  });

  test('swipe left holds Move open, Move opens the sheet, Tomorrow sets the date to today + 1', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', SEED);
    await drag(page, '.c2-row.t[data-task="t1"] .c2-face', -90);
    const tx = await trow(today, 't1').locator('.c2-face').evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41);
    expect(tx).toBe(-80);
    await trow(today, 't1').locator('.c2-ul [data-c2-move]').click({ force: true });
    expect(await sheetOpen(page)).toBe(true);
    await page.locator('#c2-sheet').getByRole('button', { name: 'Tomorrow' }).click();
    expect((await byId(page, 't1')).dueDate).toBe('2026-09-25');
    expect(await sheetOpen(page)).toBe(false);
  });

  test('hold opens the Move sheet and changes nothing; This weekend and Mark done instead work', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', SEED);
    const before = await taskStore(page);
    await hold(page, '.c2-row.t[data-task="t1"] .c2-face');
    expect(await sheetOpen(page)).toBe(true);
    expect(await taskStore(page)).toEqual(before);
    await page.locator('#c2-sheet').getByRole('button', { name: 'This weekend' }).click();
    expect((await byId(page, 't1')).dueDate).toBe('2026-09-26');   // Thursday -> Saturday
    await expect.poll(() => sheetOpen(page)).toBe(false);
    await page.waitForTimeout(450);   // on a laptop the side panel is still sliding out over the Due column
    await hold(page, '.c2-row.t[data-task="t2"] .c2-face');
    await page.locator('#c2-sheet').getByRole('button', { name: 'Mark done instead' }).click();
    expect((await byId(page, 't2')).status).toBe('submitted');
    await expect(today.locator('.c2-row.t[data-task="t2"]')).toHaveCount(0);
  });

  test('tapping the name opens the Move sheet; Esc closes it and focus returns to the row', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', SEED);
    await trow(today, 't1').locator('.c2-tname').focus();
    await page.keyboard.press('Enter');
    expect(await sheetOpen(page)).toBe(true);
    expect(await page.evaluate(() => !!document.activeElement?.closest('#c2-sheet'))).toBe(true);
    await page.keyboard.press('Escape');
    expect(await sheetOpen(page)).toBe(false);
    expect(await page.evaluate(() => !!document.activeElement?.closest('.c2-row.t[data-task="t1"]'))).toBe(true);
  });

  test('the open row and the sheet survive the minute re-render', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', SEED, { install: true });
    await drag(page, '.c2-row.t[data-task="t1"] .c2-face', -90);
    await page.clock.runFor(61000);
    const tx = await trow(today, 't1').locator('.c2-face').evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41);
    expect(tx).toBe(-80);
    await hold(page, '.c2-row.t[data-task="t2"] .c2-face');
    await page.clock.runFor(61000);
    expect(await sheetOpen(page)).toBe(true);
    await expect(page.locator('#c2-sheet')).toContainText('OS quiz prep');
  });

  test('5 pending tasks show 3 rows and "+2 more in Tasks"', async ({ page }) => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((k, i) => T(k, `Task ${k}`, `2026-10-0${i + 1}`));
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_tasks: many });
    await expect(today.locator('.c2-row.t')).toHaveCount(3);
    await expect(today.locator('.dash-more-link', { hasText: 'more' })).toHaveText(/\+2 more in Tasks/);
  });

  test('typing in the quick-add line and pressing Enter adds a task', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', SEED);
    await today.locator('#quick-add-input').fill('Lab report due tomorrow');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await taskStore(page)).some((t: any) => /Lab report/i.test(t.title) && t.dueDate === '2026-09-25')).toBe(true);
  });

  test('the tick has a 44 x 44 box', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', SEED);
    const b = (await trow(today, 't1').locator('.task-checkbox').boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  });

  test('tapping the tick finishes the task', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', SEED);
    await trow(today, 't1').locator('.task-checkbox').click();
    expect((await byId(page, 't1')).status).toBe('submitted');
  });
});

test.describe('name on the strip', () => {
  const dbmsBlock = (today: ReturnType<Page['locator']>) => today.locator('.c2-strip .c2-blk:not(.gap)').nth(1);

  test('tap a class, type a name, Save: the strip shows it; clearing goes back to the automatic name', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    const auto = await dbmsBlock(today).innerText();
    expect(auto).not.toBe('DB');
    await face(today, 'Database Management Systems').click();
    const sheet = page.locator('#c2-sheet');
    const row = sheet.getByRole('button', { name: /^Name on the strip/ });
    await expect(row).toContainText('From your timetable');
    await row.click();
    const field = sheet.getByRole('textbox');
    await expect(field).toBeFocused();
    await field.fill('DB');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(dbmsBlock(today)).toHaveText('DB');
    await expect(row).toContainText('Your choice');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('cos_strip_labels') || '{}'))).toEqual({ 'Database Management Systems': 'DB' });

    await row.click();
    await field.fill('');
    await page.keyboard.press('Enter');
    await expect(dbmsBlock(today)).toHaveText(auto);
    expect(await page.evaluate(() => localStorage.getItem('cos_strip_labels'))).toBe('{}');
  });

  test('the field holds 10 characters, and what you are typing survives the minute re-render', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', {}, { install: true });
    await face(today, 'Database Management Systems').click();
    const sheet = page.locator('#c2-sheet');
    await sheet.getByRole('button', { name: /^Name on the strip/ }).click();
    const field = sheet.getByRole('textbox');
    await field.pressSequentially('ABCDEFGHIJKL');
    await expect(field).toHaveValue('ABCDEFGHIJ');
    await page.clock.runFor(61000);
    await expect(sheet.getByRole('textbox')).toHaveValue('ABCDEFGHIJ');
    await expect(sheet.getByRole('textbox')).toBeFocused();
  });

  test('a name never touches attendance', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    const before = await marks(page);
    await face(today, 'Database Management Systems').click();
    const sheet = page.locator('#c2-sheet');
    await sheet.getByRole('button', { name: /^Name on the strip/ }).click();
    await sheet.getByRole('textbox').fill('DB');
    await sheet.getByRole('button', { name: 'Save' }).click();
    expect(await marks(page)).toBe(before);
  });
});

test.describe('modes', () => {
  test('evening: Mark all present sits above all the rows, and nothing folds away', async ({ page }) => {
    const today = await open(page, '2026-09-24T18:40:00', { cos_attendance_baseline: BASE });
    const key = await page.locator('#page-dashboard .c2-row').first().getAttribute('data-row');
    await page.evaluate((k) => localStorage.setItem('cos_attendance', JSON.stringify({ '2026-09-24': { [k as string]: 'attended' } })), key);
    await page.reload();
    await page.waitForFunction(() => typeof (window as any).navigate === 'function');
    await expect(today.getByRole('button', { name: 'Mark all present' })).toBeVisible();
    await expect(today.locator('.c2-fold')).toHaveCount(0);
    await expect(today.locator('.c2-rows .c2-row')).toHaveCount(3);
  });

  test('night: the title says Tomorrow, the first class can be skipped-checked, due stops at 2, Mark today shows', async ({ page }) => {
    const many = ['a', 'b', 'c', 'd'].map((k, i) => T(k, `Task ${k}`, `2026-09-2${6 + i}`));
    const today = await open(page, '2026-09-24T22:50:00', { cos_custom_tasks: many, cos_attendance_baseline: BASE });
    await expect(page.locator('#c2-lt-title')).toHaveText('Tomorrow');
    await expect(page.locator('#c2-lt-date')).toHaveText('Late study session, Riya?');  // the greeting takes the date's place at night
    await expect(today.locator('.c2-rows .c2-row').first().locator('.c2-skipq')).toHaveText('Can I skip this?');
    await expect(today.locator('.c2-row.t')).toHaveCount(2);
    await expect(today.getByRole('button', { name: 'Mark today' })).toBeVisible();
  });

  test('after 9 PM a class still running keeps Today on today', async ({ page }) => {
    const late = [...DAY, cls('Workshop', 'WS', '20:00', '22:00')];
    const today = await open(page, '2026-09-24T21:10:00', { cos_custom_timetable: every(late) });
    await expect(page.locator('#c2-lt-title')).toContainText('Riya');   // still today, so the greeting stays the title
    await expect(page.locator('#c2-lt-title')).not.toHaveText('Tomorrow');
    await expect(today.locator('.c2-now')).toContainText('Workshop');
    await expect(today.getByRole('button', { name: 'Mark today' })).toHaveCount(0);
  });

  test('evening lists every class, even more than six', async ({ page }) => {
    const eight = ['08', '09', '10', '11', '12', '13', '14', '15'].map((h, i) => cls(`Subject ${String.fromCharCode(65 + i)}`, `S${i}`, `${h}:00`, `${h}:50`));
    const today = await open(page, '2026-09-24T18:40:00', { cos_custom_timetable: every(eight) });
    await expect(today.locator('.c2-rows .c2-row')).toHaveCount(8);
    await expect(today.locator('.c2-more')).toHaveCount(0);
  });

  test('left open after the last class, Today turns to evening at 6 PM and to Tomorrow at 9 PM', async ({ page }) => {
    const today = await open(page, '2026-09-24T17:58:00', {}, { install: true });
    await expect(today.getByRole('button', { name: 'Mark all present' })).toHaveCount(0);
    await page.clock.runFor(3 * 60000);
    await expect(today.getByRole('button', { name: 'Mark all present' })).toBeVisible();
    await page.clock.runFor(3 * 3600000);
    await expect(page.locator('#c2-lt-title')).toHaveText('Tomorrow');
    await expect(today.getByRole('button', { name: 'Mark today' })).toBeVisible();
  });

  test('daytime: the greeting is the title, the date stays above it, the bar still says Today', async ({ page }) => {
    await open(page, '2026-09-24T12:40:00');
    await expect(page.locator('#c2-lt-title')).toHaveText('Good afternoon, Riya.');
    await expect(page.locator('#c2-lt-date')).toHaveText('Thursday 24 September');
    await expect(page.locator('#c2-compact-title')).toHaveText('Today');
    await expect(page.locator('.c2-dtitle')).toHaveText('Good afternoon, Riya.');
  });

  test('the title leaves Today when you go to another page, and comes back', async ({ page }) => {
    await open(page, '2026-09-24T12:40:00');
    await page.evaluate(() => (window as any).navigateTo('timetable'));
    await expect(page.locator('#c2-lt-title')).toHaveText('Timetable');
    await page.evaluate(() => (window as any).navigateTo('dashboard'));
    await expect(page.locator('#c2-lt-title')).toHaveText('Good afternoon, Riya.');
  });

  test('no name saved: the title is the greeting without a name', async ({ page }) => {
    await open(page, '2026-09-24T12:40:00', { cos_profile: { name: '', batch: '' }, cos_notified_history: { onb_tt_day: '2026-09-20', onb_name_skip: true } });
    await expect(page.locator('#c2-lt-title')).toHaveText('Good afternoon.');
  });

  test('a name with markup is shown as typed, never as HTML', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: '<b>Riya</b>' } });
    await expect(page.locator('#c2-lt-title')).toHaveText('Good afternoon, <b>Riya</b>.');
    expect(await today.locator('.c2-dtitle').evaluate((e) => e.querySelector('b'))).toBeNull();
  });

  test('a 40 letter name wraps on a 320 px phone and never clips', async ({ page }) => {
    await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'A'.repeat(40) } });
    await page.setViewportSize({ width: 320, height: 700 });
    const r = await page.locator('#c2-lt-title').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(r.sw).toBeLessThanOrEqual(r.cw + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the quip shows after the line on a calm day, and not above late work', async ({ page }) => {
    const calm = await open(page, '2026-09-24T09:30:00');
    await expect(calm.locator('.c2-quip')).toHaveText('Chai first?');
  });
  test('no quip when a task is late', async ({ page }) => {
    const today = await open(page, '2026-09-24T09:30:00', { cos_custom_tasks: [T('t1', 'OS quiz', '2026-09-22')] });
    await expect(today.locator('.c2-quip')).toHaveCount(0);
  });

  test('holiday: no strip, and End holiday early', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_holiday: { on: true, since: '2026-09-20', until: '2026-10-05' } });
    await expect(today.locator('.c2-strip')).toHaveCount(0);
    await expect(today.getByRole('button', { name: 'End holiday early' })).toBeVisible();
  });

  test('self-study: no strip', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'Riya', studyMode: 'self' }, cos_custom_timetable: {} });
    await expect(today.locator('.c2-strip')).toHaveCount(0);
  });

  test('a day with no classes says so', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_timetable: { ...every(DAY), 4: [] } });
    await expect(today).toContainText('No classes today.');
  });

  test('empty desk: three add rows and an example day, no setup cards', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_timetable: {} });
    for (const n of ['Add timetable', 'Add attendance so far', 'Add a deadline', 'See an example day']) {
      await expect(today.getByRole('button', { name: n })).toBeVisible();
    }
    await expect(today.locator('.desk-setup-guide')).toHaveCount(0);
  });

  test('no timetable but a task already: no start rows, one quiet timetable line under the work', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_timetable: {}, cos_custom_tasks: [T('t1', 'DBMS record', '2026-09-26')] });
    await expect(today.locator('.c2-empty')).toHaveCount(0);
    const line = today.locator('.desk-setup-guide.setup-first');
    await expect(line).toContainText('Have a timetable?');
    const tasksBox = (await today.locator('.c2-row.t').first().boundingBox())!;
    expect((await line.boundingBox())!.y).toBeGreaterThan(tasksBox.y);
  });
});

test.describe('laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('two columns: the strip on the left, Due on the right, within 980 px of the sidebar', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_tasks: [T('t1', 'DBMS record', '2026-09-26')] });
    const strip = (await today.locator('.c2-strip').boundingBox())!;
    const due = (await today.locator('.panel-due').boundingBox())!;
    expect(due.x).toBeGreaterThan(strip.x + strip.width);
    const day = (await today.locator('.panel-day').boundingBox())!;
    expect(Math.round(due.x - (day.x + day.width))).toBe(64);
    expect(day.width / due.width).toBeGreaterThan(1.1);
    const side = (await page.locator('.sidebar').boundingBox())!;
    const edge = Math.max(...(await today.locator('.c2-day, .panel-due, .dashboard-right-panel').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))));
    expect(edge).toBeLessThanOrEqual(side.x + side.width + 48 + 980 + 1);
  });

  test('the class sheet is a 420 px panel on the right, and right-click on a row opens it', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    await face(today, 'Data Structures').click({ button: 'right' });
    await expect.poll(() => sheetOpen(page)).toBe(true);
    const box = (await page.locator('.c2-sheet').boundingBox())!;
    expect(Math.round(box.width)).toBe(420);
    expect(box.x + box.width).toBeGreaterThan(1280 - 40);
  });

  for (const w of [1024, 1280, 1440]) {
    test(`no horizontal scroll at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await open(page, '2026-09-24T12:40:00', { cos_custom_tasks: [T('t1', 'DBMS record', '2026-09-26')] });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

test.describe('smart line', () => {
  const line = (today: ReturnType<Page['locator']>) => today.locator('.desk-greeting');
  test('morning: next class and the free stretch; the name is in the title, not in the line', async ({ page }) => {
    const today = await open(page, '2026-09-24T08:10:00');
    await expect(line(today)).toHaveText('DS at 9:00 AM. Free from 12:00 PM to 2:00 PM.');
    await expect(line(today)).not.toContainText('Riya');
    await expect(page.locator('#c2-lt-title')).toContainText('Riya');
  });
  test('in class: minutes left, then what is next', async ({ page }) => {
    const today = await open(page, '2026-09-24T11:20:00');
    await expect(line(today)).toHaveText('40 minutes left. Then free until OS at 2:00 PM.');
  });
  test('evening: Mark them in one tap', async ({ page }) => {
    const today = await open(page, '2026-09-24T18:40:00');
    await expect(line(today)).toHaveText('3 classes today. Mark them in one tap.');
  });
  test('night: tomorrow starts with the first class, and what is due tomorrow', async ({ page }) => {
    const today = await open(page, '2026-09-24T22:50:00', { cos_custom_tasks: [T('t2', 'DBMS assignment 2', '2026-09-25')] });
    await expect(line(today)).toHaveText('Tomorrow starts at 9:00 AM with DS. DBMS assignment 2 is due.');
  });
  test('slipped tasks keep their own wording over the class line', async ({ page }) => {
    const today = await open(page, '2026-09-24T08:10:00', { cos_custom_tasks: [T('t1', 'OS quiz', '2026-09-22')] });
    await expect(line(today)).toHaveText('1 task slipped. Pick a new day or mark it done.');
  });
  test('a completely new desk says what to do first', async ({ page }) => {
    const today = await open(page, '2026-09-24T08:10:00', { cos_custom_timetable: {} });
    await expect(line(today)).toHaveText('Add your timetable and Today plans the day for you.');
  });
  test('two lines at most at 390 px', async ({ page }) => {
    const today = await open(page, '2026-09-24T11:20:00');
    const lines = await line(today).evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
    expect(lines).toBeLessThanOrEqual(2);
  });
});

test.describe('evening and night details', () => {
  test('evening: Mark all present is a full-width filled button, with the swipe tip under the rows', async ({ page }) => {
    const today = await open(page, '2026-09-24T18:40:00');
    const btn = today.getByRole('button', { name: 'Mark all present' });
    await expect(btn).toBeVisible();
    const box = (await btn.boundingBox())!, col = (await today.locator('.c2-rows').boundingBox())!;
    expect(Math.round(box.width)).toBe(Math.round(col.width));
    expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await expect(today.locator('.c2-tip')).toHaveText('Missed one? Swipe its row left, then mark the rest.');
  });
  test('evening: marking everything removes the button and the tip', async ({ page }) => {
    const today = await open(page, '2026-09-24T18:40:00');
    await today.getByRole('button', { name: 'Mark all present' }).click();
    await expect(today.getByRole('button', { name: 'Mark all present' })).toHaveCount(0);
    await expect(today.locator('.c2-tip')).toHaveCount(0);
  });
  test('night: says how many of today are unmarked, titles the list "Due tomorrow", and has no free row', async ({ page }) => {
    const today = await open(page, '2026-09-24T22:50:00');
    await expect(today.locator('.c2-tip')).toHaveText("3 classes from today aren't marked.");
    await expect(today.getByRole('heading', { name: 'Due tomorrow' })).toBeVisible();
    await expect(today.locator('.c2-gaprow')).toHaveCount(0);
  });
  test('daytime still has its free row and a plain "Due"', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00');
    await expect(today.locator('.c2-gaprow')).toHaveCount(1);
    await expect(today.getByRole('heading', { name: 'Due', exact: true })).toBeVisible();
  });
});

test.describe('calm details', () => {
  test('section titles are sentence case, and late work says "late", with a warning icon', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_tasks: [T('t1', 'OS quiz', '2026-09-22')] });
    await expect(today.getByRole('heading', { name: /^Your day/ })).toBeVisible();
    expect(await today.getByRole('heading', { name: 'Due', exact: true }).evaluate((e) => getComputedStyle(e).textTransform)).toBe('none');
    const late = today.locator('.c2-row.t .due-badge').first();
    await expect(late).toHaveText('2 days late');
    await expect(late.locator('svg')).toHaveCount(1);
  });
  test('the free row names the task that could go there', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_tasks: [T('t1', 'OS quiz', '2026-09-26')] });
    await expect(today.locator('.c2-gaprow')).toContainText('OS quiz fits here');
  });
  test('the free row has no second line when nothing is due soon', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_tasks: [T('t1', 'Far off', '2026-11-30')] });
    await expect(today.locator('.c2-gaprow small')).toHaveCount(0);
  });
  test('holiday: one quiet line and a link, no gradient card', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_holiday: { on: true, since: '2026-09-20', until: '2026-10-05' } });
    await expect(today.locator('.desk-greeting')).toHaveText('Holiday: classes and attendance are paused.');
    const banner = today.locator('.holiday-banner');
    await expect(banner).toContainText('Back on');
    expect(await banner.evaluate((e) => getComputedStyle(e).backgroundImage)).toBe('none');
    await expect(banner.getByRole('button', { name: 'End holiday early' })).toBeVisible();
    await expect(today.locator('.holiday-banner-art')).toHaveCount(0);
  });
  test('a completely new desk: no self-study button, no "No tasks yet", a plain Add button', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_custom_timetable: {} });
    await expect(today.getByRole('button', { name: 'Study without a timetable' })).toHaveCount(0);
    await expect(today).not.toContainText('No tasks yet.');
    await expect(today.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  });
});

test.describe('smart line in the evening and at night with late work', () => {
  const late = [T('t1', 'OS quiz', '2026-09-22')];
  test('evening: the class line wins over the slipped-task line', async ({ page }) => {
    const today = await open(page, '2026-09-24T18:40:00', { cos_custom_tasks: late });
    await expect(today.locator('.desk-greeting')).toHaveText('3 classes today. Mark them in one tap.');
    await expect(today.locator('.c2-row.t .due-badge').first()).toHaveText('2 days late');
  });
  test('night: tomorrow starts at the first class, even with a late task', async ({ page }) => {
    const today = await open(page, '2026-09-24T22:50:00', { cos_custom_tasks: late });
    await expect(today.locator('.desk-greeting')).toHaveText('Tomorrow starts at 9:00 AM with DS.');
  });
});

test.describe('End-Sem at the foot', () => {
  test('one quiet line after Due: label, days, start date without the year', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'Riya', examDate: '2026-10-12' } });
    const foot = today.locator('.c2-foot');
    await expect(foot).toHaveText('End-Sem exams in 18 days. Starts 12 October.');
    await expect(today.locator('.desk-greeting-note')).toHaveCount(0);
    // It comes after the Due panel in the page.
    const after = await today.evaluate((e) => {
      const due = e.querySelector('.dashboard-panel.panel-due, #quick-add-input');
      const foot = e.querySelector('.c2-foot');
      return !!due && !!foot && !!(due.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(after).toBe(true);
  });
  test('a next-year exam keeps its year', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'Riya', examDate: '2027-01-12' } });
    await expect(today.locator('.c2-foot')).toContainText('Starts 12 January 2027.');
  });
  test('in the last 7 days the foot goes quiet (the line under the title says it)', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'Riya', examDate: '2026-09-30' } });
    await expect(today.locator('.c2-foot')).toHaveCount(0);
  });
  test('no foot on holiday, and none without a date', async ({ page }) => {
    const hol = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'Riya', examDate: '2026-10-12' }, cos_holiday: { on: true, since: '2026-09-20', until: '2026-10-05' } });
    await expect(hol.locator('.c2-foot')).toHaveCount(0);
  });
  test('a label with markup stays text', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'Riya', examDate: '2026-10-12', examLabel: '<b>x</b>' } });
    await expect(today.locator('.c2-foot')).toContainText('<b>x</b> in 18 days.');
    expect(await today.locator('.c2-foot-link b').count()).toBe(1);
  });
  test('the link opens the countdown in Settings', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'Riya', examDate: '2026-10-12' } });
    await today.locator('.c2-foot-link').click();
    await expect(page.locator('#s-exam-label')).toBeVisible();
  });
  test('at 390 px the line wraps and the page never scrolls sideways', async ({ page }) => {
    const today = await open(page, '2026-09-24T12:40:00', { cos_profile: { name: 'Riya', examDate: '2026-10-12', examLabel: 'Semester examinations and practicals' } });
    await page.setViewportSize({ width: 320, height: 700 });
    await today.locator('.c2-foot').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('study shortcuts on the class', () => {
  const links = [
    { subject: 'Database Management Systems', code: 'DBMS', color: '#c2410c', resources: [{ label: 'DBMS syllabus', url: 'https://drive.google.com/x' }, { label: 'Unit 2 notes', url: 'https://erp.college.edu/n' }] },
    { subject: 'Data Structures', code: 'DS', color: '#0f766e', resources: [{ label: 'DS notebook', url: 'https://example.com/ds' }] },
  ];
  const AT = '2026-09-24T10:30:00';   // DS is over and unmarked, DBMS is next
  async function offline(page: Page) {
    await page.context().route('**/*', (r) => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' })));
  }

  test('the next class gets one link beside "Can I skip this?", other classes get none', async ({ page }) => {
    const today = await open(page, AT, { cos_custom_links: links });
    await expect(today.locator('.c2-reslink')).toHaveCount(1);
    await expect(today.locator('.c2-row.next .c2-rowlinks .c2-reslink')).toHaveText('DBMS syllabus');
    await expect(today.locator('.c2-row.next .c2-skipq').first()).toHaveText('Can I skip this?');
    expect(Math.round((await today.locator('.c2-reslink').boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  });

  test('no saved links: no link, and "Can I skip this?" is unchanged', async ({ page }) => {
    const today = await open(page, AT, { cos_custom_links: [] });
    await expect(today.locator('.c2-reslink')).toHaveCount(0);
    await expect(today.locator('.c2-row.next .c2-skipq')).toHaveText('Can I skip this?');
  });

  test('the link opens the saved address in a new tab, and it works from the keyboard', async ({ page }) => {
    await offline(page);
    const today = await open(page, AT, { cos_custom_links: links });
    const [pop] = await Promise.all([page.waitForEvent('popup'), today.locator('.c2-reslink').click()]);
    await pop.waitForURL(/drive\.google\.com\/x/);
    await pop.close();
    await today.locator('.c2-reslink').focus();
    const [pop2] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('Enter')]);
    await pop2.waitForURL(/drive\.google\.com\/x/);
  });

  test('the sheet lists every resource in saved order, before "Open in Subjects", with where it lives', async ({ page }) => {
    const today = await open(page, AT, { cos_custom_links: links });
    await today.locator('.c2-row.next .c2-skipq').first().click();
    const sheet = page.locator('#c2-sheet');
    const rows = sheet.locator('.c2-res');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('DBMS syllabus');
    await expect(rows.nth(0)).toContainText('Google Drive');
    await expect(rows.nth(1)).toContainText('Unit 2 notes');
    await expect(rows.nth(1)).toContainText('erp.college.edu');
    const order = await sheet.evaluate((e) => {
      const r = e.querySelector('.c2-res'), s = e.querySelector('[data-c2-subject]');
      return !!r && !!s && !!(r.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
  });

  test('a row in the sheet opens its address', async ({ page }) => {
    await offline(page);
    const today = await open(page, AT, { cos_custom_links: links });
    await today.locator('.c2-row.next .c2-skipq').first().click();
    const [pop] = await Promise.all([page.waitForEvent('popup'), page.locator('#c2-sheet .c2-res').nth(1).click()]);
    await pop.waitForURL(/erp\.college\.edu\/n/);
    await expect(page.locator('#c2-sheet')).toHaveAttribute('aria-hidden', 'false');   // the sheet stays so you can come back
  });

  test('a class that is already marked shows the Open list too', async ({ page }) => {
    const today = await open(page, AT, { cos_custom_links: links });
    await today.locator('.c2-row[data-row] .c2-face').first().click();
    await expect(page.locator('#c2-sheet')).toContainText('Mark this class');
    await expect(page.locator('#c2-sheet .c2-res')).toHaveCount(1);
    await expect(page.locator('#c2-sheet .c2-res')).toContainText('DS notebook');
  });

  test('matched by subject code too, and never writes to storage', async ({ page }) => {
    const odd = [{ subject: 'DB Systems (old name)', code: 'dbms', color: '#000', resources: [{ label: 'Old notes', url: 'https://example.com/o' }] }];
    const today = await open(page, AT, { cos_custom_links: odd });
    const before = await page.evaluate(() => localStorage.getItem('cos_custom_links'));
    await expect(today.locator('.c2-reslink')).toHaveText('Old notes');
    expect(await page.evaluate(() => localStorage.getItem('cos_custom_links'))).toBe(before);
  });

  test('blocked addresses and files that cannot be fetched are left out; a fetchable file says so', async ({ page }) => {
    const mixed = [{ subject: 'Database Management Systems', code: 'DBMS', color: '#000', resources: [
      { label: 'Bad link', url: 'javascript:alert(1)' },
      { label: 'Lost file', onDevice: true, fileId: 'bad id!' },
      { label: 'Phone file.pdf', onDevice: true, fileId: 'fabc-12' },
      { label: 'Real <b>link</b>', url: 'https://example.com/r' },
    ] }];
    const today = await open(page, AT, { cos_custom_links: mixed });
    await expect(today.locator('.c2-reslink')).toHaveText('Phone file.pdf');
    await today.locator('.c2-row.next .c2-skipq').first().click();
    const rows = page.locator('#c2-sheet .c2-res');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('On another device, tap to download');
    await expect(rows.nth(1)).toContainText('Real <b>link</b>');
    expect(await rows.nth(1).evaluate((e) => e.querySelector('b'))).toBeNull();
  });

  test('a long title wraps on a 320 px phone and the page does not scroll sideways', async ({ page }) => {
    const long = [{ subject: 'Database Management Systems', code: 'DBMS', color: '#000', resources: [{ label: 'Unit 3 normalisation worked examples and previous year questions with solutions', url: 'https://example.com/long' }] }];
    const today = await open(page, AT, { cos_custom_links: long });
    await page.setViewportSize({ width: 320, height: 700 });
    await today.locator('.c2-reslink').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const r = await today.locator('.c2-rowlinks').boundingBox();
    expect(r!.x + r!.width).toBeLessThanOrEqual(320);
  });

  test('the old Study Shortcuts chips are gone', async ({ page }) => {
    const today = await open(page, AT, { cos_custom_links: links });
    await expect(today.locator('.dash-shortcuts')).toHaveCount(0);
    await expect(today).not.toContainText('Study Shortcuts');
  });
});
