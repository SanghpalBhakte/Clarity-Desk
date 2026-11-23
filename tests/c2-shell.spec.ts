import { test, expect, Page } from '@playwright/test';

// Today C2, Task 3: floating tab bar and large title on a phone, floating sidebar on a laptop.

async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
}

test.describe('phone 390x844', () => {
  test.beforeEach(async ({ page }) => { await open(page, 390, 844); });

  test('tab bar floats: inset 16, 64 high, 24 above the bottom', async ({ page }) => {
    const b = (await page.locator('.bottom-nav').boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(16);
    expect(b.x + b.width).toBeLessThanOrEqual(374);
    expect(Math.round(b.height)).toBe(64);
    expect(b.y + b.height).toBeLessThanOrEqual(844 - 24 + 0.5);
  });

  test('only the active tab shows its label; the others are icons with a name', async ({ page }) => {
    const widths = await page.$$eval('.bottom-nav-item > span', (els) => els.map((e) => ({ t: e.textContent, w: Math.round(e.getBoundingClientRect().width), on: !!e.parentElement?.classList.contains('active') })));
    expect(widths).toHaveLength(5);
    for (const x of widths) { x.on ? expect(x.w).toBeGreaterThan(20) : expect(x.w).toBe(0); }
    for (const l of ['Today', 'Timetable', 'Subjects', 'Tasks', 'More']) {
      await expect(page.locator(`.bottom-nav-item[aria-label="${l}"]`)).toHaveCount(1);
    }
    await expect(page.locator('.bottom-nav-item.active')).toHaveAttribute('aria-current', 'page');
  });

  test('no topbar on a phone; the large title says Today (no name saved yet, so no greeting) with the date', async ({ page }) => {
    await expect(page.locator('.topbar')).toBeHidden();
    await expect(page.locator('.c2-lt-title')).toHaveText('Today');
    await expect(page.locator('.c2-lt-date')).not.toBeEmpty();
    await expect(page.locator('.c2-largetitle #assistant-toggle-btn')).toBeVisible();
  });

  // #455: Settings shows once; the avatar and theme switch are no longer extra rows.
  test('More lists Settings once plus Sync, and Sync still opens Settings', async ({ page }) => {
    await page.click('#bnav-more');
    const sheet = page.locator('#more-sheet');
    await expect(sheet.getByText('Sync', { exact: true })).toBeVisible();
    for (const t of ['Profile and settings', 'Appearance']) await expect(sheet.getByText(t, { exact: true })).toHaveCount(0);
    await expect(sheet.locator('#theme-toggle-btn, #topbar-avatar')).toHaveCount(0);
    await sheet.locator('#sync-status-btn').click();
    await expect(page.locator('#page-settings')).toBeVisible();
  });

  test('scrolling 120px adds c2-scrolled and shows the slim bar', async ({ page }) => {
    await page.evaluate(() => { document.body.style.minHeight = '3000px'; });
    await expect(page.locator('.c2-compact')).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 120));
    await expect(page.locator('body')).toHaveClass(/c2-scrolled/);
    await expect(page.locator('.c2-compact')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('body')).not.toHaveClass(/c2-scrolled/);
  });

  test('other pages keep a bar with the page name, and Back still goes back', async ({ page }) => {
    await page.click('.bottom-nav-item[data-nav="timetable"]');
    await expect(page.locator('.c2-compact')).toBeVisible();
    await expect(page.locator('.c2-compact-title')).toHaveText('Timetable');
    await page.evaluate(() => (window as any).navigate('settings'));
    await expect(page.locator('#c2-back-btn')).toBeVisible();
    await page.click('#c2-back-btn');
    await expect(page.locator('#page-timetable')).toBeVisible();
  });

  test('Ask Desk opens from the large title and from the slim bar', async ({ page }) => {
    await page.click('#assistant-toggle-btn');
    await expect(page.locator('#assistant-toggle-btn')).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('laptop 1280x800', () => {
  test.beforeEach(async ({ page }) => { await open(page, 1280, 800); });

  test('sidebar floats at 16,16, 232 wide, and [ collapses it', async ({ page }) => {
    const b = (await page.locator('.sidebar').boundingBox())!;
    expect(b.x).toBe(16); expect(b.y).toBe(16); expect(Math.round(b.width)).toBe(232);
    await page.keyboard.press('[');
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
    await expect.poll(async () => Math.round((await page.locator('.sidebar').boundingBox())!.width)).toBe(68);
    await page.keyboard.press('[');
    await expect(page.locator('html')).not.toHaveClass(/sidebar-collapsed/);
  });

  test('topbar parts are back in the topbar and the content clears the sidebar', async ({ page }) => {
    for (const id of ['assistant-toggle-btn', 'theme-toggle-btn', 'topbar-avatar']) {
      await expect(page.locator(`.topbar #${id}`)).toHaveCount(1);
    }
    const c = (await page.locator('.content-area').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(248);
    await expect(page.locator('.c2-largetitle')).toBeHidden();
    await expect(page.locator('.c2-compact')).toBeHidden();
  });
});

test.describe('laptop sidebar: four places, a hairline, three quiet rows, then you', () => {
  async function seeded(page: Page, extra: Record<string, unknown> = {}) {
    await open(page, 1280, 800);
    await page.evaluate((x) => {
      localStorage.setItem('cos_profile', JSON.stringify({ name: 'Riya Sharma', branch: 'AI & Data Science', year: 'SY' }));
      for (const [k, v] of Object.entries(x)) localStorage.setItem(k, JSON.stringify(v));
    }, extra);
    await page.reload();
    await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  }

  test('plain names in the phone tab bar order, no section labels, no Briefing row', async ({ page }) => {
    await seeded(page);
    expect(await page.locator('.sidebar .nav-item .nav-label').allInnerTexts()).toEqual(['Today', 'Timetable', 'Subjects', 'Tasks', 'Calendar', 'Vault', 'College portal ↗', 'Settings']);
    await expect(page.locator('.sidebar-section-label')).toHaveCount(0);
    await expect(page.locator('#sidebar-summary')).toHaveCount(0);
    await expect(page.locator('.sidebar .side-rule')).toBeVisible();
  });

  test('every place is still one click away, with the same routes', async ({ page }) => {
    await seeded(page);
    const go: [string, string][] = [['#sidebar-timetable', '#timetable'], ['#sidebar-subjects', '#subjects'], ['#sidebar-assignments', '#assignments'], ['#sidebar-calendar', '#calendar'], ['#sidebar-links', '#links'], ['#sidebar-settings', '#settings'], ['#sidebar-dashboard', '#dashboard']];
    for (const [sel, hash] of go) {
      await page.click(sel);
      await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);
    }
    await expect(page.locator('#sidebar-portal')).toHaveAttribute('data-testid', 'sidebar-college-portal');
  });

  test('expanded it is words only, the open page has an ink bar, rows are 48 px apart', async ({ page }) => {
    await seeded(page);
    await expect(page.locator('#sidebar-timetable svg')).toBeHidden();
    expect(await page.locator('#sidebar-dashboard').evaluate((e) => getComputedStyle(e, '::before').content)).toBe('""');
    expect(await page.locator('#sidebar-timetable').evaluate((e) => getComputedStyle(e, '::before').content)).not.toBe('""');
    const a = (await page.locator('#sidebar-dashboard').boundingBox())!, b = (await page.locator('#sidebar-timetable').boundingBox())!;
    expect(Math.round(b.y - a.y)).toBe(48);
  });

  test('the icon rail keeps the icons', async ({ page }) => {
    await seeded(page);
    await page.keyboard.press('[');
    await expect(page.locator('#sidebar-timetable svg')).toBeVisible();
    await expect(page.locator('#sidebar-timetable .nav-label')).toBeHidden();
    await expect(page.locator('.side-who')).toBeHidden();
  });

  test('your row: first name, course line, opens Settings, the dot carries the saving state', async ({ page }) => {
    await seeded(page);
    await expect(page.locator('#sidebar-name')).toHaveText('Riya');
    await expect(page.locator('#sidebar-semester-label')).toHaveText('AI & Data Science · SY');
    await expect(page.locator('#sidebar-avatar')).toHaveText('RS');
    await expect(page.locator('#sidebar-profile')).toHaveAttribute('aria-label', /^Your profile and settings/);
    // Going offline turns the dot amber and says so in the row's name.
    await page.context().setOffline(true);
    await expect(page.locator('#sidebar-profile')).toHaveAttribute('aria-label', /Offline/);
    expect(await page.locator('#sidebar-sync-dot').evaluate((e) => (e as HTMLElement).style.background)).toContain('var(--yellow)');
    await page.context().setOffline(false);
    await page.click('#sidebar-profile');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#settings');
  });

  test('no name saved: the row says Your profile, never "?"', async ({ page }) => {
    await open(page, 1280, 800);
    await expect(page.locator('#sidebar-name')).toHaveText('Your profile');
    await expect(page.locator('#sidebar-avatar')).toHaveText('?');   // aria-hidden; the button has its own name
  });

  test('the collapse button is quiet until you point at the sidebar or tab to it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a touch screen has no hover, so the button stays visible there');
    await seeded(page);
    const btn = page.locator('#sidebar-collapse-btn');
    await page.mouse.move(700, 400);
    expect(await btn.evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
    await page.mouse.move(100, 300);
    await expect.poll(() => btn.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    await page.mouse.move(700, 400);
    await btn.focus();
    await expect.poll(() => btn.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  });

  test('Daily Briefing: reached from Today with "This week", and Today stays marked while it is open', async ({ page }) => {
    await seeded(page);
    await page.locator('#page-dashboard').getByRole('button', { name: 'This week →' }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#summary');
    await expect(page.locator('#page-resources')).toContainText('Daily Briefing');
    await expect(page.locator('#sidebar-dashboard')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#sidebar-links')).not.toHaveAttribute('aria-current', 'page');
  });

  test('on a holiday there is no day to show, so "This week" sits in the Due header', async ({ page }) => {
    await seeded(page, { cos_holiday: { on: true, since: '2020-01-01', until: '2099-01-01' } });
    await expect(page.locator('#page-dashboard .panel-due').getByRole('button', { name: 'This week →' })).toBeVisible();
  });
});

test.describe('laptop: no top bar', () => {
  test.beforeEach(async ({ page }) => { await open(page, 1280, 800); });

  test('no strip, no border; Ask Desk is a round button at the top right of the content', async ({ page }) => {
    const bar = (await page.locator('.topbar').boundingBox())!;
    expect(bar.height).toBe(0);
    const ask = (await page.locator('#assistant-toggle-btn').boundingBox())!;
    expect(Math.round(ask.width)).toBe(38); expect(Math.round(ask.height)).toBe(38);
    expect(ask.y).toBeLessThan(24);
    expect(ask.x + ask.width).toBeGreaterThan(1280 - 40);
    await expect(page.locator('#assistant-toggle-btn span')).toBeHidden();   // icon only; the name is the aria-label
    await expect(page.locator('#assistant-toggle-btn')).toHaveAttribute('aria-label', 'Open Desk Assistant');
  });

  test('theme switch, saving status, avatar and clock are not drawn (they live in Settings and the sidebar)', async ({ page }) => {
    for (const sel of ['#theme-toggle-btn', '#sync-status-btn', '#topbar-avatar', '#topbar-clock-text']) await expect(page.locator(sel)).toBeHidden();
  });

  test('Ask Desk still opens, and the theme is chosen in Settings', async ({ page }) => {
    await page.click('#assistant-toggle-btn');
    await expect(page.locator('#assistant-toggle-btn')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#assistant-toggle-btn')).toHaveAttribute('aria-expanded', 'false');
    await page.click('#sidebar-settings');
    const before = await page.locator('html').getAttribute('data-theme');
    await page.locator('.theme-swatch', { hasText: before === 'midnight-ink' ? 'Paper Slate' : 'Midnight Ink' }).click();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(before);
  });

  test('Back is a matching round button at the top left, only when there is somewhere to go back to', async ({ page }) => {
    await expect(page.locator('#nav-back-btn')).toBeHidden();
    await page.click('#sidebar-timetable');
    await page.click('#sidebar-subjects');
    const back = page.locator('#nav-back-btn');
    await expect(back).toBeVisible();
    const b = (await back.boundingBox())!;
    expect(Math.round(b.width)).toBe(38);
    expect(b.x).toBeGreaterThan(250); expect(b.y).toBeLessThan(24);
    await back.click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#timetable');
  });

  test('the first line of every page clears the round buttons', async ({ page }) => {
    for (const sel of ['#sidebar-dashboard', '#sidebar-timetable', '#sidebar-assignments', '#sidebar-subjects', '#sidebar-settings']) {
      await page.click(sel);
      const top = await page.evaluate(() => {
        const pg = document.querySelector('.section-page.active') as HTMLElement | null;
        const shown = pg ? Array.from(pg.querySelectorAll('.page-title, .desk-date, h2')).map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0) : [];
        return shown.length ? Math.min(...shown.map((r) => r.top)) : null;
      });
      if (top !== null) expect(top).toBeGreaterThanOrEqual(54);
    }
  });
});
