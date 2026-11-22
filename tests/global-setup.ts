import path from 'path';

// Local runs reuse a server already on the port (reuseExistingServer). If that
// server was started from another worktree or an older checkout, every test
// would quietly run the wrong files. Stop here instead, saying how to fix it.
export default async function globalSetup() {
  if (process.env.SMOKE_BASE_URL || process.env.CLARITY_BASE_URL) return;   // live smoke: no local server
  const port = process.env.PORT || '4173';
  const here = path.resolve(__dirname, '..');
  let served = '';
  try {
    const res = await fetch(`http://127.0.0.1:${port}/__root`);
    served = res.ok ? (await res.text()).trim() : '';
  } catch { /* nothing answered: Playwright's webServer reports that itself */ return; }
  if (served !== here) {
    throw new Error(
      `Port ${port} is serving ${served || 'an older test server'}, not ${here}.\n` +
      `Stop it and run again:  lsof -ti :${port} | xargs kill`
    );
  }
}
