// ==================================================================
// Clarity Desk: photo scanners (attendance photo scan, syllabus scan)
// ==================================================================
// Moved out of app.js so first load downloads and parses less. app.js
// imports this file the first time a scan is used (loadScanners) and
// precaches it in sw.js, so scanning works offline exactly as before.
// The file pickers stay in app.js (triggerAttendancePhotoScan,
// chooseSyllabusScanFile) so they still open straight from the tap.
// The code below is the same as it was in app.js; the app.js helpers it
// reads arrive in `deps` (scannerDeps() in app.js). _isOcrBusy (the OCR
// lock shared with the timetable scan) and sylPasteDraft are read through
// deps because app.js owns and reassigns them.
// Tests: tests/lazy-modules.mjs loads this for the app.js test sandbox.
// ==================================================================

export function createScanners(deps) {
  const {
    AIService, chooseSyllabusScanFile, clearUndatedTapsCoveredBy,
    confirmScanPhotoQuality, findSyllabusEntry, getAttendanceTarget, getSubjectList, getTesseractWorker,
    groupWordsIntoLines, icons, loadAttendanceBaselines, loadSyllabus,
    normalizeSubjectIdentity, parseSyllabusLine, reencodeDataUrl,
    renderPage, renderSyllabusPreviewStep, saveAttendanceBaselines,
    showBaselineModal, showToast, state, SYL_MAX_TOPICS, sylEsc,
    triggerAttendancePhotoScan
  } = deps;

  // ── Attendance Photo Scanning Engine ──────────────────────────

  let _currentAttendanceScanId = 0;
  let _isAttendanceScanCanceled = false;

function showAttendanceScanLoadingModal(message = 'Scanning attendance…') {
  const existing = document.getElementById('ab-scan-loading-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'ab-scan-loading-backdrop';
  backdrop.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()" style="max-width:380px;text-align:center;padding:28px 24px">
      <div class="spinner" style="width:36px;height:36px;border-width:3px;margin:0 auto 16px auto"></div>
      <div id="ab-scan-loading-msg" style="font-weight:700;font-size:var(--text-md);color:var(--text-primary);margin-bottom:6px">${message}</div>
      <div id="ab-scan-loading-sub" style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:4px">Extracting subject names and attendance counts from screenshot…</div>
      <div style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:18px">Usually 15–45 seconds. Nothing is saved until you check the counts.</div>
      <button type="button" class="btn-secondary" onclick="cancelAttendancePhotoScan()" style="font-size:var(--text-base);padding:6px 16px">
        Cancel Scan
      </button>
    </div>
  `;
  document.body.appendChild(backdrop);
}

function updateAttendanceScanLoadingMessage(msg) {
  const el = document.getElementById('ab-scan-loading-msg');
  if (el) el.textContent = msg;
}

function updateAttendanceScanLoadingProgress(pct) {
  const subEl = document.getElementById('ab-scan-loading-sub');
  if (subEl && pct > 0 && pct < 100) {
    subEl.textContent = `Recognizing table text with local OCR (${pct}%)…`;
  }
}

function hideAttendanceScanLoadingModal() {
  document.getElementById('ab-scan-loading-backdrop')?.remove();
}

function cancelAttendancePhotoScan() {
  _isAttendanceScanCanceled = true;
  deps._isOcrBusy = false;
  hideAttendanceScanLoadingModal();
  showToast('Scan canceled', 'info');
  showBaselineModal(null, 'manual');
}

function preprocessAttendanceImageForOCR(base64Data, mimeType) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const origWidth = img.width;
      const origHeight = img.height;

      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = origWidth;
      rawCanvas.height = origHeight;
      const rawCtx = rawCanvas.getContext('2d');
      rawCtx.drawImage(img, 0, 0, origWidth, origHeight);

      // 1. Find the real table's content box FIRST, on the untouched
      // pixels -- a tall phone screenshot (portal chrome above, a table
      // in the middle, blank space below) wastes most of its height on
      // margins. Cropping to content before deciding how much to scale
      // means the resize budget goes to the table itself, not to
      // whitespace around it.
      const origData = rawCtx.getImageData(0, 0, origWidth, origHeight);
      const od = origData.data;
      const darkThreshold = 180;

      const rowHasContent = (y) => {
        let darks = 0;
        for (let x = 0; x < origWidth; x += 2) {
          const i = (y * origWidth + x) * 4;
          const gray = 0.299 * od[i] + 0.587 * od[i + 1] + 0.114 * od[i + 2];
          if (gray < darkThreshold) darks++;
        }
        return darks > origWidth * 0.01;
      };
      const colHasContent = (x, top, bottom) => {
        let darks = 0;
        for (let y = top; y <= bottom; y += 2) {
          const i = (y * origWidth + x) * 4;
          const gray = 0.299 * od[i] + 0.587 * od[i + 1] + 0.114 * od[i + 2];
          if (gray < darkThreshold) darks++;
        }
        return darks > (bottom - top) * 0.01;
      };

      let top = 0, bottom = origHeight - 1, left = 0, right = origWidth - 1;
      for (let y = 0; y < origHeight; y++) { if (rowHasContent(y)) { top = y; break; } }
      for (let y = origHeight - 1; y >= top; y--) { if (rowHasContent(y)) { bottom = y; break; } }
      for (let x = 0; x < origWidth; x++) { if (colHasContent(x, top, bottom)) { left = x; break; } }
      for (let x = origWidth - 1; x >= left; x--) { if (colHasContent(x, top, bottom)) { right = x; break; } }

      const pad = 20;
      top = Math.max(0, top - pad);
      bottom = Math.min(origHeight - 1, bottom + pad);
      left = Math.max(0, left - pad);
      right = Math.min(origWidth - 1, right + pad);

      const cropW = Math.max(10, right - left + 1);
      const cropH = Math.max(10, bottom - top + 1);

      // 2. Decide target size from the CROPPED content's own dimensions,
      // not the full (often mostly-blank) screenshot -- this is what
      // stops a tall portrait screenshot's table from being needlessly
      // shrunk just because the overall image is tall.
      let width = cropW;
      let height = cropH;

      const TARGET_MIN_WIDTH = 1300;
      if (width < TARGET_MIN_WIDTH) {
        const scale = Math.min(2.0, TARGET_MIN_WIDTH / width);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Raised from the timetable pipeline's 1800px cap: a dense ERP
      // attendance table packs 6-9 narrow numeric columns into the same
      // width a day/time timetable grid gives just a handful of cells,
      // so those columns need more pixels per character to stay legible.
      const MAX_DIM = 2600;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(rawCanvas, left, top, cropW, cropH, 0, 0, width, height);

      rawCanvas.width = 1;
      rawCanvas.height = 1;

      // 3. Grayscale & contrast. A clean digital screenshot (ERP portal,
      // not a photo of a printed sheet) already has near-black text on a
      // near-white background -- the aggressive S-curve boost tuned for
      // washed-out real photos was measurably corrupting that already-
      // crisp anti-aliasing instead of helping it, so it's applied only
      // when the source doesn't already have strong native contrast.
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      let minL = 255, maxL = 0;
      const grayValues = new Uint8ClampedArray(data.length / 4);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        grayValues[j] = gray;
        if (gray < minL) minL = gray;
        if (gray > maxL) maxL = gray;
      }

      const nativeRange = maxL - minL;
      const range = Math.max(1, nativeRange);
      const isAlreadyHighContrast = nativeRange > 200;

      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const normalized = Math.min(255, Math.max(0, Math.round(((grayValues[j] - minL) / range) * 255)));
        let out;
        if (isAlreadyHighContrast) {
          out = normalized;
        } else {
          out = normalized < 130
            ? Math.round(Math.pow(normalized / 130, 1.35) * 115)
            : Math.min(255, Math.round(115 + Math.pow((normalized - 130) / 125, 0.75) * 140));
        }
        data[i] = out;
        data[i + 1] = out;
        data[i + 2] = out;
      }

      ctx.putImageData(imageData, 0, 0);

      // Lossless PNG for OCR, same fix and reason as preprocessImageForOCR
      // (v158): toDataURL(mimeType, 0.92) re-compressed every JPEG upload
      // (phone photos, WhatsApp-forwarded screenshots) right after the
      // contrast/sharpen pass, blurring small table text before Tesseract
      // read it. The vision-AI upload is re-encoded back to the original
      // format by the caller, so that payload is unchanged.
      const resultDataUrl = canvas.toDataURL('image/png');
      canvas.width = 1;
      canvas.height = 1;

      resolve(resultDataUrl);
    };
    img.onerror = () => reject(new Error('Failed to load image for attendance preprocessing'));
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
}

async function handleAttendancePhotoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (deps._isOcrBusy) {
    showToast('An OCR scan is already in progress. Please wait a moment.', 'info');
    return;
  }

  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file (PNG, JPG, WEBP, etc.)');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    alert('Image is too large (max 12 MB). Please compress or crop it first.');
    return;
  }

  deps._isOcrBusy = true;
  _isAttendanceScanCanceled = false;
  const currentScanId = ++_currentAttendanceScanId;

  showAttendanceScanLoadingModal('Scanning attendance…');

  const reader = new FileReader();
  reader.onload = async (e) => {
    let mimeType, base64Data;
    try {
      const resultUrl = e.target.result;
      mimeType = resultUrl.split(';')[0].split(':')[1] || 'image/jpeg';
      base64Data = resultUrl.split(',')[1];
    } catch {
      deps._isOcrBusy = false;
      hideAttendanceScanLoadingModal();
      showAttendanceScanErrorModal('Could not read image file. Please try another photo.');
      return;
    }

    try {
      if (_isAttendanceScanCanceled || currentScanId !== _currentAttendanceScanId) return;

      // A blurry or tiny photo gets a chance to be retaken before it is read.
      if (!(await confirmScanPhotoQuality(e.target.result, triggerAttendancePhotoScan))) {
        deps._isOcrBusy = false;
        hideAttendanceScanLoadingModal();
        return;
      }
      if (_isAttendanceScanCanceled || currentScanId !== _currentAttendanceScanId) return;

      updateAttendanceScanLoadingMessage('Preprocessing image (contrast normalization, table crop)…');
      const preprocessedDataUrl = await preprocessAttendanceImageForOCR(base64Data, mimeType);

      if (_isAttendanceScanCanceled || currentScanId !== _currentAttendanceScanId) return;

      updateAttendanceScanLoadingMessage('Running local OCR in background worker…');
      const worker = await getTesseractWorker();
      const ocrResult = await worker.recognize(preprocessedDataUrl);

      if (_isAttendanceScanCanceled || currentScanId !== _currentAttendanceScanId) return;

      updateAttendanceScanLoadingMessage('Reconstructing table columns and mapping attendance counts…');
      const visionDataUrl = await reencodeDataUrl(preprocessedDataUrl, mimeType, 0.92);
      const extractedRows = await extractAttendanceRowsFromOCR(ocrResult?.data, visionDataUrl.split(',')[1], mimeType);

      deps._isOcrBusy = false;
      hideAttendanceScanLoadingModal();
      document.getElementById('baseline-modal-backdrop')?.remove();

      if (_isAttendanceScanCanceled || currentScanId !== _currentAttendanceScanId) return;

      if (!extractedRows || extractedRows.length === 0) {
        showAttendanceScanErrorModal('We couldn’t read this screenshot clearly. You can still enter your counts manually.');
        return;
      }

      showAttendanceScanReviewModal(flagAttendanceRowsThatWentBack(extractedRows, loadAttendanceBaselines()));
    } catch (err) {
      deps._isOcrBusy = false;
      console.error('[AttendancePhotoScan] Scan error:', err);
      hideAttendanceScanLoadingModal();
      if (!_isAttendanceScanCanceled) {
        showAttendanceScanErrorModal('We couldn’t read this screenshot clearly. You can still enter your counts manually.');
      }
    }
  };
  reader.readAsDataURL(file);
}

async function extractAttendanceRowsFromOCR(ocrData, base64Data, mimeType) {
  const existingSubjects = getSubjectList();
  const rawOcrText = typeof ocrData === 'string' ? ocrData : (ocrData?.text || '');

  // 1. Vision-AI extraction is the PRIMARY path whenever any provider is
  // configured. A confidence gate on the local geometric parser (below)
  // was tried first and turned out untrustworthy on real ERP screenshots:
  // it kept reporting "confident" (few isUncertain rows) even when the
  // subject names it produced were badly OCR-garbled -- e.g. a course CODE
  // like "MGM56VEL102" corrupted into "MGMSEVELID2" and saved as if it
  // were the subject name, littering the student's subject list with junk
  // cards. Sending the actual photo to a vision model, same as the
  // timetable scanner, reads the real table instead of guessing from
  // Tesseract's flat, error-prone word positions.
  const hasGroqKey = AIService.hasProvider('groq');
  const hasGeminiKey = AIService.hasProvider('gemini');
  const hasOpenRouterKey = AIService.hasProvider('openrouter');

  if (hasGroqKey || hasGeminiKey || hasOpenRouterKey) {
    const visionRows = await extractAttendanceRowsViaVision(base64Data, mimeType, rawOcrText, existingSubjects);
    if (visionRows) return visionRows;
  }

  // 2. Fallback (no AI provider configured, or every configured one
  // failed/errored): local geometric table reconstruction from Tesseract's
  // word positions. Less reliable than vision AI (see above) but keeps the
  // scanner working fully offline.
  let geometricResult = [];
  if (ocrData && typeof ocrData === 'object' && Array.isArray(ocrData.words) && ocrData.words.length > 0) {
    try {
      geometricResult = reconstructAttendanceTableFromGrid(ocrData, existingSubjects);
      console.log(`[AttendanceGeometricOCR] Extracted ${geometricResult.length} rows via bounding-box geometry.`);
    } catch (geoErr) {
      console.warn('[AttendanceGeometricOCR] Geometric parse error, falling back to text regex:', geoErr);
    }
  }
  if (geometricResult.length > 0) return geometricResult;

  // 3. Last resort: deterministic regex-based text table parser (100% offline)
  return parseAttendanceFromText(rawOcrText, existingSubjects);
}

async function extractAttendanceRowsViaVision(base64Data, mimeType, rawOcrText, existingSubjects) {
  // Reuses extractStructuredFromImage's existing {"schedule":[...]} JSON
  // contract (built for the timetable scanner) instead of adding a second
  // AI-plumbing path -- "schedule" here just holds attendance rows.
  const visionPrompt = `Extract all course attendance records from this college ERP attendance report screenshot.
Return JSON matching this exact structure:
{
  "schedule": [
    {
      "subject": "Data Structures",
      "code": "AID21PCL202",
      "present": 10,
      "absent": 8,
      "leave": 0,
      "notEntered": 0,
      "totalSessions": 60,
      "totalCount": 18,
      "percentage": 55.56,
      "isUncertain": false
    }
  ]
}
Rules:
1. One row per course, in the same top-to-bottom order as the table.
2. Course names and faculty names sometimes wrap onto two lines in the
   photo (e.g. "Business Management and Financial" / "Accounting" is ONE
   course, not two) -- join wrapped lines back into a single "subject"
   value, never split one course into two rows.
3. Extract the present count, absent count, "Leaves Applied" as leave, and
   "Attendance Not Entered" as notEntered -- read the actual printed
   numbers; do not compute them from the percentage column.
4. Two different "total" columns: "Total Sessions" (sessions planned for
   the term, often 30 or 60) goes in totalSessions; "Total Count" (sessions
   held so far) goes in totalCount. Never put one in the other's place.
   present + absent + leave + notEntered should equal totalCount; if it
   doesn't add up, or a number is genuinely illegible, set isUncertain: true.
5. Skip a totals/summary row at the bottom of the table -- it isn't a course.
   If the table prints an attendance percentage per course, copy it into
   "percentage" exactly as printed; if there is no percentage, use null.
6. "subject" must be the actual course NAME printed in the table, never a
   course code -- if a name is genuinely unreadable, still read the code
   into "code" and leave "subject" as your best plain-language guess at the
   name rather than copying or mangling the code into the subject field.

Rough OCR text from a first pass (may be inaccurate, garbled, or have
columns out of order -- treat the image as the primary source of truth):
${rawOcrText}`;

  try {
    let provider = '';
    let aiResult = await AIService.extractStructuredFromImage(base64Data, mimeType, visionPrompt,
      name => { provider = name; updateAttendanceScanLoadingMessage(`Reading the screenshot with AI (${name})…`); });
    // Second opinion: when a row's four counts don't add up to the printed
    // Total Count, the first answer misread something. Ask the next provider
    // and keep whichever answer has fewer such rows (never one with fewer
    // courses). Rows still off are flagged for review either way.
    const firstMisses = aiResult && Array.isArray(aiResult.schedule) ? attendanceTotalsMisses(aiResult.schedule) : 0;
    if (firstMisses > 0 && provider) {
      try {
        const second = await AIService.extractStructuredFromImage(base64Data, mimeType, visionPrompt,
          name => updateAttendanceScanLoadingMessage(`Some totals don't add up. Double-checking with another AI (${name})…`), [provider]);
        if (second && Array.isArray(second.schedule) && second.schedule.length >= aiResult.schedule.length
          && attendanceTotalsMisses(second.schedule) < firstMisses) aiResult = second;
      } catch (_) { /* keep the first answer */ }
    }
    if (aiResult && Array.isArray(aiResult.schedule) && aiResult.schedule.length > 0) {
      const rows = aiResult.schedule.map(r => matchScannedRowToSubjects(r, existingSubjects));
      return flagAttendanceScanRows(rows, aiResult.schedule);
    }
  } catch (aiErr) {
    console.warn('[AttendancePhotoScan] Vision AI extraction failed, falling back to local OCR:', aiErr);
  }
  return null;
}

// Rows whose present + absent + leave + notEntered isn't the printed Total
// Count (same check as countsDisagree in matchScannedRowToSubjects).
function attendanceTotalsMisses(schedule) {
  const n = v => Math.max(0, parseInt(v) || 0);
  return schedule.filter(r => {
    const total = parseInt(r && r.totalCount);
    return Number.isFinite(total) && total > 0 && n(r.present) + n(r.absent) + n(r.leave) + n(r.notEntered) !== total;
  }).length;
}

function extractNumericZoneTokens(words) {
  const numTokens = [];
  let pctVal = null;
  words.forEach(w => {
    const cleanedRaw = (w.text || '').trim();
    const isPctSign = cleanedRaw.includes('%');
    const numCandidate = cleanedRaw
      .replace(/[%]/g, '')
      .replace(/^[OoQD]$/, '0')
      .replace(/^[lI|i]$/, '1')
      .replace(/^[Ss]$/, '5')
      .replace(/^[Bb]$/, '8');
    if (/^\d+(\.\d+)?$/.test(numCandidate)) {
      const val = parseFloat(numCandidate);
      numTokens.push(val);
      // An exact-two-decimal value (12.34) is this portal's percentage-column
      // format far more reliably than a literal '%' sign, which OCR commonly
      // drops (or, worse, hallucinates onto an unrelated garbled digit --
      // seen for real on one row where "25" the Total-Sessions count OCR'd
      // as "2%"). Prefer that signal; fall back to a literal '%' hit only if
      // no X.XX-shaped token exists at all.
      if (/^\d{1,3}\.\d{2}$/.test(numCandidate)) pctVal = val;
      else if (isPctSign && pctVal == null) pctVal = val;
    }
  });
  return { numTokens, pctVal };
}

function reconstructAttendanceTableFromGrid(ocrData, existingSubjects = []) {
  if (!ocrData || !Array.isArray(ocrData.words) || ocrData.words.length === 0) return [];

  const words = ocrData.words.map(w => ({
    text: (w.text || '').trim(),
    bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
    conf: w.confidence || 0,
    cx: ((w.bbox?.x0 || 0) + (w.bbox?.x1 || 0)) / 2,
    cy: ((w.bbox?.y0 || 0) + (w.bbox?.y1 || 0)) / 2
  })).filter(w => w.text.length > 0);

  const lines = groupWordsIntoLines(words, 0.42);

  // Find the header's START line. A single physical line's keyword count
  // isn't always enough on its own -- a badly-OCR'd header can lose all
  // but 2 of its column labels to the same wrapping/garbling that affects
  // body cells, so also credit keywords from the next couple of lines.
  // The first line itself must still carry at least 2 matches so a nav
  // bar/tab strip ("Courses Schedule Marks...") a line or two above the
  // real header can't be mistaken for it just because the real header
  // happens to fall inside its lookahead window.
  const headerKeywords = ['course', 'subject', 'present', 'absent', 'leave', 'attended', 'total', 'percent', '%', 'entered', 'status', 'sessions', 'faculty', 'code', 'sr.'];
  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const firstLineText = lines[i].map(w => w.text.toLowerCase()).join(' ');
    const firstLineMatches = headerKeywords.filter(kw => firstLineText.includes(kw)).length;
    if (firstLineMatches < 2) continue;
    const windowText = lines.slice(i, i + 3).map(l => l.map(w => w.text.toLowerCase()).join(' ')).join(' ');
    const windowMatches = headerKeywords.filter(kw => windowText.includes(kw)).length;
    if (windowMatches >= 3) { headerLineIndex = i; break; }
  }
  if (headerLineIndex === -1) return [];

  // The header itself commonly wraps across 2-3 physical lines, exactly
  // like a body cell does ("Total" / "Sessions", "Attendance" / "Not" /
  // "Entered") -- absorb those continuation lines into the header word
  // pool too. A continuation line is recognisable because it consists
  // entirely of short, purely-alphabetic generic column words; a real
  // data row never looks like that (it always carries a code, a number,
  // or a proper name).
  const CONTINUATION_VOCAB = new Set(['count', 'applied', 'entered', 'sessions', 'percentage', 'status', 'not', 'name']);
  let headerEndIndex = headerLineIndex;
  for (let i = headerLineIndex + 1; i < Math.min(lines.length, headerLineIndex + 3); i++) {
    const line = lines[i];
    const hasDigits = line.some(w => /\d/.test(w.text));
    const allShort = line.every(w => w.text.replace(/[^a-zA-Z]/g, '').length <= 14);
    const vocabHits = line.filter(w => CONTINUATION_VOCAB.has(w.text.toLowerCase().replace(/[^a-z]/g, ''))).length;
    const isContinuation = !hasDigits && allShort && vocabHits >= Math.ceil(line.length / 2);
    if (isContinuation) { headerEndIndex = i; } else { break; }
  }

  // Merge all header-region words and re-sort purely by X position
  // (ignoring which physical line each came from) -- a phrase like
  // "Total" / "Sessions" that wraps across lines shares nearly the same
  // x-range, so pure-X order reconstructs it as adjacent tokens the same
  // way extractColumnIntervalsFromHeader already expects for a single
  // physical header line.
  const headerWords = [];
  for (let i = headerLineIndex; i <= headerEndIndex; i++) headerWords.push(...lines[i]);
  headerWords.sort((a, b) => a.bbox.x0 - b.bbox.x0);

  const intervals = extractColumnIntervalsFromHeader(headerWords);
  if (!intervals || intervals.length < 3) return [];

  const bodyLines = lines.slice(headerEndIndex + 1);

  const isSummaryLine = (line) => {
    const fullText = line.map(w => w.text).join(' ');
    return /^(total|overall|aggregate|grand\s*total)\b/i.test(fullText) ||
      (line.length <= 7 && line.every(w => /^\d+(\.\d+)?%?$/.test(w.text)));
  };

  const ANCHOR_TYPES = new Set(['present', 'absent', 'leave', 'notEntered', 'total', 'percentage']);
  const anchorIntervals = intervals.filter(iv => ANCHOR_TYPES.has(iv.type));
  const looksNumericish = (text) => /\d/.test(text) || /^[OoQDlI|iZz?EeAhSs$§Gb\/Bb&gq.,%]+$/.test(text);

  // Fallback for when the header's numeric-column labels ("Present
  // Count", "Absent Count", ...) OCR'd too poorly to identify even one of
  // them individually (common: these are the smallest, most tightly
  // packed header cells). Rather than give up, treat everything to the
  // right of the last column we COULD identify (name/faculty/sessions)
  // as "the numeric zone" -- a line with several numeric-looking tokens
  // out there is still a reliable row anchor even without knowing which
  // specific column each number belongs to (parseRowUsingMathematicalSolver
  // resolves that ambiguity itself via arithmetic balance, not position).
  const numericZoneStartX = anchorIntervals.length
    ? null
    : Math.max(...intervals.map(iv => iv.x1));

  const isAnchorLine = (line) => {
    if (anchorIntervals.length) {
      return line.some(w => {
        const inAnchorCol = anchorIntervals.some(iv => w.cx >= iv.minX && w.cx < iv.maxX);
        return inAnchorCol && looksNumericish(w.text);
      });
    }
    if (numericZoneStartX == null) return false;
    const numericZoneWords = line.filter(w => w.cx > numericZoneStartX && looksNumericish(w.text));
    return numericZoneWords.length >= 3;
  };

  const summaryFlags = bodyLines.map(isSummaryLine);
  const anchorIdx = [];
  bodyLines.forEach((line, i) => { if (!summaryFlags[i] && isAnchorLine(line)) anchorIdx.push(i); });
  if (anchorIdx.length === 0) return [];

  const lineCenterY = (line) => line.reduce((s, w) => s + w.cy, 0) / line.length;
  const rawCenters = anchorIdx.map(i => lineCenterY(bodyLines[i]));
  const gaps = [];
  for (let k = 1; k < rawCenters.length; k++) gaps.push(rawCenters[k] - rawCenters[k - 1]);
  const medianGap = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0;

  const mergedAnchorIdx = [];
  anchorIdx.forEach((idx, k) => {
    if (k > 0 && medianGap > 0 && (rawCenters[k] - rawCenters[k - 1]) < medianGap * 0.4) return;
    mergedAnchorIdx.push(idx);
  });

  const anchorCenters = mergedAnchorIdx.map(i => lineCenterY(bodyLines[i]));
  const rowBands = mergedAnchorIdx.map((_, k) => ({
    top: k > 0 ? (anchorCenters[k - 1] + anchorCenters[k]) / 2 : -Infinity,
    bottom: k < mergedAnchorIdx.length - 1 ? (anchorCenters[k] + anchorCenters[k + 1]) / 2 : Infinity,
    words: []
  }));

  const findBand = (cy) => {
    for (const band of rowBands) if (cy >= band.top && cy < band.bottom) return band;
    let best = rowBands[0], bestDist = Infinity;
    rowBands.forEach((band, k) => { const d = Math.abs(cy - anchorCenters[k]); if (d < bestDist) { bestDist = d; best = band; } });
    return best;
  };

  bodyLines.forEach((line, i) => {
    if (summaryFlags[i]) return;
    line.forEach(w => findBand(w.cy).words.push(w));
  });

  // When no anchor-type column could be identified at all (the header's
  // numeric labels OCR'd too poorly to recognise even one), the solver
  // must not be handed the WHOLE row -- that would include the Total
  // Sessions value and any leftover code/faculty fragments as candidate
  // numbers, giving the arithmetic balance search too much noise to
  // reliably land on the right combination. Excluding words that fall
  // inside a column we DID manage to identify (name/code/sessions/
  // faculty) leaves just the genuine attendance-count zone.
  // Use each identified column's own header-label extent (x1), not its
  // bucketing maxX -- the rightmost identified column's maxX is
  // Infinity (nothing detected further right to bound it against), which
  // would otherwise swallow the entire, unidentified numeric zone as if
  // it were still part of that last column.
  const isInKnownColumn = (w) => intervals.some(iv => w.cx >= iv.minX && w.cx <= iv.x1 + 30);

  const candidateRows = [];
  rowBands.forEach(band => {
    const rowWords = [...band.words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    let parsedRow = parseRowWithIntervals(rowWords, intervals);
    const hasNumericData = parsedRow && (parsedRow.present > 0 || parsedRow.absent > 0 || parsedRow.leave > 0 || parsedRow.notEntered > 0);
    const solverInputWords = anchorIntervals.length ? rowWords : rowWords.filter(w => !isInKnownColumn(w));

    if (!parsedRow || !parsedRow.subject) {
      parsedRow = parseRowUsingMathematicalSolver(solverInputWords);
    } else if (!hasNumericData) {
      // The interval-based parse found a subject/code fine but its
      // present/absent/leave/notEntered buckets came back empty -- this
      // happens when the header's numeric-column labels themselves OCR'd
      // too poorly to identify (garbled "Present Count"/"Absent Count"/
      // etc). Fall back to the arithmetic balance solver, which doesn't
      // need column identity at all: it just finds which of the row's
      // numbers add up to Present+Absent+Leave+NotEntered=Total.
      //
      // The two cases below need genuinely different treatment, because
      // solverInputWords means something different in each:
      if (anchorIntervals.length) {
        // At least one anchor-type column (e.g. percentage) WAS identified,
        // so solverInputWords is the row's FULL, unfiltered word list --
        // name/faculty text plus, commonly, the row's own Total-Sessions
        // count sitting BEFORE Present/Absent/Leave/NotEntered (verified
        // against real rows: "PCL202 Data Structures 60 Jayeshkumar 12 9 0
        // 0 ... 57.14" -- the "60" is Total Sessions, not part of the
        // attendance tally). That's exactly the pattern
        // parseRowUsingMathematicalSolver's own "skip a serial number /
        // skip a 30-45-60-90 planned-session-count" heuristic exists for,
        // and it's verified correct here (its guessed Present/Absent
        // matched an independent Present/(Present+Absent)=Percentage
        // cross-check on real data) -- so keep using it unchanged.
        const solved = parseRowUsingMathematicalSolver(solverInputWords);
        if (solved) {
          parsedRow = { ...parsedRow, present: solved.present, absent: solved.absent, leave: solved.leave, notEntered: solved.notEntered, isUncertain: parsedRow.isUncertain && solved.isUncertain };
        }
      } else {
        // NO anchor-type column was identified at all, so solverInputWords
        // has already had name/sessions/faculty excluded (isInKnownColumn,
        // above) -- there is no leading serial-number or sessions-count
        // prefix left to skip. Here parseRowUsingMathematicalSolver's
        // offset-guessing fallback tier instead misreads the row's OWN
        // Total/Percentage values as Leave/NotEntered (verified against 3
        // real garbled rows in a Sem I screenshot: it confidently -- at
        // confidence exactly 75 -- returned the Total-Sessions and
        // Percentage numbers as if they belonged in those slots).
        //
        // Call solveAttendanceCounts directly instead, bypassing
        // parseRowUsingMathematicalSolver's `textTokens.length === 0`
        // guard (which exists for subject-extraction, irrelevant here
        // since solverInputWords is deliberately numeric-only and we
        // already have a subject) -- and only trust a genuine arithmetic-
        // balance match:
        //  1. confidence >= 92 excludes the 2-term tier (90) and the
        //     offset-guess tier (75, 60) that produced the wrong values
        //     above.
        //  2. At least two of present/absent/leave/notEntered must be
        //     non-zero. Two equal-but-zero slots (leave=notEntered=0 is
        //     the overwhelmingly common real case) are harmless to
        //     mis-swap -- both display as 0 either way. But when only ONE
        //     slot is non-zero (verified against a real row whose true
        //     values were Present=1/Absent=0/Leave=0/NotEntered=0), that
        //     lone value could validly sit in any of the four positions
        //     and still balance the same sum -- arithmetically "valid" but
        //     an arbitrary slot assignment. Two or more distinct non-zero
        //     values pins it down: verified empirically that the solver's
        //     ascending-index preference then lands on each value's true
        //     left-to-right reading-order slot.
        const { numTokens, pctVal } = extractNumericZoneTokens(solverInputWords);
        const solved = numTokens.length >= 2 ? solveAttendanceCounts(numTokens, pctVal) : null;
        const nonZeroCount = solved ? [solved.present, solved.absent, solved.leave, solved.notEntered].filter(v => v > 0).length : 0;
        if (solved && solved.confidence >= 92 && nonZeroCount >= 2) {
          parsedRow = { ...parsedRow, present: solved.present, absent: solved.absent, leave: solved.leave, notEntered: solved.notEntered, isUncertain: false };
        }
      }
    }
    if (parsedRow && (parsedRow.subject || parsedRow.code)) {
      candidateRows.push(matchScannedRowToSubjects(parsedRow, existingSubjects));
    }
  });

  const seen = new Set();
  const deduped = [];
  for (const r of candidateRows) {
    const key = (r.code || r.subject).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key && !seen.has(key)) { seen.add(key); deduped.push(r); }
  }
  return deduped;
}


function extractColumnIntervalsFromHeader(headerWords) {
  const colKeywords = [
    { type: 'sr', match: /^(sr\.?\s*no\.?|s\.?\s*no\.?|serial\s*no\.?|sl\.?\s*no\.?|sr|sno)$/i },
    { type: 'code', match: /^(course\s*code|sub(ject)?\s*code|paper\s*code)$/i },
    { type: 'name', match: /^(course\s*name|sub(ject)?\s*name|course\s*title|sub(ject)?\s*title)$/i },
    { type: 'sessions', match: /^(total\s*sessions|total\s*lectures|total\s*hours|conducted|sessions|held)$/i },
    { type: 'faculty', match: /^(faculty\s*name|teacher\s*name|instructor|faculty|teacher)$/i },
    { type: 'present', match: /^(present\s*count|attended|present|att)$/i },
    { type: 'absent', match: /^(absent\s*count|missed|absent|abs)$/i },
    { type: 'leave', match: /^(leaves?\s*applied|leaves?|od|medical)$/i },
    { type: 'notEntered', match: /^(attendance\s*not\s*entered|not\s*entered|pending)$/i },
    { type: 'total', match: /^(total\s*count|total\s*marked)$/i },
    { type: 'percentage', match: /^(percentage|percent|att\.?\s*%|%)$/i },

    // Single-word fallbacks
    { type: 'code', match: /^code$/i },
    { type: 'name', match: /^(course|subject|title)$/i },
    { type: 'total', match: /^total$/i }
  ];

  const detected = [];
  let i = 0;
  while (i < headerWords.length) {
    let matchedType = null;
    let endIdx = i + 1;

    // Check longer phrases first
    for (let len = 3; len >= 1; len--) {
      if (i + len <= headerWords.length) {
        const phrase = headerWords.slice(i, i + len).map(w => w.text).join(' ').trim();
        const m = colKeywords.find(k => k.match.test(phrase));
        if (m && !detected.some(d => d.type === m.type)) {
          matchedType = m.type;
          endIdx = i + len;
          break;
        }
      }
    }

    if (matchedType) {
      const slice = headerWords.slice(i, endIdx);
      const x0 = Math.min(...slice.map(w => w.bbox.x0));
      const x1 = Math.max(...slice.map(w => w.bbox.x1));
      const cx = (x0 + x1) / 2;
      detected.push({ type: matchedType, x0, x1, cx });
      i = endIdx;
    } else {
      i++;
    }
  }

  detected.sort((a, b) => a.cx - b.cx);

  const intervals = [];
  for (let idx = 0; idx < detected.length; idx++) {
    const prev = detected[idx - 1];
    const curr = detected[idx];
    const next = detected[idx + 1];

    const minX = prev ? (prev.x1 + curr.x0) / 2 : 0;
    const maxX = next ? (curr.x1 + next.x0) / 2 : Infinity;

    intervals.push({
      type: curr.type,
      x0: curr.x0,
      x1: curr.x1,
      minX,
      maxX
    });
  }

  return intervals;
}

function parseColumnNumberToken(arr) {
  if (!arr || !arr.length) return 0;
  for (const token of arr) {
    if (!token) continue;
    let cleaned = String(token).trim()
      .replace(/[%₹$]/g, '')
      .replace(/(?<=\d)[OoQD](?=\d|$)/g, '0')
      .replace(/(?<=\d)[lI|i](?=\d|$)/g, '1')
      .replace(/^[OoQD@C]$/, '0')
      .replace(/^[lI|i!\]\[]$/, '1')
      .replace(/^[Zz?]$/, '2')
      .replace(/^[Ee]$/, '3')
      .replace(/^[Ah]$/, '4')
      .replace(/^[Ss$§]$/, '5')
      .replace(/^[Gb]$/, '6')
      .replace(/^[Tt/]$/, '7')
      .replace(/^[Bb&]$/, '8')
      .replace(/^[gq]$/, '9')
      .trim();

    const m = cleaned.match(/\b\d+(\.\d+)?\b/);
    if (m) {
      const n = parseFloat(m[0]);
      if (!isNaN(n) && n >= 0) return Math.round(n);
    }
  }
  return 0;
}

function solveAttendanceCounts(numTokens, pctToken = null) {
  const nums = (numTokens || []).filter(n => typeof n === 'number' && !isNaN(n) && n >= 0);
  if (nums.length < 2) return null;

  // 1. Sort candidate totals descending (college attendance rows have total as the largest count)
  const candidateIndices = [...nums.keys()].sort((a, b) => nums[b] - nums[a]);

  // Try 4-term balance first (P + A + L + N == Total)
  for (const tIdx of candidateIndices) {
    const candidateTotal = nums[tIdx];
    if (candidateTotal < 1) continue;

    for (let pIdx = 0; pIdx < nums.length; pIdx++) {
      if (pIdx === tIdx) continue;
      for (let aIdx = 0; aIdx < nums.length; aIdx++) {
        if (aIdx === tIdx || aIdx === pIdx) continue;
        for (let lIdx = 0; lIdx < nums.length; lIdx++) {
          if (lIdx === tIdx || lIdx === pIdx || lIdx === aIdx) continue;
          for (let nIdx = 0; nIdx < nums.length; nIdx++) {
            if (nIdx === tIdx || nIdx === pIdx || nIdx === aIdx || nIdx === lIdx) continue;

            const p = nums[pIdx];
            const a = nums[aIdx];
            const l = nums[lIdx];
            const n = nums[nIdx];

            if (p + a + l + n === candidateTotal) {
              if (pctToken) {
                const expectedPct = (p / candidateTotal) * 100;
                if (Math.abs(expectedPct - pctToken) < 1.8) {
                  return { present: Math.round(p), absent: Math.round(a), leave: Math.round(l), notEntered: Math.round(n), total: Math.round(candidateTotal), confidence: 98 };
                }
              }
              return { present: Math.round(p), absent: Math.round(a), leave: Math.round(l), notEntered: Math.round(n), total: Math.round(candidateTotal), confidence: 95 };
            }
          }
        }
      }
    }
  }

  // Try 3-term balance (P + A + L == Total)
  for (const tIdx of candidateIndices) {
    const candidateTotal = nums[tIdx];
    if (candidateTotal < 1) continue;

    for (let pIdx = 0; pIdx < nums.length; pIdx++) {
      if (pIdx === tIdx) continue;
      for (let aIdx = 0; aIdx < nums.length; aIdx++) {
        if (aIdx === tIdx || aIdx === pIdx) continue;
        for (let lIdx = 0; lIdx < nums.length; lIdx++) {
          if (lIdx === tIdx || lIdx === pIdx || lIdx === aIdx) continue;

          const p = nums[pIdx];
          const a = nums[aIdx];
          const l = nums[lIdx];

          if (p + a + l === candidateTotal) {
            if (pctToken) {
              const expectedPct = (p / candidateTotal) * 100;
              if (Math.abs(expectedPct - pctToken) < 1.8) {
                return { present: Math.round(p), absent: Math.round(a), leave: Math.round(l), notEntered: 0, total: Math.round(candidateTotal), confidence: 98 };
              }
            }
            return { present: Math.round(p), absent: Math.round(a), leave: Math.round(l), notEntered: 0, total: Math.round(candidateTotal), confidence: 92 };
          }
        }
      }
    }
  }

  // Try 2-term balance (P + A == Total)
  for (const tIdx of candidateIndices) {
    const candidateTotal = nums[tIdx];
    if (candidateTotal < 1) continue;

    for (let pIdx = 0; pIdx < nums.length; pIdx++) {
      if (pIdx === tIdx) continue;
      for (let aIdx = 0; aIdx < nums.length; aIdx++) {
        if (aIdx === tIdx || aIdx === pIdx) continue;

        const p = nums[pIdx];
        const a = nums[aIdx];

        if (p + a === candidateTotal) {
          if (pctToken) {
            const expectedPct = (p / candidateTotal) * 100;
            if (Math.abs(expectedPct - pctToken) < 1.8) {
              return { present: Math.round(p), absent: Math.round(a), leave: 0, notEntered: 0, total: Math.round(candidateTotal), confidence: 98 };
            }
          }
          return { present: Math.round(p), absent: Math.round(a), leave: 0, notEntered: 0, total: Math.round(candidateTotal), confidence: 90 };
        }
      }
    }
  }

  // 2. Intelligent offset extraction skipping serial numbers and 30/45/60/90 planned session counts
  let offset = 0;
  if (nums[0] >= 1 && nums[0] <= 30 && Number.isInteger(nums[0]) && nums.length >= 3) {
    offset = 1;
  }
  if (nums[offset] === 30 || nums[offset] === 45 || nums[offset] === 60 || nums[offset] === 90) {
    offset++;
  }

  const remaining = nums.slice(offset);
  if (remaining.length >= 2) {
    const present = Math.round(remaining[0]);
    const absent = Math.round(remaining[1]);
    const leave = remaining.length >= 3 ? Math.round(remaining[2]) : 0;
    const notEntered = remaining.length >= 4 ? Math.round(remaining[3]) : 0;
    return { present, absent, leave, notEntered, total: present + absent + leave + notEntered, confidence: 75 };
  }

  return { present: Math.round(nums[0]), absent: Math.round(nums[1]), leave: 0, notEntered: 0, total: Math.round(nums[0] + nums[1]), confidence: 60 };
}

function cleanSubjectString(s, existingSubjects = []) {
  if (!s || typeof s !== 'string') return { subject: 'General Subject', code: '' };

  let text = s.trim();
  // Strip leading serial numbers (e.g. "1.", "02", "1 -")
  text = text.replace(/^\d+[\s.\-–)]+/, '');
  // Strip room and teacher tokens first before numbers are stripped
  text = text.replace(/\b(?:prof\.|dr\.|mr\.|ms\.|mrs\.|lh\s*[-–]?\s*\d+|lab\s*[-–]?\s*\d+|room\s*[-–]?\s*\d+)\b/gi, ' ');
  // Strip standalone numeric tokens from subject text
  text = text.replace(/\b\d+(\.\d+)?%?\b/g, ' ');
  // Strip portal table headers & metadata tokens
  text = text.replace(/\b(?:semester|sem|lecture|sessions|total|present|absent|leave|entered|percentage|percent|att|count|marked|held|conducted)\b/gi, ' ');

  // Pass through canonical normalization layer
  const norm = normalizeSubjectIdentity(text, existingSubjects);
  return {
    subject: norm.canonicalName || 'General Subject',
    code: norm.canonicalCode || ''
  };
}

function parseRowWithIntervals(rowWords, intervals) {
  const buckets = {};
  intervals.forEach(inv => { buckets[inv.type] = []; });

  rowWords.forEach(w => {
    const cx = ((w.bbox?.x0 || 0) + (w.bbox?.x1 || 0)) / 2;
    const matched = intervals.find(inv => cx >= inv.minX && cx < inv.maxX);
    if (matched) {
      buckets[matched.type].push(w.text);
    }
  });

  const rawCode = (buckets.code || []).join('').trim();
  
  // Gather course name words from name bucket + any overflow text words in sessions before faculty column.
  // Overflow only ever means a wrapped course-name FRAGMENT ("Studio", "Lab") that
  // spilled rightward into the sessions column's x-range -- it must contain a letter.
  // A pure Total-Sessions digit with trailing OCR punctuation (e.g. "25;") is not text
  // overflow and must NOT be pulled into the name: doing so lets it sit adjacent to a
  // genuine "Lab" name-fragment and false-match ROOM_PATTERN's "Lab<number>" rule,
  // silently deleting both from the subject (e.g. "Python Programming Lab" -> "Python
  // Programming").
  const nameWords = [...(buckets.name || [])];
  (buckets.sessions || []).forEach(w => {
    if (/[a-zA-Z]/.test(w) && !/^(dr\.|mr\.|ms\.|mrs\.|prof\.)/i.test(w)) {
      nameWords.push(w);
    }
  });


  let rawName = nameWords.join(' ').trim();
  if (!rawName && rawCode) rawName = rawCode;

  const present = parseColumnNumberToken(buckets.present);
  const absent = parseColumnNumberToken(buckets.absent);
  const leave = parseColumnNumberToken(buckets.leave);
  const notEntered = parseColumnNumberToken(buckets.notEntered);
  const total = parseColumnNumberToken(buckets.total);
  const totalSessions = parseColumnNumberToken(buckets.sessions);

  const clean = cleanSubjectString(rawName);

  return {
    subject: clean.subject || rawCode || 'General Subject',
    code: clean.code || (rawCode && /^[A-Z0-9_-]+$/.test(rawCode) ? rawCode : ''),
    present,
    absent,
    leave,
    notEntered,
    totalSessions,
    totalCount: total,
    isUncertain: !clean.subject || (present + absent === 0)
  };
}

function parseRowUsingMathematicalSolver(rowWords) {
  const textTokens = [];
  const numTokens = [];
  let pctVal = null;

  rowWords.forEach(w => {
    const cleaned = w.text.trim();
    const isPct = cleaned.includes('%');
    const numCandidate = cleaned
      .replace(/[%]/g, '')
      .replace(/^[OoQD]$/, '0')
      .replace(/^[lI|i]$/, '1')
      .replace(/^[Ss]$/, '5')
      .replace(/^[Bb]$/, '8');

    if (/^\d+(\.\d+)?$/.test(numCandidate)) {
      const val = parseFloat(numCandidate);
      if (isPct) pctVal = val;
      numTokens.push(val);
    } else if (cleaned.length > 0 && !/^[.\-/,:;]+$/.test(cleaned)) {
      textTokens.push(cleaned);
    }
  });

  if (numTokens.length < 2 || textTokens.length === 0) return null;

  const cleanTexts = textTokens.filter(t => !/^(dr\.|mr\.|ms\.|mrs\.|prof\.)/i.test(t));
  const rawSubjectStr = cleanTexts.join(' ');
  const clean = cleanSubjectString(rawSubjectStr);

  const solved = solveAttendanceCounts(numTokens, pctVal);
  if (!solved) return null;

  return {
    subject: clean.subject || clean.code || 'General Subject',
    code: clean.code || '',
    present: solved.present,
    absent: solved.absent,
    leave: solved.leave,
    notEntered: solved.notEntered,
    totalSessions: 0,
    isUncertain: solved.confidence < 75 || !clean.subject || (solved.present + solved.absent === 0)
  };
}

function parseAttendanceFromText(rawText, existingSubjects = []) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^(sr\.?\s*no|course\s*code|course\s*name|total\s*sessions|present\s*count|overall|aggregate|grand\s*total)\b/i.test(line)) {
      continue;
    }

    const numTokens = [];
    let pctVal = null;
    const numRegex = /\b\d+(\.\d+)?%?\b/g;
    let match;
    while ((match = numRegex.exec(line)) !== null) {
      const isPct = match[0].includes('%');
      const cleaned = match[0].replace('%', '');
      const val = parseFloat(cleaned);
      if (!isNaN(val)) {
        if (isPct) pctVal = val;
        numTokens.push(val);
      }
    }

    if (numTokens.length < 2) continue;

    const clean = cleanSubjectString(line, existingSubjects);
    const solved = solveAttendanceCounts(numTokens, pctVal);
    if (!solved) continue;

    const rawRow = {
      subject: clean.subject || clean.code || 'General Subject',
      code: clean.code || '',
      present: solved.present,
      absent: solved.absent,
      leave: solved.leave,
      notEntered: solved.notEntered,
      totalSessions: 0,
      isUncertain: solved.confidence < 75 || !clean.subject || (solved.present + solved.absent === 0)
    };

    const matched = matchScannedRowToSubjects(rawRow, existingSubjects);
    rows.push(matched);
  }

  return rows;
}

function matchScannedRowToSubjects(rawRow, existingSubjects = []) {
  const rawName = (rawRow.subject || '').trim();
  const rawCode = (rawRow.code || '').trim();

  // 1. Run raw text through canonical normalizer
  const norm = normalizeSubjectIdentity(rawName, existingSubjects);
  // "Laboratory" counts as a lab too: ERPs print the full word, and without
  // it a lab row matched the theory course of the same name.
  const isLab = norm.isLab || /\blab(oratory)?\b/i.test(rawName) || rawCode.endsWith('-LAB');
  const targetName = norm.canonicalName || rawName;
  const targetCode = norm.canonicalCode || rawCode;

  const cleanTargetName = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanTargetCode = targetCode.toLowerCase().replace(/[^a-z0-9]/g, '');

  let bestMatch = null;

  // 2. Exact code match (preserving theory vs lab distinction)
  if (cleanTargetCode) {
    for (const s of existingSubjects) {
      const sCode = (s.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const sIsLab = s.type === 'lab' || /\blab\b/i.test(s.name);
      if (sCode && cleanTargetCode === sCode && sIsLab === isLab) {
        bestMatch = s;
        break;
      }
    }
  }

  // 3. Exact name match (preserving theory vs lab distinction)
  if (!bestMatch && cleanTargetName) {
    for (const s of existingSubjects) {
      const sName = (s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const sIsLab = s.type === 'lab' || /\blab\b/i.test(s.name);
      if (sName && cleanTargetName === sName && sIsLab === isLab) {
        bestMatch = s;
        break;
      }
    }
  }

  // 4. Substring name match (longest name match first)
  if (!bestMatch && cleanTargetName) {
    const sortedSubjects = [...existingSubjects].sort((a, b) => (b.name || '').length - (a.name || '').length);
    for (const s of sortedSubjects) {
      const sName = (s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const sIsLab = s.type === 'lab' || /\blab\b/i.test(s.name);
      if (sName && sName.length >= 4 && sIsLab === isLab && (cleanTargetName.includes(sName) || sName.includes(cleanTargetName))) {
        bestMatch = s;
        break;
      }
    }
  }

  // 5. Word token code match
  if (!bestMatch && rawName) {
    const tokens = rawName.toUpperCase().split(/[^A-Z0-9_-]+/);
    for (const s of existingSubjects) {
      const sCodeUpper = (s.code || '').toUpperCase();
      const sIsLab = s.type === 'lab' || /\blab\b/i.test(s.name);
      if (sCodeUpper && sCodeUpper.length >= 2 && tokens.includes(sCodeUpper) && sIsLab === isLab) {
        bestMatch = s;
        break;
      }
    }
  }

  // With no saved subject to match (a new student scanning attendance
  // first), the normalizer strips "Laboratory" from a lab course's name, so
  // the theory course and its lab came out with the same name and could be
  // saved as one subject. Keep the lab visibly a lab.
  const unmatchedName = (isLab && targetName && !/\blab(oratory)?\b/i.test(targetName)) ? `${targetName} Lab` : targetName;
  const finalSubject = bestMatch ? bestMatch.name : (unmatchedName || 'General Subject');
  const finalCode = bestMatch ? bestMatch.code : targetCode;
  const isSubjectValid = finalSubject && finalSubject !== 'General Subject' && finalSubject.length >= 3;

  const present = Math.max(0, parseInt(rawRow.present) || 0);
  const absent = Math.max(0, parseInt(rawRow.absent) || 0);
  const leave = Math.max(0, parseInt(rawRow.leave) || 0);
  const notEntered = Math.max(0, parseInt(rawRow.notEntered) || 0);
  // The ERP prints a "Total Count" that must equal the four counts added
  // up. The scan's own reading of it is not saved -- it's only a check: a
  // mismatch means a number (or a whole row) was misread, e.g. one course
  // picking up the next course's counts.
  const printedTotal = parseInt(rawRow.totalCount);
  const countsDisagree = Number.isFinite(printedTotal) && printedTotal > 0 && present + absent + leave + notEntered !== printedTotal;
  // Second check: the printed percentage. A misread count can still add up
  // to the printed total (seen on a blurry photo: Absent 3 read as 2 and
  // Not Entered 0 read as 1), but it won't reproduce the percentage.
  // Portals compute it either from present+absent or from every session
  // held, so it passes if either way matches within 1 point.
  const printedPct = parseFloat(rawRow.percentage);
  const pctOf = (den) => den > 0 ? (present / den) * 100 : null;
  const pctCandidates = [pctOf(present + absent), pctOf(present + absent + leave + notEntered)].filter(v => v !== null);
  const pctDisagree = Number.isFinite(printedPct) && printedPct >= 0 && printedPct <= 100 && pctCandidates.length > 0
    && pctCandidates.every(v => Math.abs(v - printedPct) > 1);

  return {
    subject: finalSubject,
    code: finalCode,
    present,
    absent,
    leave,
    notEntered,
    totalSessions: Math.max(0, parseInt(rawRow.totalSessions) || 0),
    // (parsed numbers here: the AI can return "0"/"0" as text, and
    // "0" + "0" === 0 is false, so a 0/0 row slipped through unflagged)
    isUncertain: !isSubjectValid || (present + absent === 0) || countsDisagree || pctDisagree || !!rawRow.isUncertain
  };
}

// Table-wide checks on AI-read attendance rows (rows[i] came from raw[i]).
// Both catch misreads that still look self-consistent row by row, so the
// student sees them highlighted in review instead of saving wrong counts.
function flagAttendanceScanRows(rows, raw = []) {
  // 1. The same course read twice: flag both copies. Keyed by course code
  //    when there is one -- a theory course and its lab share a name once
  //    "Laboratory" is normalized away, but never share a code.
  const keyOf = r => String(r.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    || 'name:' + String(r.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
  const seen = new Map();
  rows.forEach(r => { const k = keyOf(r); if (k) seen.set(k, (seen.get(k) || 0) + 1); });
  rows.forEach(r => { if (seen.get(keyOf(r)) > 1) r.isUncertain = true; });

  // 2. A portal computes its percentage one way for every row: present out
  //    of present+absent, or out of every session held. Work out which from
  //    the rows that fit only one formula, then hold every row to it. A row
  //    check alone can't do this: Absent 3 misread as 2 and Not Entered 0
  //    as 1 still matches the "every session" formula by coincidence.
  const fits = rows.map((r, i) => {
    const pct = parseFloat((raw[i] || {}).percentage);
    if (!Number.isFinite(pct)) return null;
    const a = r.present + r.absent, b = a + r.leave + r.notEntered;
    return { pa: a > 0 && Math.abs((r.present / a) * 100 - pct) <= 1, all: b > 0 && Math.abs((r.present / b) * 100 - pct) <= 1 };
  });
  const onlyPA = fits.filter(f => f && f.pa && !f.all).length;
  const onlyAll = fits.filter(f => f && f.all && !f.pa).length;
  const formula = onlyPA > onlyAll ? 'pa' : onlyAll > onlyPA ? 'all' : null;
  if (formula) rows.forEach((r, i) => { if (fits[i] && !fits[i][formula]) r.isUncertain = true; });
  return rows;
}

// Counts only go up during a term: a subject whose present count or
// classes held (present + absent + leave + not entered) is lower than what
// was last saved was almost certainly misread, so it's marked for review.
// When most subjects went down it's a new term (counts reset), not a
// misread, and nothing is flagged. Flags only; never changes a number.
function flagAttendanceRowsThatWentBack(rows, baselines = {}) {
  const held = r => (+r.present || 0) + (+r.absent || 0) + (+r.leave || 0) + (+r.notEntered || 0);
  const back = rows.map(r => {
    const prev = baselines[String(r.code || r.subject || '').trim()];
    return !!prev && typeof prev === 'object' && ((+r.present || 0) < (+prev.present || 0) || held(r) < held(prev));
  });
  const compared = rows.filter(r => baselines[String(r.code || r.subject || '').trim()]).length;
  if (back.filter(Boolean).length * 2 > compared) return rows;
  return rows.map((r, i) => back[i] ? { ...r, isUncertain: true, wentBack: true } : r);
}

function showAttendanceScanReviewModal(rows = []) {
  const existingBackdrop = document.getElementById('ab-review-modal-backdrop');
  if (existingBackdrop) existingBackdrop.remove();

  const subjects = getSubjectList();
  const hasUncertain = rows.some(r => r.isUncertain);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'ab-review-modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal attendance-review-dialog" onclick="event.stopPropagation()" style="max-width:680px;padding:24px 22px">
      <div class="modal-header" style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
        <div>
          <h2 class="modal-title" style="margin:0;font-size:clamp(var(--text-lg), 5vw, var(--text-xl));font-weight:700">We found your subject counts. Review once before saving.</h2>
          <div style="font-size:var(--text-sm);color:var(--text-muted);margin-top:3px">Check the scanned numbers below and make any quick corrections.</div>
        </div>
        <button class="modal-close" onclick="document.getElementById('ab-review-modal-backdrop')?.remove()">${icons.x()}</button>
      </div>

      ${hasUncertain ? `
        <div style="background:var(--surface-2);border-left:3px solid var(--yellow);border-radius:6px;padding:9px 12px;margin-bottom:14px;font-size:var(--text-sm);color:var(--text-secondary);display:flex;align-items:center;gap:8px">
          <span>${icons.alert()}</span>
          <span>Couldn’t match a few rows directly. You can select your subject or keep the detected name below.</span>
        </div>
      ` : ''}

      <div id="ab-review-rows-container" class="attendance-review-list">
        ${renderReviewRowsHTML(rows, subjects)}
      </div>

      <div class="review-footer" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border)">
        <button type="button" class="btn-secondary" onclick="addScanReviewRow()" style="display:inline-flex;align-items:center;gap:6px;font-size:var(--text-base);padding:6px 12px">
          ${icons.plus()} Add Subject Row
        </button>
        <div style="display:flex;align-items:center;gap:10px;margin-left:auto">
          <button type="button" class="btn-secondary" onclick="document.getElementById('ab-review-modal-backdrop')?.remove(); showBaselineModal(null, 'manual');" style="font-size:var(--text-base)">
            ← Enter Manually
          </button>
          <button type="button" class="btn-primary" onclick="saveAllReviewedBaselines()" style="padding:8px 20px;font-size:var(--text-base);font-weight:600">
            Save All Baselines ✓
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
}

function renderReviewRowsHTML(rows, subjects) {
  if (!rows.length) {
    return `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:var(--text-base)">No rows found. Tap + Add Subject Row to add one.</div>`;
  }

  const targetPct = getAttendanceTarget();

  return rows.map((r, idx) => {
    // Not Entered is left out of the percentage, as on the ERP.
    const total = (parseInt(r.present) || 0) + (parseInt(r.absent) || 0) + (parseInt(r.leave) || 0);
    const pct = total > 0 ? (((parseInt(r.present) || 0) / total) * 100).toFixed(1) : '0.0';
    const isSafe = parseFloat(pct) >= targetPct;

    const subjectOptionsHTML = subjects.map(s => {
      const isSel = (s.name.toLowerCase() === r.subject.toLowerCase() || (r.code && s.code && s.code.toLowerCase() === r.code.toLowerCase()));
      return `<option value="${s.name}|||${s.code || ''}" ${isSel ? 'selected' : ''}>${s.name} ${s.code ? `(${s.code})` : ''}</option>`;
    }).join('');

    const isExisting = subjects.some(s => s.name.toLowerCase() === r.subject.toLowerCase() || (r.code && s.code && s.code.toLowerCase() === r.code.toLowerCase()));

    return `
      <div class="attendance-review-row ${r.isUncertain ? 'uncertain' : ''}" id="review-row-${idx}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <label class="form-label" style="font-size:var(--text-sm);margin-bottom:3px">Subject</label>
            <select class="form-select review-subject-select" style="font-size:var(--text-base);padding:5px 8px" onchange="onReviewRowInputChange(${idx})">
              ${subjectOptionsHTML}
              ${!isExisting ? `<option value="${r.subject}|||${r.code || ''}" selected>${r.subject} ${r.code ? `(${r.code})` : ''} (Detected)</option>` : ''}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="type-badge" id="row-badge-${idx}" style="font-size:var(--text-xs);padding:3px 8px;background:${isSafe ? 'color-mix(in srgb, var(--status-success) 14%, transparent)' : 'color-mix(in srgb, var(--status-error) 14%, transparent)'};color:${isSafe ? 'var(--status-success)' : 'var(--status-error)'}">
              ${total > 0 ? `${pct}% · ${isSafe ? 'Safe Zone' : 'Needs Recovery'}` : 'Attendance not set'}
            </span>
            <button type="button" onclick="deleteReviewRow(${idx})" class="btn-icon" style="color:var(--text-muted);font-size:var(--text-md)" title="Remove row">${icons.x()}</button>
          </div>
        </div>

        <div class="review-counts-grid">
          <div>
            <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--status-success)">Present *</label>
            <input type="number" min="0" class="form-input review-present" id="row-present-${idx}" value="${r.present}" style="font-size:var(--text-base);padding:5px 8px" oninput="onReviewRowInputChange(${idx})">
          </div>
          <div>
            <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--status-error)">Absent *</label>
            <input type="number" min="0" class="form-input review-absent" id="row-absent-${idx}" value="${r.absent}" style="font-size:var(--text-base);padding:5px 8px" oninput="onReviewRowInputChange(${idx})">
          </div>
          <div>
            <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--status-warning)">Leave</label>
            <input type="number" min="0" class="form-input review-leave" id="row-leave-${idx}" value="${r.leave || 0}" style="font-size:var(--text-base);padding:5px 8px" oninput="onReviewRowInputChange(${idx})">
          </div>
          <div>
            <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--text-muted)">Not Entered</label>
            <input type="number" min="0" class="form-input review-not-entered" id="row-not-entered-${idx}" value="${r.notEntered || 0}" style="font-size:var(--text-base);padding:5px 8px" oninput="onReviewRowInputChange(${idx})">
          </div>
          <div>
            <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--text-muted)" title="The ERP's Total Sessions column: classes planned for the semester">Total sessions</label>
            <input type="number" min="0" class="form-input review-total-sessions" id="row-total-sessions-${idx}" value="${parseInt(r.totalSessions) > 0 ? parseInt(r.totalSessions) : ''}" placeholder="e.g. 60" style="font-size:var(--text-base);padding:5px 8px">
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function onReviewRowInputChange(idx) {
  const p = Math.max(0, parseInt(document.getElementById(`row-present-${idx}`)?.value) || 0);
  const a = Math.max(0, parseInt(document.getElementById(`row-absent-${idx}`)?.value) || 0);
  const l = Math.max(0, parseInt(document.getElementById(`row-leave-${idx}`)?.value) || 0);
  const n = Math.max(0, parseInt(document.getElementById(`row-not-entered-${idx}`)?.value) || 0);

  const targetPct = getAttendanceTarget();
  const total = p + a + l;   // Not Entered left out of the percentage, as on the ERP
  const pct = total > 0 ? ((p / total) * 100).toFixed(1) : '0.0';
  const isSafe = parseFloat(pct) >= targetPct;

  const badgeEl = document.getElementById(`row-badge-${idx}`);
  if (badgeEl) {
    badgeEl.textContent = total > 0 ? `${pct}% · ${isSafe ? 'Safe Zone' : 'Needs Recovery'}` : 'Attendance not set';
    badgeEl.style.background = isSafe ? 'color-mix(in srgb, var(--status-success) 14%, transparent)' : 'color-mix(in srgb, var(--status-error) 14%, transparent)';
    badgeEl.style.color = isSafe ? 'var(--status-success)' : 'var(--status-error)';
  }
}

function deleteReviewRow(idx) {
  document.getElementById(`review-row-${idx}`)?.remove();
}

function addScanReviewRow() {
  const container = document.getElementById('ab-review-rows-container');
  if (!container) return;

  const subjects = getSubjectList();
  const newIdx = container.querySelectorAll('.attendance-review-row').length + Math.floor(Math.random()*1000);

  const subjectOptionsHTML = subjects.map(s => `
    <option value="${s.name}|||${s.code || ''}">${s.name} ${s.code ? `(${s.code})` : ''}</option>
  `).join('');

  const rowDiv = document.createElement('div');
  rowDiv.className = 'attendance-review-row';
  rowDiv.id = `review-row-${newIdx}`;
  rowDiv.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <label class="form-label" style="font-size:var(--text-sm);margin-bottom:3px">Subject</label>
        <select class="form-select review-subject-select" style="font-size:var(--text-base);padding:5px 8px" onchange="onReviewRowInputChange(${newIdx})">
          ${subjectOptionsHTML}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="type-badge" id="row-badge-${newIdx}" style="font-size:var(--text-xs);padding:3px 8px;background:var(--surface-2);color:var(--text-muted)">
          Attendance not set
        </span>
        <button type="button" onclick="deleteReviewRow(${newIdx})" class="btn-icon" style="color:var(--text-muted);font-size:var(--text-md)" title="Remove row">${icons.x()}</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(80px, 1fr));gap:8px">
      <div>
        <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--green)">Present *</label>
        <input type="number" min="0" class="form-input review-present" id="row-present-${newIdx}" value="0" style="font-size:var(--text-base);padding:5px 8px" oninput="onReviewRowInputChange(${newIdx})">
      </div>
      <div>
        <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--red)">Absent *</label>
        <input type="number" min="0" class="form-input review-absent" id="row-absent-${newIdx}" value="0" style="font-size:var(--text-base);padding:5px 8px" oninput="onReviewRowInputChange(${newIdx})">
      </div>
      <div>
        <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--yellow)">Leave</label>
        <input type="number" min="0" class="form-input review-leave" id="row-leave-${newIdx}" value="0" style="font-size:var(--text-base);padding:5px 8px" oninput="onReviewRowInputChange(${newIdx})">
      </div>
      <div>
        <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--text-muted)">Not Entered</label>
        <input type="number" min="0" class="form-input review-not-entered" id="row-not-entered-${newIdx}" value="0" style="font-size:var(--text-base);padding:5px 8px" oninput="onReviewRowInputChange(${newIdx})">
      </div>
      <div>
        <label class="form-label" style="font-size:var(--text-xs);margin-bottom:2px;color:var(--text-muted)" title="The ERP's Total Sessions column: classes planned for the semester">Total sessions</label>
        <input type="number" min="0" class="form-input review-total-sessions" id="row-total-sessions-${newIdx}" value="" placeholder="e.g. 60" style="font-size:var(--text-base);padding:5px 8px">
      </div>
    </div>
  `;
  container.appendChild(rowDiv);
}

// The ERP's Total Sessions (classes planned for the semester) from a scan
// row; a blank or 0 keeps the value the previous baseline had.
function keepPlannedSessions(scanned, previous) {
  const n = parseInt(scanned, 10);
  if (n > 0) return n;
  const old = previous && typeof previous === 'object' ? parseInt(previous.totalSessions, 10) : 0;
  return old > 0 ? old : 0;
}

function saveAllReviewedBaselines() {
  const container = document.getElementById('ab-review-rows-container');
  if (!container) return;

  const rows = container.querySelectorAll('.attendance-review-row');
  if (!rows.length) {
    showToast('No subjects to save.', 'info');
    document.getElementById('ab-review-modal-backdrop')?.remove();
    return;
  }

  const baselines = loadAttendanceBaselines();
  let savedCount = 0;
  const savedRows = [];

  rows.forEach(row => {
    const subjVal = row.querySelector('.review-subject-select')?.value || '';
    const [subjName, subjCode] = subjVal.split('|||');
    if (!subjName && !subjCode) return;

    const present = Math.max(0, parseInt(row.querySelector('.review-present')?.value) || 0);
    const absent = Math.max(0, parseInt(row.querySelector('.review-absent')?.value) || 0);
    const leave = Math.max(0, parseInt(row.querySelector('.review-leave')?.value) || 0);
    const notEntered = Math.max(0, parseInt(row.querySelector('.review-not-entered')?.value) || 0);
    const scannedTotal = Math.max(0, parseInt(row.querySelector('.review-total-sessions')?.value) || 0);

    const storageKey = (subjCode || subjName).trim();
    const totalSessions = keepPlannedSessions(scannedTotal, baselines[storageKey]);
    baselines[storageKey] = {
      subjectCode: subjCode || '',
      subjectName: subjName || '',
      present,
      absent,
      leave,
      notEntered,
      totalSessions,
      updatedAt: new Date().toISOString()
    };
    savedRows.push({ name: subjName, code: subjCode });
    savedCount++;
  });

  saveAttendanceBaselines(baselines);
  clearUndatedTapsCoveredBy(savedRows);
  document.getElementById('ab-review-modal-backdrop')?.remove();
  showToast(`Attendance baseline saved for ${savedCount} subject${savedCount!==1?'s':''} ✓`, 'success');
  renderPage(state.currentPage);
}

function showAttendanceScanErrorModal(message) {
  const existing = document.getElementById('ab-scan-error-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'ab-scan-error-backdrop';
  backdrop.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()" style="max-width:440px;padding:26px 22px;text-align:center">
      <div class="scan-zone-icon">${icons.camera()}</div>
      <h3 style="margin:0 0 8px 0;font-size:var(--text-lg);font-weight:700;color:var(--text-primary)">We couldn’t read this screenshot clearly.</h3>
      <div style="font-size:var(--text-base);color:var(--text-secondary);margin-bottom:20px;line-height:1.45">
        ${message || 'The image may be blurry, low contrast, or not showing table columns. You can still enter your counts manually.'}
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button type="button" class="btn-secondary" onclick="document.getElementById('ab-scan-error-backdrop')?.remove()" style="font-size:var(--text-base)">
          Close
        </button>
        <button type="button" class="btn-primary" onclick="document.getElementById('ab-scan-error-backdrop')?.remove(); showBaselineModal(null, 'manual');" style="font-size:var(--text-base);padding:7px 16px">
          ${icons.edit()} Enter Counts Manually
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
}

  // ── Scan a syllabus (photo, screenshot or PDF) ────────────────
// Reuses the scanners' AI path and its {"schedule":[...]} answer shape
// (the attendance scan does the same), so "schedule" here holds topics.
// The answer only ever fills the same preview as pasting: nothing is
// saved until the student taps Save. PDFs are read by Gemini only; the
// other providers take images, so a PDF falls through to an error there.
const SYL_SCAN_MAX_BYTES = 8 * 1024 * 1024;   // ~11 MB once base64'd; the AI proxy allows 12 MB
const SYL_SCAN_PROMPT = `This is a college course syllabus (a photo, screenshot or PDF page).
List the topics a student has to study.
Return JSON matching this exact structure:
{
  "schedule": [
    { "title": "Normalization: 1NF, 2NF, 3NF and BCNF", "unit": "Unit 3", "marks": 10, "importance": "high" }
  ]
}
Rules:
1. One row per topic, in the order printed. When a unit lists several topics
   separated by commas or semicolons, make each one its own row.
2. "title" is the topic text only: no unit number, bullet or numbering.
3. "marks": only when the document prints marks or weightage for exactly
   that topic. Otherwise null. Never guess.
4. "importance": "high" only when the document marks the topic as important
   (a star, "imp", "important"). Otherwise null.
5. Skip everything that is not a topic: course code and title, objectives,
   outcomes, prerequisites, teaching hours, credits, exam/assessment scheme,
   textbooks and reference books.
6. Do not invent topics. If you cannot read the page, return {"schedule": []}.`;

// Turns AI rows into preview topics: cleaned like a pasted line, weightage
// kept only when valid, duplicates (with each other or the existing list)
// dropped.
function topicsFromSyllabusScan(rows, existingTitles = []) {
  const seen = new Set(existingTitles.map(t => String(t).toLowerCase().replace(/\s+/g, ' ').trim()));
  const topics = [];
  let duplicates = 0;
  (Array.isArray(rows) ? rows : []).forEach(r => {
    const raw = typeof r === 'string' ? r : (r && (r.title || r.topic || r.name)) || '';
    const t = parseSyllabusLine(String(raw));
    if (!t) return;
    if (r && typeof r === 'object') {
      const m = Number(r.marks);
      if (Number.isFinite(m) && m > 0 && m <= 500) t.marks = m;
      const imp = String(r.importance ?? '').toLowerCase();
      if (/high|imp|^3$/.test(imp)) t.importance = 3;
      else if (/low|^1$/.test(imp)) t.importance = 1;
    }
    const k = t.title.toLowerCase();
    if (seen.has(k)) { duplicates++; return; }
    seen.add(k);
    topics.push(t);
  });
  return { topics, duplicates };
}

// Why a file can't be scanned, or '' when it can.
function syllabusScanFileProblem(file) {
  if (!file) return 'No file chosen.';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf && !String(file.type || '').startsWith('image/')) return 'Choose a photo, a screenshot or a PDF of the syllabus.';
  if (file.size > SYL_SCAN_MAX_BYTES) return `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 8 MB: crop the photo, or save just the syllabus pages as a PDF.`;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Scanning needs an internet connection. You can paste the topics instead, which works offline.';
  return '';
}

// Big phone photos are shrunk before upload (faster, and fits every
// provider's size limit). Falls back to the original on any problem.
async function shrinkSyllabusImage(dataUrl, maxSide = 2200) {
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1 && dataUrl.length < 2.5 * 1048576) return dataUrl;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } catch (_) {
    return dataUrl;
  }
}

async function handleSyllabusScanFile(file) {
  if (!deps.sylPasteDraft) return;
  const problem = syllabusScanFileProblem(file);
  if (problem) { renderSyllabusScanError(problem); return; }
  renderSyllabusScanLoading('Reading the file…');
  let dataUrl;
  try {
    dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  } catch (_) {
    renderSyllabusScanError('Could not open that file. Try another one, or paste the topics.');
    return;
  }
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) {
    // A blurry or tiny photo gets a chance to be retaken before it is read.
    if (!(await confirmScanPhotoQuality(dataUrl, chooseSyllabusScanFile))) {
      renderSyllabusScanError('Choose a clearer photo, or paste the topics.');
      return;
    }
    dataUrl = await shrinkSyllabusImage(dataUrl);
  }
  const mimeType = isPdf ? 'application/pdf' : (String(dataUrl).split(';')[0].split(':')[1] || 'image/jpeg');
  await runSyllabusScan(String(dataUrl).split(',')[1] || '', mimeType);
}

async function runSyllabusScan(base64Data, mimeType) {
  if (!deps.sylPasteDraft) return;
  const draft = deps.sylPasteDraft;
  renderSyllabusScanLoading('Reading your syllabus with AI…');
  let rows = null;
  try {
    const res = await AIService.extractStructuredFromImage(base64Data, mimeType, SYL_SCAN_PROMPT,
      name => renderSyllabusScanLoading(`Reading your syllabus with AI (${name})…`));
    rows = res && res.schedule;
  } catch (err) {
    console.warn('[SyllabusScan] AI read failed:', err && err.message);
  }
  if (deps.sylPasteDraft !== draft) return;   // closed or reopened while waiting
  if (!Array.isArray(rows) || !rows.length) {
    renderSyllabusScanError(mimeType === 'application/pdf'
      ? "Couldn't read topics from that PDF. Try a clear photo or screenshot of the syllabus page, or paste the text."
      : "Couldn't read topics from that photo. Try a sharper, straight-on photo of just the syllabus, or paste the text.");
    return;
  }
  const entry = findSyllabusEntry(loadSyllabus(), draft.subjectName);
  const existing = entry ? entry.topics.map(t => t.title) : [];
  const { topics, duplicates } = topicsFromSyllabusScan(rows, existing);
  if (!topics.length) {
    renderSyllabusScanError(duplicates ? 'Every topic in that file is already in your list.' : "Couldn't find any topics in that file. You can paste them instead.");
    return;
  }
  const room = SYL_MAX_TOPICS - existing.length;
  draft.topics = topics.slice(0, Math.max(0, room));
  draft.duplicates = duplicates;
  draft.overflow = Math.max(0, topics.length - room);
  draft.scanned = true;
  draft.text = draft.topics.map(t => `${t.title}${t.marks ? ` - ${t.marks} marks` : ''}${t.importance === 3 ? ' (High)' : t.importance === 1 ? ' (Low)' : ''}`).join('\n');
  renderSyllabusPreviewStep();
}

function renderSyllabusScanLoading(message) {
  const body = document.getElementById('syl-paste-body');
  if (!body || !deps.sylPasteDraft) return;
  body.innerHTML = `
    <div class="syl-scan-status" role="status" aria-live="polite">
      <div class="syl-spinner" aria-hidden="true"></div>
      <div><strong>${sylEsc(message)}</strong><div class="syl-hint">Usually 10–40 seconds. Nothing is saved until you check the list.</div></div>
    </div>
    <div class="modal-footer" style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
      <button type="button" class="btn btn-secondary" onclick="closeSyllabusPasteModal()">Cancel</button>
    </div>`;
}

function renderSyllabusScanError(message) {
  const body = document.getElementById('syl-paste-body');
  if (!body || !deps.sylPasteDraft) return;
  body.innerHTML = `
    <div class="syl-scan-status is-error" role="alert">
      <div><strong>Scan didn't work</strong><div class="syl-hint" style="font-size:var(--text-sm)">${sylEsc(message)}</div></div>
    </div>
    <div class="modal-footer" style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" onclick="renderSyllabusPasteStepAgain()">Paste instead</button>
      <button type="button" class="btn btn-primary" onclick="chooseSyllabusScanFile()">Try another file</button>
    </div>`;
}

  return {
    showAttendanceScanLoadingModal, updateAttendanceScanLoadingMessage,
    updateAttendanceScanLoadingProgress, hideAttendanceScanLoadingModal,
    cancelAttendancePhotoScan, preprocessAttendanceImageForOCR,
    handleAttendancePhotoUpload, extractAttendanceRowsFromOCR,
    extractAttendanceRowsViaVision, extractNumericZoneTokens, flagAttendanceRowsThatWentBack,
    reconstructAttendanceTableFromGrid, extractColumnIntervalsFromHeader,
    parseColumnNumberToken, solveAttendanceCounts, cleanSubjectString,
    parseRowWithIntervals, parseRowUsingMathematicalSolver,
    parseAttendanceFromText, matchScannedRowToSubjects,
    flagAttendanceScanRows, showAttendanceScanReviewModal,
    renderReviewRowsHTML, onReviewRowInputChange, deleteReviewRow,
    addScanReviewRow, keepPlannedSessions, saveAllReviewedBaselines,
    showAttendanceScanErrorModal, SYL_SCAN_MAX_BYTES, SYL_SCAN_PROMPT,
    topicsFromSyllabusScan, syllabusScanFileProblem, shrinkSyllabusImage,
    handleSyllabusScanFile, runSyllabusScan, renderSyllabusScanLoading,
    renderSyllabusScanError
  };
}
