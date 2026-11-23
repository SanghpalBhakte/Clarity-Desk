// ==================================================================
// Clarity Desk: Syllabus tracker screens (paste topics, edit, add subject)
// ==================================================================
// Moved out of app.js so first load downloads and parses less. app.js
// imports this file the first time a syllabus screen is used
// (loadSyllabusUi) and precaches it in sw.js, so it works offline exactly
// as before. What stays in app.js is the data side (cos_syllabus load /
// save / sanitize / stats, used by backups, sync, Today and the Subject
// Hub card) and the scan file picker. The inline onclick handlers are
// stubs in app.js that call in here.
// The code below is the same as it was in app.js; the app.js helpers it
// reads arrive in `deps` (syllabusDeps() in app.js). scanners.js reads
// parseSyllabusLine, renderSyllabusPreviewStep and the paste draft from
// here (loadScanners loads this file first).
// Tests: tests/lazy-modules.mjs loads this for the app.js test sandbox.
// ==================================================================

export function createSyllabusUi(deps) {
  const {
    KEY_HIDDEN_SUBJECTS, SYL_IMPORTANCE, SYL_MAX_TITLE, SYL_MAX_TOPICS, SYL_STATUS_NEXT, appConfirm, findSyllabusEntry, getCanonicalSubjectKey, getCanonicalSubjectName, getSubjectList, icons, isLikelyGarbledSubjectName, loadSyllabus, renderPage, reportFormErrors, safeGetStorage, safeSetStorage, sanitizeSyllabusTopic, saveSyllabus, showCelebration, showToast, state, sylEsc, sylNewId, sylValidDate, syllabusStats, todayStr, visibleSyllabusEntries
  } = deps;

  // ── Paste → topics ────────────────────────────────────────────
  const SYL_BULLET_RE = /^\s*(?:[-*•▪◦·–—>]+|\(?\d{1,3}(?:\.\d{1,3})*[.)]|\(?[a-z][.)]|\(?(?:i{1,3}|iv|v|vi{0,3}|ix|x)[.)])\s+/i;
  const SYL_HEADING_RE = /^\s*(?:unit|module|chapter|ch\.?|part|topic)\s*[-#]?\s*(?:\d{1,2}|[ivx]{1,4})\s*[:.\-–—)]\s*/i;
  const SYL_MARKS_RE = /\s*[-–—:|,]?\s*[([]?\s*(\d{1,3}(?:\.\d)?)\s*(?:marks?|mks?|m)\.?\s*[)\]]?\s*$/i;
  const SYL_HIGH_RE = /\s*(?:[([]\s*(?:high|imp|important|v\.?\s*imp)\s*[)\]]|★+|\*{1,3}|\b(?:imp|important)\b!?)\s*$/i;
  const SYL_MED_RE = /\s*[([]\s*(?:medium|med)\s*[)\]]\s*$/i;
  const SYL_LOW_RE = /\s*[([]\s*low\s*[)\]]\s*$/i;

  function parseSyllabusLine(line) {
    let text = String(line || '').replace(/\s+/g, ' ').trim();
    let importance = 2, marks = null;
    for (let i = 0; i < 4; i++) {
      const before = text;
      let m;
      if ((m = text.match(SYL_MARKS_RE)) && m.index > 0) { marks = Number(m[1]); text = text.slice(0, m.index); }
      else if ((m = text.match(SYL_HIGH_RE)) && m.index > 0) { importance = 3; text = text.slice(0, m.index); }
      else if ((m = text.match(SYL_MED_RE)) && m.index > 0) { importance = 2; text = text.slice(0, m.index); }
      else if ((m = text.match(SYL_LOW_RE)) && m.index > 0) { importance = 1; text = text.slice(0, m.index); }
      text = text.trim();
      if (text === before) break;
    }
    for (let i = 0; i < 3; i++) {
      const before = text;
      text = text.replace(SYL_HEADING_RE, '').replace(SYL_BULLET_RE, '').trim();
      if (text === before) break;
    }
    text = text.replace(/[\s,;:.\-–—]+$/, '').trim().slice(0, SYL_MAX_TITLE);
    if (!text || !/[a-z0-9]/i.test(text)) return null;
    const out = { title: text, importance };
    if (marks > 0 && marks <= 500) out.marks = marks;
    return out;
  }

  // existingTitles: titles already in the subject, so a re-paste doesn't
  // add them twice. Returns { topics, skipped } where skipped counts lines
  // that were blank-ish or duplicates.
  function parseSyllabusPaste(text, existingTitles = []) {
    const seen = new Set(existingTitles.map(t => String(t).toLowerCase().replace(/\s+/g, ' ').trim()));
    const topics = [];
    let duplicates = 0;
    String(text || '').split(/\r?\n|;/).forEach(line => {
      if (!line.trim()) return;
      const t = parseSyllabusLine(line);
      if (!t) return;
      const k = t.title.toLowerCase();
      if (seen.has(k)) { duplicates++; return; }
      seen.add(k);
      topics.push(t);
    });
    return { topics, duplicates };
  }

  // ── Pop-ups ───────────────────────────────────────────────────
  // Each fires once a day per subject (seen-markers share the reminder
  // history map, "card_" prefix like the countdown cards).
  function celebrateSyllabusOnce(key, icon, title, subtitle) {
    const seen = safeGetStorage('cos_notified_history', {}) || {};
    const k = `card_${key}_${todayStr()}`;
    if (seen[k]) return;
    seen[k] = true;
    safeSetStorage('cos_notified_history', seen);
    showCelebration(icon, title, subtitle);
  }

  function checkSyllabusCelebrations(before, list, subjectKey) {
    const entry = list.find(e => e.subjectKey === subjectKey);
    if (!entry) return;
    const was = syllabusStats(before.find(e => e.subjectKey === subjectKey));
    const now = syllabusStats(entry);
    const allBefore = visibleSyllabusEntries(before);
    const allNow = visibleSyllabusEntries(list);
    const everyDone = (arr) => arr.length > 0 && arr.every(e => syllabusStats(e).complete);
    if (!everyDone(allBefore) && everyDone(allNow) && allNow.length > 1) {
      celebrateSyllabusOnce('syllabus_all', '🏁', 'Whole syllabus done', `Every topic in all ${allNow.length} subjects is covered. Time to revise.`);
    } else if (!was.allRevised && now.allRevised) {
      celebrateSyllabusOnce(`syllabus_rev_${subjectKey}`, '✅', `${entry.subjectName} fully revised`, `All ${now.total} topics revised. You're ready for this one.`);
    } else if (!was.complete && now.complete) {
      celebrateSyllabusOnce(`syllabus_done_${subjectKey}`, '📘', `${entry.subjectName} syllabus done`, `All ${now.total} topics covered. Revision next.`);
    }
  }

  // ── Topic actions (every one is a tap the student made) ───────
  function updateSyllabusEntry(subjectKey, fn, { celebrate = false } = {}) {
    const before = loadSyllabus();
    const list = JSON.parse(JSON.stringify(before));
    const entry = list.find(e => e.subjectKey === subjectKey);
    if (!entry) return false;
    if (fn(entry) === false) return false;
    entry.updatedAt = new Date().toISOString();
    saveSyllabus(list);
    if (celebrate) checkSyllabusCelebrations(before, loadSyllabus(), subjectKey);
    renderPage(state.currentPage);
    return true;
  }

  function cycleSyllabusTopic(subjectKey, id) {
    updateSyllabusEntry(subjectKey, (e) => {
      const t = e.topics.find(x => x.id === id);
      if (!t) return false;
      t.status = SYL_STATUS_NEXT[t.status] || 'done';
      const now = new Date().toISOString();
      if (t.status === 'done') { t.doneAt = now; delete t.revisedAt; }
      else if (t.status === 'revised') t.revisedAt = now;
      else { delete t.doneAt; delete t.revisedAt; }
    }, { celebrate: true });
  }

  function cycleSyllabusImportance(subjectKey, id) {
    updateSyllabusEntry(subjectKey, (e) => {
      const t = e.topics.find(x => x.id === id);
      if (!t) return false;
      t.importance = t.importance === 3 ? 1 : t.importance + 1;
    });
  }

  function moveSyllabusTopic(subjectKey, id, dir) {
    updateSyllabusEntry(subjectKey, (e) => {
      const i = e.topics.findIndex(x => x.id === id);
      const j = i + (dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= e.topics.length) return false;
      [e.topics[i], e.topics[j]] = [e.topics[j], e.topics[i]];
    });
  }

  function setSyllabusExamDate(subjectKey, value) {
    updateSyllabusEntry(subjectKey, (e) => { e.examDate = sylValidDate(value); });
  }

  function resetSyllabusProgress(subjectKey) {
    const entry = findSyllabusEntry(loadSyllabus(), subjectKey);
    if (!entry) return;
    appConfirm(`Mark every ${entry.subjectName} topic as not started again?\n\nYour topics, weightage and exam date stay.`, 'Yes, reset', () => {
      updateSyllabusEntry(subjectKey, (e) => {
        e.topics.forEach(t => { t.status = 'todo'; delete t.doneAt; delete t.revisedAt; });
      });
      showToast('progress reset', 'note', { item: entry.subjectName, where: true });
    });
  }

  // Ask Desk's "Open … syllabus" buttons: open the hub and bring the card
  // into view (or straight into Add topics when there is none yet).
  function openSubjectSyllabus(subjectName, addTopics = false) {
    openSubjectHub(subjectName);
    if (addTopics) { showSyllabusPasteModal(subjectName); return; }
    setTimeout(() => {
      const el = document.getElementById('syllabus');
      if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 76), behavior: 'smooth' });
    }, 80);
  }

  function removeSyllabus(subjectKey) {
    const list = loadSyllabus();
    const entry = findSyllabusEntry(list, subjectKey);
    if (!entry) return;
    appConfirm(`Remove the ${entry.subjectName} syllabus (${entry.topics.length} topics)?\n\nThis cannot be undone.`, 'Delete', () => {
      saveSyllabus(list.filter(e => e.subjectKey !== entry.subjectKey));
      showToast('syllabus removed', 'note', { item: entry.subjectName, where: true });
      renderPage(state.currentPage);
    });
  }

  function showEditSyllabusTopicModal(subjectKey, id) {
    const entry = findSyllabusEntry(loadSyllabus(), subjectKey);
    const t = entry && entry.topics.find(x => x.id === id);
    if (!t) return;
    document.getElementById('syl-edit-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'syl-edit-backdrop';
    backdrop.onclick = () => backdrop.remove();
    backdrop.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()" style="max-width:440px">
        <div class="modal-header">
          <h2 class="modal-title">Edit topic</h2>
          <button class="modal-close" onclick="document.getElementById('syl-edit-backdrop').remove()" aria-label="Close">${icons.x()}</button>
        </div>
        <div class="form-group">
          <label class="form-label" for="syl-edit-title">Topic</label>
          <input type="text" class="form-input" id="syl-edit-title" maxlength="${SYL_MAX_TITLE}" value="${sylEsc(t.title)}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="syl-edit-imp">Importance</label>
            <select class="form-select" id="syl-edit-imp">
              ${[3, 2, 1].map(v => `<option value="${v}" ${t.importance === v ? 'selected' : ''}>${SYL_IMPORTANCE[v]}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="syl-edit-marks">Marks (optional)</label>
            <input type="number" class="form-input" id="syl-edit-marks" min="0" max="500" step="0.5" inputmode="decimal" placeholder="e.g. 10" value="${t.marks || ''}">
          </div>
        </div>
        <div class="modal-footer" style="margin-top:16px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-secondary" style="color:var(--status-error)" onclick="deleteSyllabusTopic('${subjectKey}', '${t.id}')">${icons.trash()} Delete</button>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('syl-edit-backdrop').remove()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="saveSyllabusTopicEdit('${subjectKey}', '${t.id}')">Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('syl-edit-title')?.focus();
  }

  function saveSyllabusTopicEdit(subjectKey, id) {
    const title = String(document.getElementById('syl-edit-title')?.value || '').replace(/\s+/g, ' ').trim();
    const titleEl = document.getElementById('syl-edit-title');
    if (!title) { reportFormErrors([{ input: titleEl, msg: 'Give the topic a name' }]); return; }
    const importance = Number(document.getElementById('syl-edit-imp')?.value) || 2;
    const marks = Number(document.getElementById('syl-edit-marks')?.value);
    const ok = updateSyllabusEntry(subjectKey, (e) => {
      const t = e.topics.find(x => x.id === id);
      if (!t) return false;
      if (e.topics.some(x => x.id !== id && x.title.toLowerCase() === title.toLowerCase())) {
        reportFormErrors([{ input: titleEl, msg: 'That topic is already in the list', isValid: (v) => { const n = v.replace(/\s+/g, ' ').trim().toLowerCase(); return !!n && !e.topics.some(x => x.id !== id && x.title.toLowerCase() === n); } }]);
        return false;
      }
      t.title = title.slice(0, SYL_MAX_TITLE);
      t.importance = importance;
      if (marks > 0) t.marks = marks; else delete t.marks;
    });
    if (ok) document.getElementById('syl-edit-backdrop')?.remove();
  }

  function deleteSyllabusTopic(subjectKey, id) {
    const entry = findSyllabusEntry(loadSyllabus(), subjectKey);
    const t = entry && entry.topics.find(x => x.id === id);
    if (!t) return;
    appConfirm(`Delete "${t.title}"?`, 'Delete', () => {
      updateSyllabusEntry(subjectKey, (e) => { e.topics = e.topics.filter(x => x.id !== id); });
      document.getElementById('syl-edit-backdrop')?.remove();
      showToast('Topic removed', 'note', { where: true });
    });
  }

  // ── Add topics: paste → preview → save ────────────────────────
  let sylPasteDraft = null;   // { subjectName, topics } while the preview is open

  function showSyllabusPasteModal(subjectName) {
    document.getElementById('syl-paste-backdrop')?.remove();
    sylPasteDraft = { subjectName, topics: [] };
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'syl-paste-backdrop';
    backdrop.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()" style="max-width:560px">
        <div class="modal-header">
          <h2 class="modal-title">Add topics · ${sylEsc(subjectName)}</h2>
          <button class="modal-close" onclick="closeSyllabusPasteModal()" aria-label="Close">${icons.x()}</button>
        </div>
        <div id="syl-paste-body"></div>
      </div>`;
    document.body.appendChild(backdrop);
    keepAboveKeyboard(backdrop);
    renderSyllabusPasteStep();
  }

  // A phone keyboard shrinks only the visible part of the page, so a fixed
  // sheet runs under it. Fit the sheet to what is visible; its buttons stay
  // pinned to the sheet's bottom (CSS), so Preview topics and Cancel stay in view.
  let sylKeyboardFit = null;
  function keepAboveKeyboard(backdrop) {
    const vv = window.visualViewport;
    if (!vv) return;
    if (sylKeyboardFit) vv.removeEventListener('resize', sylKeyboardFit);
    sylKeyboardFit = () => {
      if (!backdrop.isConnected) { vv.removeEventListener('resize', sylKeyboardFit); sylKeyboardFit = null; return; }
      backdrop.style.top = vv.offsetTop + 'px';
      backdrop.style.height = vv.height + 'px';
    };
    vv.addEventListener('resize', sylKeyboardFit);
    sylKeyboardFit();
  }

  function closeSyllabusPasteModal() {
    sylPasteDraft = null;
    document.getElementById('syl-paste-backdrop')?.remove();
    if (sylKeyboardFit && window.visualViewport) window.visualViewport.removeEventListener('resize', sylKeyboardFit);
    sylKeyboardFit = null;
  }

  function renderSyllabusPasteStep(prefill = '') {
    const body = document.getElementById('syl-paste-body');
    if (!body) return;
    body.innerHTML = `
      <div class="syl-scan-row">
        <button type="button" class="btn btn-secondary" onclick="chooseSyllabusScanFile()">${icons.camera()} Scan a photo or PDF</button>
        <span class="syl-hint" style="margin-top:0">Needs internet. You check every topic before it's saved.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="syl-paste-text">Or paste your syllabus, one topic per line</label>
        <textarea class="form-input syl-paste-text" id="syl-paste-text" rows="9" placeholder="Unit 1: Introduction to DBMS&#10;ER model - 10 marks&#10;Normalization (High)&#10;Transactions and concurrency">${sylEsc(prefill)}</textarea>
        <div class="syl-hint">Numbers, bullets and "Unit 1:" are removed for you. Add weightage at the end of a line if you know it: <strong>10 marks</strong>, <strong>(10m)</strong>, <strong>(High)</strong>, <strong>(Low)</strong> or <strong>★</strong>. You can check everything before it's saved.</div>
      </div>
      <div class="modal-footer" style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
        <button type="button" class="btn btn-secondary" onclick="closeSyllabusPasteModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="previewSyllabusPaste()">Preview topics →</button>
      </div>`;
    document.getElementById('syl-paste-text')?.focus();
  }

  function previewSyllabusPaste() {
    if (!sylPasteDraft) return;
    const text = document.getElementById('syl-paste-text')?.value || '';
    const entry = findSyllabusEntry(loadSyllabus(), sylPasteDraft.subjectName);
    const existing = entry ? entry.topics.map(t => t.title) : [];
    const { topics, duplicates } = parseSyllabusPaste(text, existing);
    const room = SYL_MAX_TOPICS - existing.length;
    if (!topics.length) {
      showToast(duplicates ? 'Those topics are already in your list' : 'No topics found. Put one topic on each line.', 'info');
      return;
    }
    sylPasteDraft.text = text;
    sylPasteDraft.scanned = false;
    sylPasteDraft.topics = topics.slice(0, Math.max(0, room));
    sylPasteDraft.duplicates = duplicates;
    sylPasteDraft.overflow = Math.max(0, topics.length - room);
    renderSyllabusPreviewStep();
  }

  function renderSyllabusPreviewStep() {
    const body = document.getElementById('syl-paste-body');
    if (!body || !sylPasteDraft) return;
    const d = sylPasteDraft;
    const notes = [
      d.duplicates ? `${d.duplicates} duplicate${d.duplicates !== 1 ? 's' : ''} skipped` : '',
      d.overflow ? `${d.overflow} over the ${SYL_MAX_TOPICS}-topic limit, left out` : ''
    ].filter(Boolean).join(' · ');
    body.innerHTML = `
      <div class="syl-preview-head">
        <strong>${d.topics.length} topic${d.topics.length !== 1 ? 's' : ''} to add</strong>${notes ? ` <span class="syl-hint">${notes}</span>` : ''}
        ${d.scanned ? `<div class="syl-hint syl-scan-note">Read by AI from your file. It can misread or miss a topic, so check each row against the syllabus.</div>` : ''}
        <div class="syl-hint">Nothing is saved yet. Fix a name, set importance or marks, or remove a row.</div>
      </div>
      <div class="syl-preview-list">
        ${d.topics.map((t, i) => `
          <div class="syl-preview-row">
            <input type="text" class="form-input syl-pv-title" aria-label="Topic ${i + 1}" maxlength="${SYL_MAX_TITLE}" value="${sylEsc(t.title)}" oninput="setSyllabusPreviewField(${i}, 'title', this.value)">
            <select class="form-select syl-pv-imp" aria-label="Importance for topic ${i + 1}" onchange="setSyllabusPreviewField(${i}, 'importance', this.value)">
              ${[3, 2, 1].map(v => `<option value="${v}" ${t.importance === v ? 'selected' : ''}>${SYL_IMPORTANCE[v]}</option>`).join('')}
            </select>
            <input type="number" class="form-input syl-pv-marks" aria-label="Marks for topic ${i + 1}" min="0" max="500" step="0.5" inputmode="decimal" placeholder="Marks" value="${t.marks || ''}" oninput="setSyllabusPreviewField(${i}, 'marks', this.value)">
            <button type="button" class="btn btn-secondary syl-pv-remove" aria-label="Remove topic ${i + 1}" onclick="removeSyllabusPreviewRow(${i})">${icons.x()}</button>
          </div>`).join('')}
      </div>
      <div class="modal-footer" style="margin-top:14px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary" onclick="renderSyllabusPasteStepAgain()">← Edit text</button>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-secondary" onclick="closeSyllabusPasteModal()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="confirmSyllabusPaste()" ${d.topics.length ? '' : 'disabled'}>Save ${d.topics.length} topic${d.topics.length !== 1 ? 's' : ''}</button>
        </div>
      </div>`;
  }

  function renderSyllabusPasteStepAgain() {
    renderSyllabusPasteStep(sylPasteDraft ? sylPasteDraft.text || '' : '');
  }

  function setSyllabusPreviewField(i, field, value) {
    const t = sylPasteDraft && sylPasteDraft.topics[i];
    if (!t) return;
    if (field === 'title') t.title = String(value);
    else if (field === 'importance') t.importance = Number(value) || 2;
    else if (field === 'marks') { const m = Number(value); if (m > 0) t.marks = m; else delete t.marks; }
  }

  function removeSyllabusPreviewRow(i) {
    if (!sylPasteDraft) return;
    sylPasteDraft.topics.splice(i, 1);
    renderSyllabusPreviewStep();
  }

  function confirmSyllabusPaste() {
    if (!sylPasteDraft) return;
    const { subjectName } = sylPasteDraft;
    const list = loadSyllabus();
    let entry = findSyllabusEntry(list, subjectName);
    if (!entry) {
      entry = { subjectKey: getCanonicalSubjectKey(subjectName), subjectName, examDate: '', topics: [] };
      list.push(entry);
    }
    const have = new Set(entry.topics.map(t => t.title.toLowerCase()));
    let added = 0;
    sylPasteDraft.topics.forEach(raw => {
      const t = sanitizeSyllabusTopic({ ...raw, id: sylNewId(), status: 'todo' });
      if (!t || have.has(t.title.toLowerCase()) || entry.topics.length >= SYL_MAX_TOPICS) return;
      have.add(t.title.toLowerCase());
      entry.topics.push(t);
      added++;
    });
    entry.updatedAt = new Date().toISOString();
    saveSyllabus(list);
    closeSyllabusPasteModal();
    showToast(`· ${added} topic${added !== 1 ? 's' : ''} added`, 'done', { item: subjectName, where: true, key: `done:subject:${entry.subjectKey || getCanonicalSubjectKey(subjectName)}` });
    renderPage(state.currentPage);
  }

  // ── Add a subject by name (students without a timetable) ──────
  function showAddSyllabusSubjectModal() {
    document.getElementById('syl-subj-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'syl-subj-backdrop';
    backdrop.onclick = () => backdrop.remove();
    backdrop.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()" style="max-width:420px">
        <div class="modal-header">
          <h2 class="modal-title">Add a subject</h2>
          <button class="modal-close" onclick="document.getElementById('syl-subj-backdrop').remove()" aria-label="Close">${icons.x()}</button>
        </div>
        <div class="form-group">
          <label class="form-label" for="syl-subj-name">Subject name</label>
          <input type="text" class="form-input" id="syl-subj-name" maxlength="80" placeholder="e.g. Physics, Quantitative Aptitude">
          <div class="syl-hint">Next you can paste its syllabus.</div>
        </div>
        <div class="modal-footer" style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('syl-subj-backdrop').remove()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="confirmAddSyllabusSubject()">Add subject</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('syl-subj-name')?.focus();
  }

  function confirmAddSyllabusSubject() {
    const raw = String(document.getElementById('syl-subj-name')?.value || '').replace(/\s+/g, ' ').trim();
    const name = getCanonicalSubjectName(raw) || raw;
    const key = getCanonicalSubjectKey(raw);
    if (!key || key === 'general' || isLikelyGarbledSubjectName(name)) {
      reportFormErrors([{ input: document.getElementById('syl-subj-name'), msg: 'Type the subject name, like Physics', isValid: (v) => { const k = getCanonicalSubjectKey(v.trim()); return !!k && k !== 'general'; } }]);
      return;
    }
    const existing = getSubjectList().find(s => getCanonicalSubjectKey(s.name) === key);
    const subjectName = existing ? existing.name : name;
    const list = loadSyllabus();
    if (!findSyllabusEntry(list, subjectName)) {
      list.push({ subjectKey: key, subjectName, examDate: '', topics: [] });
      saveSyllabus(list);
    }
    const hidden = safeGetStorage(KEY_HIDDEN_SUBJECTS, []) || [];
    if (hidden.includes(key)) safeSetStorage(KEY_HIDDEN_SUBJECTS, hidden.filter(k => k !== key));
    document.getElementById('syl-subj-backdrop')?.remove();
    openSubjectHub(subjectName);
    showSyllabusPasteModal(subjectName);
  }


  return {
    cycleSyllabusTopic,
    cycleSyllabusImportance,
    moveSyllabusTopic,
    setSyllabusExamDate,
    resetSyllabusProgress,
    openSubjectSyllabus,
    removeSyllabus,
    showEditSyllabusTopicModal,
    saveSyllabusTopicEdit,
    deleteSyllabusTopic,
    showSyllabusPasteModal,
    closeSyllabusPasteModal,
    previewSyllabusPaste,
    renderSyllabusPasteStepAgain,
    setSyllabusPreviewField,
    removeSyllabusPreviewRow,
    confirmSyllabusPaste,
    showAddSyllabusSubjectModal,
    confirmAddSyllabusSubject,
    parseSyllabusLine,
    parseSyllabusPaste,
    renderSyllabusPasteStep,
    renderSyllabusPreviewStep,
    getPasteDraft() { return sylPasteDraft; }
  };
}
