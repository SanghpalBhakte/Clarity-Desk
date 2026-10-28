// ==================================================================
// Clarity Desk: Desk Assistant (Ask Desk answers)
// ==================================================================
// Rules-based student data assistant. No paid API. No fake LLM.
// Every answer comes from live app state on this device.
//
// Moved out of app.js so first load downloads and parses less: app.js
// imports this file the first time Ask Desk is used (loadClarityAssistant).
// sw.js precaches it, so Ask Desk still works offline. The code is the same
// as it was in app.js; the app.js helpers it reads arrive in `deps`
// (built by clarityAssistantDeps() in app.js). liveProfile is read through
// deps because app.js reassigns it.
// Tests: tests/verify_ask_desk.mjs, tests/verify_master.mjs
// ==================================================================

export function createClarityAssistant(deps) {
  const {
    DAY_SHORT, SUBJECT_ALIASES, allTasks, attV2ProjectionText,
    calculateSmartAttendanceGuidance, currentTimeMinutes,
    detectDeskPollution, escHtml_cd, formatDisplayTime,
    formatDisplayTimeRange, getAttendanceTarget, getCanonicalSubjectKey,
    getCountdownLabel, getOverallAttendance, getSubjectAttendance,
    getSubjectList, getVisibleNotices, holidayLabel, icons, isBreakEntry,
    isHolidayActive, isTaskOverdue, isTeachingClass,
    loadAttendanceBaselines, loadHoliday, loadProfile, loadTimetable,
    syllabusExamInfo, syllabusStats, syllabusTodayLine, timeToMinutes,
    timetableForDisplay, visibleSyllabusEntries
  } = deps;

  // ── Helpers ───────────────────────────────────────────────────
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function nDaysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[m-1]}`;
  }

  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAY_ABBR  = ['sun','mon','tue','wed','thu','fri','sat'];

  function formatTime(t) {
    return formatDisplayTime(t);
  }

  // ── Intent Matching ───────────────────────────────────────────
  // First match wins, so the more specific rules come first. Greetings are
  // not in here: understand() strips them off the front, so "hi, what's my
  // next class" answers the question instead of only saying hello.
  const INTENTS = [
    {
      id: 'parser_review',
      test: /\b(review (import|timetable|attendance|scan|data|staging)|check (pending|uncertain|imports?|review)|is my import (confirmed|ready)|needs? review|uncertain (data|import|attendance|timetable))\b/i,
    },
    {
      id: 'cleanup_followup',
      test: /\b(cleanup status|what changed after cleanup|did (declutter|cleanup) work|recovery status|continue (cleanup|recovery|declutter)|post[- ]cleanup|after cleanup)\b/i,
    },
    {
      id: 'weekly_plan',
      test: /\b(plan (my )?week|weekly (plan|focus|schedule|summary)|what should i focus on this week|help me rebalance this week|rebalance this week|week'?s plan)\b/i,
    },
    {
      id: 'subject_guidance',
      test: /\b(which subjects? need(s)? (attention|more attention|the most attention)|where am i falling behind|highest risk subject|undertracked|weak attendance|subject with upcoming pressure|what subject should i focus on|needs? (the )?most attention|needs? more attention)\b|\bwhich (lab|theory|subject|course).*(undertracked|attention|falling behind|pressure)\b/i,
    },
    {
      id: 'import_timetable',
      test: /\b(import timetable|scan timetable|upload timetable|add timetable|setup timetable|set up timetable|fix timetable|import my timetable|i need to set up my timetable|set up my timetable)\b/i,
    },
    {
      id: 'setup_attendance',
      test: /\b(setup attendance|set up attendance|attendance baseline|attendance setup|help me set up attendance|help me set my attendance baseline|configure attendance|set baseline|set my baseline|set attendance baseline)\b/i,
    },
    {
      id: 'timetable_view',
      test: /\b(show (me )?(my )?(whole |full |weekly )?timetable|(my|whole|full|weekly) timetable|timetable for (the )?week|week'?s timetable|open timetable)\b/i,
    },
    {
      id: 'exams',
      test: /\b(exams?|end ?sems?|mid ?sems?|tests?|quiz(zes)?|viva|orals?)\b/i,
    },
    {
      id: 'day_end',
      test: /\b(last (class|lab)|when (do|does|will) (i|my|college|classes?|the day) (get )?(finish|end|over|done)|(finish|end|done|free) (for the day|today|tomorrow)|what time (do|does|will) .*(end|finish|over)|when am i free)\b/i,
    },
    {
      id: 'subject_hubs',
      test: /\b(open (my )?subject hubs?|view (my )?subject hubs?|go to subject hubs?|subject hubs?|open subjects?|view subjects?)\b/i,
    },
    {
      id: 'declutter_desk',
      test: /\b(clean my desk|clean desk|declutter|declutter desk|declutter my desk|duplicate subjects|find duplicate|fix duplicate|polluted subjects|my subjects look wrong|subjects look wrong|wrong subjects)\b/i,
    },
    {
      id: 'create_task',
      test: /\b(add task|create task|new task|add a task|remind me to|make a task)\b/i,
    },
    {
      id: 'study_plan',
      test: /\b(study plan|plan tonight|help me plan tonight|plan today|what should i study|what to study|study schedule|how to study today|plan my evening)\b/i,
    },
    {
      id: 'setup_gaps',
      test: /\b(setup|what needs setup|missing setup|setup gaps|what is missing|needs setup|desk setup|is anything missing( from my setup)?|anything missing)\b/i,
    },
    {
      id: 'tasks_week',
      test: /\b(due (this|next) week|upcoming (task|deadline|assignment)s?|this week|next week|due soon|week'?s tasks?)\b/i,
    },
    {
      id: 'next_class',
      test: /\b(next class|next lab|next lecture|upcoming class|which class|next period|what'?s next|what is next|\bnext\b|soon start|starting next)\b/i,
    },
    {
      id: 'attendance_risk',
      test: /\b(at risk|risk|attendance risk|which subjects are at risk|attendance at risk|low attendance|below 75|danger)\b/i,
    },
    {
      id: 'tasks_urgent',
      test: /\b(urgent|overdue|late|missed deadline|past due|behind|urgent tasks|show (my )?urgent tasks|what tasks are urgent|due today|due tomorrow|deadline|deadlines)\b/i,
    },
    {
      id: 'tasks_all',
      test: /\b(all (task|assignment)s?|pending tasks?|my tasks?|task list|what (task|assignment)s?|tasks)\b/i,
    },
    {
      id: 'today_summary',
      test: /\b(today|what do i have|schedule today|classes today|my day|show my day|what'?s on|plan for today|focus on today|what should i focus)\b/i,
    },
    {
      id: 'attendance_general',
      test: /\b(attendance|percentage|pct|how many class(es)? (attended|missed)|my record|att(end)?|can i skip|safe to skip)\b/i,
    },
    {
      id: 'classes_left',
      test: /\b(classes left|remaining (class|today)|how many more|left today)\b/i,
    },
    {
      id: 'day_schedule',
      test: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i,
    },
    {
      id: 'notices',
      test: /\b(notices?|announcements?|important|updates?|bulletins?|news|notifications?|circulars?)\b/i,
    },
    {
      id: 'profile',
      test: /\b(who am i|my profile|my name|my branch|my year|my roll|my college|my batch)\b/i,
    },
    {
      id: 'help',
      test: /\b(help|what can you|commands|what do you know|how to use|capabilities)\b/i,
    },
  ];

  // ── Understanding the question ────────────────────────────────
  // All of this runs on the phone: no AI model, no network, no tokens, so
  // answers are instant and work offline. The question is cleaned up
  // (slang, common typos), its subject and day are picked out, and only
  // then matched against the rules above.

  const SLANG = [
    [/\b(bunk|bunks|bunking|bunked|skipping|skipped|miss|missed)\b/g, 'skip'],
    [/\b(tmrw|tmrow|tmr|tmw|tmrrw|tomm?orr?ow|tomm?orow|2moro|2morrow)\b/g, 'tomorrow'],
    [/\b(tdy|2day)\b/g, 'today'],
    [/\b(lecs?|lects?|lectures?)\b/g, 'class'],
    [/\b(att|attnd|attendence|attendace|atendance|attandance|attendanc)\b/g, 'attendance'],
    [/\b(tt|time table|timetabel|timtable|time-table)\b/g, 'timetable'],
    [/\b(assignments?|assignmnts?|asignments?|homeworks?|hw)\b/g, 'tasks'],
    [/\b(practicals?|labs)\b/g, 'lab'],
    [/\b(portions?|syllabi|sylabus|syllabys|sillabus)\b/g, 'syllabus'],
    [/\b(imp)\b/g, 'important'],
    [/\b(revison|revisn|rivision)\b/g, 'revision'],
    [/\b(pls|plz|please|kindly)\b/g, ' '],
  ];

  // Words the rules care about; a word one or two letters off one of these
  // is read as that word ("attendnce", "scedule", "tommorow").
  const VOCAB = ['attendance', 'timetable', 'schedule', 'tomorrow', 'today', 'tasks', 'deadline', 'deadlines',
    'subject', 'subjects', 'notice', 'notices', 'exam', 'exams', 'class', 'classes', 'urgent', 'overdue',
    'pending', 'setup', 'week', 'weekly', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    'sunday', 'percentage', 'remaining', 'next', 'study', 'plan', 'tonight', 'profile', 'declutter', 'baseline',
    'import', 'scan', 'attention', 'skip', 'safe', 'risk', 'upcoming', 'schedule', 'finish', 'update', 'updates',
    'syllabus', 'revise', 'revised', 'revision', 'topics', 'important', 'weightage', 'progress'];

  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  function fixTypos(text, keep) {
    return text.split(' ').map(w => {
      if (w.length < 5 || VOCAB.includes(w) || keep.has(w)) return w;
      const max = w.length >= 8 ? 2 : 1;
      let best = null, bestD = max + 1;
      for (const v of VOCAB) {
        const d = editDistance(w, v, max);
        if (d < bestD) { best = v; bestD = d; }
      }
      return best && bestD <= max ? best : w;
    }).join(' ');
  }

  function plainText(q) {
    return String(q || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9%'+&\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Short English words that are also subject codes (IT, OR, ...) only count
  // as the subject when typed in capitals.
  const COMMON_WORDS = new Set(['it', 'is', 'or', 'as', 'in', 'on', 'at', 'to', 'me', 'my', 'an', 'am', 'be', 'do',
    'go', 'no', 'so', 'up', 'us', 'we', 'of', 'if', 'by', 'he', 'hi', 'ok', 'all', 'and', 'are', 'can', 'for',
    'the', 'how', 'any', 'due', 'not', 'off', 'one', 'out', 'pe', 'cn', 'lab']);

  function subjectNames(s) {
    const names = new Set();
    const name = (s.name || '').toLowerCase().trim();
    if (name) names.add(plainText(name));
    const code = plainText(s.code || '');
    if (code.length >= 2) names.add(code);
    // "Database Management Systems" -> "dbms"
    const words = plainText(name).split(' ').filter(w => w && !['and', 'of', 'the', 'for', 'in', '&', 'to'].includes(w));
    if (words.length >= 2) names.add(words.map(w => w[0]).join(''));
    Object.entries(typeof SUBJECT_ALIASES === 'object' ? SUBJECT_ALIASES : {}).forEach(([short, full]) => {
      if (plainText(full) === plainText(name) || plainText(short) === code) names.add(plainText(short));
    });
    return [...names].filter(Boolean);
  }

  function findSubject(raw, text) {
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    let best = null, bestLen = 0;
    subjects.forEach(s => {
      subjectNames(s).forEach(n => {
        if (n.length < 2) return;
        const re = new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`);
        if (!re.test(text)) return;
        if (COMMON_WORDS.has(n) && !new RegExp(`\\b${n.toUpperCase().replace(/[^A-Z0-9]/g, '')}\\b`).test(raw)) return;
        // Longest wins, so "data structures lab" beats "data structures".
        if (n.length > bestLen) { best = s; bestLen = n.length; }
      });
    });
    return best;
  }

  function dayFrom(dayNum, offset) {
    const label = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : offset === -1 ? 'yesterday' : DAY_NAMES[dayNum];
    return { dayNum, offset, date: nDaysFromNow(offset), label, title: offset === 0 || offset === 1 || offset === -1 ? label[0].toUpperCase() + label.slice(1) : DAY_NAMES[dayNum] };
  }

  function findDay(text) {
    const now = new Date().getDay();
    if (/\bday after tomorrow\b/.test(text)) return dayFrom((now + 2) % 7, 2);
    if (/\btomorrow\b/.test(text)) return dayFrom((now + 1) % 7, 1);
    if (/\byesterday\b/.test(text)) return dayFrom((now + 6) % 7, -1);
    if (/\b(today|tonight)\b/.test(text)) return dayFrom(now, 0);
    for (let i = 0; i < 7; i++) {
      if (new RegExp(`\\b(${DAY_NAMES[i].toLowerCase()}|${DAY_ABBR[i]})\\b`).test(text)) {
        let offset = (i - now + 7) % 7;
        if (offset === 0 && new RegExp(`\\bnext (${DAY_NAMES[i].toLowerCase()}|${DAY_ABBR[i]})\\b`).test(text)) offset = 7;
        return dayFrom(i, offset);
      }
    }
    return null;
  }

  const GREETING_RE = /^(hi+|hey+|hello+|helo|hiya|yo|sup|namaste|good (morning|afternoon|evening|night)|ok(ay)?|so|desk|ask desk|thanks|thank you|thx)\b[\s,!.?]*/;
  const FILLER_RE = /^((can|could|would|will) you (please )?(tell|show|give|let) me( know)?|(please )?(tell|show) me|i (want|wanna|need) to know|let me know)\b\s*/;
  const FOLLOW_UP_RE = /^((what|how) about|and|also|same for|what of|for)\b\s*/;
  const SKIP_RE = /\b(skip|safe to skip|can i skip|afford to skip|safe to (not go|stay home)|stay home|not go)\b/;
  const ATTENDANCE_RE = /\b(attendance|percentage|%|below \d+|at risk|how am i doing)\b/;
  const DUE_RE = /\b(due|tasks?|deadlines?|submit|submission)\b/;

  // Intents that use a subject and/or a day, and so can be continued with
  // "what about OS?" or "and tomorrow?".
  const SUBJECT_INTENTS = ['subject_skip', 'subject_attendance', 'subject_info', 'next_class', 'subject_syllabus'];
  const DAY_INTENTS = ['day_skip', 'day_schedule', 'tasks_day', 'day_end'];
  let lastAsked = null;

  function understand(query) {
    const raw = String(query || '');
    let text = plainText(raw);
    const subject = findSubject(raw, text);
    const keep = new Set(subject ? subjectNames(subject).flatMap(n => n.split(' ')) : []);
    let greeted = false;
    for (let i = 0; i < 4; i++) {
      const before = text;
      if (GREETING_RE.test(text)) { greeted = true; text = text.replace(GREETING_RE, ''); }
      text = text.replace(FILLER_RE, '').trim();
      if (text === before) break;
    }
    if (!text) return { intent: greeted ? (/thank|thx/.test(plainText(raw)) ? 'thanks' : 'greeting') : 'unknown', subject: null, day: null };

    SLANG.forEach(([re, to]) => { text = text.replace(re, to); });
    text = fixTypos(text.replace(/\s+/g, ' ').trim(), keep);
    const day = findDay(text);

    // "what about OS?" / "and tomorrow?" continue the last question.
    if (lastAsked && FOLLOW_UP_RE.test(text) && (subject || day)) {
      let intent = lastAsked.intent;
      if (subject && !day && DAY_INTENTS.includes(intent)) intent = intent === 'day_skip' ? 'subject_skip' : 'subject_info';
      if (day && !subject && !DAY_INTENTS.includes(intent) && intent !== 'subject_skip') intent = 'day_schedule';
      if (SUBJECT_INTENTS.includes(intent) || DAY_INTENTS.includes(intent)) {
        return { intent, subject: subject || lastAsked.subject, day: day || lastAsked.day };
      }
    }

    let intent = null;
    if (SKIP_RE.test(text)) intent = subject ? 'subject_skip' : day ? 'day_skip' : 'skip_overview';
    else if (subject && ATTENDANCE_RE.test(text)) intent = 'subject_attendance';
    else if (day && day.offset !== 0 && DUE_RE.test(text) && !/\b(class|classes|lab)\b/.test(text)) intent = 'tasks_day';

    if (!intent) intent = syllabusIntent(text, subject);
    if (!intent) {
      for (const rule of INTENTS) {
        if (rule.test.test(text)) { intent = rule.id; break; }
      }
    }

    // A day other than today turns "what do I have" / "classes" into that day's list.
    if (day && day.offset !== 0 && ['today_summary', 'day_schedule', 'classes_left', 'next_class', 'unknown', null].includes(intent) && !(intent === 'next_class' && subject)) intent = 'day_schedule';
    if (intent === 'day_schedule' && (!day || day.offset === 0)) intent = 'today_summary';
    if (!intent && subject) intent = 'subject_info';
    if (!intent && day) intent = 'today_summary';
    if (!intent && greeted) intent = 'greeting';
    return { intent: intent || 'unknown', subject, day, text };
  }

  // ── Data Readers ──────────────────────────────────────────────

  function getTodayClasses() {
    const tt = timetableForDisplay();
    const day = new Date().getDay();
    return (tt[day] || []).filter(c => !isBreakEntry(c));
  }

  function getDayClasses(dayNum) {
    const tt = timetableForDisplay();
    return (tt[dayNum] || []).filter(c => !isBreakEntry(c));
  }

  function getNextClass() {
    const tt = timetableForDisplay();
    const now = currentTimeMinutes();
    const day = new Date().getDay();
    const classes = (tt[day] || []).filter(c => !isBreakEntry(c));
    return classes.find(c => timeToMinutes(c.time) > now) || null;
  }

  function getRemainingTodayClasses() {
    const tt = timetableForDisplay();
    const now = currentTimeMinutes();
    const day = new Date().getDay();
    return (tt[day] || []).filter(c => !isBreakEntry(c) && timeToMinutes(c.end || c.time) > now);
  }

  // ── Syllabus answers ──────────────────────────────────────────
  // Read-only, like every other answer: buttons open the Syllabus card,
  // nothing here ticks a topic. Ranking is plain arithmetic so the reason
  // shown next to each topic is the real reason it was picked.
  const SYL_TOPIC_RE = /^(?:have i (?:done|finished|covered|completed|revised|studied|read)|did i (?:do|finish|cover|complete|revise|study|read)|status of|is|are)\s+(.+?)(?:\s+(?:done|finished|covered|completed|revised|studied|over))?(?:\s+(?:yet|already))?\s*$/;
  const SYL_REVISE_RE = /\b(what (should|do|can) i revise|what to revise|revis(e|ion) (plan|list|today|next)|topics? to revise|need(s)? revision|revise what|which topics? (should i |to )?revise)\b/;
  const SYL_IMPORTANT_RE = /\b(important topics?|high (weight(age)?|priority|marks?)( topics?)?|(most|more|high) weight(age)?|(most|more|high) marks|carry (the )?(most|more) marks|important (ones|left|remaining))\b/;
  const SYL_PACE_RE = /\b(am i on track|on track|can i (finish|complete|cover)|will i (finish|complete|cover)|(finish|complete|cover) (the |my )?(syllabus|portion|course|topics)|topics? (per|a|each) day|enough time|my pace|how fast)\b/;
  const SYL_PROGRESS_RE = /\b(syllabus|topics? (left|remaining|done|covered|completed|pending)|how many topics|how much (is |of )?.*\b(left|remaining|done|covered|completed|finished)\b|progress|coverage)\b/;

  function sylEntries() {
    return (typeof visibleSyllabusEntries === 'function') ? visibleSyllabusEntries() : [];
  }

  function sylEntryFor(subject) {
    if (!subject) return null;
    return sylEntries().find(e => sameSubject(e.subjectName, subject.name)) || null;
  }

  function sylDays(entry) {
    const ex = syllabusExamInfo(entry);
    return ex ? ex.days : null;
  }

  function sylWhen(days) {
    if (days === null) return '';
    if (days < 0) return 'exam date passed';
    return days === 0 ? 'exam today' : days === 1 ? 'exam tomorrow' : `exam in ${days} days`;
  }

  function sylWeightText(t) {
    return [t.importance === 3 ? 'High' : t.importance === 1 ? 'Low' : '', t.marks ? `${t.marks} marks` : ''].filter(Boolean).join(' · ');
  }

  // Weightage × how close the exam is. Unknown date counts as "some time".
  function sylScore(t, days) {
    const w = t.importance + (t.marks ? Math.min(t.marks / 5, 4) : 0);
    const urgency = days === null ? 1 : days < 0 ? 0.5 : 1 + 10 / (days + 1);
    return w * urgency;
  }

  // Up to `limit` topics, at most 2 from one subject. Not started comes
  // first; done-but-not-revised moves ahead in the last week before an exam.
  function sylPicks(entries, limit = 3) {
    const all = [];
    entries.forEach(e => {
      const days = sylDays(e);
      const finalWeek = days !== null && days >= 0 && days <= 7;
      e.topics.forEach(t => {
        if (t.status === 'revised') return;
        const base = sylScore(t, days);
        const score = t.status === 'todo' ? base : base * (finalWeek ? 1.5 : 0.4);
        all.push({ e, t, days, score });
      });
    });
    all.sort((a, b) => b.score - a.score || a.e.topics.indexOf(a.t) - b.e.topics.indexOf(b.t));
    const perSubject = {};
    const out = [];
    for (const p of all) {
      if ((perSubject[p.e.subjectKey] || 0) >= 2) continue;
      perSubject[p.e.subjectKey] = (perSubject[p.e.subjectKey] || 0) + 1;
      out.push(p);
      if (out.length >= limit) break;
    }
    return out;
  }

  function sylPickLine(p) {
    const why = [sylWeightText(p.t), `${escHtml(p.e.subjectName)} ${sylWhen(p.days)}`.trim(), p.t.status === 'todo' ? 'not started' : 'done, not revised'].filter(Boolean).join(' · ');
    return `<li><span class="cd-item-label">${escHtml(p.t.title)}</span><span class="cd-item-meta">${why}</span></li>`;
  }

  function sylOpenButton(name, label) {
    return `<button class="btn btn-sm btn-secondary" onclick="openSubjectSyllabus('${jsArg(name)}')" style="font-size:var(--text-sm);padding:4px 10px">${icons.book()} ${label || `Open ${escHtml(name)} syllabus`} →</button>`;
  }

  function sylNone(subject) {
    const name = subject ? subject.name : '';
    return `${subject ? `There's no syllabus for <strong>${escHtml(name)}</strong> yet.` : "You haven't added a syllabus yet."} Paste the topics once and I can tell you what's left, what to revise and what carries the most marks.<br><br>
    ${subject
      ? `<button class="btn btn-sm btn-primary" onclick="openSubjectSyllabus('${jsArg(name)}', true)" style="font-size:var(--text-sm);padding:5px 12px">+ Add ${escHtml(name)} topics</button>`
      : `<button class="btn btn-sm btn-primary" onclick="navigate('subjects')" style="font-size:var(--text-sm);padding:5px 12px">${icons.book()} Open Subject Hubs →</button>`}`;
  }

  function buildSyllabusOverview() {
    const entries = sylEntries();
    if (!entries.length) return sylNone(null);
    const rows = entries.map(e => ({ e, st: syllabusStats(e), days: sylDays(e) }))
      .sort((a, b) => a.st.pct - b.st.pct);
    const avg = Math.round(rows.reduce((s, r) => s + r.st.pct, 0) / rows.length);
    const left = rows.reduce((s, r) => s + r.st.left, 0);
    const items = rows.map(r => `<li><span class="cd-item-label">${escHtml(r.e.subjectName)} · ${r.st.pct}%</span><span class="cd-item-meta">${r.st.left ? `${r.st.left} topic${r.st.left !== 1 ? 's' : ''} left` : 'all covered'}${r.st.revised ? ` · ${r.st.revised} revised` : ''}${r.days !== null ? ` · ${sylWhen(r.days)}` : ''}</span></li>`).join('');
    return `<strong>Syllabus: ${avg}% across ${rows.length} subject${rows.length !== 1 ? 's' : ''}</strong>, ${left ? `${left} topic${left !== 1 ? 's' : ''} left` : 'everything covered'}. Furthest behind first:<ul class="cd-list">${items}</ul>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-sm btn-secondary" onclick="sendAssistantMessage('What should I study today?')" style="font-size:var(--text-sm);padding:4px 10px">What should I study?</button>
      ${sylOpenButton(rows[0].e.subjectName)}
    </div>`;
  }

  function buildSubjectSyllabus(subject) {
    const e = sylEntryFor(subject);
    if (!e) return sylNone(subject);
    const st = syllabusStats(e);
    const days = sylDays(e);
    const highLeft = e.topics.filter(t => t.status === 'todo').sort((a, b) => sylScore(b, days) - sylScore(a, days)).slice(0, 5);
    let res = `<strong>${escHtml(e.subjectName)}: ${st.pct}% done</strong> (${st.done} of ${st.total} topics${st.revised ? `, ${st.revised} revised` : ''}${st.byMarks ? ', counted by marks' : ''}).`;
    if (days !== null) res += ` ${sylWhen(days)[0].toUpperCase()}${sylWhen(days).slice(1)}.`;
    if (highLeft.length) {
      res += `<br><br><strong>Next up, by weightage:</strong><ul class="cd-list">${highLeft.map(t => `<li><span class="cd-item-label">${escHtml(t.title)}</span><span class="cd-item-meta">${sylWeightText(t) || 'Medium'}</span></li>`).join('')}</ul>`;
    } else {
      res += st.allRevised ? ' Everything is revised.' : ` Every topic is covered. ${st.total - st.revised} still to revise.`;
    }
    return res + `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${sylOpenButton(e.subjectName)}</div>`;
  }

  function buildSyllabusRevise(subject) {
    const entries = subject ? [sylEntryFor(subject)].filter(Boolean) : sylEntries();
    if (!entries.length) return sylNone(subject);
    const list = [];
    entries.forEach(e => {
      const days = sylDays(e);
      e.topics.filter(t => t.status === 'done').forEach(t => list.push({ e, t, days, score: sylScore(t, days) }));
    });
    if (!list.length) {
      const anyRevised = entries.some(e => e.topics.some(t => t.status === 'revised'));
      return anyRevised
        ? `Everything you've finished is already revised. Nice. Ask "what should I study" for what's next.`
        : `Nothing to revise yet: no topic is marked done. Tap a topic's circle once when you finish it, and again when you revise it.<br><br>${sylOpenButton(entries[0].subjectName)}`;
    }
    list.sort((a, b) => b.score - a.score);
    const items = list.slice(0, 6).map(p => `<li><span class="cd-item-label">${escHtml(p.t.title)}</span><span class="cd-item-meta">${[escHtml(p.e.subjectName), sylWeightText(p.t), sylWhen(p.days)].filter(Boolean).join(' · ')}</span></li>`).join('');
    return `<strong>${list.length} topic${list.length !== 1 ? 's' : ''} done but not revised.</strong> Start with these (weightage and nearest exam first):<ul class="cd-list">${items}</ul>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${sylOpenButton(list[0].e.subjectName)}</div>`;
  }

  function buildSyllabusImportant(subject) {
    const entries = subject ? [sylEntryFor(subject)].filter(Boolean) : sylEntries();
    if (!entries.length) return sylNone(subject);
    const left = [];
    entries.forEach(e => e.topics.filter(t => t.status === 'todo').forEach(t => left.push({ e, t })));
    if (!left.length) return `No topics left${subject ? ` in <strong>${escHtml(entries[0].subjectName)}</strong>` : ''}. Ask "what should I revise" next.`;
    const weighted = left.filter(p => p.t.importance === 3 || p.t.marks);
    if (!weighted.length) {
      return `None of your remaining topics has weightage yet. Mark a topic <strong>High</strong> or add its marks (tap the chip or ✎ on the Syllabus card) and I can rank them.<br><br>${sylOpenButton(left[0].e.subjectName)}`;
    }
    weighted.sort((a, b) => (b.t.marks || 0) - (a.t.marks || 0) || b.t.importance - a.t.importance);
    const items = weighted.slice(0, 8).map(p => `<li><span class="cd-item-label">${escHtml(p.t.title)}</span><span class="cd-item-meta">${[sylWeightText(p.t), escHtml(p.e.subjectName)].filter(Boolean).join(' · ')}</span></li>`).join('');
    return `<strong>${weighted.length} important topic${weighted.length !== 1 ? 's' : ''} not started yet</strong>, most marks first:<ul class="cd-list">${items}</ul>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${sylOpenButton(weighted[0].e.subjectName)}</div>`;
  }

  function sylPaceLine(e) {
    const st = syllabusStats(e);
    const days = sylDays(e);
    const name = `<strong>${escHtml(e.subjectName)}</strong>`;
    if (!st.left) return `${name}: everything covered${st.total - st.revised ? `, ${st.total - st.revised} to revise` : ', all revised'}.`;
    if (days === null) return `${name}: ${st.left} topic${st.left !== 1 ? 's' : ''} left, no exam date set.`;
    if (days < 0) return `${name}: exam date has passed, ${st.left} topic${st.left !== 1 ? 's' : ''} left.`;
    if (days === 0) return `${name}: exam is today with ${st.left} topic${st.left !== 1 ? 's' : ''} left. Go over the High ones first.`;
    const perDay = Math.ceil(st.left / days);
    const tight = perDay >= 4;
    return `${name}: ${st.left} topic${st.left !== 1 ? 's' : ''} left, ${days} day${days !== 1 ? 's' : ''} → about <strong>${perDay} a day</strong>${tight ? '. That is tight, so start with the High-weightage ones' : ''}.`;
  }

  function buildSyllabusPace(subject) {
    const entries = subject ? [sylEntryFor(subject)].filter(Boolean) : sylEntries();
    if (!entries.length) return sylNone(subject);
    const lines = entries.map(e => ({ e, days: sylDays(e) }))
      .sort((a, b) => (a.days === null) - (b.days === null) || (a.days ?? 0) - (b.days ?? 0))
      .map(x => `<li>${sylPaceLine(x.e)}</li>`).join('');
    const noDates = entries.some(e => sylDays(e) === null);
    return `<ul class="cd-list">${lines}</ul>${noDates ? `<div style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:6px">Add an exam date on a subject's Syllabus card (or the countdown in Settings) to see a daily pace.</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-sm btn-secondary" onclick="sendAssistantMessage('What should I study today?')" style="font-size:var(--text-sm);padding:4px 10px">What should I study?</button>
    </div>`;
  }

  // "is normalization done": finds the closest topic name, or null.
  function sylFindTopic(phrase) {
    const q = plainText(phrase).replace(/^(the|my|topic|chapter|unit)\s+/, '').replace(/\s+(topic|chapter|unit)$/, '').trim();
    if (q.length < 3) return null;
    let best = null, bestScore = 0;
    sylEntries().forEach(e => e.topics.forEach(t => {
      const title = plainText(t.title);
      let score = 0;
      if (title === q) score = 100;
      else if (title.includes(q) || q.includes(title)) score = 60 + Math.min(q.length, title.length);
      else {
        const qw = q.split(' ').filter(w => w.length >= 3);
        const tw = title.split(' ');
        const hits = qw.filter(w => tw.some(x => x === w || (w.length >= 5 && editDistance(w, x, 2) <= 2))).length;
        if (qw.length && hits === qw.length) score = 30 + hits;
      }
      if (score > bestScore) { best = { e, t }; bestScore = score; }
    }));
    return best;
  }

  function topicQuestion(text) {
    const m = text.match(SYL_TOPIC_RE);
    if (!m) return null;
    return sylFindTopic(m[1]);
  }

  function buildSyllabusTopic(query, text) {
    const hit = topicQuestion(text || '');
    if (!hit) return buildUnknown(query);
    const { e, t } = hit;
    const state = t.status === 'revised' ? `Yes, done and revised${t.revisedAt ? ` (${fmtDate(t.revisedAt.slice(0, 10))})` : ''}.`
      : t.status === 'done' ? `Yes, done${t.doneAt ? ` on ${fmtDate(t.doneAt.slice(0, 10))}` : ''}, not revised yet.`
      : 'Not yet. It is still marked not started.';
    const days = sylDays(e);
    return `<strong>${escHtml(t.title)}</strong> (${escHtml(e.subjectName)}): ${state}${sylWeightText(t) ? `<br>Weightage: ${sylWeightText(t)}.` : ''}${days !== null && days >= 0 ? ` ${sylWhen(days)[0].toUpperCase()}${sylWhen(days).slice(1)}.` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${sylOpenButton(e.subjectName)}</div>`;
  }

  // The syllabus rules, checked before the general ones (so "important
  // topics" isn't read as notices and "finish DBMS before the exam" isn't
  // read as the exam date).
  function syllabusIntent(text, subject) {
    if (topicQuestion(text)) return 'syllabus_topic';
    if (SYL_REVISE_RE.test(text)) return 'syllabus_revise';
    if (SYL_IMPORTANT_RE.test(text)) return 'syllabus_important';
    // Attendance, classes and tasks have their own answers.
    if (/\b(attendance|class|classes|lab|tasks?|deadlines?)\b/.test(text)) return null;
    if (SYL_PACE_RE.test(text)) return 'syllabus_pace';
    if (SYL_PROGRESS_RE.test(text)) return subject ? 'subject_syllabus' : 'syllabus_overview';
    return null;
  }

  // One line for answers that already exist (subject overview, week, today).
  function sylSubjectLine(subject) {
    const e = sylEntryFor(subject);
    if (!e) return '';
    const st = syllabusStats(e);
    return `Syllabus: <strong>${st.pct}%</strong> (${st.done}/${st.total} topics${st.revised ? `, ${st.revised} revised` : ''})<br>`;
  }

  // ── Response Builders ─────────────────────────────────────────

  function buildGreeting() {
    const p = loadProfile() || deps.liveProfile || {};
    const name = p.name || '';
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const nameStr = name ? `, ${name.split(' ')[0]}` : '';
    const todayClasses = getTodayClasses();
    const pending = allTasks().filter(t => t.status === 'pending').length;
    const dayName = DAY_NAMES[new Date().getDay()];

    let line2 = '';
    if (todayClasses.length > 0) {
      line2 = `You have <strong>${todayClasses.length} class${todayClasses.length !== 1 ? 'es' : ''}</strong> today (${dayName})`;
    } else {
      line2 = `No classes today (${dayName}).`;
    }
    if (pending > 0) {
      line2 += ` and <strong>${pending} pending task${pending !== 1 ? 's' : ''}</strong>.`;
    } else {
      line2 += ` and no pending tasks.`;
    }

    return `${greet}${nameStr}! ${line2}`;
  }

  function buildHelp() {
    return `Ask Desk operates as your academic assistant grounded in your live schedule &amp; records:<ul class="cd-list">
      <li><span class="cd-item-label">Parser &amp; Setup Review</span><span class="cd-item-meta">"Review timetable import" · "Check pending imports"</span></li>
      <li><span class="cd-item-label">Post-Cleanup Followup</span><span class="cd-item-meta">"What changed after cleanup?" · "Recovery status"</span></li>
      <li><span class="cd-item-label">Weekly Academic Plan</span><span class="cd-item-meta">"Plan my week" · "Help me rebalance this week"</span></li>
      <li><span class="cd-item-label">Subject Radar</span><span class="cd-item-meta">"Which subject needs the most attention?" · "Where am I falling behind?"</span></li>
      <li><span class="cd-item-label">Today Study Plan</span><span class="cd-item-meta">"Help me plan tonight" · "What should I study today?"</span></li>
      <li><span class="cd-item-label">Syllabus</span><span class="cd-item-meta">"How much syllabus is left?" · "What should I revise?" · "Important topics left" · "Am I on track?" · "Have I done normalization?"</span></li>
      <li><span class="cd-item-label">Desk Actions</span><span class="cd-item-meta">"Add a task for [Subject]" · "Import timetable" · "Clean my desk"</span></li>
    </ul>`;
  }

  function buildParserReview() {
    const tt = loadTimetable();
    const hasClasses = Object.values(tt || {}).some(arr => Array.isArray(arr) && arr.some(c => !isBreakEntry(c)));
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const baselines = loadAttendanceBaselines();
    const isPolluted = (typeof detectDeskPollution === 'function') && detectDeskPollution();

    const issues = [];

    // 1. Timetable Check
    if (!hasClasses) {
      issues.push({
        title: 'Timetable Import Pending',
        desc: 'No timetable data found. Your schedule has not been imported yet.',
        action: `<button class="btn btn-sm btn-primary" onclick="triggerTimetableImport()" style="font-size:var(--text-sm);padding:3px 10px;margin-top:4px">${icons.camera()} Scan Timetable Photo →</button>`
      });
    } else if (isPolluted) {
      issues.push({
        title: 'Timetable Multi-Batch Sessions Found',
        desc: 'Extracted timetable contains other-batch practicals or duplicate merged slots that need batch filtering confirmation.',
        action: `<button class="btn btn-sm btn-secondary" onclick="showDeclutterDeskModal()" style="font-size:var(--text-sm);padding:3px 10px;margin-top:4px">${icons.declutter()} Review &amp; Filter Batch →</button>`
      });
    }

    // 2. Attendance Baseline Check
    if (subjects.length > 0) {
      const unverified = subjects.filter(s => {
        const codeKey = (s.code || '').trim();
        const nameKey = (s.name || '').trim();
        return !baselines[codeKey] && !baselines[nameKey];
      });
      if (unverified.length > 0) {
        issues.push({
          title: `Attendance Baselines (${unverified.length} Unverified)`,
          desc: `${unverified.map(s => s.name).slice(0, 3).join(', ')}${unverified.length > 3 ? ` and ${unverified.length - 3} more` : ''} need starting attendance counts confirmed.`,
          action: `<button class="btn btn-sm btn-secondary" onclick="showBaselineModal(null, 'manual')" style="font-size:var(--text-sm);padding:3px 10px;margin-top:4px">${icons.chartLine()} Confirm Baselines →</button>`
        });
      }
    }

    if (issues.length === 0) {
      let totalSlots = 0;
      Object.values(tt || {}).forEach(arr => {
        (arr || []).forEach(c => { if (!isBreakEntry(c)) totalSlots++; });
      });
      return `<div class="cd-tag cd-tag-safe" style="display:inline-flex;margin-bottom:8px">✓ All Imports Confirmed</div><br>
      <strong>All imported data is verified and confirmed!</strong><br><br>
      • Timetable: <strong>${totalSlots} weekly slots</strong> active.<br>
      • Attendance: <strong>${subjects.length}/${subjects.length} subjects</strong> confirmed with live tracking.<br>
      • Desk Health: Zero duplicate or unmapped rows detected.`;
    }

    const items = issues.map(iss => `
      <li style="margin-bottom:8px">
        <div style="font-weight:600;color:var(--text-primary)">${iss.title}</div>
        <div style="font-size:var(--text-sm);color:var(--text-muted)">${iss.desc}</div>
        ${iss.action}
      </li>
    `).join('');

    return `<div class="cd-tag is-warning" style="margin-bottom:8px">Import Review Status</div><br>
    <strong>${issues.length} item${issues.length !== 1 ? 's' : ''} require confirmation or review:</strong><ul class="cd-list" style="margin-top:8px">${items}</ul>`;
  }

  function buildCleanupFollowup() {
    const isPolluted = (typeof detectDeskPollution === 'function') && detectDeskPollution();
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const p = loadProfile() || deps.liveProfile || {};

    if (isPolluted) {
      return `<div class="cd-tag is-warning" style="margin-bottom:8px">Cleanup Incomplete</div><br>
      Your desk still has duplicate cards or mixed practical batches from an earlier timetable scan.<br><br>
      <strong>Next step:</strong> Select your practical batch to remove other-batch classes and merge duplicate cards safely.<br><br>
      <button class="btn btn-sm btn-primary" onclick="showDeclutterDeskModal()" style="font-size:var(--text-sm);padding:6px 14px">${icons.declutter()} Run Declutter &amp; Recovery →</button>`;
    }

    const labSubjects = subjects.filter(s => s.isLab || /lab\b/i.test(s.name));
    const theorySubjects = subjects.filter(s => !s.isLab && !/lab\b/i.test(s.name));

    return `<div class="cd-tag cd-tag-safe" style="margin-bottom:8px">✓ Desk Structure Clean</div><br>
    <strong>Post-Cleanup Status:</strong><br>
    • <strong>Active Filter:</strong> ${p.batch ? `Batch ${p.batch}` : 'All Batches (General)'}<br>
    • <strong>Canonical Subjects:</strong> ${subjects.length} active (${theorySubjects.length} theory, ${labSubjects.length} lab)<br>
    • <strong>Data Integrity:</strong> All attendance baselines and tasks remain safely attached to canonical hubs.<br><br>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm btn-secondary" onclick="navigate('subjects')" style="font-size:var(--text-sm);padding:5px 12px">View Subject Hubs →</button>
      <button class="btn btn-sm btn-secondary" onclick="navigate('timetable')" style="font-size:var(--text-sm);padding:5px 12px">View Timetable →</button>
    </div>`;
  }

  function buildWeeklyPlan() {
    const tt = timetableForDisplay();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = [1, 2, 3, 4, 5, 6].map(d => {
      const classes = (tt[d] || []).filter(c => !isBreakEntry(c));
      return { dayNum: d, day: dayNames[d], count: classes.length };
    }).filter(d => d.count > 0);

    const totalSlots = dayCounts.reduce((acc, d) => acc + d.count, 0);
    const sortedDays = [...dayCounts].sort((a, b) => b.count - a.count);
    const heaviest = sortedDays[0];
    const lightest = sortedDays[sortedDays.length - 1];

    const today = todayISO();
    const weekEnd = nDaysFromNow(7);
    const tasks = allTasks();
    const thisWeekTasks = tasks.filter(t => t.status === 'pending' && !t.noDeadline && t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd);
    const overdueTasks = tasks.filter(t => isTaskOverdue(t));

    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const target = getAttendanceTarget();
    const atRisk = subjects.filter(s => {
      const att = getSubjectAttendance(s);
      return att.pct !== null && att.pct < target;
    });

    const sections = [];

    // 1. Timetable Load
    if (totalSlots > 0) {
      sections.push(`<li><strong>Weekly Timetable Load:</strong> <strong>${totalSlots} total classes</strong> this week. Heaviest day: <strong>${heaviest.day} (${heaviest.count} classes)</strong>${lightest && lightest.day !== heaviest.day ? `, lightest: ${lightest.day} (${lightest.count} classes)` : ''}.</li>`);
    } else {
      sections.push(`<li><strong>Weekly Timetable Load:</strong> No weekly schedule imported yet.</li>`);
    }

    // 2. Deadlines
    if (overdueTasks.length > 0 || thisWeekTasks.length > 0) {
      const topTask = overdueTasks[0] || thisWeekTasks[0];
      const overdueTag = overdueTasks.length > 0 ? ` (<strong>${overdueTasks.length} overdue</strong>)` : '';
      sections.push(`<li><strong>Academic Deadlines:</strong> <strong>${thisWeekTasks.length + overdueTasks.length} task${(thisWeekTasks.length+overdueTasks.length)!==1?'s':''}</strong>${overdueTag} needing focus, led by <em>${escHtml(topTask.title)}</em> (${escHtml(topTask.subject || 'Task')}).</li>`);
    } else {
      sections.push(`<li><strong>Academic Deadlines:</strong> Nothing overdue and nothing due this week.</li>`);
    }

    // 3. Attendance Targets
    if (atRisk.length > 0) {
      const riskNames = atRisk.map(s => escHtml(s.name)).join(', ');
      sections.push(`<li><strong>Attendance Health:</strong> <strong>${atRisk.length} subject${atRisk.length!==1?'s':''}</strong> below target (${riskNames}). Attend all sessions this week to gain safety margin.</li>`);
    } else {
      sections.push(`<li><strong>Attendance Health:</strong> All active subjects are in safe standing (≥${target}%).</li>`);
    }

    // 3b. Syllabus
    const sylRows = sylEntries().map(e => ({ e, st: syllabusStats(e), days: sylDays(e) }));
    if (sylRows.length) {
      const behind = [...sylRows].sort((a, b) => a.st.pct - b.st.pct)[0];
      const avg = Math.round(sylRows.reduce((n, r) => n + r.st.pct, 0) / sylRows.length);
      sections.push(`<li><strong>Syllabus:</strong> <strong>${avg}%</strong> covered across ${sylRows.length} subject${sylRows.length !== 1 ? 's' : ''}. Furthest behind: <strong>${escHtml(behind.e.subjectName)}</strong> at ${behind.st.pct}%${behind.days !== null && behind.days >= 0 ? ` (${sylWhen(behind.days)})` : ''}.</li>`);
    }

    // 4. Rebalancing Strategy
    if (heaviest && (overdueTasks.length > 0 || thisWeekTasks.length > 0)) {
      const topTask = overdueTasks[0] || thisWeekTasks[0];
      sections.push(`<li><strong>💡 Rebalance Strategy:</strong> Complete <em>${escHtml(topTask.title)}</em> before <strong>${heaviest.day}</strong> to eliminate stress during your heaviest class day.</li>`);
    } else {
      sections.push(`<li><strong>💡 Rebalance Strategy:</strong> Review your notes in 25-minute focus intervals after morning lectures.</li>`);
    }

    return `<div class="cd-tag is-accent" style="margin-bottom:8px">Weekly Academic Roadmap</div><br>
    Here is your grounded weekly focus summary:<ul class="cd-list" style="margin-top:8px">${sections.join('')}</ul>`;
  }

  function buildSubjectGuidance() {
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    if (subjects.length === 0) {
      return `No subjects found. Add classes in Timetable to start subject-aware tracking.`;
    }

    const target = getAttendanceTarget();

    const scored = subjects.map(s => {
      const att = getSubjectAttendance(s);
      const tasks = allTasks().filter(t => t.subject && t.subject.toLowerCase() === s.name.toLowerCase() && t.status === 'pending');
      const overdue = tasks.filter(t => isTaskOverdue(t));
      const hasBaseline = att.hasBaseline;
      const pct = att.pct;

      let score = 0;
      const signals = [];

      if (pct !== null && (att.pctLabel ? att.isSafe === false : pct < target)) {
        score += 50;
        signals.push(`attendance is low at <strong>${att.pctLabel ?? pct}%</strong> (target: ${target}%)`);
      } else if (!hasBaseline && att.total === 0) {
        score += 20;
        signals.push(`baseline counts unverified`);
      }

      if (overdue.length > 0) {
        score += 40;
        signals.push(`<strong>${overdue.length} overdue deadline${overdue.length!==1?'s':''}</strong>`);
      } else if (tasks.length > 0) {
        score += 20;
        signals.push(`${tasks.length} pending task${tasks.length!==1?'s':''}`);
      }

      const sylE = sylEntryFor(s);
      if (sylE) {
        const st = syllabusStats(sylE);
        const days = sylDays(sylE);
        if (st.left > 0 && days !== null && days >= 0 && days <= 14 && st.pct < 60) {
          score += 35;
          signals.push(`syllabus only <strong>${st.pct}%</strong> done with the ${sylWhen(days)}`);
        }
      }

      const isLab = s.isLab || /lab\b/i.test(s.name);

      return {
        subject: s,
        score,
        signals,
        isLab,
        pct,
        tasksCount: tasks.length,
        hasBaseline
      };
    }).sort((a, b) => b.score - a.score);

    const top = scored[0];
    if (!top || top.score === 0) {
      return `<div class="cd-tag cd-tag-safe" style="margin-bottom:8px">✓ All Good</div><br>
      <strong>All subjects are in great standing!</strong><br><br>
      No subjects have low attendance, unverified baselines, or overdue tasks. Keep up the strong consistency!`;
    }

    const items = scored.filter(s => s.score > 0).slice(0, 3).map(s => {
      const typeBadge = s.isLab ? '<span class="cd-tag is-purple" style="font-size:var(--text-xs);padding:1px 5px">Lab</span> ' : '';
      return `<li>${typeBadge}<strong>${escHtml(s.subject.name)}</strong>: ${s.signals.join(' and ')}.</li>`;
    }).join('');

    return `<div class="cd-tag is-error" style="margin-bottom:8px">Academic Focus Radar</div><br>
    <strong>${escHtml(top.subject.name)}</strong> needs the most attention right now because ${top.signals.join(' and ')}.<br><br>
    <strong>Priority Breakdown:</strong><ul class="cd-list" style="margin-top:6px">${items}</ul>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-sm btn-primary" onclick="sendAssistantMessage('Help me plan tonight')" style="font-size:var(--text-sm);padding:4px 10px">${icons.target()} Plan Study for Today</button>
      <button class="btn btn-sm btn-secondary" onclick="showAddTaskModal(null, '${top.subject.name.replace(/'/g, "\\'")}')" style="font-size:var(--text-sm);padding:4px 10px">${icons.edit()} Add Task</button>
    </div>`;
  }

  function buildImportTimetable() {
    const tt = loadTimetable();
    const hasClasses = Object.values(tt || {}).some(arr => Array.isArray(arr) && arr.some(c => !isBreakEntry(c)));
    let totalSlots = 0;
    Object.values(tt || {}).forEach(arr => {
      (arr || []).forEach(c => { if (!isBreakEntry(c)) totalSlots++; });
    });

    if (!hasClasses) {
      return `<div class="cd-tag is-accent" style="margin-bottom:8px">Timetable Setup</div><br>
      You don't have a schedule set up yet. You can scan an image of your timetable or load our official sample schedule template.<br><br>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" onclick="triggerTimetableImport()" style="font-size:var(--text-sm);padding:5px 12px">${icons.camera()} Scan Timetable Photo</button>
        <button class="btn btn-sm btn-secondary" onclick="loadOfficialAidsTimetable()" style="font-size:var(--text-sm);padding:5px 12px">${icons.filetext()} Sample Template</button>
        <button class="btn btn-sm btn-secondary" onclick="navigate('timetable')" style="font-size:var(--text-sm);padding:5px 12px">Open Timetable →</button>
      </div>`;
    }

    return `<div class="cd-tag cd-tag-safe" style="margin-bottom:8px">Timetable Active</div><br>
    You currently have <strong>${totalSlots} class slot${totalSlots!==1?'s':''}</strong> active on your timetable. You can scan a new photo to replace/update it or add individual classes manually.<br><br>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm btn-secondary" onclick="triggerTimetableImport()" style="font-size:var(--text-sm);padding:5px 12px">${icons.camera()} Scan New Photo</button>
      <button class="btn btn-sm btn-secondary" onclick="navigate('timetable')" style="font-size:var(--text-sm);padding:5px 12px">View Full Schedule →</button>
    </div>`;
  }

  function buildSetupAttendance() {
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const baselines = loadAttendanceBaselines();
    const missing = subjects.filter(s => {
      const codeKey = (s.code || '').trim();
      const nameKey = (s.name || '').trim();
      return !baselines[codeKey] && !baselines[nameKey];
    });

    if (subjects.length === 0) {
      return `<div class="cd-tag is-warning" style="margin-bottom:8px">No Subjects Found</div><br>
      Set up your timetable schedule first so Clarity Desk can automatically create your Subject Hubs for tracking attendance.<br><br>
      <button class="btn btn-sm btn-primary" onclick="triggerTimetableImport()" style="font-size:var(--text-sm);padding:5px 12px">${icons.camera()} Scan Timetable Photo →</button>`;
    }

    if (missing.length > 0) {
      return `<div class="cd-tag is-warning" style="margin-bottom:8px">Attendance Baseline</div><br>
      <strong>${missing.length} of ${subjects.length} subjects</strong> are missing initial attendance counts. Entering your portal counts once gives you instant % calculations and safe skip guidance.<br><br>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" onclick="showBaselineModal(null, 'scan')" style="font-size:var(--text-sm);padding:5px 12px">${icons.camera()} Scan Portal Screenshot</button>
        <button class="btn btn-sm btn-secondary" onclick="showBaselineModal(null, 'manual')" style="font-size:var(--text-sm);padding:5px 12px">${icons.edit()} Enter Counts Manually</button>
        <button class="btn btn-sm btn-secondary" onclick="navigate('subjects')" style="font-size:var(--text-sm);padding:5px 12px">Subject Hubs →</button>
      </div>`;
    }

    return `<div class="cd-tag cd-tag-safe" style="margin-bottom:8px">Baselines Active</div><br>
    All your active Subject Hubs have baseline counts configured. You can update counts at any time or log daily attendance directly in the timetable.<br><br>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm btn-secondary" onclick="showBaselineModal()" style="font-size:var(--text-sm);padding:5px 12px">${icons.chartLine()} Edit Baseline Counts</button>
      <button class="btn btn-sm btn-secondary" onclick="navigate('subjects')" style="font-size:var(--text-sm);padding:5px 12px">Subject Hubs →</button>
    </div>`;
  }

  function buildDeclutterDesk() {
    const isPolluted = (typeof detectDeskPollution === 'function') && detectDeskPollution();

    if (isPolluted) {
      return `<div class="cd-tag is-warning" style="margin-bottom:8px">Declutter Recommended</div><br>
      We detected duplicate, noisy, or multi-batch subject cards on your desk. Decluttering will:<br>
      <ul class="cd-list" style="margin:6px 0 8px 0">
        <li>Filter practical lab sessions to your exact batch (e.g. A2, B1, D1)</li>
        <li>Merge duplicate variations into clean canonical cards</li>
        <li>Safely reassign all attendance baselines &amp; tasks without data loss</li>
      </ul>
      <button class="btn btn-sm btn-primary" onclick="showDeclutterDeskModal()" style="font-size:var(--text-sm);padding:6px 14px">${icons.declutter()} Declutter my desk →</button>`;
    }

    return `<div class="cd-tag cd-tag-safe" style="margin-bottom:8px">Clean Desk</div><br>
    Your Subject Hubs and timetable structure are already normalized and clean! If you ever need to change your practical batch or re-filter sessions, you can launch cleanup anytime.<br><br>
    <button class="btn btn-sm btn-secondary" onclick="showDeclutterDeskModal()" style="font-size:var(--text-sm);padding:5px 12px">${icons.declutter()} Open Declutter Tool →</button>`;
  }

  function buildSubjectHubs() {
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    if (subjects.length === 0) {
      return `No Subject Hubs found. Set up your timetable schedule or attendance baseline first.<br><br>
      <button class="btn btn-sm btn-primary" onclick="navigate('subjects')" style="font-size:var(--text-sm);padding:5px 12px">Open Subject Hubs →</button>`;
    }
    return `You have <strong>${subjects.length} active Subject Hub${subjects.length !== 1 ? 's' : ''}</strong> configured with attendance, course resources, and faculty metadata.<br><br>
    <button class="btn btn-sm btn-primary" onclick="navigate('subjects')" style="font-size:var(--text-sm);padding:6px 14px">${icons.book()} Open Subject Hubs →</button>`;
  }

  function buildCreateTask(query) {
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    let q = query.replace(/\b(add a task|add task|create task|new task|make a task|remind me to)\b/i, '').trim();
    const cleanQ = q.replace(/^(for|in|about)\s+/i, '').trim().toLowerCase();

    // Check matching subjects
    const matching = subjects.filter(s => {
      const sName = s.name.toLowerCase();
      const sCode = (s.code || '').toLowerCase();
      if (!cleanQ || cleanQ.length < 3) return false;
      return (sName && (sName === cleanQ || sName.includes(cleanQ) || cleanQ.includes(sName))) ||
             (sCode && sCode.length >= 2 && (sCode === cleanQ || sCode.includes(cleanQ) || cleanQ.includes(sCode)));
    });

    if (matching.length === 1) {
      const foundSubj = matching[0];
      return `Open the Task Creator for <strong>${escHtml(foundSubj.name)}</strong> in <a href="javascript:void(0)" onclick="navigate('assignments')" style="color:var(--accent);font-weight:600">Tasks &amp; Deadlines</a>:<br><br>
      <button class="btn btn-sm btn-primary" onclick="showAddTaskModal(null, '${foundSubj.name.replace(/'/g, "\\'")}')" style="font-size:var(--text-sm);padding:6px 14px">${icons.edit()} Create Task for ${escHtml(foundSubj.name)} →</button>`;
    } else if (matching.length > 1) {
      const buttons = matching.map(s =>
        `<button class="btn btn-sm btn-secondary" onclick="showAddTaskModal(null, '${s.name.replace(/'/g, "\\'")}')" style="font-size:var(--text-sm);padding:4px 10px">${escHtml(s.name)}</button>`
      ).join(' ');
      return `Multiple subjects matched your request. Choose which subject to create a task for:<br><br>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${buttons}</div>`;
    }

    return `To create or schedule an assignment, open the Task Creator in <a href="javascript:void(0)" onclick="navigate('assignments')" style="color:var(--accent);font-weight:600">Tasks &amp; Deadlines</a>:<br><br>
    <button class="btn btn-sm btn-primary" onclick="showAddTaskModal()" style="font-size:var(--text-sm);padding:6px 14px">${icons.edit()} Open Task Creator →</button>`;
  }

  function buildStudyPlan() {
    const today = todayISO();
    const tomorrow = nDaysFromNow(1);
    const tasks = allTasks();
    const urgentTasks = tasks.filter(t => t.status === 'pending' && (isTaskOverdue(t) || t.dueDate === today || t.dueDate === tomorrow));
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const target = getAttendanceTarget();
    const atRisk = subjects.filter(s => {
      const att = getSubjectAttendance(s);
      return att.pct !== null && att.pct < target;
    });

    const tomorrowDay = (new Date().getDay() + 1) % 7;
    const tt = timetableForDisplay();
    const tomorrowClasses = (tt[tomorrowDay] || []).filter(c => !isBreakEntry(c));

    const planSteps = [];

    // Block 1: Highest Priority / Urgent Work
    if (urgentTasks.length > 0) {
      const topTask = urgentTasks[0];
      const urgencyLabel = isTaskOverdue(topTask) ? 'Overdue' : topTask.dueDate === today ? 'Due today' : 'Due tomorrow';
      planSteps.push(`<strong>1. High-Priority Focus (45 min):</strong> Tackle <em>${escHtml(topTask.title)}</em> for <strong>${escHtml(topTask.subject || 'Task')}</strong> (${urgencyLabel}). Finish this before moving to optional topics.`);
    } else {
      planSteps.push(`<strong>1. Course Consolidation (35 min):</strong> No urgent deadlines pending. Review key concepts and lab writeups from today's lectures.`);
    }

    // Block 2: syllabus topics when there is a syllabus, else the old advice.
    const picks = sylPicks(sylEntries(), 3);
    if (picks.length > 0) {
      planSteps.push(`<strong>2. Syllabus Topics (about 30 min each):</strong> Picked by weightage and how close each exam is:<ul class="cd-list" style="margin-top:4px">${picks.map(sylPickLine).join('')}</ul>`);
    } else if (atRisk.length > 0) {
      const topRisk = atRisk[0];
      const att = getSubjectAttendance(topRisk);
      planSteps.push(`<strong>2. Attendance Recovery Study (30 min):</strong> Focus on <strong>${escHtml(topRisk.name)}</strong> (currently at ${att.pctLabel ?? att.pct}%). Ensure lecture notes and assignments are up to date so you don't miss future marks.`);
    } else if (subjects.length > 0) {
      planSteps.push(`<strong>2. Problem Practice (30 min):</strong> Solve practice questions or read syllabus references for <strong>${escHtml(subjects[0].name)}</strong>.`);
    } else {
      planSteps.push(`<strong>2. Desk Review (20 min):</strong> Organize notes, verify upcoming tests, and check campus notices.`);
    }

    // Block 3: Tomorrow's Schedule Preview
    if (tomorrowClasses.length > 0) {
      const firstClass = tomorrowClasses[0];
      planSteps.push(`<strong>3. Tomorrow's Preview (15 min):</strong> Preview tomorrow's opening lecture: <strong>${escHtml(firstClass.subject)}</strong> at ${formatTime(firstClass.time)}${firstClass.room && firstClass.room !== '—' ? ' in ' + escHtml(firstClass.room) : ''}.`);
    } else {
      planSteps.push(`<strong>3. Day Wrap-Up (10 min):</strong> Check off completed tasks and set goals for tomorrow.`);
    }

    const sylNudge = !picks.length && !sylEntries().length
      ? `<div style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:8px">Add your syllabus in a Subject Hub and I'll pick the exact topics for you.</div>` : '';
    return `<div class="cd-tag is-accent" style="margin-bottom:8px">Today's Focus Plan</div><br>
    Here is a realistic study plan grounded in your live desk data:<ul class="cd-list" style="margin-top:8px">${planSteps.map(s => `<li>${s}</li>`).join('')}</ul>${sylNudge}${picks.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${sylOpenButton(picks[0].e.subjectName)}</div>` : ''}`;
  }

  function buildTodaySummary() {
    const line = typeof syllabusTodayLine === 'function' ? syllabusTodayLine() : '';
    const body = buildTodaySummaryBody();
    return line ? `${body}<div style="margin-top:8px;font-size:var(--text-sm);color:var(--text-secondary)">📘 ${line}</div>` : body;
  }

  function buildTodaySummaryBody() {
    const classes = getTodayClasses();
    const dayName = DAY_NAMES[new Date().getDay()];
    const isSunday = new Date().getDay() === 0;
    const pendingOverdue = allTasks().filter(t => isTaskOverdue(t));
    const dueToday = allTasks().filter(t => t.status === 'pending' && !t.noDeadline && t.dueDate === todayISO());

    if (isHolidayActive()) {
      const n = pendingOverdue.length + dueToday.length;
      return `Holiday mode is on${loadHoliday()?.until ? ` (${holidayLabel().replace('Back', 'back')})` : ''}, so classes are hidden. Your timetable is safe.${n > 0 ? `<br><br>💡 You have <strong>${n}</strong> urgent/due task${n !== 1 ? 's' : ''} on your desk.` : ''}`;
    }

    if (isSunday) {
      let msg = `Today is <strong>Sunday</strong>, so there are no classes.`;
      if (pendingOverdue.length > 0 || dueToday.length > 0) {
        msg += `<br><br>💡 You have <strong>${pendingOverdue.length + dueToday.length}</strong> urgent/due tasks to catch up on before Monday.`;
      } else {
        msg += ` A calm day to relax or plan ahead for the week.`;
      }
      return msg;
    }

    const hasAnyTT = Object.values(loadTimetable() || {}).some(arr => arr && arr.some(c => !isBreakEntry(c)));
    if (!hasAnyTT) {
      return `<div class="cd-tag is-warning" style="margin-bottom:8px">No Timetable Set</div><br>No timetable imported yet. You can scan your schedule photo or add classes in the <a href="javascript:void(0)" onclick="navigate('timetable')" style="color:var(--accent);font-weight:600">Timetable tab</a>.`;
    }

    if (classes.length === 0) {
      return `<strong>${dayName}</strong>: No classes scheduled today.<br><br>💡 ${pendingOverdue.length > 0 ? `Focus on clearing your <strong>${pendingOverdue.length} overdue task${pendingOverdue.length!==1?'s':''}</strong> today.` : 'Your desk schedule is clear today.'}`;
    }

    const items = classes.map(c => {
      const timeStr = `${formatTime(c.time)} – ${formatTime(c.end)}`;
      const meta = [c.room && c.room !== '—' ? c.room : null, c.teacher && c.teacher !== '—' ? c.teacher : null].filter(Boolean).join(' · ');
      return `<li><span class="cd-item-label">${escHtml(c.subject)}</span><span class="cd-item-meta">${timeStr}${meta ? ' · ' + escHtml(meta) : ''}</span></li>`;
    }).join('');

    let guidance = '';
    const next = getNextClass();
    if (next) {
      guidance = `<div style="margin-top:10px;font-size:var(--text-sm);color:var(--text-secondary);border-top:1px dashed var(--border);padding-top:8px">⏱️ Next up: <strong>${escHtml(next.subject)}</strong> at ${formatTime(next.time)}${next.room ? ' (' + escHtml(next.room) + ')' : ''}</div>`;
    } else {
      guidance = `<div style="margin-top:10px;font-size:var(--text-sm);color:var(--green);border-top:1px dashed var(--border);padding-top:8px">✓ All classes for today completed!</div>`;
    }

    return `<strong>${dayName}</strong>, ${classes.length} class${classes.length !== 1 ? 'es' : ''}:<ul class="cd-list">${items}</ul>${guidance}`;
  }

  function buildNextClass() {
    const hasAnyTT = Object.values(loadTimetable() || {}).some(arr => arr && arr.some(c => !isBreakEntry(c)));
    if (!hasAnyTT) {
      return `No timetable imported yet. Add or scan your schedule in the <a href="javascript:void(0)" onclick="navigate('timetable')" style="color:var(--accent);font-weight:600">Timetable tab</a>.`;
    }

    const todayClasses = getTodayClasses();
    const next = getNextClass();
    const now = currentTimeMinutes();

    if (!next) {
      const first = todayClasses.length === 0 ? 'No classes today.' : `You're done with today's classes.`;
      // Say when the next one is instead of stopping at "none today".
      for (let off = 1; off < 8; off++) {
        const dn = (new Date().getDay() + off) % 7;
        const c = getDayClasses(dn).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))[0];
        if (c) {
          const when = off === 1 ? 'tomorrow' : off === 7 ? `next ${DAY_NAMES[dn]}` : DAY_NAMES[dn];
          return `${first} Next class: <strong>${escHtml(c.subject)}</strong>, ${when} at ${formatTime(c.time)}${c.room && c.room !== '—' ? ' in ' + escHtml(c.room) : ''}.`;
        }
      }
      return first;
    }

    const startMin = timeToMinutes(next.time);
    const diff = startMin - now;
    const inStr = diff > 0 ? ` (in ${diff} min)` : '';
    const timeStr = `${formatTime(next.time)} – ${formatTime(next.end)}`;
    const meta = [next.room && next.room !== '—' ? next.room : null, next.teacher && next.teacher !== '—' ? next.teacher : null].filter(Boolean).join(' · ');

    return `Next class: <strong>${escHtml(next.subject)}</strong>${inStr}<br><span style="font-size:var(--text-sm);color:var(--text-secondary)">🕐 ${timeStr}${meta ? ' · ' + escHtml(meta) : ''}</span>`;
  }

  function buildAttendanceRisk() {
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    if (subjects.length === 0) {
      return `No subjects found yet. Set up your timetable or attendance baseline to start monitoring attendance health.`;
    }

    const target = getAttendanceTarget();
    const atRisk = [];
    const safe = [];
    const missingBaseline = [];

    subjects.forEach(s => {
      const att = getSubjectAttendance(s);
      if (!att.hasBaseline && att.total === 0) {
        missingBaseline.push(s);
      } else if (att.pct !== null && (att.pctLabel ? att.isSafe === false : att.pct < target)) {
        atRisk.push({ subject: s, att });
      } else if (att.pct !== null) {
        safe.push({ subject: s, att });
      }
    });

    if (atRisk.length === 0 && missingBaseline.length === subjects.length) {
      return `<div class="cd-tag is-warning" style="margin-bottom:8px">No Baseline Set</div><br>No attendance baseline recorded yet. Set your starting attendance counts in <a href="javascript:void(0)" onclick="navigate('subjects')" style="color:var(--accent);font-weight:600">Subject Hubs</a> to track risks.`;
    }

    if (atRisk.length > 0) {
      const items = atRisk.map(({ subject, att }) => {
        const guidance = calculateSmartAttendanceGuidance(att.present, att.absent + att.leave, target);
        const cleanMsg = guidance.message.replace(/<\/?strong>/g, '');
        return `<li><span class="cd-tag cd-tag-risk">${att.pctLabel ?? att.pct}%</span><span class="cd-item-label">${escHtml(subject.name)}</span><span class="cd-item-meta">${cleanMsg}</span></li>`;
      }).join('');

      return `<strong>${atRisk.length} subject${atRisk.length!==1?'s':''} below target (${target}%):</strong><ul class="cd-list">${items}</ul>`;
    }

    const highest = safe.sort((a, b) => b.att.pct - a.att.pct)[0];
    return `<span class="cd-tag cd-tag-safe">All Safe</span> <strong>All active subjects are safely at or above ${target}%!</strong><br><br>Highest: <strong>${escHtml(highest.subject.name)}</strong> (${highest.att.pctLabel ?? highest.att.pct}%). Keep up the good momentum!`;
  }

  function buildAttendanceGeneral() {
    const overall = getOverallAttendance();
    const { attended, skipped, total } = overall;
    if (total === 0) {
      return `<div class="cd-tag is-warning" style="margin-bottom:8px">Attendance Setup Incomplete</div><br>No attendance recorded yet. Enter your starting portal baseline counts in <a href="javascript:void(0)" onclick="showBaselineModal(null, 'manual')" style="color:var(--accent);font-weight:600">Subject Hubs</a> to unlock percentage tracking and safe skip guidance.<br><br><button class="btn btn-sm btn-primary" onclick="showBaselineModal(null, 'manual')" style="font-size:var(--text-sm);padding:5px 12px">${icons.chartLine()} Set Baseline Counts →</button>`;
    }
    const target = getAttendanceTarget();
    // v2: the exact 2-decimal % and an exact comparison (74.50% is not safe).
    const pct = overall.pctLabel ?? Math.round((attended / total) * 100);
    const isSafe = overall.pctLabel ? overall.isSafe === true : pct >= target;
    const tag = isSafe
      ? '<span class="cd-tag cd-tag-safe">Safe Zone</span>'
      : '<span class="cd-tag cd-tag-risk">Risk Zone</span>';
    const guidance = calculateSmartAttendanceGuidance(attended, skipped, target);
    const cleanMsg = guidance.message.replace(/<\/?strong>/g, '');

    return `${tag}<strong>${pct}% overall attendance</strong> (${attended}/${total} sessions attended).<br><br>💡 ${cleanMsg}`;
  }

  function buildTasksUrgent() {
    const today = todayISO();
    const tomorrow = nDaysFromNow(1);
    const tasks = allTasks();

    const overdue = tasks.filter(t => isTaskOverdue(t));
    const dueToday = tasks.filter(t => t.status === 'pending' && !t.noDeadline && t.dueDate === today);
    const dueTomorrow = tasks.filter(t => t.status === 'pending' && !t.noDeadline && t.dueDate === tomorrow);

    const urgentTotal = overdue.length + dueToday.length + dueTomorrow.length;

    if (urgentTotal === 0) {
      return `<span class="cd-tag cd-tag-safe">Clear Desk</span> <strong>No urgent deadlines right now!</strong><br><br>No tasks are overdue or due in the next 24 hours. You're fully on track.`;
    }

    const items = [];
    overdue.forEach(t => {
      items.push(`<li><span class="cd-tag cd-tag-overdue">Overdue</span><span class="cd-item-label">${escHtml(t.title)}</span><span class="cd-item-meta">${escHtml(t.subject || 'Task')} · Due ${fmtDate(t.dueDate)}</span></li>`);
    });
    dueToday.forEach(t => {
      items.push(`<li><span class="cd-tag cd-tag-today">Due Today</span><span class="cd-item-label">${escHtml(t.title)}</span><span class="cd-item-meta">${escHtml(t.subject || 'Task')}</span></li>`);
    });
    dueTomorrow.forEach(t => {
      items.push(`<li><span class="cd-tag is-accent">Tomorrow</span><span class="cd-item-label">${escHtml(t.title)}</span><span class="cd-item-meta">${escHtml(t.subject || 'Task')} · Due ${fmtDate(t.dueDate)}</span></li>`);
    });

    return `<strong>${urgentTotal} urgent task${urgentTotal!==1?'s':''}:</strong><ul class="cd-list">${items.join('')}</ul>`;
  }

  function buildSetupGaps() {
    const gaps = [];
    const tt = loadTimetable();
    const hasClasses = Object.values(tt || {}).some(arr => Array.isArray(arr) && arr.some(c => !isBreakEntry(c)));
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const baselines = loadAttendanceBaselines();
    const p = loadProfile() || deps.liveProfile || {};

    // 1. Timetable Check
    if (!hasClasses) {
      gaps.push({
        title: 'Timetable Schedule',
        desc: 'No classes imported yet. Add or scan your schedule to unlock daily timetable intelligence.',
        btn: `<button class="btn btn-sm btn-secondary" onclick="navigate('timetable')" style="margin-top:4px;font-size:var(--text-sm);padding:3px 10px">${icons.camera()} Scan Timetable →</button>`
      });
    }

    // 2. Attendance Baseline Check
    if (subjects.length > 0) {
      const missingBaselines = subjects.filter(s => {
        const codeKey = (s.code || '').trim();
        const nameKey = (s.name || '').trim();
        return !baselines[codeKey] && !baselines[nameKey];
      });
      if (missingBaselines.length > 0) {
        gaps.push({
          title: 'Attendance Baselines',
          desc: `${missingBaselines.length} of ${subjects.length} subjects missing initial attendance counts.`,
          btn: `<button class="btn btn-sm btn-secondary" onclick="navigate('subjects')" style="margin-top:4px;font-size:var(--text-sm);padding:3px 10px">${icons.chartLine()} Set Baselines →</button>`
        });
      }
    }

    // 3. Profile & Practical Batch Check
    const missingProfile = [];
    if (!p.name) missingProfile.push('Name');
    if (!p.batch) missingProfile.push('Practical Batch');
    if (missingProfile.length > 0) {
      gaps.push({
        title: 'Student Profile',
        desc: `Add your ${missingProfile.join(' and ')} for personalized headers and batch filtering.`,
        btn: `<button class="btn btn-sm btn-secondary" onclick="navigate('settings')" style="margin-top:4px;font-size:var(--text-sm);padding:3px 10px">${icons.settings()} Profile Settings →</button>`
      });
    }

    // 4. Desk Pollution / Decluttering Check
    if (typeof detectDeskPollution === 'function' && detectDeskPollution()) {
      gaps.push({
        title: 'Schedule Decluttering',
        desc: 'Detected duplicate or other-batch subject cards from an earlier timetable scan.',
        btn: `<button class="btn btn-sm btn-secondary" onclick="showDeclutterDeskModal()" style="margin-top:4px;font-size:var(--text-sm);padding:3px 10px">${icons.declutter()} Declutter Desk →</button>`
      });
    }

    if (gaps.length === 0) {
      return `<div class="cd-tag cd-tag-safe" style="display:inline-flex;margin-bottom:8px">✓ Setup Complete</div><br><strong>Your desk setup is complete!</strong><br><br>Timetable, attendance baselines, and profile are all configured and active.`;
    }

    const items = gaps.map(g => `
      <li style="margin-bottom:8px">
        <div style="font-weight:600;color:var(--text-primary)">${g.title}</div>
        <div style="font-size:var(--text-sm);color:var(--text-muted)">${g.desc}</div>
        ${g.btn}
      </li>
    `).join('');

    return `<strong>${gaps.length} desk setup item${gaps.length !== 1 ? 's' : ''} to complete:</strong><ul class="cd-list" style="margin-top:8px">${items}</ul>`;
  }

  function buildClassesLeft() {
    const remaining = getRemainingTodayClasses();
    if (remaining.length === 0) {
      return `No more classes left today. You're done!`;
    }
    const items = remaining.map(c =>
      `<li><span class="cd-item-label">${escHtml(c.subject)}</span><span class="cd-item-meta">${formatTime(c.time)} – ${formatTime(c.end)}</span></li>`
    ).join('');
    return `<strong>${remaining.length} class${remaining.length !== 1 ? 'es' : ''}</strong> remaining today:<ul class="cd-list">${items}</ul>`;
  }

  function buildDaySchedule(day) {
    if (!day) return buildTodaySummary();
    if (!hasTimetable()) return noTimetableMsg();
    const classes = getDayClasses(day.dayNum);
    const when = day.offset === 0 || day.offset === 1 || day.offset === -1 ? `${day.title} (${DAY_NAMES[day.dayNum]})` : DAY_NAMES[day.dayNum];
    if (classes.length === 0) return `<strong>${when}</strong>: no classes. ${day.offset > 0 ? 'A free day.' : ''}`;

    const items = classes.map(c => {
      const timeStr = `${formatTime(c.time)} – ${formatTime(c.end)}`;
      const meta = [c.room && c.room !== '—' ? c.room : null, c.teacher && c.teacher !== '—' ? c.teacher : null].filter(Boolean).join(' · ');
      return `<li><span class="cd-item-label">${escHtml(c.subject)}</span><span class="cd-item-meta">${timeStr}${meta ? ' · ' + escHtml(meta) : ''}</span></li>`;
    }).join('');

    const due = day.offset >= 0 ? pendingDueOn(day.date) : [];
    const dueLine = due.length ? `<div style="margin-top:8px;font-size:var(--text-sm);color:var(--text-secondary)">Also due ${escHtml(day.label)}: ${due.map(t => `<strong>${escHtml(t.title)}</strong>`).join(', ')}</div>` : '';
    return `<strong>${when}</strong>, ${classes.length} class${classes.length !== 1 ? 'es' : ''}:<ul class="cd-list">${items}</ul>${dueLine}`;
  }

  // ── Answers that use a subject or a day ───────────────────────

  function hasTimetable() {
    return Object.values(loadTimetable() || {}).some(arr => Array.isArray(arr) && arr.some(c => !isBreakEntry(c)));
  }

  function noTimetableMsg() {
    return `No timetable yet. Scan a photo of it and I can answer questions about your classes.<br><br>
    <button class="btn btn-sm btn-primary" onclick="triggerTimetableImport()" style="font-size:var(--text-sm);padding:5px 12px">${icons.camera()} Scan timetable →</button>`;
  }

  function jsArg(str) {
    return escHtml(String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  }

  function sameSubject(a, b) {
    const k = (x) => (typeof getCanonicalSubjectKey === 'function' ? getCanonicalSubjectKey(x || '') : String(x || '').toLowerCase().trim());
    return !!a && !!b && k(a) === k(b);
  }

  function pendingDueOn(iso) {
    return allTasks().filter(t => t.status === 'pending' && !t.noDeadline && t.dueDate === iso);
  }

  function subjectButtons(subject, extra = '') {
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-sm btn-secondary" onclick="openSubjectHub('${jsArg(subject.name)}')" style="font-size:var(--text-sm);padding:4px 10px">${icons.book()} Open ${escHtml(subject.name)} →</button>${extra}
    </div>`;
  }

  function noAttendanceFor(subject) {
    return `I don't have attendance for <strong>${escHtml(subject.name)}</strong> yet. Add your counts from the college portal once and I can tell you how many classes you can miss.<br><br>
    <button class="btn btn-sm btn-primary" onclick="showBaselineModal(null, 'scan')" style="font-size:var(--text-sm);padding:5px 12px">${icons.camera()} Scan portal screenshot</button>
    <button class="btn btn-sm btn-secondary" onclick="showBaselineModal(null, 'manual')" style="font-size:var(--text-sm);padding:5px 12px">${icons.edit()} Enter counts</button>`;
  }

  function projectionLine(att) {
    const line = typeof attV2ProjectionText === 'function' ? attV2ProjectionText(att) : '';
    return line ? `<div style="margin-top:6px;font-size:var(--text-sm);color:var(--text-secondary)">${escHtml(line)}.</div>` : '';
  }

  // Yes/no first, then the numbers.
  function skipVerdict(subject, att) {
    const target = att.targetPct || getAttendanceTarget();
    const pct = att.pctLabel ?? att.pct;
    const name = escHtml(subject.name);
    if (att.isSafe && att.safeSkips > 0) {
      return { ok: true, html: `<span class="cd-tag cd-tag-safe">Yes</span> You can miss <strong>${att.safeSkips} more ${name} class${att.safeSkips !== 1 ? 'es' : ''}</strong> and stay at or above ${target}% (now ${pct}%).` };
    }
    if (att.isSafe) {
      return { ok: false, html: `<span class="cd-tag is-warning">Better not</span> ${name} is at ${pct}%, but there's no safe skip yet. Missing the next class would drop you below ${target}%.` };
    }
    const n = att.classesToAttend;
    return { ok: false, html: `<span class="cd-tag cd-tag-risk">No</span> ${name} is at <strong>${pct}%</strong>, below ${target}%.${n ? ` Attend the next <strong>${n} class${n !== 1 ? 'es' : ''}</strong> in a row to get back to ${target}%.` : ''}` };
  }

  function buildSubjectSkip(subject, day) {
    if (!subject) return buildSkipOverview();
    const att = getSubjectAttendance(subject);
    if (att.pct === null) return noAttendanceFor(subject);
    let dayNote = '';
    if (day && hasTimetable()) {
      const onDay = getDayClasses(day.dayNum).filter(c => sameSubject(c.subject, subject.name));
      dayNote = onDay.length
        ? `<div style="margin-top:6px;font-size:var(--text-sm);color:var(--text-secondary)">${escHtml(day.title)} you have ${onDay.length} ${escHtml(subject.name)} class${onDay.length !== 1 ? 'es' : ''} (${onDay.map(c => formatTime(c.time)).join(', ')}).</div>`
        : `<div style="margin-top:6px;font-size:var(--text-sm);color:var(--text-secondary)">${escHtml(subject.name)} isn't on your timetable ${day.offset === 0 || day.offset === 1 ? escHtml(day.label) : 'on ' + DAY_NAMES[day.dayNum]}.</div>`;
    }
    return `${skipVerdict(subject, att).html}${dayNote}${projectionLine(att)}${subjectButtons(subject)}`;
  }

  function buildSubjectAttendance(subject) {
    const att = getSubjectAttendance(subject);
    if (att.pct === null) return noAttendanceFor(subject);
    const tag = att.isSafe ? '<span class="cd-tag cd-tag-safe">Safe</span>' : '<span class="cd-tag cd-tag-risk">Below target</span>';
    const verdict = skipVerdict(subject, att);
    return `${tag} <strong>${escHtml(subject.name)}: ${att.pctLabel ?? att.pct}%</strong> (${att.present} of ${att.total} attended).<br><br>${verdict.html}${projectionLine(att)}${subjectButtons(subject)}`;
  }

  function buildDaySkip(day) {
    if (!hasTimetable()) return noTimetableMsg();
    const classes = getDayClasses(day.dayNum);
    if (classes.length === 0) return `No classes ${day.offset === 0 || day.offset === 1 ? escHtml(day.label) : 'on ' + DAY_NAMES[day.dayNum]}, so nothing to skip.`;
    const seen = new Set();
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const rows = [];
    let unsafe = 0, unknown = 0;
    classes.forEach(c => {
      const key = String(c.subject || '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const subj = subjects.find(s => sameSubject(s.name, c.subject)) || { name: c.subject, code: c.code };
      const att = getSubjectAttendance(subj);
      let tag;
      if (att.pct === null) { unknown++; tag = '<span class="cd-tag">No data</span>'; }
      else if (att.isSafe && att.safeSkips > 0) tag = `<span class="cd-tag cd-tag-safe">Can miss ${att.safeSkips}</span>`;
      else { unsafe++; tag = `<span class="cd-tag cd-tag-risk">${att.isSafe ? 'At the line' : 'Attend'}</span>`; }
      rows.push(`<li>${tag}<span class="cd-item-label">${escHtml(c.subject)}</span><span class="cd-item-meta">${formatTime(c.time)}${att.pct !== null ? ` · ${att.pctLabel ?? att.pct}%` : ''}</span></li>`);
    });
    const when = day.offset === 0 || day.offset === 1 ? day.label : 'on ' + DAY_NAMES[day.dayNum];
    const head = unsafe === 0 && unknown === 0
      ? `<span class="cd-tag cd-tag-safe">Yes</span> Every class ${escHtml(when)} can be missed without dropping below ${getAttendanceTarget()}%.`
      : unsafe > 0
        ? `<span class="cd-tag cd-tag-risk">Not all of it</span> ${unsafe} class${unsafe !== 1 ? 'es' : ''} ${escHtml(when)} ${unsafe !== 1 ? 'are' : 'is'} at or below your ${getAttendanceTarget()}% target. Go to ${unsafe !== 1 ? 'those' : 'that one'}.`
        : `Some subjects ${escHtml(when)} have no attendance yet, so I can't be sure.`;
    return `${head}<ul class="cd-list" style="margin-top:8px">${rows.join('')}</ul>`;
  }

  function buildSkipOverview() {
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const rows = subjects.map(s => ({ s, att: getSubjectAttendance(s) })).filter(r => r.att.pct !== null);
    if (rows.length === 0) return buildAttendanceGeneral();
    rows.sort((a, b) => (a.att.isSafe === b.att.isSafe ? (a.att.safeSkips || 0) - (b.att.safeSkips || 0) : a.att.isSafe ? 1 : -1));
    const items = rows.map(({ s, att }) => {
      const tag = att.isSafe && att.safeSkips > 0
        ? `<span class="cd-tag cd-tag-safe">Can miss ${att.safeSkips}</span>`
        : `<span class="cd-tag cd-tag-risk">${att.isSafe ? 'At the line' : `Attend ${att.classesToAttend || ''}`.trim()}</span>`;
      return `<li>${tag}<span class="cd-item-label">${escHtml(s.name)}</span><span class="cd-item-meta">${att.pctLabel ?? att.pct}%</span></li>`;
    }).join('');
    return `How many classes you can still miss in each subject (target ${getAttendanceTarget()}%):<ul class="cd-list" style="margin-top:8px">${items}</ul>
    <div style="font-size:var(--text-sm);color:var(--text-secondary)">Ask "can I skip DBMS?" or "can I skip tomorrow?" for one subject or day.</div>`;
  }

  function buildTasksDay(day) {
    const due = pendingDueOn(day.date);
    const when = day.offset === 1 ? 'tomorrow' : `on ${DAY_NAMES[day.dayNum]} (${fmtDate(day.date)})`;
    if (due.length === 0) return `Nothing due ${when}.`;
    const items = due.map(t => `<li><span class="cd-item-label">${escHtml(t.title)}</span><span class="cd-item-meta">${escHtml(t.subject || 'Task')}</span></li>`).join('');
    return `<strong>${due.length} task${due.length !== 1 ? 's' : ''} due ${when}:</strong><ul class="cd-list">${items}</ul>`;
  }

  function buildDayEnd(day) {
    if (!hasTimetable()) return noTimetableMsg();
    const d = day || dayFrom(new Date().getDay(), 0);
    const classes = getDayClasses(d.dayNum);
    if (classes.length === 0) return `No classes ${d.offset === 0 || d.offset === 1 ? escHtml(d.label) : 'on ' + DAY_NAMES[d.dayNum]}.`;
    const last = classes.reduce((a, c) => (timeToMinutes(c.end || c.time) > timeToMinutes(a.end || a.time) ? c : a), classes[0]);
    const first = classes.reduce((a, c) => (timeToMinutes(c.time) < timeToMinutes(a.time) ? c : a), classes[0]);
    const finished = d.offset === 0 && timeToMinutes(last.end || last.time) <= currentTimeMinutes();
    return finished
      ? `Your last class today, <strong>${escHtml(last.subject)}</strong>, ended at ${formatTime(last.end || last.time)}. You're done for the day.`
      : `${escHtml(d.title)} you're done at <strong>${formatTime(last.end || last.time)}</strong>, after <strong>${escHtml(last.subject)}</strong>. Classes start at ${formatTime(first.time)}.`;
  }

  function buildNextSubjectClass(subject) {
    if (!hasTimetable()) return noTimetableMsg();
    const now = currentTimeMinutes();
    const today = new Date().getDay();
    for (let off = 0; off < 8; off++) {
      const dn = (today + off) % 7;
      const hit = getDayClasses(dn)
        .filter(c => sameSubject(c.subject, subject.name) && (off > 0 || timeToMinutes(c.time) > now))
        .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))[0];
      if (hit) {
        const when = off === 0 ? 'today' : off === 1 ? 'tomorrow' : DAY_NAMES[dn];
        return `Next <strong>${escHtml(subject.name)}</strong> class: <strong>${when}</strong> at ${formatTime(hit.time)}${hit.room && hit.room !== '—' ? ' in ' + escHtml(hit.room) : ''}.${subjectButtons(subject)}`;
      }
    }
    return `${escHtml(subject.name)} isn't on your weekly timetable.${subjectButtons(subject)}`;
  }

  function buildTimetableView() {
    if (!hasTimetable()) return noTimetableMsg();
    const rows = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const classes = getDayClasses(d);
      if (!classes.length) return null;
      const start = classes.reduce((m, c) => Math.min(m, timeToMinutes(c.time)), Infinity);
      const end = classes.reduce((m, c) => Math.max(m, timeToMinutes(c.end || c.time)), 0);
      const fmt = (min) => formatTime(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
      return `<li><span class="cd-item-label">${DAY_NAMES[d]}</span><span class="cd-item-meta">${classes.length} class${classes.length !== 1 ? 'es' : ''} · ${fmt(start)} – ${fmt(end)}</span></li>`;
    }).filter(Boolean).join('');
    return `Your week:<ul class="cd-list">${rows}</ul>
    <button class="btn btn-sm btn-primary" onclick="navigate('timetable')" style="font-size:var(--text-sm);padding:5px 12px">${icons.calendar()} Open timetable →</button>`;
  }

  function buildExams() {
    const p = (typeof deps.liveProfile === 'object' && deps.liveProfile) || loadProfile() || {};
    const lines = [];
    if (p.examDate) {
      const days = Math.round((new Date(p.examDate + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000);
      if (days >= 0) lines.push(`<li><span class="cd-tag is-accent">${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days + ' days'}</span><span class="cd-item-label">${escHtml_cd(getCountdownLabel())}</span><span class="cd-item-meta">${fmtDate(p.examDate)}</span></li>`);
    }
    const isExam = (t) => ['exam', 'quiz'].includes(t.taskType) || /\b(exam|test|quiz|viva|oral|mid ?sem|end ?sem)\b/i.test(t.title || '');
    allTasks().filter(t => t.status === 'pending' && isExam(t))
      .sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'))
      .forEach(t => lines.push(`<li><span class="cd-item-label">${escHtml(t.title)}</span><span class="cd-item-meta">${escHtml(t.subject || 'Task')}${t.dueDate ? ' · ' + fmtDate(t.dueDate) : ''}</span></li>`));
    getVisibleNotices().filter(n => /exam|test|quiz|viva/i.test(`${n.category} ${n.title}`)).slice(0, 3)
      .forEach(n => lines.push(`<li><span class="cd-tag cd-tag-notice">Notice</span><span class="cd-item-label">${escHtml(n.title)}</span><span class="cd-item-meta">${fmtDate(n.date)}</span></li>`));
    if (lines.length === 0) {
      return `I don't know any exam dates yet. Set your End-Sem date in Settings, or add a test as a task with the type "Exam".<br><br>
      <button class="btn btn-sm btn-secondary" onclick="navigate('settings')" style="font-size:var(--text-sm);padding:5px 12px">${icons.settings()} Set exam date</button>
      <button class="btn btn-sm btn-secondary" onclick="showAddTaskModal(null, null, 'exam')" style="font-size:var(--text-sm);padding:5px 12px">${icons.edit()} Add a test</button>`;
    }
    return `<strong>Coming up:</strong><ul class="cd-list">${lines.join('')}</ul>`;
  }

  function buildThanks() {
    return `Anytime. Ask me about your classes, attendance or deadlines whenever you need.`;
  }

    function buildTasksWeek() {
    const today = todayISO();
    const weekEnd = nDaysFromNow(7);
    const upcoming = allTasks().filter(t => t.status === 'pending' && !t.noDeadline && t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd);
    if (upcoming.length === 0) return `Nothing due in the next 7 days.`;
    const items = upcoming.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).map(t => {
      const isToday = t.dueDate === today;
      const tag = isToday ? '<span class="cd-tag cd-tag-today">Today</span>' : '';
      return `<li>${tag}<span class="cd-item-label">${escHtml(t.title)}</span><span class="cd-item-meta">${escHtml(t.subject || 'Task')} · Due ${fmtDate(t.dueDate)}</span></li>`;
    }).join('');
    return `<strong>${upcoming.length} task${upcoming.length !== 1 ? 's' : ''} in the next 7 days:</strong><ul class="cd-list">${items}</ul>`;
  }

  function buildTasksAll() {
    const pending = allTasks().filter(t => t.status === 'pending');
    if (pending.length === 0) return `No pending tasks. Your desk is clear.`;
    const sorted = [...pending].sort((a, b) => {
      const isOngoingA = !!a.noDeadline || (a.taskType === 'mission' && !a.dueDate);
      const isOngoingB = !!b.noDeadline || (b.taskType === 'mission' && !b.dueDate);
      if (isOngoingA && !isOngoingB) return 1;
      if (!isOngoingA && isOngoingB) return -1;
      if (isOngoingA && isOngoingB) return a.title.localeCompare(b.title);
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });
    const items = sorted.map(t => {
      const isOngoing = !!t.noDeadline || (t.taskType === 'mission' && !t.dueDate);
      const isOverdue = isTaskOverdue(t);
      const tag = isOngoing
        ? '<span class="cd-tag is-purple">Mission</span>'
        : isOverdue ? '<span class="cd-tag cd-tag-overdue">Overdue</span>' : '';
      const meta = isOngoing ? `${escHtml(t.subject || 'Task')} · Ongoing Mission` : `${escHtml(t.subject || 'Task')} · Due ${fmtDate(t.dueDate)}`;
      return `<li>${tag}<span class="cd-item-label">${escHtml(t.title)}</span><span class="cd-item-meta">${meta}</span></li>`;
    }).join('');
    return `<strong>${pending.length} pending task${pending.length !== 1 ? 's' : ''}:</strong><ul class="cd-list">${items}</ul>`;
  }

  function buildNotices() {
    const allNotices = getVisibleNotices();
    const importantNotices = allNotices.filter(n => n.important);

    if (allNotices.length === 0) return `No notices posted yet.`;

    const items = allNotices.slice(0, 5).map(n => {
      const tag = n.important ? '<span class="cd-tag cd-tag-notice">Important</span>' : '';
      return `<li>${tag}<span class="cd-item-label">${escHtml(n.title)}</span><span class="cd-item-meta">${n.category} · ${fmtDate(n.date)}</span></li>`;
    }).join('');

    const header = importantNotices.length > 0
      ? `${importantNotices.length} important notice${importantNotices.length !== 1 ? 's' : ''}:`
      : `${allNotices.length} notice${allNotices.length !== 1 ? 's' : ''} posted:`;

    return `<strong>${header}</strong><ul class="cd-list">${items}</ul>`;
  }

  function buildProfile() {
    const p = loadProfile() || deps.liveProfile || {};
    if (!p.name) return `Your profile isn't set up yet. Go to <a href="javascript:void(0)" onclick="navigate('settings')" style="color:var(--accent);font-weight:600">Settings</a> to add your name, batch, and branch.`;
    const lines = [
      p.name    ? `<li><span class="cd-item-label">Name</span><span class="cd-item-meta">${escHtml(p.name)}</span></li>` : '',
      p.branch  ? `<li><span class="cd-item-label">Branch</span><span class="cd-item-meta">${escHtml(p.branch)}</span></li>` : '',
      p.batch   ? `<li><span class="cd-item-label">Batch</span><span class="cd-item-meta">Batch ${escHtml(p.batch)}</span></li>` : '',
      p.year    ? `<li><span class="cd-item-label">Year</span><span class="cd-item-meta">${escHtml(p.year)}</span></li>` : '',
      p.college ? `<li><span class="cd-item-label">College</span><span class="cd-item-meta">${escHtml(p.college)}</span></li>` : '',
      p.rollNo  ? `<li><span class="cd-item-label">Roll No.</span><span class="cd-item-meta">${escHtml(p.rollNo)}</span></li>` : '',
    ].filter(Boolean).join('');
    return `<ul class="cd-list">${lines}</ul>`;
  }

  // Starters for "did you mean": the closest few by shared words.
  const EXAMPLES = [
    'What do I have today?', 'What is my next class?', 'Can I skip a class today?', 'How is my attendance?',
    'Which subjects are at risk?', 'What tasks are urgent?', 'What is due this week?', 'Classes tomorrow',
    'Show my timetable', 'When are my exams?', 'Plan my week', 'Help me plan tonight',
    'Which subject needs the most attention?', 'Any notices?', 'Add a task', 'Is anything missing from my setup?',
    'When does my last class end?', 'How many classes can I skip?',
    'How much syllabus is left?', 'What should I revise?', 'Important topics left', 'Am I on track for my exams?'
  ];
  const STOP = new Set(['i', 'a', 'an', 'the', 'my', 'me', 'is', 'are', 'what', 'do', 'to', 'of', 'in', 'on', 'any', 'have', 'for', 'can', 'how', 'which', 'when', 'it', 'and']);

  function buildUnknown(query) {
    const words = (t) => plainText(t).split(' ').filter(w => w && !STOP.has(w));
    const qWords = words(query);
    const subjects = (typeof getSubjectList === 'function') ? getSubjectList() : [];
    const pool = subjects.length ? [...EXAMPLES, `Can I skip ${subjects[0].name}?`] : EXAMPLES;
    const scored = pool.map(ex => {
      const ew = words(ex);
      const score = qWords.reduce((n, w) => n + (ew.some(e => e === w || (w.length >= 4 && e.length >= 4 && e.slice(0, 4) === w.slice(0, 4))) ? 1 : 0), 0);
      return { ex, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.ex);
    const picks = scored.length ? scored : ['What do I have today?', 'How is my attendance?', 'What tasks are urgent?', 'Plan my week'];
    const buttons = picks.map(ex => `<button class="btn btn-sm btn-secondary" onclick="sendAssistantMessage('${jsArg(ex)}')" style="font-size:var(--text-sm);padding:4px 10px">${escHtml(ex)}</button>`).join('');
    return `${scored.length ? 'Did you mean:' : "I didn't get that. I answer questions about your classes, attendance, tasks and notices. Try:"}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${buttons}</div>`;
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Main Respond ──────────────────────────────────────────────
  function respond(query) {
    const { intent, subject, day, text } = understand(query);
    lastAsked = (SUBJECT_INTENTS.includes(intent) || DAY_INTENTS.includes(intent)) ? { intent, subject, day } : null;

    switch (intent) {
      case 'greeting':           return buildGreeting();
      case 'thanks':             return buildThanks();
      case 'help':               return buildHelp();
      case 'parser_review':      return buildParserReview();
      case 'cleanup_followup':   return buildCleanupFollowup();
      case 'weekly_plan':        return buildWeeklyPlan();
      case 'subject_guidance':   return buildSubjectGuidance();
      case 'import_timetable':   return buildImportTimetable();
      case 'setup_attendance':   return buildSetupAttendance();
      case 'subject_hubs':       return buildSubjectHubs();
      case 'declutter_desk':     return buildDeclutterDesk();
      case 'create_task':        return buildCreateTask(query);
      case 'study_plan':         return buildStudyPlan();
      case 'today_summary':      return buildTodaySummary();
      case 'next_class':         return subject ? buildNextSubjectClass(subject) : buildNextClass();
      case 'attendance_risk':    return buildAttendanceRisk();
      case 'attendance_general': return subject ? buildSubjectAttendance(subject) : buildAttendanceGeneral();
      case 'subject_attendance': return buildSubjectAttendance(subject);
      case 'subject_skip':       return buildSubjectSkip(subject, day);
      case 'day_skip':           return buildDaySkip(day);
      case 'skip_overview':      return buildSkipOverview();
      case 'tasks_urgent':       return buildTasksUrgent();
      case 'tasks_week':         return buildTasksWeek();
      case 'tasks_all':          return buildTasksAll();
      case 'tasks_day':          return buildTasksDay(day);
      case 'setup_gaps':         return buildSetupGaps();
      case 'classes_left':       return buildClassesLeft();
      case 'day_schedule':       return buildDaySchedule(day);
      case 'day_end':            return buildDayEnd(day);
      case 'timetable_view':     return buildTimetableView();
      case 'exams':              return buildExams();
      case 'notices':            return buildNotices();
      case 'profile':            return buildProfile();
      case 'subject_info':       return buildSubjectInfo(subject);
      case 'syllabus_overview':  return buildSyllabusOverview();
      case 'subject_syllabus':   return buildSubjectSyllabus(subject);
      case 'syllabus_revise':    return buildSyllabusRevise(subject);
      case 'syllabus_important': return buildSyllabusImportant(subject);
      case 'syllabus_pace':      return buildSyllabusPace(subject);
      case 'syllabus_topic':     return buildSyllabusTopic(query, text);
      default:                   return buildUnknown(query);
    }
  }

  function buildSubjectInfo(s) {
    const tt = loadTimetable();
    const classes = [];
    [1,2,3,4,5,6,0].forEach(d => {
      (tt[d] || []).forEach(c => {
        if (isTeachingClass(c) && sameSubject(c.subject, s.name)) {
          classes.push(`${DAY_SHORT[d]} ${formatDisplayTimeRange(c.time, c.end)}${c.room ? ' (' + escHtml(c.room) + ')' : ''}`);
        }
      });
    });
    const pTasks = allTasks().filter(t => t.status === 'pending' && sameSubject(t.subject, s.name));
    const att = getSubjectAttendance(s);
    let res = `<strong>${escHtml(s.name)}:</strong><br>`;
    res += classes.length ? `Schedule: ${classes.join(' · ')}<br>` : `No weekly timetable slots scheduled.<br>`;
    if (att.pct !== null) {
      res += `Attendance: <strong>${att.pctLabel ?? att.pct}%</strong> (${att.present}/${att.total} attended)<br>`;
    }
    res += sylSubjectLine(s);
    res += pTasks.length
      ? `${pTasks.length} pending task${pTasks.length !== 1 ? 's' : ''}: ${pTasks.map(t => escHtml(t.title)).join(', ')}`
      : `No pending tasks.`;
    return res + subjectButtons(s, ` <button class="btn btn-sm btn-secondary" onclick="showAddTaskModal(null, '${jsArg(s.name)}')" style="font-size:var(--text-sm);padding:4px 10px">${icons.edit()} Add task</button>`);
  }

  return { respond, understand };
}
