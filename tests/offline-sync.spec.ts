import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: OFFLINE BASELINE (offline-first sync plan, Task 1)
// ==================================================================
// Locks in today's behaviour before the sync changes: with the network
// off, every non-AI page renders and a task added offline survives a
// reload. Run: npx playwright test tests/offline-sync.spec.ts
// ==================================================================

const PAGES = ['dashboard', 'timetable', 'subjects', 'assignments', 'calendar', 'resources', 'links', 'summary', 'settings', 'review'];

async function openAppOnline(page: Page) {
  await page.addInitScript(() => {
    // Seed once only, so a reload keeps whatever the app saved.
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  // Wait until the service worker is active and has precached the shell.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const w = reg.active;
    if (w && w.state !== 'activated') {
      await new Promise<void>((resolve) => {
        w.addEventListener('statechange', () => { if (w.state === 'activated') resolve(); });
      });
    }
  });
  // Reload once so the page is SW-controlled and everything it needs is cached.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function' && !!navigator.serviceWorker.controller);
}

async function quickAdd(page: Page, title: string) {
  await page.evaluate((t) => {
    const w = window as any;
    w.navigate('dashboard');
    const input = [...document.querySelectorAll('#quick-add-input')].find((el: any) => el.offsetParent !== null) as HTMLInputElement | undefined
      || document.getElementById('quick-add-input') as HTMLInputElement;
    input.value = t;
    w.handleQuickAdd();
    if (w._qaFinalize) w._qaFinalize();   // no date in the text: save without a due date
  }, title);
}

const storedTitles = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]') as any[]).map((t) => t.title));

test.describe('Clarity Desk offline baseline', () => {
  test('adds a task while offline and keeps it after reload', async ({ context, page }) => {
    await openAppOnline(page);
    await context.setOffline(true);
    try {
      await quickAdd(page, 'Offline baseline task');
      expect(await storedTitles(page)).toContain('Offline baseline task');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof (window as any).navigate === 'function');
      expect(await storedTitles(page)).toContain('Offline baseline task');
      await page.evaluate(() => (window as any).navigate('assignments'));
      await expect(page.locator('#page-assignments')).toContainText('Offline baseline task');
    } finally {
      await context.setOffline(false);
    }
  });

  test('every non-AI page renders offline', async ({ context, page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await openAppOnline(page);
    await context.setOffline(true);
    const empty: string[] = [];
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof (window as any).navigate === 'function');
      for (const p of PAGES) {
        await page.evaluate((name) => (window as any).navigate(name), p);
        // The page asked for must be the active one and have content
        // (links and summary are tabs of the resources page).
        const ok = await page.waitForFunction((name) => {
          const id = name === 'links' || name === 'summary' ? 'resources' : name;
          const el = document.querySelector(`#page-${id}.section-page.active`) as HTMLElement | null;
          return !!el && (el.innerText || '').trim().length > 0;
        }, p, { timeout: 3000 }).then(() => true, () => false);
        if (!ok) empty.push(p);
      }
    } finally {
      await context.setOffline(false);
    }
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(empty, `pages that rendered empty offline: ${empty.join(', ')}`).toEqual([]);
  });

  test('edits made offline are still there after coming back online', async ({ context, page }) => {
    await openAppOnline(page);
    await context.setOffline(true);
    await quickAdd(page, 'Edit made offline');
    expect(await storedTitles(page)).toContain('Edit made offline');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => storedTitles(page)).toContain('Edit made offline');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).navigate === 'function');
    expect(await storedTitles(page)).toContain('Edit made offline');
  });

  test('Undo last sync works offline: Settings offers it, the review lists the task, Put it back saves it', async ({ context, page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await openAppOnline(page);
    await context.setOffline(true);
    try {
      await page.evaluate(() => {
        const t = { id: 'undo-1', subject: 'Physics', code: 'PHY', title: 'Lab report removed by sync', taskType: 'assignment', noDeadline: true, description: '', dueDate: '', priority: 'medium', status: 'pending', marks: 0, isCustom: true, updatedAt: 5 };
        localStorage.setItem('cos_sync_prev', JSON.stringify({ at: Date.now() - 60000, customTasks: [t], customLinks: [], open: true, lost: { tasks: [{ rec: t, gone: true }], links: [] } }));
        (window as any).navigate('settings');
      });
      const row = page.getByRole('button', { name: 'Review & undo' });
      await expect(row).toBeVisible();
      await row.click();
      const dialog = page.getByRole('dialog', { name: 'Undo the last sync?' });
      await expect(dialog).toContainText('Lab report removed by sync');
      await dialog.getByRole('button', { name: 'Put it back' }).click();
      await expect(dialog).toBeHidden();
      const saved = await page.evaluate(() => ({
        task: (JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]') as any[]).find((x) => x.id === 'undo-1'),
        prev: JSON.parse(localStorage.getItem('cos_sync_prev') || 'null'),
      }));
      expect(saved.task && saved.task.updatedAt).toBeGreaterThan(5);
      expect(saved.prev.open).toBe(false);
      await expect(page.getByRole('button', { name: 'Review & undo' })).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('offline audit: tasks, attendance, vault files, Ask Desk and feedback all work with the network off', async ({ context, page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    let feedbackPosts = 0;
    await page.route(/clarity-desk-feedback/, (r) => { feedbackPosts++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await openAppOnline(page);
    await context.setOffline(true);
    const toasts = () => page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map((t) => t.textContent || ''));
    try {
      // App shell from the service worker.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof (window as any).navigate === 'function');

      // Tasks: add, edit, delete.
      await quickAdd(page, 'Audit task');
      const id = await page.evaluate(() => (window as any).state.customTasks.find((t: any) => t.title === 'Audit task').id);
      await page.evaluate((tid) => (window as any).showAddTaskModal(tid), id);
      await page.fill('#task-title', 'Audit task edited');
      await page.evaluate((tid) => (window as any).submitAddTask(tid), id);
      expect(await storedTitles(page)).toEqual(expect.arrayContaining(['Audit task edited']));
      expect(await storedTitles(page)).not.toContain('Audit task');
      await page.evaluate((tid) => (window as any).deleteCustomTask(tid), id);
      await page.click('#app-confirm-backdrop [data-act="yes"]');
      expect(await storedTitles(page)).not.toContain('Audit task edited');

      // Attendance mark, kept after a reload.
      await page.evaluate(() => (window as any).setAttendance('2026-11-02', 'AUD_0900', 'attended'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof (window as any).navigate === 'function');
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cos_attendance') || '{}')['2026-11-02']?.AUD_0900)).toBe('attended');

      // Vault: upload a file offline, then open it offline.
      await page.evaluate(() => { (window as any).navigate('links'); (window as any).openAddResourceForSubject('Audit Subject', 'AUD'); });
      await page.fill('#lsm-code', 'AUD');
      await page.getByRole('button', { name: 'Save Vault' }).click();
      await page.evaluate(() => { document.getElementById('lrm-file-input') || (window as any).openAddResourceForSubject('Audit Subject', 'AUD'); (window as any).setResourceInputMode('file'); });
      await page.setInputFiles('#lrm-file-input', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('offline notes') });
      await page.fill('#lrm-label', 'Offline notes');
      await page.getByRole('dialog', { name: 'Add Vault Material' }).locator('.btn-primary').last().click();
      await page.waitForFunction(() => JSON.stringify(JSON.parse(localStorage.getItem('cos_custom_links') || '[]')).includes('Offline notes'));
      const file = await page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_links') || '[]').flatMap((s: any) => s.resources || []).find((r: any) => r.label === 'Offline notes'));
      expect(file.idb === true || String(file.url).startsWith('data:')).toBeTruthy();
      if (file.idb) {
        const popup = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
        await page.evaluate((fid) => (window as any).vaultOpenFile(fid), file.fileId);
        await popup;
        expect((await toasts()).join(' ')).not.toContain('missing');
      }

      // Ask Desk answers (or fails gracefully) offline.
      await page.evaluate(() => { (window as any).openAssistant(); (window as any).sendAssistantMessage('what is due today'); });
      await expect.poll(() => page.evaluate(() => (document.getElementById('cd-chat-thread')?.innerText || '').length), { timeout: 5000 }).toBeGreaterThan(20);

      // Feedback written offline is queued.
      await page.evaluate(() => (window as any).openFeedbackForm());
      await page.fill('#fb-message', 'Offline audit feedback');
      await page.evaluate(() => (window as any).submitFeedback());
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cos_feedback_queue') || '[]').length)).toBe(1);
    } finally {
      await context.setOffline(false);
    }
    // Back online: the queued report is sent once, even if "online" fires twice.
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online')); });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cos_feedback_queue') || '[]').length)).toBe(0);
    await page.waitForTimeout(300);
    expect(feedbackPosts).toBe(1);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
