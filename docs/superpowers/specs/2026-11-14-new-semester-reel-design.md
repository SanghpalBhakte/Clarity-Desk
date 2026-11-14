# New-semester reel: "Same four questions" (spec, 2026-11-14)

Status: spec only, nothing built. A short vertical motion video for students who
have never seen Clarity Desk, timed for the start of the new semester.

## Brief

- **Who:** a new student in week one. Has not heard of the app.
- **Goal:** they understand what Clarity Desk is within 3 seconds and open the link.
- **Format:** 1080x1920 (9:16), 30 fps, about 28 s, MP4. Instagram Reels, WhatsApp
  status and class groups.
- **Carried by:** on-screen text and sound design. No voiceover.
- **Made by:** Claude, end to end (motion, captions, sound). Real app screens.
- **Link:** `claritydesk.web.app` on the end card. The bio link carries `?ref=reel`,
  which the app already counts (`USAGE_REFS` in `app.js`).

## Why this story

Students ask the same four things every week: where is my class, what is on now,
can I miss this one, what is due. Today the answers live in a group chat, a
timetable photo and memory. The app answers each one on a real screen. The reel
is that: question, answer, four times.

### Different from the last reel (v4, late October)

| | Reel v4 | This reel |
|---|---|---|
| Voice | founder: "so i built something" | "you", the new student |
| Problem shown as | a student in chaos, then the app opens | four questions piling up in a group chat |
| Footage | raw screen recording | designed motion with real screens set into it |
| Look | old UI | Board and Sheet, calm Today |
| Structure | one arc: hook, build, payoff | question and answer, four times |

v4 was described from the Creator HQ notes, not rewatched. Before the motion
build, watch `~/Downloads/clarity-desk-reel-v4.mp4` once and confirm no shot or
line is repeated.

## Shot list

| # | Time | On screen | Text | Real feature behind it |
|---|---|---|---|---|
| 1 | 0.0-2.5 | Chat bubbles pile up fast: "which room??", "is 9 am cancelled", "anyone have the timetable pdf", "how many can i miss" | **New sem. Same four questions.** (visible in frame 1) | none, the problem |
| 2 | 2.5-5.0 | The pile is swept flat into one ruled sheet; the wordmark lands | **Put it on one desk.** | none, the turn |
| 3 | 5.0-10.0 | Timetable photo, scan line, rows settle into the week. The review screen is visible before save. | **Where's my class?** Snap your timetable. | timetable scan with review |
| 4 | 10.0-14.0 | Today: now and next, with room and time | **What's now?** | Today screen |
| 5 | 14.0-18.0 | The line is set to 80, classes are marked, "can miss N" appears | **Can I miss this one?** Set your line. Mark your classes. | attendance line, register |
| 6 | 18.0-22.0 | Tasks due this week, then one Vault file opening | **What's due?** | Tasks, Study Vault |
| 7 | 22.0-25.0 | The Wi-Fi mark drops out; the app keeps working | **Works without internet. Free.** | offline-first PWA |
| 8 | 25.0-28.0 | Wordmark and `claritydesk.web.app` | **Your semester, on one desk.** | end card |

Timings are targets. They are locked at the end of the motion phase and become
the cue sheet for sound.

## Honesty rules

Each claim must be true on the live site on the day the reel is posted.

- Screens are captured from the real app with sample data. Nothing is redrawn to
  look better than it is, and no feature is shown that is not live.
- **Attendance.** Verified 2026-11-14 on `origin/main` c514284 and the live site
  (commit 6f64934, cache v302); `tests/verify_aims.mjs` passed 24 of 24.
  - True, may be said: a student sets their own line (50 to 100%), a different
    line for one subject, marks classes, and sees how many they can miss.
  - Not true, never say: "works for any college", "your college's rules",
    "custom calculations". The sums (leave counts as missed, a 2-hour lab is one
    session, OD rules, "not entered") follow one college's ERP and cannot be
    changed by the student.
  - Sample data in shot 5 uses Present and Absent marks only, so nothing on
    screen depends on those rules.
- Scan: show the review step. The app never saves a scan without it.
- No user counts, no "best" or "first" claims, no comparison with other apps.
- "Free" and "works without internet" are checked again before posting.
- Sample data uses invented subject names, rooms and teachers. No real student
  data, and nothing from `attendance-practice-kit/` or `scanner-practice-kit/`.

## Look and sound

- **Type:** the app's own fonts, Bricolage Grotesque for headlines and Instrument
  Sans for the rest (`fonts/`).
- **Colour and shape:** the app's palette and the Board and Sheet language (rules,
  type and space, not cards). No stock reel template. The exact theme is picked
  in the capture phase by looking at stills.
- **Captions:** bold question in frame, short answer line under it, inside the
  Reels safe zones (clear of the top bar and the bottom caption and button area).
- **Motion:** shots 1-2 are fast and crowded; from shot 3 on, calm and even. The
  contrast is the message.
- **Sound:** bubble pops building to one hit at 2.5 s, then a quiet tick per
  answer and a soft close. Music is added only after the silent cut is approved.
  Sounds are generated or from a licence-free source, noted in the project.

## Tools

- `hyperframes-cli`: motion written as HTML and CSS, checked with snapshots,
  rendered to MP4. Needs Node 22+ (have 24) and FFmpeg (not installed; install
  is the first step of phase 3, with approval). Free local render only.
- `viral-reels-ai`: hook rules, caption sizes and safe zones, and its sound-design
  training. Its Remotion talking-head workflow is not used.
- `sound-effects`, `motion-broll`, `cut-video`: used where they fit, read at the
  start of the phase that needs them.
- Screen capture: Playwright against `node tests/serve.mjs`, phone viewport.

## Where it lives

A sibling folder, `~/Projects/clarity-desk-reel/`, not inside the PWA repo.
Why: Firebase Hosting serves the repo root, and `npm run ship` runs `git add -A`,
so video files in the repo could be committed or deployed by accident. Only this
spec and the later plan live in the PWA repo. The PWA itself is not changed.

## Phases (one session each)

| Phase | Output | Done when |
|---|---|---|
| 1. Spec and storyboard | this file | approved |
| 2. Screen capture | stills and short clips of shots 3-7, sample data, chosen theme | every shot has a clean capture that matches the live app |
| 3. Motion and captions | silent cut | checks pass, snapshots reviewed, cut approved, timings locked |
| 4. Sound and final render | MP4 plus a cover frame | plays correctly on a phone, muted and unmuted |

Each session starts by reading this file. Phase 4 also covers the final render.

## Later reels (backlog, not in this build)

Cut from the same captures where possible, each with a different hook to compare
through `?ref=` counts.

1. **The one number** (15 s): "How many classes can you miss? You're guessing."
2. **Buried in the group chat**: "214 unread. The deadline is message 87."
   Uses the WhatsApp deadline import and its review step.
3. **Your gallery is not a planner**: a camera roll of timetable screenshots.
4. **No signal**: the app opening with no internet.
5. **Day one, timed**: only with a real, measured run on screen.
6. **A day on the desk**: 8 AM, 1 PM, 9 PM.
7. **Two friends texting**: "bro which room" / "check the desk".

## Not in scope

- A 16:9 cut, a voiceover, paid tools or paid renders.
- Any change to the app, including custom attendance rules.
- Posting. The owner posts it.
