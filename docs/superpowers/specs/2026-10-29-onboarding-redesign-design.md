# First-run onboarding redesign

Date: 2026-10-29. Status: design approved in chat, spec awaiting review.

## Why

New students see too much at once. After the welcome, Today shows a "Get started, 2 steps left" card holding a 3-field attendance calculator and three setup paths, with more steps queued behind them. Two of those need things the student has to go and find (a timetable photo, portal numbers). People see the hill and leave.

Goal: one small ask per screen, each one waiting for the one before, and a real payoff (their own classes on Today) as early as possible.

Success: more new students go from `welcome_shown` to a saved timetable. Measured with the existing anonymous `trackUsage` events, before vs after.

## The flow

1. **Welcome (full screen, not a popup).** Three questions students actually ask, each answered by a small tilted note built from real app pieces:
   - "Which room is the next class in?" → **Room 204** Data Structures, in 12 min
   - "Can I skip this one?" → **Yep.** You can still miss 3 and stay above 75%
   - "When's the lab record due?" → **Tomorrow** and you haven't started
   - Line: "Clarity Desk keeps all of this on your phone, so you're never asking around. Works without internet too."
   - Buttons: **Show me around** / **I already have an account** (the existing log in screen).
   - The anonymous visit count note stays, same condition as today.
2. **Name (only after Show me around).** Same full screen style. "Hi! What do your friends call you?" / one name box, already focused / "Just so the app can say hi properly. You can skip this." Buttons: **That's me** (Enter does the same) / **Skip**. Saves `name` to the existing profile, trimmed, nothing saved if empty. "I already have an account" never sees this screen.
3. **Tour on the real app.** The screen dims and one real nav item lights up at a time, with a bubble ("1 of 5", Next, Skip tour). Phone points at the bottom tabs, laptop at the sidebar.
   1. Today: title "Okay Riya, this is Today" (just "This is Today" if they skipped the name). "Your next class and anything due soon. Open the app and it's right here."
   2. Timetable: "Your whole week of classes. Tap a class to say if you went."
   3. Subjects: "Every subject gets its own page for notes, links and files."
   4. Tasks: "Homework, assignments, exams. Just type "lab report Friday" and it's saved."
   5. More (phone) / Notice Board (laptop): "Notices, calendar, settings and backups live in here." Laptop text: "Notices, calendar, study vault and settings are all in this sidebar."
   - Last bubble lights up the timetable card: "That's the tour!" ("That's the tour, Riya!" with a name) "Last thing. Add your timetable and Today fills up with your real classes." Buttons: **Let's do it** (opens step 5) / **Later** (closes the tour).
   - Skip tour, Later and Escape all close it. Arrow keys move between stops. Nothing is read or written except usage events.
4. **First Today (no timetable).** One card only: "Let's add your timetable" / "Takes about a minute. The rest can wait." / one big **Add your timetable** button / a quiet link "No timetable? I study on my own" (existing `setupSelfStudy`). No step counter, no calculator. Tasks panel stays as it is.
5. **How to add it.** A small dialog: "How do you want to add it?" / "You check every class before anything is saved." Two rows: **Take a photo** (existing `setupScanTimetable`) and **Type it in** (existing `setupAddClasses`), plus Not now.
6. **Timetable saved.** Today shows the next class right away. Then, one at a time:
   - **Lab group card**, only if the timetable has groups and the profile has no batch (the scan review usually already asked). "Timetable added ✓ One quick thing" / "Which lab group are you in? So you only see your labs." Chips from the timetable's own groups, plus Skip. Saves `batch` to the profile, same as Settings does.
   - **Name in the greeting (fallback)**, only for students with no name yet (they skipped step 2, logged in without one, or skipped the tour), after the group card is answered or not needed. Nobody is asked twice. The big greeting reads "Hey there." with "Your week's all set. What should we call you?" and a name box with Save. Saves `name` to the profile. Dismissed by saving or by tapping a small "Not now". From then on the existing greeting uses the name.
7. **Attendance, from the next day.** One card: "Want your attendance %?" / "Copy your counts from the college portal once. Or just start marking classes from today." Buttons: **Add counts** (existing `showBaselineModal(null, 'manual')`) / **Later**. Under them, a small link "Just check how many I can miss" that opens the existing bunk calculator inline. Hidden for self-study, during holidays, and once counts or marks exist (same rules as today's `att` step).

Self-study students skip 5 to 7 and keep the existing countdown step.

## What stays the same

- `checkOnboarding()` conditions, `hasExistingUserData()`, `cos_onboarding_dismissed`: a returning student never sees the welcome.
- Scan, manual entry, scan review, baseline modal, bunk calculator math, attendance math: called as they are, not changed.
- Log in screen and its buttons.
- `welcome_shown`, `welcome_choice` (explore, login, look, scan, manual, self) and `bunk_calc_used` events keep their names. New: `name_given` / `name_skipped` (step 2, so we can see if the extra screen loses people; if many skip, the name moves back to the greeting only), `tour_step` (1 to 6) and `tour_done` / `tour_skipped`.

Before Today a student taps through at most 7 small screens (welcome, name, 5 tour stops). That is the limit: nothing else gets added before Today.

## Storage

No new keys and no shape changes.
- Name and group go into the existing `cos_profile` fields `name` and `batch`.
- "Skip", "Not now" and "Later" are remembered in the existing `cos_notified_history` map, like the holiday welcome-back card: `onb_group_skip`, `onb_name_skip`, `onb_att_later_<date>` (Later hides the attendance card for that day only).
- The day the timetable first appeared is stored as `onb_tt_day: 'YYYY-MM-DD'` in the same map, so step 7 waits a day. Students who already have a timetable when this ships get it set on first open, so they see step 7 at once if they still have no counts.
- Backups already carry `cos_notified_history`, so restore stays compatible.

## Files

- `welcome-tour.js`: rewritten as the spotlight tour (same file name, so `sw.js` precache and `verify_hosting_files.mjs` stay as they are). Still loaded only when someone taps Show me around.
- `app.js`: `showOnboardingModal` (new welcome; remove the unused `onboarding-step-2` profile form and `showOnboardingStep2`, listed as dead in `docs/AUDIT.md`), `onboardingExplore`, the Today setup card block, the greeting, a small "how to add it" dialog.
- `style.css`: welcome screen, tour spotlight and bubble, tilted notes. Uses existing tokens, both themes, phone and laptop.
- `docs/ARCHITECTURE.md` and `PROJECT_MEMORY.md` onboarding notes updated.

## Wording rules

Plain words a student would say. No dashes of any kind, no "seamless", "effortless", "unlock", "journey". One sentence where one will do.

## Risks

- `verify_onboarding_returning.mjs`, `verify_bunk_calc.mjs` and `verify_countdown_self_study.mjs` read the old welcome and setup card markup. They get updated to the new markup while still checking the same behaviour (returning students skip the welcome, the calculator answer, self-study path). No check gets dropped.
- Visual snapshots of the empty Today change, so they need `npm run test:visual:update`.
- The tour has to place bubbles correctly on small phones, with the sidebar collapsed, and in both themes. Covered by a Playwright check at phone and laptop sizes.
- If `welcome-tour.js` can't load (offline, never cached), Show me around goes straight to Today, same as now.

## Out of scope

- The time-of-day greeting text (for example "made it through the day" in the evening with classes left).
- Settings, the scan itself, and anything after onboarding.

## Testing

`npm test`, `npm run test:visual`, `npm run test:pwa-smoke` (the tour file is precached), plus a manual run of the whole flow on `node tests/serve.mjs` at phone and laptop sizes.
