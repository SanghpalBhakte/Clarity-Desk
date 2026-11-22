import { test, expect } from '@playwright/test';

// Welcome polish for Azuki & Matcha: colours, a quiet-then-ready "That's me", small motion.
// The welcome makes no sound: the audio stub below counts any Web Audio use.

const stubAudio = () => {
  (window as any).__audio = { contexts: 0, oscillators: 0 };
  class Osc { frequency = { value: 0 }; type = ''; connect() {} start() { (window as any).__audio.oscillators++; } stop() {} }
  class Gain { gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; connect() {} }
  class AC {
    state = 'running'; currentTime = 0; destination = {};
    constructor() { (window as any).__audio.contexts++; }
    createOscillator() { return new Osc(); }
    createGain() { return new Gain(); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  (window as any).AudioContext = AC;
};

const open = async (page: any, accent = 'rose') => {
  await page.addInitScript(stubAudio);
  await page.addInitScript((a: string) => { localStorage.setItem('cos_theme', 'paper-slate'); localStorage.setItem('cos_accent', a); }, accent);
  await page.goto('/');
  await page.locator('#onboarding-step-1').waitFor();
};
const css = (page: any, sel: string, prop: string) => page.locator(sel).evaluate((el: Element, p: string) => getComputedStyle(el).getPropertyValue(p), prop);

test('Azuki & Matcha welcome: matcha wash, red-bean button, leaf eyebrow, green-black headline', async ({ page }) => {
  await open(page);
  expect(await css(page, '#onboarding-backdrop', 'background-image')).toContain('radial-gradient');
  expect(await css(page, '.ob-add-btn', 'background-color')).toBe('rgb(138, 42, 54)');
  expect(await css(page, '.ob-date', 'color')).toBe('rgb(79, 106, 31)');
  expect(await css(page, '.ob-hero', 'color')).toBe('rgb(38, 48, 27)');
});

test('other palettes keep their welcome as it was', async ({ page }) => {
  await open(page, 'terracotta');
  expect(await css(page, '#onboarding-backdrop', 'background-image')).toBe('none');
  expect(await css(page, '.ob-hero', 'color')).not.toBe('rgb(38, 48, 27)');
});

test('name step: That\'s me is quiet until a name is typed, then turns red-bean', async ({ page }) => {
  await open(page);
  await page.getByRole('group').getByText('Set up more later').click().catch(() => {});
  await page.getByRole('button', { name: 'Show me around' }).click();
  const btn = page.getByRole('button', { name: "That's me" });
  await expect(btn).toBeVisible();
  const quiet = await btn.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(quiet).not.toBe('rgb(138, 42, 54)');
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.locator('#ob-name').fill('Riya');
  await expect(btn).toHaveCSS('background-color', 'rgb(138, 42, 54)');
  await page.locator('#ob-name').fill('  ');
  await expect(btn).not.toHaveCSS('background-color', 'rgb(138, 42, 54)');
});

test('no sound: taps on the welcome never start audio', async ({ page }) => {
  await open(page);
  await page.locator('#ob-due').fill('Lab report Friday');
  await page.locator('.ob-add-btn').click();
  const a = await page.evaluate(() => (window as any).__audio);
  expect(a.contexts).toBe(0);
  expect(a.oscillators).toBe(0);
});

test('reduced motion: no new animation', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await open(page);
  expect(await css(page, '.ob-add-btn', 'transition-duration')).toMatch(/^(0s|1e-05s)$/);
  await page.locator('#ob-due').fill('Lab report Friday');
  await page.locator('.ob-add-btn').click();
  expect(await page.evaluate(() => (window as any).__audio.contexts)).toBe(0);
  await ctx.close();
});
