# Coding Standards (for review)

Read during review, not while building. Each rule is a judgement call that no lint rule or test can make. Anything mechanical belongs in `npm run lint` or `npm test` instead. `CLAUDE.md` holds the working rules (smallest safe change, data safety, protected systems); this file adds what a reviewer checks in a diff.

## Removing a choice

When a diff removes something a student used to choose (a field, picker, dropdown or setting), follow the value it set through every place that still reads, writes or shows it:

- **Default:** new items get a sensible value, and that value means something.
- **Edit:** changing a related input can't leave an old value stuck, now that nobody can fix it by hand. Example: #424 removed the icon picker, and an edited link kept its old icon until #426.
- **Display:** anything that showed the value still tells students apart, or goes too.
- **Storage:** the stored field stays, so backup, restore and the cloud copy keep working (see Data safety in `CLAUDE.md`).

## Claims about the screen

A diff, PR or spec that says what students see is checked against the running app (`node tests/serve.mjs`), not read from the markup. Example: #427 described a colour dot that rendered at 0×0 px, so students had never seen it.
