// The messy desk from the #458 board ("Real data"): long subject names, a course code, two subjects with no
// code, two labs at the same time, missing rooms, 12 tasks with one 104 days late. Screens are judged with
// this desk, not a tidy one (docs/POLISH.md). Raw localStorage strings, like sample-desk.mjs. Names are made up.
const J = JSON.stringify;

// Tuesday 24 Nov 2026, 10:20 in India: DEMP is on, COA is next.
export const MESSY_AT = '2026-11-24T10:20:00+05:30';

const P = (subject, code, time, end, room = '', type = 'lecture', batches = []) => ({ subject, code, time, end, type, batches, room });
const DAY = [
  P('Universal Human Values', '', '08:00', '09:00'),
  P('Data Structures', 'CS301', '09:00', '10:00', 'B-204'),
  P('Digital Electronics and Microprocessors', 'EC303', '10:00', '11:00', 'B-204'),
  P('Computer Organisation and Architecture', 'CS304', '11:15', '12:15', 'B-110'),
  P('Engineering Mathematics III', 'MA301', '12:15', '13:15'),
  P('Database Management Systems Lab', 'CS305L', '14:00', '16:00', 'Lab 4', 'lab', ['A1']),
  P('Object Oriented Programming Lab', 'CS306L', '14:00', '16:00', 'Lab 2', 'lab', ['A2']),
  P('Environmental Studies', 'MGM51OEL115', '16:00', '17:00'),
  P('Professional Communication', '', '17:00', '17:30', 'Seminar hall')
];

const T = (id, subject, code, title, dueDate, taskType = 'assignment', priority = 'medium') =>
  ({ id, subject, code, title, taskType, dueDate, description: '', priority, status: 'pending', isCustom: true, updatedAt: 1 });

const base = (subjectName, present, absent) => ({ subjectName, present, absent });

export const MESSY_DESK = {
  cos_profile: J({ name: 'Aishwarya', college: 'Sample College', branch: 'CSE', year: 'SE', rollNo: '42', batch: '', examDate: '2026-12-01', examLabel: 'End-Sem', studyMode: '' }),
  cos_custom_timetable: J({ 1: DAY, 2: DAY, 3: DAY, 4: DAY, 5: DAY, 6: [], 0: [] }),
  cos_timetable_choice: 'custom',
  cos_strip_labels: J({}),
  cos_hidden_subjects: J([]),
  cos_custom_tasks: J([
    T('m1', 'Environmental Studies', 'MGM51OEL115', 'EVS field report on Godavari river pollution', '2026-08-12', 'assignment', 'high'),
    T('m2', 'Computer Organisation and Architecture', 'CS304', 'Pipelining hazards, assignment 3', '2026-11-12'),
    T('m3', 'Universal Human Values', '', 'Reflection journal, week 6', '2026-11-21'),
    T('m4', 'Database Management Systems Lab', 'CS305L', 'ER diagram for library management system', '2026-11-25'),
    T('m5', 'Data Structures', 'CS301', 'Trees and graphs quiz (unit 3)', '2026-11-27', 'quiz'),
    T('m6', 'Digital Electronics and Microprocessors', 'EC303', '8085 lab write-up, experiments 4 to 7', '2026-11-28'),
    T('m7', 'Object Oriented Programming Lab', 'CS306L', 'Mini-project synopsis', '2026-11-29'),
    T('m8', 'Engineering Mathematics III', 'MA301', 'Laplace transform tutorial sheet 2', '2026-12-02'),
    T('m9', 'Professional Communication', '', 'Group discussion prep', '2026-12-08'),
    T('m10', 'Data Structures', 'CS301', 'Hashing practice problems', '2026-12-10'),
    T('m11', 'Computer Organisation and Architecture', 'CS304', 'Cache memory numericals', '2026-12-12'),
    T('m12', 'Environmental Studies', 'MGM51OEL115', 'Case study: urban waste', '2026-12-15')
  ]),
  cos_attendance_baseline: J({
    UHV: base('Universal Human Values', 16, 9),
    MGM51OEL115: base('Environmental Studies', 12, 6),
    EC303: base('Digital Electronics and Microprocessors', 22, 10),
    MA301: base('Engineering Mathematics III', 20, 9),
    CS304: base('Computer Organisation and Architecture', 23, 8),
    CS305: base('Database Management Systems', 27, 6),
    PC: base('Professional Communication', 10, 2),
    CS301: base('Data Structures', 30, 4),
    CS306L: base('Object Oriented Programming Lab', 8, 1),
    CS305L: base('Database Management Systems Lab', 9, 1)
  }),
  cos_attendance: J({ '2026-11-24': { CS301_0900: 'attended' } }),
  cos_attendance_live: J({}),
  cos_theme: 'paper-slate',
  cos_accent: 'rose'
};

// Before the app loads: the desk above plus "first run done", so no welcome or tour covers the screen.
export const MESSY_FLAGS = {
  cos_onboarding_dismissed: 'true',
  cos_onboarding_done: '1',
  cos_att_v2_state: J({ mode: 'v2', decidedAt: '2026-09-01T00:00:00Z' }),
  cos_notified_history: J({ onb_tt_day: '2026-09-20' })
};
