// ==================================================================
// Clarity Desk: Import from WhatsApp (paste a chat, message or circular)
// ==================================================================
// Moved out of app.js so first load downloads and parses less. app.js
// imports this file the first time the import screen is opened
// (loadWhatsApp) and precaches it in sw.js, so it opens offline exactly as
// before. The buttons that open it stay in app.js (showWhatsAppImport and
// the wa* window handlers are thin stubs that call in here).
// The code below is the same as it was in app.js; the app.js helpers it
// reads arrive in `deps` (whatsAppDeps() in app.js). The helpers the Vault
// import also uses (waNormUrl, waSavedLinkUrls, waLinkSubjects,
// waGuessLinkSubject, loadWaParser) stay in app.js.
// Tests: tests/lazy-modules.mjs loads this for the app.js test sandbox.
// ==================================================================

export function createWhatsAppImport(deps) {
  const {
    TASK_TITLE_MAX, VAULT_FULL_MESSAGE, VAULT_IMPORT_LABEL_MAX, allTasks, formatDisplayTime, getCanonicalSubjectKey, icons, loadCustomLinks, loadWaParser, maybeOfferClosedAppReminders, navigate, renderPage, saveCustomLinks, saveCustomTasks, showToast, showUndoToast, state, trackUsage, updateNavBadges, vaultIconForUrl, waGuessLinkSubject, waLinkSubjects, waNormUrl, waSavedLinkUrls
  } = deps;

  // ── Import from WhatsApp ──────────────────────────────────────
  // Reads a class-group chat ON THIS DEVICE and lists the deadlines it finds
  // for review. Privacy rules (the chat holds other students' messages):
  //   - the raw chat is never stored, uploaded, logged or synced; it only
  //     lives in local variables / the paste box while this screen is open
  //   - only the rows the student ticks become tasks, via saveCustomTasks()
  //   - nothing is imported without the review step
  // Parser: deadline-import.js (lazy-loaded). Long chats are scanned in
  // deadline-import-worker.js. JSZip (vendor/) is loaded only for a .zip.
  const WA_MAX_BYTES = 20 * 1024 * 1024;
  const WA_WORKER_LINES = 3000;
  const WA_KIND_LABEL = { exam: 'Exam', sub: 'Submission', pres: 'Presentation', lec: 'Lecture', oth: 'Notice' };
  const WA_NOT_A_CHAT = 'Couldn’t read this as a chat export. Use Export chat, or paste the message or circular text itself.';
  const WA_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WA_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Review state: { P, items, stats, sel:Set, dup:Set, open, now }. Memory only;
  // set back to null when the screen closes.
  let _wa = null;
  let _jszipPromise = null;

  function waEsc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!_jszipPromise) {
      _jszipPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = './vendor/jszip.min.js';
        s.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('zip reader missing')));
        s.onerror = () => { _jszipPromise = null; s.remove(); reject(new Error('Could not load the zip reader. Check your connection and try again.')); };
        document.head.appendChild(s);
      });
    }
    return _jszipPromise;
  }

  async function waReadChatFile(file) {
    if (file.size > WA_MAX_BYTES) throw new Error('This file is over 20 MB. Export a single group chat Without media and try again.');
    const isZip = /\.zip$/i.test(file.name || '') || /zip/i.test(file.type || '');
    if (!isZip) return await file.text();
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    const txts = Object.values(zip.files).filter(f => !f.dir && /\.txt$/i.test(f.name));
    if (!txts.length) throw new Error('This zip has no chat .txt file inside. Export the chat again Without media.');
    const pick = txts.find(f => /(^|\/)_chat\.txt$|whatsapp/i.test(f.name)) || txts[0];
    return await pick.async('string');
  }

  // Scans in a worker for long chats so the screen never freezes; falls back
  // to the main thread if workers are unavailable or fail.
  async function waScan(P, raw, now) {
    const lines = (raw.match(/\n/g) || []).length + 1;
    if (lines > WA_WORKER_LINES && typeof Worker !== 'undefined') {
      try {
        return await new Promise((resolve, reject) => {
          const w = new Worker('./deadline-import-worker.js', { type: 'module' });
          const done = (fn, v) => { w.terminate(); fn(v); };
          w.onmessage = (e) => (e.data && e.data.ok ? done(resolve, e.data.result) : done(reject, new Error('scan failed')));
          w.onerror = (e) => { e.preventDefault?.(); done(reject, new Error('worker failed')); };
          w.postMessage({ raw, now: now.getTime() });
        });
      } catch (_) { /* fall through to the main thread */ }
    }
    return P.scanChat(raw, now);
  }

  function waClose() {
    _wa = null;
    document.getElementById('wa-import-backdrop')?.remove();
  }

  function waIsOpen() { return !!document.getElementById('wa-import-backdrop'); }

  // Opens the import screen. prefill = { file?, text? } from the Android
  // share target; when given, it skips straight to the review list.
  let _waStartTab = 'tasks';
  function showWhatsAppImport(prefill = null, opts = {}) {
    document.getElementById('add-task-backdrop')?.remove();
    waClose();
    _waStartTab = opts && opts.tab === 'links' ? 'links' : 'tasks';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'wa-import-backdrop';
    backdrop.innerHTML = `
      <div class="modal wa-modal" data-testid="wa-import-modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2 class="modal-title">Paste a message or circular</h2>
          <button class="modal-close" aria-label="Close" onclick="waClose()">${icons.x()}</button>
        </div>
        <div id="wa-body"></div>
      </div>`;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) waClose(); });
    const escHandler = (e) => {
      if (!waIsOpen()) { document.removeEventListener('keydown', escHandler); return; }
      if (e.key === 'Escape') { waClose(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
    document.body.appendChild(backdrop);
    waRenderAddChat();
    if (prefill && prefill.file) waHandleFile(prefill.file);
    else if (prefill && prefill.text) waHandleText(prefill.text);
  }

  function waRenderAddChat(errorMsg = '') {
    const body = document.getElementById('wa-body');
    if (!body) return;
    body.innerHTML = `
      <p class="wa-lead">Paste the text, or pick a class group chat file. The chat is read on this phone and never uploaded. Only the deadlines you add are kept, each with its message, and they sync like your other tasks.</p>
      <input type="file" id="wa-file" accept=".txt,.zip,text/plain,application/zip" hidden onchange="waFilePicked(this)">
      <button type="button" class="btn-primary wa-choose" data-testid="wa-choose" onclick="document.getElementById('wa-file').click()">Choose chat file</button>
      <div class="form-group wa-paste-group">
        <label class="form-label" for="wa-paste">Paste the text</label>
        <textarea class="form-input form-textarea" id="wa-paste" data-testid="wa-paste" rows="5" placeholder="Paste a circular, a notice, or WhatsApp messages"></textarea>
        <button type="button" class="btn-secondary wa-find" data-testid="wa-find" onclick="waScanPasted()">Find deadlines</button>
      </div>
      <div class="wa-error" id="wa-error" role="alert" ${errorMsg ? '' : 'hidden'}>${waEsc(errorMsg)}</div>
      <details class="wa-howto">
        <summary>How to export</summary>
        <ol>
          <li>Open the class group in WhatsApp.</li>
          <li>Tap ⋮ › More › Export chat. On iPhone, tap the group name › Export Chat.</li>
          <li>Choose Without media.</li>
          <li>Save the file, then pick it here.</li>
        </ol>
        <p class="wa-howto-note">On Android, if you installed Clarity Desk from Chrome, you can also pick Clarity Desk in the share list after Export chat. On iPhone, save the file and choose it here.</p>
      </details>`;
  }

  function waShowError(msg) {
    const el = document.getElementById('wa-error');
    if (el) { el.textContent = msg; el.hidden = false; }
    else waRenderAddChat(msg);
  }

  function waShowBusy(msg) {
    const body = document.getElementById('wa-body');
    if (body) body.innerHTML = `<div class="wa-busy" role="status">${waEsc(msg)}</div>`;
  }

  async function waFilePicked(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (file) await waHandleFile(file);
  }

  async function waHandleFile(file) {
    if (file.size > WA_MAX_BYTES) { waRenderAddChat('This file is over 20 MB. Export a single group chat Without media and try again.'); return; }
    waShowBusy('Reading chat…');
    let raw;
    try { raw = await waReadChatFile(file); }
    catch (err) { if (waIsOpen()) waRenderAddChat(err && err.message ? err.message : WA_NOT_A_CHAT); return; }
    await waHandleText(raw);
  }

  function waScanPasted() {
    const text = document.getElementById('wa-paste')?.value || '';
    if (!text.trim()) { waShowError('Paste some messages first, or choose a chat file.'); return; }
    waHandleText(text);
  }

  async function waHandleText(raw) {
    waShowBusy('Finding deadlines and links…');
    let P, result;
    const now = new Date();
    try {
      P = await loadWaParser();
      result = await waScan(P, String(raw || ''), now);
    } catch (_) {
      if (waIsOpen()) waRenderAddChat('Couldn’t open the chat reader. Check your connection once and try again.');
      return;
    }
    // eslint-disable-next-line no-useless-assignment -- deliberate: release the pasted chat text early
    raw = null; // drop the chat text; only the found rows are kept
    if (!waIsOpen()) return;
    // Plain pasted text (a circular) has no timestamps; a chat needs at least 2,
    // or 1 when that single pasted message has a deadline in it.
    const oneMessage = result && result.stats.recognised === 1 && result.items.length > 0;
    if (!result || (result.stats.recognised < 2 && !result.stats.plain && !oneMessage)) { waRenderAddChat(WA_NOT_A_CHAT); return; }

    const today = waMidnight(now);
    const existing = allTasks();
    const sel = new Set(), dup = new Set();
    for (const c of result.items) {
      if (waIsDuplicate(P, c, existing)) dup.add(c.id);
      else if (waMidnight(c.date) >= today && !c.unsure) sel.add(c.id);
    }
    const links = Array.isArray(result.links) ? result.links : [];
    const subjects = waLinkSubjects();
    const saved = waSavedLinkUrls();
    const linkSel = new Set(), linkDup = new Set();
    for (const l of links) {
      l.subject = waGuessLinkSubject(l.context, subjects);
      if (saved.has(waNormUrl(l.url))) linkDup.add(l.id);
      else if (WA_LINK_DEFAULT_ON.includes(l.kind)) linkSel.add(l.id);
    }
    _wa = { P, items: result.items, stats: result.stats, sel, dup, open: null, now,
      links, linkSel, linkDup, subjects, tab: _waStartTab === 'links' || (!result.items.length && links.length) ? 'links' : 'tasks' };
    waRenderReview();
  }

  function waMidnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function waNormTitle(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  // Same day and a similar title as a task already on the desk.
  function waIsDuplicate(P, c, tasks) {
    const day = P.ymd(c.date);
    const t = waNormTitle(c.title);
    if (!t) return false;
    const original = String(c.text || '').slice(0, 300);
    return tasks.some(x => {
      if (x.dueDate !== day) return false;
      // Imported before (title may have been edited): same original message.
      if (x.source === 'whatsapp' && original && x.description === original) return true;
      const n = waNormTitle(x.title);
      if (!n) return false;
      const k = Math.min(20, n.length, t.length);
      return n === t || n.slice(0, k) === t.slice(0, k);
    });
  }

  function waDayLabel(d, now) {
    const diff = Math.round((waMidnight(d) - waMidnight(now)) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${WA_DAY[d.getDay()]} ${d.getDate()} ${WA_MON[d.getMonth()]}`;
  }

  function waTimeLabel(c) {
    if (!c.hasTime) return 'All day';
    const P = _wa.P;
    const start = formatDisplayTime(P.hhmm(c.date));
    if (c.end) return `${start} to ${formatDisplayTime(P.hhmm(c.end))}`;
    return c.kind === 'sub' ? `by ${start}` : start;
  }

  function waRowMain(c) {
    return `
      <span class="wa-when"><span class="wa-day">${waDayLabel(c.date, _wa.now)}</span><span class="wa-time">${waEsc(waTimeLabel(c))}</span></span>
      <span class="wa-what">
        <span class="wa-chip wa-chip-${c.kind}">${WA_KIND_LABEL[c.kind] || 'Notice'}</span>
        ${_wa.dup.has(c.id) ? '<span class="wa-dup">Already in tasks</span>' : ''}
        <span class="wa-title">${waEsc(c.title || 'Untitled')}</span>
      </span>`;
  }

  function waRowEditor(c) {
    const P = _wa.P;
    const kinds = Object.entries(WA_KIND_LABEL).map(([k, v]) => `<option value="${k}" ${k === c.kind ? 'selected' : ''}>${v}</option>`).join('');
    return `
      <div class="wa-edit">
        <div class="wa-orig">${c.who ? `<strong>${waEsc(c.who)}:</strong> ` : ''}${waEsc(c.text)}</div>
        <div class="form-group">
          <label class="form-label" for="wa-t-${c.id}">Title</label>
          <input class="form-input" id="wa-t-${c.id}" maxlength="150" value="${waEsc(c.title)}" onchange="waEdit('${c.id}','title',this.value)">
        </div>
        <div class="wa-edit-row">
          <div class="form-group"><label class="form-label" for="wa-d-${c.id}">Date</label>
            <input type="date" class="form-input" id="wa-d-${c.id}" value="${P.ymd(c.date)}" onchange="waEdit('${c.id}','date',this.value)"></div>
          <div class="form-group"><label class="form-label" for="wa-k-${c.id}">Type</label>
            <select class="form-select" id="wa-k-${c.id}" onchange="waEdit('${c.id}','kind',this.value)">${kinds}</select></div>
        </div>
        <div class="wa-edit-row">
          <div class="form-group"><label class="form-label" for="wa-s-${c.id}">Start time</label>
            <input type="time" class="form-input" id="wa-s-${c.id}" value="${c.hasTime ? P.hhmm(c.date) : ''}" onchange="waEdit('${c.id}','start',this.value)"></div>
          <div class="form-group"><label class="form-label" for="wa-e-${c.id}">End time</label>
            <input type="time" class="form-input" id="wa-e-${c.id}" value="${c.end ? P.hhmm(c.end) : ''}" onchange="waEdit('${c.id}','end',this.value)"></div>
        </div>
      </div>`;
  }

  function waRow(c) {
    const open = _wa.open === c.id;
    return `
      <div class="wa-row ${open ? 'open' : ''}" data-wa-id="${c.id}">
        <label class="wa-check"><input type="checkbox" ${_wa.sel.has(c.id) ? 'checked' : ''} aria-label="Import ${waEsc(c.title)}" onchange="waToggle('${c.id}', this.checked)"></label>
        <button type="button" class="wa-row-main" aria-expanded="${open}" onclick="waToggleOpen('${c.id}')">${waRowMain(c)}</button>
        ${open ? waRowEditor(c) : ''}
      </div>`;
  }

  function waRenderReview() {
    const body = document.getElementById('wa-body');
    if (!body || !_wa) return;
    if (_wa.tab === 'links') { waRenderLinks(); return; }
    const { items, stats, now } = _wa;
    const today = waMidnight(now);
    const week = new Date(today); week.setDate(week.getDate() + 8);
    const past = items.filter(c => waMidnight(c.date) < today);
    const next = items.filter(c => waMidnight(c.date) >= today && c.date < week);
    const later = items.filter(c => c.date >= week);
    const fmt = (d) => `${d.getDate()} ${WA_MON[d.getMonth()]}`;
    const range = stats.first && stats.last ? `, ${fmt(stats.first)} to ${fmt(stats.last)}` : '';
    const header = `Read ${stats.messages} message${stats.messages === 1 ? '' : 's'}${range}. Found ${next.length + later.length} upcoming${stats.ignored ? `, ignored ${stats.ignored} with no deadline` : ''}.`;

    if (!items.length) {
      body.innerHTML = `
        ${waTabsHtml()}
        <p class="wa-summary">${waEsc(header)}</p>
        <div class="empty-state-card wa-empty">
          <div class="empty-state-desc">No deadlines found in these messages. If one was missed, the wording might be new.</div>
          <button type="button" class="btn-secondary" onclick="waRenderAddChat()">Try another chat</button>
        </div>`;
      return;
    }
    const section = (title, list) => list.length ? `<h3 class="wa-section">${title}</h3>${list.map(waRow).join('')}` : '';
    body.innerHTML = `
      ${waTabsHtml()}
      <p class="wa-summary" data-testid="wa-summary">${waEsc(header)}</p>
      <div class="wa-list">
        ${section('Next 7 days', next)}
        ${section('Later', later)}
        ${past.length ? `<details class="wa-past"><summary>Already past (${past.length})</summary>${past.map(waRow).join('')}</details>` : ''}
      </div>
      <div class="wa-bar">
        <button type="button" class="btn-secondary" id="wa-ics" onclick="waExportIcs()">Export .ics</button>
        <button type="button" class="btn-primary" id="wa-import" data-testid="wa-import" onclick="waImportSelected()"></button>
      </div>`;
    waUpdateBar();
  }

  function waUpdateBar() {
    if (!_wa) return;
    const n = _wa.sel.size;
    const btn = document.getElementById('wa-import');
    const ics = document.getElementById('wa-ics');
    if (btn) { btn.textContent = `Import ${n} task${n === 1 ? '' : 's'}`; btn.disabled = !n; }
    if (ics) ics.disabled = !n;
  }

  function waToggle(id, on) {
    if (!_wa) return;
    if (on) _wa.sel.add(id); else _wa.sel.delete(id);
    waUpdateBar();
  }

  function waToggleOpen(id) {
    if (!_wa) return;
    const prev = _wa.open;
    _wa.open = prev === id ? null : id;
    for (const rid of [prev, _wa.open]) {
      if (!rid) continue;
      const row = document.querySelector(`.wa-row[data-wa-id="${rid}"]`);
      const c = _wa.items.find(x => x.id === rid);
      if (row && c) row.outerHTML = waRow(c);
    }
  }

  // Inline edits change the in-memory row only; the summary line updates in
  // place so the open editor keeps focus on a phone.
  function waEdit(id, field, value) {
    const c = _wa && _wa.items.find(x => x.id === id);
    if (!c) return;
    if (field === 'title') c.title = String(value).trim().slice(0, TASK_TITLE_MAX) || c.title;
    else if (field === 'kind' && WA_KIND_LABEL[value]) c.kind = value;
    else if (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      const shift = (x) => { const n = new Date(x); n.setFullYear(y, m - 1, d); return n; };
      c.date = shift(c.date);
      if (c.end) c.end = shift(c.end);
    } else if (field === 'start') {
      if (/^\d{2}:\d{2}$/.test(value)) {
        const [h, mi] = value.split(':').map(Number);
        c.date.setHours(h, mi, 0, 0);
        c.hasTime = true;
        if (c.end && c.end <= c.date) c.end = null;
      } else { c.date.setHours(0, 0, 0, 0); c.hasTime = false; c.end = null; }
    } else if (field === 'end') {
      if (/^\d{2}:\d{2}$/.test(value) && c.hasTime) {
        const [h, mi] = value.split(':').map(Number);
        const e = new Date(c.date); e.setHours(h, mi, 0, 0);
        c.end = e > c.date ? e : null;
      } else c.end = null;
    }
    const main = document.querySelector(`.wa-row[data-wa-id="${id}"] .wa-row-main`);
    if (main) main.innerHTML = waRowMain(c);
  }

  function waSelected() {
    return _wa ? _wa.items.filter(c => _wa.sel.has(c.id)) : [];
  }

  function waExportIcs() {
    const chosen = waSelected();
    if (!chosen.length) return;
    const blob = new Blob([_wa.P.buildIcs(chosen)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clarity-desk-deadlines.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function waImportSelected() {
    const chosen = waSelected();
    if (!chosen.length) return;
    const P = _wa.P;
    const stamp = Date.now();
    const ids = [];
    chosen.forEach((c, i) => {
      const id = `c-${stamp}-wa${i}`;
      ids.push(id);
      state.customTasks.push({
        id,
        subject: 'General',
        code: 'GEN',
        ...P.candidateToTaskFields(c),
        noDeadline: false,
        priority: c.kind === 'exam' ? 'high' : 'medium',
        status: 'pending',
        marks: 0,
        isCustom: true,
      });
    });
    saveCustomTasks();
    waClose();
    navigate('assignments');
    updateNavBadges();
    maybeOfferClosedAppReminders(chosen);
    const n = ids.length;
    showUndoToast(`${n} task${n === 1 ? '' : 's'} added from your message`, () => {
      const drop = new Set(ids);
      state.customTasks = state.customTasks.filter(t => !drop.has(t.id));
      saveCustomTasks();
      renderPage(state.currentPage);
      updateNavBadges();
      showToast('Those tasks are removed again', 'note', { where: true });
    }, 'done', { where: true, key: 'done:task:import' });
  }

  // ── Links tab: study links → Subject Hubs ─────────────────────
  // Same scan, second list. Nothing reaches the vault until "Add to
  // Subject Hubs"; links already in the vault are shown, not added twice.
  const WA_LINK_DEFAULT_ON = ['drive', 'doc', 'classroom', 'video', 'pdf'];
  const WA_LINK_KIND_LABEL = { drive: 'Drive', doc: 'Doc', classroom: 'Classroom', video: 'Video', pdf: 'PDF', code: 'Code', other: 'Link' };

  function waTabsHtml() {
    if (!_wa || (!_wa.links.length && _wa.tab !== 'links')) return '';
    const tab = (id, label) => `<button type="button" role="tab" class="wa-tab ${_wa.tab === id ? 'active' : ''}" aria-selected="${_wa.tab === id}" onclick="waSetTab('${id}')">${label}</button>`;
    return `<div class="wa-tabs" role="tablist">${tab('tasks', `Deadlines (${_wa.items.length})`)}${tab('links', `Links (${_wa.links.length})`)}</div>`;
  }

  function waSetTab(id) {
    if (!_wa || !['tasks', 'links'].includes(id)) return;
    _wa.tab = id;
    waRenderReview();
  }

  function waLinkRow(l) {
    const dup = _wa.linkDup.has(l.id);
    const names = [...new Set([..._wa.subjects.map(s => s.name), 'General', l.subject])];
    const opts = names.map(n => `<option value="${waEsc(n)}" ${n === l.subject ? 'selected' : ''}>${waEsc(n)}</option>`).join('');
    const when = l.sent ? `${l.sent.getDate()} ${WA_MON[l.sent.getMonth()]}` : '';
    return `
      <div class="wa-row wa-link-row ${dup ? 'is-dup' : ''}" data-wl-id="${l.id}">
        <label class="wa-check"><input type="checkbox" ${_wa.linkSel.has(l.id) ? 'checked' : ''} ${dup ? 'disabled' : ''} aria-label="Add ${waEsc(l.title)}" onchange="waLinkToggle('${l.id}', this.checked)"></label>
        <div class="wa-link-main">
          <span class="wa-what">
            <span class="wa-chip wa-chip-link">${WA_LINK_KIND_LABEL[l.kind] || 'Link'}</span>
            ${dup ? '<span class="wa-dup">Already saved</span>' : ''}
            <span class="wa-title">${waEsc(l.title || l.domain)}</span>
          </span>
          <span class="wa-link-meta">${waEsc(l.domain)}${l.who ? ` · ${waEsc(l.who)}` : ''}${when ? ` · ${when}` : ''}</span>
          ${dup ? '' : `<label class="wa-link-subject"><span>Subject</span><select class="form-select" onchange="waLinkSubject('${l.id}', this.value)" aria-label="Subject for ${waEsc(l.title)}">${opts}</select></label>`}
        </div>
      </div>`;
  }

  function waRenderLinks() {
    const body = document.getElementById('wa-body');
    if (!body || !_wa) return;
    const { links, linkDup } = _wa;
    const header = links.length
      ? `Found ${links.length} link${links.length === 1 ? '' : 's'}${linkDup.size ? `, ${linkDup.size} already in your vault` : ''}. Tick the ones to keep and check the subject.`
      : 'No study links found in these messages.';
    body.innerHTML = `
      ${waTabsHtml()}
      <p class="wa-summary" data-testid="wa-link-summary">${waEsc(header)}</p>
      ${links.length ? `<div class="wa-list">${links.map(waLinkRow).join('')}</div>
      <div class="wa-bar">
        <button type="button" class="btn-primary" id="wa-links-save" data-testid="wa-links-save" onclick="waSaveLinks()"></button>
      </div>` : `<div class="empty-state-card wa-empty"><button type="button" class="btn-secondary" onclick="waRenderAddChat()">Try another chat</button></div>`}`;
    waUpdateLinkBar();
  }

  function waUpdateLinkBar() {
    const btn = document.getElementById('wa-links-save');
    if (!btn || !_wa) return;
    const n = _wa.linkSel.size;
    btn.textContent = `Add ${n} link${n === 1 ? '' : 's'} to Subject Hubs`;
    btn.disabled = !n;
  }

  function waLinkToggle(id, on) {
    if (!_wa || _wa.linkDup.has(id)) return;
    if (on) _wa.linkSel.add(id); else _wa.linkSel.delete(id);
    waUpdateLinkBar();
  }

  function waLinkSubject(id, value) {
    const l = _wa && _wa.links.find(x => x.id === id);
    if (l && String(value || '').trim()) l.subject = String(value).trim().slice(0, 60);
  }

  function waSaveLinks() {
    if (!_wa) return;
    const chosen = _wa.links.filter(l => _wa.linkSel.has(l.id) && !_wa.linkDup.has(l.id));
    if (!chosen.length) return;
    const links = loadCustomLinks();
    const added = [];        // { key, url } for undo
    const created = new Set();
    for (const l of chosen) {
      const key = getCanonicalSubjectKey(l.subject);
      let entry = links.find(s => s && getCanonicalSubjectKey(s.subject || '') === key);
      if (!entry) {
        entry = { subject: l.subject, code: l.subject.slice(0, 4).toUpperCase(), color: '#394B63', resources: [] };
        links.push(entry);
        created.add(key);
      }
      if (!Array.isArray(entry.resources)) entry.resources = [];
      entry.resources.push({ label: String(l.title || l.domain).slice(0, VAULT_IMPORT_LABEL_MAX), url: l.url, icon: vaultIconForUrl(l.url) || 'link', isUpload: false, fileSize: '' });
      added.push({ key, url: l.url });
    }
    if (!saveCustomLinks(links)) { showToast(VAULT_FULL_MESSAGE, 'error'); return; }
    const n = added.length;
    trackUsage('wa_links_saved', n <= 5 ? '1-5' : n <= 20 ? '6-20' : '21plus');
    waClose();
    navigate('links');
    showUndoToast(`${n} link${n === 1 ? '' : 's'} added to Subject Hubs`, () => {
      const cur = loadCustomLinks();
      for (const a of added) {
        const entry = cur.find(s => s && getCanonicalSubjectKey(s.subject || '') === a.key);
        if (!entry || !Array.isArray(entry.resources)) continue;
        const i = entry.resources.findIndex(r => r && r.url === a.url);
        if (i >= 0) entry.resources.splice(i, 1);
      }
      const kept = cur.filter(s => !(s && created.has(getCanonicalSubjectKey(s.subject || '')) && (!s.resources || !s.resources.length)));
      saveCustomLinks(kept);
      renderPage(state.currentPage);
      showToast('Links removed again', 'info');
    });
  }


  return {
    showWhatsAppImport,
    waClose,
    waFilePicked,
    waScanPasted,
    waRenderAddChat,
    waToggle,
    waToggleOpen,
    waEdit,
    waExportIcs,
    waImportSelected,
    waSetTab,
    waLinkToggle,
    waLinkSubject,
    waSaveLinks,
    // Tests only: put the review state in place without a chat.
    setReviewState(v) { _wa = v; }
  };
}
