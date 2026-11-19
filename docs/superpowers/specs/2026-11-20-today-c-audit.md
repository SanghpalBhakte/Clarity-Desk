# Today C rework: audit (2026-11-20)

Stage 1 of 4 (audit → C rework mockup → spec → PR plan). Read-only: no app code changed.
Base chosen by the user: **C** (https://claude.ai/artifact/U4zG3zYcQRin5EzQKHWht3). Comparison and critique of A/B/C: https://claude.ai/artifact/1aK7qJ4WPwsfiQCydfwXL7.

## Scope (decided 2026-11-20)

- In: Today on every screen size, the shared look (fonts, colour tokens, light/dark), the floating tab bar (phone) and floating sidebar (laptop), and the header items that move because of it.
- Later, own specs: onboarding UI/UX, other tabs' layouts, motion and graphics.
- Feel: Apple-like (direct, physical, quiet). Calm and uncrowded stays the rule.

Code references below are from a read-only sweep of `main` at 6a54a99 (app.js is 21.5k lines; `docs/ARCHITECTURE.md` is stale on sizes).

## 1. Why C scored lower than A or B, and the fix

| Dimension | Scores (A / B / C) | Root cause in C | Fix in the rework |
|---|---|---|---|
| Getting work done | 5 / 1 / 3 | C has ticks only. A also has: quick add (`#quick-add-input`, `handleQuickAdd`), Move on late tasks (`toggleDueMove` 9351, `moveTaskTomorrow` 10256, `pickTaskDay`), "+N more tasks", the "N older tasks" fold, "All tasks →" and "Timetable →" | Keep every one of these, restyled. Move becomes a swipe action plus a menu on the row (section 5). Quick add stays a single quiet line under Due |
| Holds up with messy data | 4 / 4 / 2 | The labelled strip breaks on real days (section 2). A's list never breaks: 6-row cap (`RAIL_MAX_ROWS` 9348), 28-char label cut (`railClassLabel` 9405), "same time" flag, "+N more classes" | Day bar (no text) plus one-line rows that reuse A's rules |
| Know your day in 2 s | 3 / 3 / 5 | — | Keep, via the day bar |
| Calm | 2 / 4 / 4 | — | Keep. New items enter as rows, never as cards |

## 2. Day strip stress test

Five made-up timetables, drawn with C's rules and with a scrolling variant. Image: `assets/2026-11-20-strip-stress-test.png`.

| Case | C as built | Scrolling strip |
|---|---|---|
| 7 periods of 45 min + lunch | Labels cut ("THS-", "ft Sk"); Library off the edge | 45-min blocks become dots; the day needs a scroll |
| Split lab, batch not chosen | **Wrong**: Physics Lab A hidden under Chem Lab B | "2 labs" striped block works |
| Class at 5:30 PM | Classes outside 8:30–4:30 become slivers | Works, needs a scroll |
| One 3-hour workshop | Fine | Fine |
| 15-min tutorial, back to back | Cut to "Tu" | Dot |
| No classes / holiday | Not designed | Not designed |

Finding: a labelled horizontal strip holds about 5 classes on a 390 px phone. Scrolling defeats "see the day at once".

**Recommendation:** split the strip in two.
- **Day bar.** A thin bar (about 12 px) drawn to scale from the first class to the last, with no text inside. It shows the now mark, the free gap and the marks (ticks/crosses). It cannot break at any density. Tapping it scrolls to the rows.
- **Class rows.** One line per class: time, name (A's 28-char cut), and state in words. These are the tap targets and carry the swipe actions. They reuse A's cap, fold and "same time" rules. Overlapping batches show both rows with their batch letter, as A does today.

## 3. Critique findings: status

| # | Finding | Severity | Status after audit |
|---|---|---|---|
| C1 | Quick add and Move missing | Critical | Confirmed. Fix in section 1 |
| C2 | Strip breaks on real days | Critical | Confirmed by stress test. Fix in section 2 |
| C3 | Hour labels 12 px at about 2.9:1 contrast | Moderate | Confirmed. Removed by the day bar design (labels move to rows) |
| C4 | Ended blocks at 55% opacity | Moderate | Confirmed. Use a lighter fill, not see-through text |
| C5 | Morning sentence 3 lines | Moderate | Confirmed. Rule: one fact plus one suggestion, at most 2 lines at 390 px |
| C6 | Header items need a home | Moderate | Corrected: the live header has the clock, the sync status (`#sync-status-btn`), Ask Desk (`#assistant-toggle-btn`), the theme toggle (`#theme-toggle-btn`) and the avatar (`#topbar-avatar`, opens Settings). There is **no** feedback button (`openFeedbackForm` only opens from error surfaces). See section 4 |
| C7 | Strip tap not discoverable | Minor | Mostly gone: rows are the tap targets |
| C8 | Night view empty, due not listed | Minor | Confirmed. List tomorrow's dues (max 2) |
| B1–B5 | Duplicate class, due words in time column, template habits, paragraph skip answer | — | Already fixed in C |

## 4. What live Today shows that C does not (decide: keep, move or drop)

| Live feature | Where | Recommendation |
|---|---|---|
| Attendance panel: big %, aim, gauge, one sentence | `renderDashboard`, `attSentence` | **Keep as one line** under the day bar: "Overall 81%, can miss 4". At risk, it becomes the smart sentence. Gauge goes to Subjects |
| Attendance risk / holiday safety / setup / welcome-back banner (one at a time) | `chooseTodayBanner` 8815 | **Keep the priority logic**; render the winner as the smart sentence, not a card |
| Exam countdown and syllabus note | `deskNoteLinksHTML` | Keep as the foot line (C already has "End-Sem in 18 days") |
| Study Shortcuts (3), Guidance →, Vault → | Today hub (shipped v291) | **Decision needed.** Shipped on purpose. My recommendation: keep one "Study" row with the 3 shortcuts below Due |
| Weekly Review link (Sat/Sun) | context line | Keep, as the weekend smart sentence |
| "N of M marked" counter | `railCountHTML` | Shown by the day bar's marks; drop the text |
| "Why this order?" | `#dash-why-line` | Drop from Today (opinion: the order is self-evident). Keep it in Tasks |
| Didn't happen / On duty (#365) | `toggleRailMore` 9389 | **Keep**: in the row menu and as a swipe "More" action |
| Holiday mode | `isHolidayActive` 9750 | Keep: no day bar, one sentence "Holiday until Monday", "End early" in the row menu |
| Self-study mode | `isSelfStudyMode` 8991 | Keep: no day bar or attendance; exam countdown is the hero |
| First run, "visible holes" | `setupSteps`, `isEmptyDesk` | Keep C's new-student view; replaces the setup cards |
| Example day | `onboardingSampleDay` 11191 | Keep as a quiet link in the new-student view |
| Minute re-render with saved UI state | `railMoreOpenKey`, `dueMoveOpenId`, `railEarlierOpen`, `staleTasksOpen` | Keep the pattern; new UI state (open row menu, swipe) follows it |

## 5. Apple-like interaction gaps

Live Today uses pill buttons for every action and has no gestures. Targets for the rework, each tied to a real job:

| Pattern (Apple reference) | Job on Today | Note |
|---|---|---|
| Swipe actions on rows (Mail, Reminders) | Class row: swipe right = Present, swipe left = Absent / More (Didn't happen, On duty). Task row: swipe right = Done, swipe left = Move | Full swipe commits; buttons stay for people who can't swipe |
| Context menu on long-press (iOS) | The same actions plus "Open in Timetable / Tasks" | Pointer and keyboard path: a "⋯" button per row |
| Sheet with detents (iOS) | Move a task (Tomorrow / Pick a day), Skip check details | Replaces inline expanders that push the list around |
| Large title that settles into the bar on scroll | Today heading on phone | Removes the separate topbar on phone |
| Press feedback 100–150 ms, springs that follow the finger | All taps and swipes | Already prototyped in C |
| Follow the phone's light/dark | Theme | Live ignores `prefers-color-scheme` today. Add "Auto" for new users; saved choices win |
| Dynamic Type / zoom, Reduce Motion, safe areas | Everything | Test at 200% zoom and 320 px, as the existing guardrails do |
| Haptics | Mark, Done | iOS PWAs cannot vibrate; Android only, via `navigator.vibrate`, short, off with Reduce Motion |

## 6. Shared look and tab bar: findings

- **Tokens.** Defined 3–6 times by later patches (`:root` 11–229, again 4970–4990, `--ds-*` at 5426, the "board" overrides around 8200–8230). A new rule written early is silently beaten by a later one. Fix: one new token layer, placed last, owned by this redesign, with the old layers retired in a later cleanup PR.
- **Palettes.** Four user-chosen accents (`ALL_ACCENTS` 7893: Register, Azuki & Matcha (default), Ai & Kaki, Tetsu lamp), stored in `cos_accent`. C has one accent. **Decision needed** (section 8).
- **Fonts.** Self-hosted woff2 (Instrument Sans, Bricolage Grotesque), preloaded in index.html and 404.html, precached by `sw.js`. A Lexend swap must self-host Lexend (offline first; no Google Fonts at runtime) and update index.html, 404.html, `sw.js` and the cache version together.
- **theme-color.** Hard-coded `#17352a` / `#080d0a` in the head script and `applyThemeColorMeta`; must follow the new bars.
- **Floating bar knock-ons.** `--nav-h` and `--topbar-h` feed the FAB offset, `.more-sheet` bottom, content padding, toasts and the Undo toast. All move together. The More sheet makes `.app-shell` inert; a bar outside it must be handled too.
- **Tab set.** Live order is Today, Timetable, Subjects, Tasks, More, with a dot badge on Tasks. C showed a different order. Recommendation: keep the live order (muscle memory).
- **Laptop.** The sidebar has sections, a collapse key `[` (`cd_sidebar_collapsed`) and an auto icon rail at 768–1023 px. The floating sidebar keeps all three.

## 7. Risks to protected systems

| System | Touch | Risk and guard |
|---|---|---|
| Attendance | Swipe/menu call the existing `setAttendance` 10596 and `markEndedPresent` 10663 only | Medium (new input path). Tests: every mark reachable without swipe; Undo works; od_pending/cancelled counted exactly as now (`tallyAttendanceSessions` 13058) |
| Timetable batch filter | Rows read `timetableForDisplay` output; no new filtering | Low. Overlap rows show the batch letter |
| Navigation | New bar markup keeps `data-nav`, `#bnav-more`, `.bnav-dot`, `aria-current` | Medium: selectors used by tests and `navigate()` 8199 |
| Offline / SW | Font files and cache version | Medium: `npm run test:pwa-smoke` |
| Storage | None new. Possible `cos_theme` value "auto"; `cos_accent` kept | Low. Head bootstrap must map unknown values safely |
| Visual snapshots | All dashboard and holiday-today PNGs change (3 OS) | Refresh via the Linux workflow and on Windows |

## 8. Decisions for the user before the rework mockup

1. **Day bar plus rows** instead of the labelled strip (section 2). Recommended.
2. **Palettes.** (a) Keep the four palettes, redrawn in the new look (marigold stays the "now" colour in all of them). (b) Replace them with one look (Daylight / Night Focus) and keep `cos_accent` stored but unused. Recommended: (a). Why: students already chose them, and removing a setting silently feels like a downgrade.
3. **Study Shortcuts on Today.** Keep as one row below Due (recommended) or move to Subjects.
4. **Header on phone.** Large title on Today with Ask Desk as the only icon; sync status, theme and profile move to More/Settings. Recommended.
5. **Dark mode default.** Follow the phone ("Auto") for new users; existing saved choices win. Recommended.

## 9. Next

After these decisions: Stage 2, rework C as a mockup (day bar plus rows, swipe actions and menus, sheets, restored task tools, header and tab bar, laptop sidebar) and test it on the same five timetables. Then Stage 3: rewrite the spec.

Model split: this audit's code sweep ran on Sonnet; design calls and this write-up on Opus.
