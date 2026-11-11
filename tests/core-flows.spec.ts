import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: CORE FLOWS (safety net before refactors, AUDIT #10)
// ==================================================================
// Real taps, not function calls: add a task from the Tasks page, mark a
// class present/absent on the timetable, and two-device sync across a
// reload against a fake cloud (no network). Also: a signed-out phone
// never downloads the Firebase SDK until sign-in is near.
// Run: npm run test:sync-flows
// ==================================================================

// A fake Firebase that keeps "the server" in localStorage (__fake_cloud),
// so it survives a reload like a real account would.
const FAKE_FIREBASE = `
(() => {
  const KEY = '__fake_cloud';
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const noop = () => {};
  const ref = {
    get: () => Promise.resolve({ exists: false }),
    set: (payload) => {
      const doc = { ...load(), ...JSON.parse(JSON.stringify(payload)) };
      localStorage.setItem(KEY, JSON.stringify(doc));
      return Promise.resolve();
    },
    update: () => Promise.resolve(),
    onSnapshot: (opts, cb) => {
      setTimeout(() => {
        const doc = load();
        window.__fakeSnapshots = (window.__fakeSnapshots || 0) + 1;
        cb({ exists: Object.keys(doc).length > 0, data: () => doc, metadata: { hasPendingWrites: false, fromCache: false } });
      }, 50);
      return noop;
    },
    collection: () => ({ doc: () => ref })
  };
  const firestore = () => ({ settings: noop, collection: () => ({ doc: () => ref }) });
  firestore.FieldValue = { delete: () => null, serverTimestamp: () => 'ts' };
  firestore.FieldPath = function () {};
  const user = { uid: 'u-sync', email: 'student@example.test', displayName: 'Student', providerData: [] };
  const authObj = new Proxy({
    currentUser: user,
    getRedirectResult: () => Promise.resolve(null),
    onAuthStateChanged: (cb) => { setTimeout(() => cb(user), 30); return noop; },
    isSignInWithEmailLink: () => false
  }, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve(null)) });
  const auth = () => authObj;
  auth.GoogleAuthProvider = function () {};
  window.firebase = { apps: [], initializeApp: function () { this.apps.push({}); }, auth, firestore };
})();
`;

// Counts SDK downloads; the app file gets the fake, the others are empty.
async function routeFirebase(page: Page) {
  const hits: string[] = [];
  await page.route(/gstatic\.com\/firebasejs\/.*\.js/, (r) => {
    hits.push(r.request().url());
    r.fulfill({ contentType: 'text/javascript', body: /firebase-app-compat/.test(r.request().url()) ? FAKE_FIREBASE : '' });
  });
  return hits;
}

async function open(page: Page, seed: Record<string, string>) {
  await page.addInitScript((s) => {
    // Seed once only, so a reload keeps whatever the app (or the fake cloud) saved.
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, seed);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
}

async function reload(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
}

async function addTaskByTapping(page: Page, title: string, due: string) {
  await page.evaluate(() => (window as any).navigate('assignments'));
  await page.locator('#page-assignments [data-testid="add-task-button"]').click();
  const subject = page.locator('#task-subject');
  if (!(await subject.inputValue())) {
    const first = await subject.locator('option').evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value).find((v) => v));
    await subject.selectOption(first!);
  }
  await page.fill('#task-title', title);
  await page.fill('#task-due', due);
  await page.locator('[data-testid="task-save"]').click();
}

const storedTasks = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]') as any[]);

test.describe('Clarity Desk core flows', () => {
  // Offline caching is covered by offline-sync.spec.ts; here the service worker
  // would answer SDK requests itself and bypass the fake above.
  test.use({ serviceWorkers: 'block' });

  test('add a task by tapping: it shows on Tasks and survives a reload', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-09-24T10:20:00'));
    await open(page, {});
    await addTaskByTapping(page, 'Lab record 4', '2026-09-26');

    await expect(page.locator('#page-assignments .assignment-title', { hasText: 'Lab record 4' })).toBeVisible();
    const saved = (await storedTasks(page)).find((t) => t.title === 'Lab record 4');
    expect(saved && saved.dueDate).toBe('2026-09-26');
    expect(saved.updatedAt, 'new tasks carry an edit stamp for sync').toBeGreaterThan(0);

    await reload(page);
    await page.evaluate(() => (window as any).navigate('assignments'));
    await expect(page.locator('#page-assignments .assignment-title', { hasText: 'Lab record 4' })).toBeVisible();
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('mark a class present, then absent, on the timetable: kept after a reload', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-09-24T10:20:00'));   // a Thursday with classes
    await open(page, {});
    await page.evaluate(() => (window as any).navigate('timetable'));

    const present = page.locator('#page-timetable button[aria-label$=" as attended"]').first();
    const label = (await present.getAttribute('aria-label'))!;
    const subject = label.replace(/^Present, mark /, '').replace(/ as attended$/, '');
    await present.click();
    const presentNow = page.locator(`#page-timetable button[aria-label="${label}"]`).first();
    await expect(presentNow).toHaveAttribute('aria-pressed', 'true');
    const marks = () => page.evaluate(() => JSON.parse(localStorage.getItem('cos_attendance') || '{}')['2026-09-24'] || {});
    expect(Object.values(await marks())).toContain('attended');

    await reload(page);
    await page.evaluate(() => (window as any).navigate('timetable'));
    await expect(presentNow).toHaveAttribute('aria-pressed', 'true');

    const absent = page.locator(`#page-timetable button[aria-label="Absent, mark ${subject} as skipped"]`).first();
    await absent.click();
    await expect(absent).toHaveAttribute('aria-pressed', 'true');
    await expect(presentNow).toHaveAttribute('aria-pressed', 'false');
    expect(Object.values(await marks())).toContain('skipped');
    expect(Object.values(await marks())).not.toContain('attended');
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('sync: a task added here reaches the cloud, a task from another device arrives after a reload', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const hits = await routeFirebase(page);
    await open(page, {
      cos_cloud_signed_in: 'true',
      cos_signin_seen: JSON.stringify(['u-sync']),
      __fake_cloud: JSON.stringify({ profile: { name: 'Student' } })
    });
    expect(hits.some((u) => /firebase-app-compat/.test(u)), 'a signed-in phone loads the SDK at startup').toBe(true);
    await page.waitForFunction(() => (window as any).__fakeSnapshots > 0);

    await addTaskByTapping(page, 'Made on this phone', '2026-12-01');
    const cloudTitles = () => page.evaluate(() => (JSON.parse(localStorage.getItem('__fake_cloud') || '{}').customTasks || []).map((t: any) => t.title));
    await expect.poll(cloudTitles, { timeout: 10000 }).toContain('Made on this phone');

    // Another device adds a task to the account.
    await page.evaluate(() => {
      const doc = JSON.parse(localStorage.getItem('__fake_cloud') || '{}');
      doc.customTasks = [...(doc.customTasks || []), { id: 'laptop-1', subject: 'General', code: 'GEN', title: 'Added on laptop', taskType: 'general', noDeadline: true, dueDate: '', priority: 'medium', status: 'pending', marks: 0, isCustom: true, updatedAt: 1 }];
      localStorage.setItem('__fake_cloud', JSON.stringify(doc));
    });
    await reload(page);
    await page.waitForFunction(() => (window as any).__fakeSnapshots > 0);
    await expect.poll(async () => (await storedTasks(page)).map((t) => t.title).sort()).toEqual(['Added on laptop', 'Made on this phone']);
    await page.evaluate(() => (window as any).navigate('assignments'));
    await expect(page.locator('#page-assignments')).toContainText('Added on laptop');
    await expect(page.locator('#page-assignments')).toContainText('Made on this phone');
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('task text with markup shows as text, and a subject with an apostrophe opens its hub', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-09-24T10:20:00'));
    const title = 'Read <img src=x onerror="window.__xss=1"> & "notes"';
    await open(page, {
      // As a WhatsApp import, a backup or another device could bring it in.
      cos_custom_tasks: JSON.stringify([{ id: 'esc-1', subject: "Women's Studies", code: '', title, description: '<b>bold?</b>', taskType: 'assignment', noDeadline: false, dueDate: '2026-09-26', priority: 'medium', status: 'pending', marks: 0, isCustom: true }])
    });
    for (const p of ['dashboard', 'summary', 'assignments']) await page.evaluate((n) => (window as any).navigate(n), p);
    const card = page.locator('#page-assignments .assignment-card', { hasText: 'Read' });
    await expect(card.locator('.assignment-title')).toHaveText(title);
    await expect(card.locator('.assignment-desc')).toHaveText('<b>bold?</b>');
    expect(await card.locator('.assignment-title img, .assignment-desc b').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();

    await page.evaluate(() => { const w = window as any; w.__hub = []; w.openSubjectHub = (s: string) => w.__hub.push(s); });
    await card.locator('.tk-subj').click();
    expect(await page.evaluate(() => (window as any).__hub)).toEqual(["Women's Studies"]);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('deleting a subject uses the in-app dialog (installed apps auto-cancel native ones)', async ({ page }) => {
    const errors: string[] = [];
    const native: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => { native.push(d.message()); d.dismiss(); });   // what an installed app does
    await page.clock.setFixedTime(new Date('2026-09-24T10:20:00'));
    await open(page, {});
    await page.evaluate(() => (window as any).navigate('subjects'));
    const titles = page.locator('#page-subjects .sj-title');
    const name = (await titles.first().textContent())!.trim();
    const count = await titles.count();
    const dialog = page.locator('#app-confirm-backdrop');

    // Cancel keeps the subject.
    await page.evaluate((n) => (window as any).deleteSubjectCard(n), name);
    await expect(dialog).toContainText(`Delete "${name}" permanently?`);
    await dialog.locator('[data-act="no"]').click();
    await expect(titles).toHaveCount(count);

    // Delete removes it, then "Don't ask again" is offered; Cancel keeps asking.
    await page.evaluate((n) => (window as any).deleteSubjectCard(n), name);
    await dialog.locator('[data-act="yes"]').click();
    await expect(dialog).toContainText('Skip this warning next time');
    await dialog.locator('[data-act="no"]').click();
    await expect(titles).toHaveCount(count - 1);
    await expect(page.locator('#page-subjects .sj-title', { hasText: name })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('cos_subject_delete_silent'))).toBeNull();
    expect(native, `native dialogs: ${native.join(' | ')}`).toEqual([]);
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('a signed-out phone downloads no Firebase SDK until Settings (where sign-in is)', async ({ page }) => {
    const hits = await routeFirebase(page);
    await open(page, {});
    for (const p of ['dashboard', 'assignments', 'timetable']) await page.evaluate((n) => (window as any).navigate(n), p);
    await page.waitForTimeout(500);
    expect(hits, 'SDK requested by a signed-out phone').toEqual([]);
    await page.evaluate(() => (window as any).navigate('settings'));
    await expect.poll(() => hits.length).toBe(3);
  });
});
