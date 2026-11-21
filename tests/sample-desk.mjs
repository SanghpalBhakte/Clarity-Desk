// One sample desk with every dataset filled in, as raw localStorage strings.
// Shared by verify_desk_saved_outputs (what the app makes of it) and
// verify_desk_roundtrip (every dataset survives each trip). A new dataset
// row needs a value here; verify_desk_roundtrip fails until it has one.
// Names, ids and dates are made up.
const J = JSON.stringify;

export const DS = { subject: 'Data Structures', code: 'DS', time: '10:00', end: '11:00', type: 'lecture', batches: [], room: 'B-204', teacher: 'Prof. Rao' };
export const LAB = { subject: 'DS Lab', code: 'DSL', time: '13:30', end: '15:30', type: 'lab', batches: ['A2'] };
export const OS = { subject: 'Operating Systems', code: 'OS', time: '11:15', end: '12:15', type: 'lecture', batches: [] };
export const task = (id, over) => ({ id, subject: 'Data Structures', code: 'DS', title: `Task ${id}`, taskType: 'assignment', noDeadline: false, description: '—', dueDate: '2026-11-14', priority: 'medium', status: 'pending', marks: 0, isCustom: true, updatedAt: 1794200000000, ...over });

export const SAMPLE_DESK = {
  cos_profile: J({ name: 'Riya', college: 'Sample College', branch: 'CSE', year: 'SE', rollNo: '42', batch: 'A2', examDate: '2026-12-01', examLabel: 'End-Sem', studyMode: '' }),
  cos_custom_tasks: J([
    task('t-lab', { title: 'DS lab record', firstStep: 'Print the first two programs' }),
    task('t-quiz', { subject: 'Operating Systems', code: 'OS', title: 'OS quiz', taskType: 'quiz', dueDate: '2026-11-08', priority: 'high' }),
    task('t-read', { title: 'Read chapter 4', noDeadline: true, dueDate: '', checkins: ['2026-11-08', '2026-11-09'] })
  ]),
  cos_assignments: J({ 't-old': 'submitted' }),
  // One deleted 3 days ago (kept), one 40 days ago (past the 30-day limit: dropped from backup and cloud).
  cos_tombstones: J([{ id: 't-gone', deletedAt: 1794000000000 }, { id: 't-long-gone', deletedAt: 1790829000000 }]),
  cos_custom_timetable: J({ 1: [DS, LAB], 2: [OS], 3: [DS, OS], 4: [], 5: [OS], 6: [], 0: [] }),
  cos_timetable_choice: 'custom',
  cos_user_batch: 'A2',
  cos_hidden_subjects: J(['Environmental Studies']),
  cos_attendance: J({ '2026-11-09': { DS_1000: 'attended', DSL_1330: 'skipped' }, '2026-11-10': { DS_1000: 'attended' } }),
  cos_attendance_baseline: J({ DS: { subjectName: 'Data Structures', present: 18, absent: 4 }, OS: { subjectName: 'Operating Systems', present: 12, absent: 6 } }),
  cos_attendance_live: J({ DS: { present: 2 }, OS: { present: 1 } }),
  cos_custom_links: J([
    { subject: 'Data Structures', code: 'DS', color: '#394B63', resources: [
      { label: 'Course page', url: 'https://example.edu/ds', icon: 'link' },
      { label: 'unit1.pdf', url: 'data:application/pdf;base64,JVBERi0xLjQK', icon: 'book-open', isUpload: true, fileSize: '9 B', fileId: 'f-unit1', mime: 'application/pdf' }
    ] }
  ]),
  cos_syllabus: J([{ subjectName: 'Data Structures', examDate: '2026-12-01', topics: [
    { id: 'tp1', title: 'Stacks', status: 'done', doneAt: '2026-11-02', importance: 3, marks: 10 },
    { id: 'tp2', title: 'Queues', status: 'revised', doneAt: '2026-11-05' },
    { id: 'tp3', title: 'Trees', status: 'todo', importance: 1 }
  ] }]),
  cos_att_target: '75',
  cos_aims: J({ v: 1, kind: 'finish', line: 75, by: '2026-11-30', scope: '', subjects: { DS: 80 } }),
  // A planned break (starts later), switched on 2 days ago.
  cos_holiday: J({ on: true, since: '2026-12-20', until: '2027-01-04', changedAt: 1794100000000 }),
  cos_strip_labels: J({ 'Data Structures': 'DSA' }),
  cos_notif_prefs: J({ taskUpcoming: 'day_before', taskOverdue: 'daily', classReminders: '10', attendanceAlerts: 'on', ongoingNudges: 'off', ongoingNudgeTime: '18:00' }),
  cos_notice_channels: J({ whatsappTitle: 'College portal', whatsappUrl: 'https://portal.example.edu' }),
  cos_theme: 'midnight-ink',
  cos_accent: 'lavender'
};
