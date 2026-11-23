// PreToolUse hook for Bash. Refuses two command shapes that defeat the sandbox
// exclusions in .claude/settings.local.json (`gh *`, `npx playwright *`, `npm run test*`)
// and waste calls: a leading `cd` into the folder the shell is already in, and a
// multi-line gh / Playwright / test command (the exclusion stops matching and gh fails
// with "x509: OSStatus -26276"). Exit 2 blocks the call and shows stderr to the agent.
import fs from 'fs';
import path from 'path';

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const cmd = String(input?.tool_input?.command || '').trim();
const cwd = input?.cwd ? path.resolve(input.cwd) : process.cwd();

const cd = cmd.match(/^cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:;|&&|\n|$)/);
if (cd) {
  const target = path.resolve(cwd, cd[1] || cd[2] || cd[3]);
  if (target === cwd) {
    console.error('The shell is already in this folder: drop the leading `cd` and start with the tool itself. A `cd` prefix also stops the gh / npx playwright / npm run test* sandbox exclusions from matching.');
    process.exit(2);
  }
}

if (/^(gh\s|npx\s+playwright\s|npm\s+run\s+test)/.test(cmd) && cmd.includes('\n')) {
  console.error('Keep gh / npx playwright / npm run test* commands on one line, or the sandbox exclusion does not match (gh then fails with x509: OSStatus -26276). For a long PR or issue body, write it to "$TMPDIR/body.md" with the Write tool and pass --body-file "$TMPDIR/body.md".');
  process.exit(2);
}
