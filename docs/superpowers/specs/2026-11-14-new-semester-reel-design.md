# New-semester reel: "Same four questions" (spec, 2026-11-14)

Status: spec only, nothing built. A short vertical motion video for students who
have never seen Clarity Desk, timed for the start of the new semester.

## Brief

- **Who:** a new student in week one. Has not heard of the app.
- **Goal:** by the 3 second mark they know this is a student app that keeps the
  semester in one place (the name and that line are on screen from 2.0 s), and
  by the end they open the link.
- **Format:** 1080x1920 (9:16), 30 fps, about 28 s, MP4. Instagram Reels, WhatsApp
  status and class groups.
- **Carried by:** on-screen text and sound design. No voiceover.
- **Made by:** Claude, end to end (motion, captions, sound). Real app screens.
- **Link:** see "Link and counting" below.

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

v4 was described from the Creator HQ notes, not rewatched. The "v4 record" step
in phase 2 closes that gap.

## Shot list

| # | Time | On screen | Text | Real feature behind it |
|---|---|---|---|---|
| 1 | 0.0-2.0 | Three chat bubbles land one after another, each readable as it lands: "which room??", "how many can i miss", "what's due tmrw" | **New sem. Same four questions.** (visible in frame 1) | none, the problem |
| 2 | 2.0-4.5 | The bubbles are swept flat into one ruled sheet; the wordmark lands | **Clarity Desk.** Your semester in one place. | none, the turn |
| 3 | 4.5-9.0 | Timetable photo, scan line, the review screen, then the saved week | **Where's my class?** Snap your timetable. | timetable scan with review |
| 4 | 9.0-12.5 | Today: now and next, with room and time | **What's on now?** | Today screen |
| 5 | 12.5-17.0 | The line is set to 80, classes are marked, and the app's own result line appears and holds for 1.5 s | **Can I miss this one?** Set your line. Mark your classes. | attendance line, register |
| 6 | 17.0-21.0 | Tasks due this week, nearest first | **What's due?** This week at a glance. | Tasks |
| 7 | 21.0-24.0 | The Wi-Fi mark drops out; Today stays open and a class is marked | **No internet? Still opens.** | offline-first PWA |
| 8 | 24.0-28.0 | Wordmark and the address, held for the full 4 s | **Start your semester on one desk.** Free. `claritydesk.web.app` | end card |

Timings are targets. They are locked at the end of the motion phase and become
the cue sheet for sound.

Notes on the shots:

- **Shot 1** has three bubbles, not four, so each can be read. Each one is a
  question the reel answers later. "Four questions" is paid off by shots 3-6.
- **Shot 5** ends on the result in the app's real words. The live class row and
  toast read like `82% · can miss 3` (`attendanceStandingLine` in `app.js`). The
  capture shows whatever the app prints for the sample data; the number is not
  typed in by hand.
- **Shot 6** is Tasks only. Study Vault is left for its own reel (backlog 3).
- **Shot 8** shows the plain address, because nobody types a query string.

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
- **Offline.** The claim is "still opens", shown with what is true offline: the
  saved timetable, Today, marking a class and tasks all work with no internet
  (data is in `localStorage`, the app files are precached by `sw.js`). Sync and
  downloading a cloud Vault file need a connection, so the reel never says
  "everything works offline". Shot 7 is captured with the network really off.
- **Free.** The app has no paid plan, no payment code and no ads (checked
  2026-11-14). "Free" appears once, on the end card.
- Both claims are checked again on the live site on the day of posting.
- Sample data uses invented subject names, rooms and teachers. No real student
  data, and nothing from `attendance-practice-kit/` or `scanner-practice-kit/`.

## Look and sound

- **Type:** the app's own fonts, Bricolage Grotesque for headlines and Instrument
  Sans for the rest (`fonts/`).
- **Colour and shape:** the app's palette and the Board and Sheet language (rules,
  type and space, not cards). No stock reel template. The exact theme is picked
  in the capture phase by looking at stills.
- **Captions:** bold question in frame, short answer line under it, burned in.
- **Safe zone:** all text and the key part of each screen stay inside a centred
  900x1440 area. Kept clear: top 250 px, bottom 480 px, right 130 px, left 90 px.
  A guide overlay with these edges is used during the build and removed before
  render. Instagram and WhatsApp differ, so the cut is also checked in both.
- **Text size:** questions 80-90 px, answer lines 60-70 px, weight 600 or more.
- **Motion:** shots 1-2 are fast and crowded; from shot 3 on, calm and even. The
  contrast is the message.
- **Sound:** bubble pops building to one hit at 2.0 s, then a quiet tick per
  answer and a soft close. Music is added only after the silent cut is approved.
  Sounds are generated or from a licence-free source, listed in `ASSETS.md`.

## Tools

- `hyperframes-cli`: motion written as HTML and CSS, checked with snapshots,
  rendered to MP4. Needs Node 22+ (have 24) and FFmpeg (not installed). Phase 3
  cannot begin until FFmpeg is installed, with the owner's approval, and a
  five-second test render succeeds. Free local render only.
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

## Link and counting

- **On screen:** the plain address `claritydesk.web.app`.
- **Everywhere it can be tapped** (Instagram bio, the reel caption, the message
  sent with it to WhatsApp status and class groups): `https://claritydesk.web.app/?ref=reel`.
- **What is verified:** the app reads `?ref=` on open and sends `ref_visit/reel`
  once per device (`trackAppOpen` in `app.js`); `tests/verify_usage_events.mjs`
  passed 25 of 25 on 2026-11-14.
- **What is not yet verified:** that a real tap on the live link shows up in
  GoatCounter. Check this once before posting.
- **Limit:** only `reel`, `linkedin` and `insta-story` are counted. Instagram and
  WhatsApp taps both land under `reel`. Telling them apart needs new tags in the
  app's list, which is an app change and outside this spec.

## Phases (one session each)

| Phase | Output | Done when |
|---|---|---|
| 1. Spec and storyboard | this file | approved |
| 2. Screen capture | stills and short clips of shots 3-7, sample data, chosen theme; the v4 record | every shot has a clean capture that matches the live app |
| 3. Motion and captions | silent cut | FFmpeg test render done, checks pass, snapshots reviewed, cut approved, timings locked |
| 4. Sound and final render | MP4 plus a cover frame | the definition of done below is met |

Each session starts by reading this file. Phase 4 also covers the final render.

**v4 record (phase 2).** Confirm `~/Downloads/clarity-desk-reel-v4.mp4` opens,
watch it once, and write down its hook line, first visual, product reveal,
closing line and footage used, in `V4-NOTES.md` in the reel folder. This reel
must not reuse its hook, opening shot, wording or closing beat.

## Definition of done

**File**

- H.264 MP4, 1080x1920, 30 fps, AAC audio, captions burned in.
- Length 26-30 s. Under 50 MB, so it sends on WhatsApp without trouble.
- Loudness about -14 LUFS, peaks at or below -1 dB.
- Name: `clarity-desk-new-sem-reel-v1.mp4`; later cuts raise the number.
- Cover: `clarity-desk-new-sem-reel-cover.png`, 1080x1920, with the headline
  inside the centre 1080x1440 so the grid crop keeps it.

**Readable on a phone.** The rendered file, not snapshots, is checked:

- at phone size, muted, and again with sound;
- paused at each text change: every line can be read in one pass;
- with the safe-zone overlay on: nothing sits under the top bar, the buttons or
  the caption area;
- by the owner on a real phone, at low brightness, before posting.

**True.** Every claim in the honesty rules is rechecked on the live site on the
day of posting.

**Sound sources.** Every sound that was not generated in the project has its
source link, licence and file name listed in `ASSETS.md` in the reel folder.

## Later reels (backlog, not in this build)

Cut from the same captures where possible, each with a different hook to compare
through `?ref=` counts.

1. **The one number** (15 s): "How many classes can you miss? You're guessing."
2. **Buried in the group chat**: "214 unread. The deadline is message 87."
   Uses the WhatsApp deadline import and its review step.
3. **Your gallery is not a planner**: a camera roll of timetable screenshots and
   notes. This is where Study Vault is shown.
4. **No signal**: the app opening with no internet.
5. **Day one, timed**: only with a real, measured run on screen.
6. **A day on the desk**: 8 AM, 1 PM, 9 PM.
7. **Two friends texting**: "bro which room" / "check the desk".

## Not in scope

- A 16:9 cut, a voiceover, paid tools or paid renders.
- Any change to the app, including custom attendance rules.
- Posting. The owner posts it.
