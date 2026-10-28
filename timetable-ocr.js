// ==================================================================
// Clarity Desk: timetable photo reader (OCR parsers)
// ==================================================================
// Moved out of app.js so first load downloads and parses less. app.js
// imports this file the first time a timetable photo is scanned
// (loadTimetableOcr) and precaches it in sw.js, so scanning works offline
// exactly as before. The file picker, the loading/error/preview screens,
// Vision AI (AIService), the Tesseract loader and subject normalization
// all stay in app.js; the helpers read here arrive in `deps`
// (timetableOcrDeps() in app.js). The code below is the same as it was
// in app.js.
// Tests: tests/lazy-modules.mjs loads this for the app.js test sandbox.
// ==================================================================

export function createTimetableOcr(deps) {
  const {
    AIService, cleanupTimetableDomain, getSubjectList, getTesseractWorker,
    groupWordsIntoLines, mapRawOcrWordsForDetection,
    normalizeSubjectIdentity, normalizeTimetableTime, parseFacultyLegend,
    parseSubjectAbbreviationLegend, reencodeDataUrl,
    standardizeTimetableDay, TIMETABLE_JUNK_TOKENS, timeToMinutes,
    updateTimetableLoadingModal
  } = deps;

// ── Auto-Deskew (Rotation Correction) ──────────────────────────
// Detects small handheld-photo tilt via a projection-profile angle
// search: for each candidate angle, rotate a cheap downscaled copy of
// the photo and score how sharply text rows separate (variance of
// per-row ink density across the rotated image). The angle that produces
// the highest variance is the one where horizontal table/text lines are
// best aligned to the horizontal axis -- the standard "projection
// profile" deskew method. Bounded to +/-12 degrees: this corrects
// ordinary camera tilt, not gross 90/180-degree misorientation (already
// handled by the browser's own EXIF-orientation handling on image
// decode, well before this ever runs).
function detectSkewAngle(sourceCanvas) {
  const SEARCH_W = 320;
  const scale = Math.min(1, SEARCH_W / sourceCanvas.width);
  const searchW = Math.max(40, Math.round(sourceCanvas.width * scale));
  const searchH = Math.max(40, Math.round(sourceCanvas.height * scale));

  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = searchW;
  smallCanvas.height = searchH;
  const sctx = smallCanvas.getContext('2d');
  sctx.drawImage(sourceCanvas, 0, 0, searchW, searchH);
  const { data } = sctx.getImageData(0, 0, searchW, searchH);
  smallCanvas.width = 1;
  smallCanvas.height = 1;

  // Scored on the coordinates of "ink" pixels only, projected at each
  // candidate angle -- NOT by rotating the image itself. The previous
  // version rotated the downscaled image onto a white-filled canvas and
  // scored row-darkness variance over the whole rotated canvas; on a real
  // scan the paper is light grey, not white, so the white corner triangles
  // that grow with every degree of rotation (and the canvas itself growing)
  // added fake variance that rose monotonically with |angle|. Verified on
  // the real SY-AIDS test-kit scan (tilted ~1deg): it returned the edge of
  // the search range (12deg) and the whole page went to Tesseract rotated
  // ~13deg, so day rows ran diagonally across each other -- the root cause
  // of garbled text, missing day labels, and one day's classes being filed
  // under another. Rotating a fixed set of points has no fill and no
  // changing canvas size, so nothing but real text/rule alignment affects
  // the score.
  //
  // Ink = pixels far from the dominant (median) background luminance in
  // either direction, so dark-on-light scans and light-on-dark screenshots
  // both work (skew detection runs before the auto-invert step).
  const lum = new Uint8Array(searchW * searchH);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
    const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    lum[j] = l;
    hist[l]++;
  }
  let acc = 0, bg = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lum.length / 2) { bg = v; break; } }

  const xs = [], ys = [];
  const cx = searchW / 2, cy = searchH / 2;
  for (let y = 0; y < searchH; y++) {
    for (let x = 0; x < searchW; x++) {
      if (Math.abs(lum[y * searchW + x] - bg) > 60) { xs.push(x - cx); ys.push(y - cy); }
    }
  }
  if (xs.length < 50) return 0;

  const diag = Math.ceil(Math.hypot(searchW, searchH));
  const bins = new Float64Array(diag * 2 + 2);
  // Same convention as rotateCanvasByAngle (canvas ctx.rotate): a point's
  // row after rotating by `rad` is y' = x*sin(rad) + y*cos(rad).
  const scoreAt = (angleDeg) => {
    const rad = angleDeg * Math.PI / 180;
    const s = Math.sin(rad), c = Math.cos(rad);
    bins.fill(0);
    for (let k = 0; k < xs.length; k++) {
      bins[Math.round(xs[k] * s + ys[k] * c) + diag]++;
    }
    let energy = 0;
    for (let b = 0; b < bins.length; b++) energy += bins[b] * bins[b];
    return energy;
  };

  const straightScore = scoreAt(0);
  let bestAngle = 0;
  let bestScore = straightScore;
  for (let angleDeg = -12; angleDeg <= 12; angleDeg += 0.5) {
    const score = scoreAt(angleDeg);
    if (score > bestScore) { bestScore = score; bestAngle = angleDeg; }
  }
  // Refine to 0.1deg around the coarse winner.
  const coarse = bestAngle;
  for (let angleDeg = coarse - 0.4; angleDeg <= coarse + 0.4 + 1e-9; angleDeg += 0.1) {
    const a = Math.round(angleDeg * 10) / 10;
    const score = scoreAt(a);
    if (score > bestScore) { bestScore = score; bestAngle = a; }
  }

  // Never rotate an already-straight page on a marginal difference: the
  // chosen angle must beat "no rotation" by a real margin.
  if (bestScore < straightScore * 1.03) return 0;
  return bestAngle;
}

// Rotates a full-resolution canvas by the given angle (degrees) around
// its own center, returning a NEW canvas sized to fit the fully-rotated
// content against a white background (so no corner content is clipped
// and the added corners read as blank page, not noise, to the margin-trim
// step that runs later). A near-zero angle is a no-op -- returns the
// same canvas unchanged -- so the common case of an already-square photo
// pays no extra resample cost.
function rotateCanvasByAngle(sourceCanvas, angleDeg) {
  if (Math.abs(angleDeg) < 0.3) return sourceCanvas;

  const rad = angleDeg * Math.PI / 180;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const absCos = Math.abs(Math.cos(rad));
  const absSin = Math.abs(Math.sin(rad));
  const newW = Math.max(1, Math.round(w * absCos + h * absSin));
  const newH = Math.max(1, Math.round(w * absSin + h * absCos));

  const out = document.createElement('canvas');
  out.width = newW;
  out.height = newH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, newW, newH);
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(sourceCanvas, -w / 2, -h / 2);

  return out;
}

// Threshold for the dark-dominant auto-invert decision in
// preprocessImageForOCR -- pulled out as a pure, named function so it's
// independently testable without a canvas/DOM. Ported from PR #33
// (claude/gifted-feynman-s1s33y): handles light-text-on-dark screenshots
// (e.g. a Notion-exported timetable) that the existing dark-text-on-light-
// tuned contrast stretch below was never tuned for.
function isDarkDominantForInvert(meanGrayValue) {
  return meanGrayValue < 100;
}

function preprocessImageForOCR(base64Data, mimeType) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');
      
      let width = img.width;
      let height = img.height;

      // 1. Target upscaling: upscale narrow/low-res photos for crisp OCR character recognition
      const TARGET_MIN_WIDTH = 1400;
      if (width < TARGET_MIN_WIDTH) {
        const scale = Math.min(2.0, TARGET_MIN_WIDTH / width);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Cap at reasonable max to keep memory low and local OCR fast
      const MAX_DIM = 2000;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // 1b. Auto-deskew: correct small handheld-photo rotation before any
      // further processing, so both the margin-trim step below (which
      // assumes roughly horizontal table lines) and Tesseract itself see
      // an upright table. Scored on a cheap downscaled copy, applied once
      // to the full-resolution canvas.
      const skewAngle = detectSkewAngle(canvas);
      if (Math.abs(skewAngle) >= 0.3) {
        const rotated = rotateCanvasByAngle(canvas, skewAngle);
        if (rotated !== canvas) {
          canvas.width = 1;
          canvas.height = 1;
          canvas = rotated;
          ctx = canvas.getContext('2d');
          width = canvas.width;
          height = canvas.height;
        }
      }

      // 2. Grayscale & contrast enhancement with dynamic range expansion & soft S-curve
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      let grayValues = new Uint8ClampedArray(data.length / 4);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        grayValues[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }

      let minL = 255, maxL = 0;
      for (let j = 0; j < grayValues.length; j++) {
        if (grayValues[j] < minL) minL = grayValues[j];
        if (grayValues[j] > maxL) maxL = grayValues[j];
      }

      // 2a. Auto-invert dark-dominant images (e.g. dark-theme screenshots
      // with light text) so the light-text-on-dark case binarizes the same
      // way the light-background/dark-text case is tuned for below. A real
      // photo of a paper timetable is background-dominant (mostly light
      // pixels even under shadow), so this only fires on genuinely
      // dark-dominant images. Ported from PR #33.
      let sumGrayForInvert = 0;
      for (let j = 0; j < grayValues.length; j++) sumGrayForInvert += grayValues[j];
      const meanGrayForInvert = sumGrayForInvert / grayValues.length;
      if (isDarkDominantForInvert(meanGrayForInvert)) {
        minL = 255;
        maxL = 0;
        for (let j = 0; j < grayValues.length; j++) {
          grayValues[j] = 255 - grayValues[j];
          if (grayValues[j] < minL) minL = grayValues[j];
          if (grayValues[j] > maxL) maxL = grayValues[j];
        }
      }

      const range = Math.max(1, maxL - minL);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const normalized = Math.min(255, Math.max(0, Math.round(((grayValues[j] - minL) / range) * 255)));
        // Soft S-curve boost to keep font edges anti-aliased while whitening light backgrounds
        const boosted = normalized < 130
          ? Math.round(Math.pow(normalized / 130, 1.35) * 115)
          : Math.min(255, Math.round(115 + Math.pow((normalized - 130) / 125, 0.75) * 140));
        data[i] = boosted;
        data[i + 1] = boosted;
        data[i + 2] = boosted;
      }

      // 2b. Local (tile-based) contrast normalization, blended with the
      // global S-curve above. A single global min/max stretch assumes
      // uniform lighting across the whole photo -- a real photographed
      // page commonly has a shadow across half the sheet or a glare
      // patch, which one curve can't equalize. Each tile is renormalized
      // against its OWN local min/max (from `grayValues`, captured before
      // the S-curve above overwrote `data`) and blended 50/50 with the
      // global result already written -- a full replacement risks
      // amplifying flat, near-blank tiles (pure background/margin) into
      // visible noise, so the global curve stays as a floor.
      const TILE = 48;
      const tilesX = Math.ceil(width / TILE);
      const tilesY = Math.ceil(height / TILE);
      const tileMin = new Float32Array(tilesX * tilesY).fill(255);
      const tileMax = new Float32Array(tilesX * tilesY).fill(0);
      for (let y = 0; y < height; y++) {
        const ty = Math.min(tilesY - 1, Math.floor(y / TILE));
        const rowBase = y * width;
        for (let x = 0; x < width; x++) {
          const tx = Math.min(tilesX - 1, Math.floor(x / TILE));
          const idx = ty * tilesX + tx;
          const g = grayValues[rowBase + x];
          if (g < tileMin[idx]) tileMin[idx] = g;
          if (g > tileMax[idx]) tileMax[idx] = g;
        }
      }
      for (let y = 0; y < height; y++) {
        const ty = Math.min(tilesY - 1, Math.floor(y / TILE));
        const rowBase = y * width;
        for (let x = 0; x < width; x++) {
          const tx = Math.min(tilesX - 1, Math.floor(x / TILE));
          const idx = ty * tilesX + tx;
          const localMin = tileMin[idx];
          const localMax = tileMax[idx];
          const localRange = localMax - localMin;
          // Skip near-flat tiles (pure background/margin) -- normalizing
          // them would only amplify sensor noise into visible speckling.
          if (localRange < 18) continue;
          const g = grayValues[rowBase + x];
          const localNorm = Math.min(255, Math.max(0, ((g - localMin) / localRange) * 255));
          const i = (rowBase + x) * 4;
          const blended = Math.round((data[i] + localNorm) / 2);
          data[i] = blended;
          data[i + 1] = blended;
          data[i + 2] = blended;
        }
      }

      // 2c. Light unsharp-mask sharpening to recover edge crispness lost
      // to smartphone camera softness/motion blur (and to the smoothing
      // upscale draw above). Deliberately mild -- a fast 3x3 box-blur
      // estimate rather than a true Gaussian, amount capped at 0.4 --
      // since OCR accuracy suffers more from over-sharpened halo
      // artifacts than from mild residual softness.
      const sharpenSrc = new Uint8ClampedArray(data.length);
      sharpenSrc.set(data);
      const SHARPEN_AMOUNT = 0.4;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4;
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const rowOffset = (y + dy) * width;
            for (let dx = -1; dx <= 1; dx++) {
              sum += sharpenSrc[(rowOffset + (x + dx)) * 4];
            }
          }
          const blurVal = sum / 9;
          const orig = sharpenSrc[i];
          const sharpened = Math.min(255, Math.max(0, orig + (orig - blurVal) * SHARPEN_AMOUNT));
          data[i] = sharpened;
          data[i + 1] = sharpened;
          data[i + 2] = sharpened;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // 3. Margin & noise trimming (with safe 24px padding to prevent header clipping)
      let top = 0, bottom = height - 1, left = 0, right = width - 1;
      const darkPixelThreshold = 100;

      for (let y = 0; y < height; y++) {
        let darks = 0;
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4] < darkPixelThreshold) darks++;
        }
        if (darks > width * 0.015) { top = y; break; }
      }

      for (let y = height - 1; y >= top; y--) {
        let darks = 0;
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4] < darkPixelThreshold) darks++;
        }
        if (darks > width * 0.015) { bottom = y; break; }
      }

      for (let x = 0; x < width; x++) {
        let darks = 0;
        for (let y = top; y <= bottom; y++) {
          if (data[(y * width + x) * 4] < darkPixelThreshold) darks++;
        }
        if (darks > (bottom - top) * 0.015) { left = x; break; }
      }

      for (let x = width - 1; x >= left; x--) {
        let darks = 0;
        for (let y = top; y <= bottom; y++) {
          if (data[(y * width + x) * 4] < darkPixelThreshold) darks++;
        }
        if (darks > (bottom - top) * 0.015) { right = x; break; }
      }

      const pad = 24;
      top = Math.max(0, top - pad);
      bottom = Math.min(height - 1, bottom + pad);
      left = Math.max(0, left - pad);
      right = Math.min(width - 1, right + pad);

      const trimW = Math.max(10, right - left + 1);
      const trimH = Math.max(10, bottom - top + 1);

      const trimmedCanvas = document.createElement('canvas');
      trimmedCanvas.width = trimW;
      trimmedCanvas.height = trimH;
      const trimmedCtx = trimmedCanvas.getContext('2d');
      trimmedCtx.drawImage(canvas, left, top, trimW, trimH, 0, 0, trimW, trimH);

      // Always lossless PNG, never the upload's own format. This used to be
      // toDataURL(mimeType, 0.92): for a JPEG upload -- every phone photo
      // and WhatsApp image -- the freshly sharpened, contrast-boosted page
      // was re-compressed as a lossy JPEG right before Tesseract read it,
      // smearing thin strokes into ringing artifacts. Verified on the real
      // SY-AIDS test-kit scan: the same preprocessed pixels read the time
      // header cleanly as PNG ("12:45PM | 1:45PM |Rece| 3:00PM") but as
      // garbage after the JPEG round-trip ("rzasem | tase | soar]"),
      // dropping three period start times and shifting every column after
      // them. The cell re-OCR crops below already use PNG for this reason.
      // The vision-AI upload re-encodes this back to the original format
      // (see reencodeDataUrl), so its payload is unchanged.
      const resultDataUrl = trimmedCanvas.toDataURL('image/png');

      // Free buffers immediately to avoid memory leaks
      canvas.width = 1;
      canvas.height = 1;
      trimmedCanvas.width = 1;
      trimmedCanvas.height = 1;

      resolve(resultDataUrl);
    };
    img.onerror = () => reject(new Error("Failed to load image for timetable preprocessing"));
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
}

function bboxOfWords(wordsArr) {
  return {
    x0: Math.min(...wordsArr.map(w => w.bbox.x0)),
    x1: Math.max(...wordsArr.map(w => w.bbox.x1)),
    y0: Math.min(...wordsArr.map(w => w.bbox.y0)),
    y1: Math.max(...wordsArr.map(w => w.bbox.y1))
  };
}

// Splits one physical text line into horizontal segments wherever the gap
// between consecutive words exceeds gapPx. Used only when the time axis
// runs horizontally (Layout A), to separate genuinely distinct side-by-side
// cells that share one day-row's Y-band without breaking apart a single
// label's own normal word spacing.
function splitLineByXGap(line, gapPx) {
  const sorted = [...line].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const segments = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const w = sorted[i];
    const gap = w.bbox.x0 - prev.bbox.x1;
    if (gap > gapPx) {
      segments.push(current);
      current = [w];
    } else {
      current.push(w);
    }
  }
  segments.push(current);
  return segments;
}

function axisOverlapFraction(bboxA, bboxB, axis) {
  const aMin = axis === 'x' ? bboxA.x0 : bboxA.y0;
  const aMax = axis === 'x' ? bboxA.x1 : bboxA.y1;
  const bMin = axis === 'x' ? bboxB.x0 : bboxB.y0;
  const bMax = axis === 'x' ? bboxB.x1 : bboxB.y1;
  const overlap = Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
  const narrower = Math.min(aMax - aMin, bMax - bMin);
  if (narrower <= 0) return 0;
  return overlap / narrower;
}

// Merges a flat list of word-segments into cell clusters by testing overlap
// on the given axis between each pair's combined bbox extent. Used by
// Layout A to re-stitch a single label's stacked subject/teacher/room lines
// (or a spanned cell's own wrapped text) back into one cluster after the
// per-line X-gap split above.
function mergeSegmentsByAxisOverlap(segments, axis, overlapFrac) {
  const items = segments.map(s => ({ words: s, bbox: bboxOfWords(s) }));
  const used = new Array(items.length).fill(false);
  const merged = [];

  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    const group = [items[i]];
    used[i] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < items.length; j++) {
        if (used[j]) continue;
        const overlapsAny = group.some(g => axisOverlapFraction(g.bbox, items[j].bbox, axis) >= overlapFrac);
        if (overlapsAny) {
          group.push(items[j]);
          used[j] = true;
          changed = true;
        }
      }
    }
    const allWords = group.flatMap(g => g.words);
    merged.push({ words: allWords, bbox: bboxOfWords(allWords) });
  }
  return merged;
}

// Merges consecutive physical text lines into one cell cluster when the
// vertical gap between them is small (stacked lines of one session). Used
// when the time axis runs vertically (Layout B): a day-band there is
// already a narrow column, so distinct cells are separated by vertical
// proximity rather than by any horizontal gap.
function mergeLinesByYGap(lines, gapPx) {
  const clusters = [];
  let current = null;
  for (const line of lines) {
    const bbox = bboxOfWords(line);
    if (current && (bbox.y0 - current.bbox.y1) <= gapPx) {
      current.words.push(...line);
      current.bbox = bboxOfWords(current.words);
    } else {
      current = { words: [...line], bbox };
      clusters.push(current);
    }
  }
  return clusters;
}

// Determines which time intervals a cluster's bbox spans on the given axis.
// An interval counts as "covered" when the overlap between the cluster's
// extent and that interval is at least overlapFrac of the interval's own
// width/height -- this is what lets one merged cell correctly claim 2
// adjacent time columns/rows instead of being force-assigned to whichever
// one its center point happens to fall in. A weak-but-passing overlap on
// any covered interval is flagged borderline for human review.
function computeIntervalSpan(clusterBBox, intervals, axis, overlapFrac = 0.35) {
  const cMin = axis === 'x' ? clusterBBox.x0 : clusterBBox.y0;
  const cMax = axis === 'x' ? clusterBBox.x1 : clusterBBox.y1;
  const clusterSize = cMax - cMin;
  const covered = [];
  intervals.forEach((iv, idx) => {
    const ivMin = axis === 'x' ? iv.minX : iv.minY;
    const ivMax = axis === 'x' ? iv.maxX : iv.maxY;
    const overlap = Math.max(0, Math.min(cMax, ivMax) - Math.max(cMin, ivMin));
    const ivSize = ivMax - ivMin;
    const ivFrac = ivSize > 0 ? overlap / ivSize : 0;
    const clusterFrac = clusterSize > 0 ? overlap / clusterSize : 0;
    // An interval counts as covered if the overlap is a substantial share of
    // EITHER the interval's own width/height (catches a cell that spans
    // multiple columns/rows) OR the cluster's own extent (catches a short,
    // narrow label -- e.g. a bare 2-letter abbreviation -- sitting inside
    // one much wider column, which would otherwise never clear an
    // interval-relative threshold). Coverage via the interval-relative
    // share is the stronger signal; when neither measure is confident the
    // interval is flagged as weak evidence for the caller.
    if (ivFrac >= overlapFrac || clusterFrac >= overlapFrac) {
      covered.push({ idx, iv, ivFrac, clusterFrac, weak: ivFrac < 0.5 && clusterFrac < 0.5 });
    }
  });
  if (covered.length === 0) return null;
  covered.sort((a, b) => a.idx - b.idx);
  const borderline = covered.some(c => c.weak);
  return {
    startIdx: covered[0].idx,
    endIdx: covered[covered.length - 1].idx,
    startInterval: covered[0].iv,
    endInterval: covered[covered.length - 1].iv,
    durationInSlots: covered[covered.length - 1].idx - covered[0].idx + 1,
    borderline
  };
}

// Conservative pre-normalization split for a clustered cell's raw text: only
// splits on a '+' that looks like a real parallel-session separator (real
// production timetable data in this codebase already uses "+" to join
// grouped multi-batch lab cells, e.g. "DS-AI-A2 (VJM) + WEB DEV.-AI-C2
// (MKP)"). Requires 2-4 fragments, each with a real minimum of readable
// text, and refuses to partially split -- an ambiguous or over-long split
// falls back to the original single-string behavior unchanged, leaving the
// caller to flag it uncertain instead.
function splitMultiSessionCellText(rawText) {
  if (!rawText || typeof rawText !== 'string') return { fragments: [rawText || ''], wasSplit: false };
  if (rawText.indexOf('+') === -1) return { fragments: [rawText], wasSplit: false };

  const MAX_FRAGMENTS = 4;
  const MIN_FRAGMENT_CHARS = 3;

  const trimmed = rawText.split(/\s*\+\s*/).map(p => p.trim());

  if (trimmed.length < 2 || trimmed.length > MAX_FRAGMENTS) {
    return { fragments: [rawText], wasSplit: false };
  }
  if (trimmed.some(f => f.replace(/[^a-zA-Z0-9]/g, '').length < MIN_FRAGMENT_CHARS)) {
    return { fragments: [rawText], wasSplit: false };
  }
  return { fragments: trimmed, wasSplit: true };
}

// Fallback split for a clustered cell with NO literal '+' separator. Real
// timetable data can show two distinct parallel sessions stacked as two
// physical lines within one cell with no connecting character at all --
// but splitting on line count alone is unsafe, since a single subject's
// own label commonly wraps across two lines too. This only splits when
// each line, run independently through the exact same subject-matching
// used everywhere else in this file, resolves to its own confident
// (non-residue) canonical subject, and the two resolved subjects differ.
// Any weaker signal declines the split and returns wasSplit:false, the
// same refuse-if-ambiguous behavior as splitMultiSessionCellText's '+'
// path. Callers must flag a resulting split uncertain -- unlike an
// explicit '+' separator, this is inferred from ambiguous input.
function trySplitByIndependentLines(clusterWords, existingSubjects) {
  if (!clusterWords || clusterWords.length === 0) return { fragments: null, wasSplit: false };

  const lines = groupWordsIntoLines(clusterWords);
  // Originally capped at exactly 2 lines; generalized to up to 4 after real
  // evidence showed a genuinely-independent 3-subject stacked cell (three
  // distinct classes crammed into one merged multi-hour cell) on a real
  // photo. Capped at 4 to keep this a targeted heuristic, not an open-ended
  // one -- more stacked lines than that is far more likely to be OCR line
  // fragmentation noise than a real 4+-subject cell.
  if (lines.length < 2 || lines.length > 4) return { fragments: null, wasSplit: false };

  const lineTexts = lines.map(line =>
    [...line].sort((a, b) => a.bbox.x0 - b.bbox.x0).map(w => w.text).join(' ').trim()
  );
  if (lineTexts.some(t => t.replace(/[^a-zA-Z0-9]/g, '').length < 3)) {
    return { fragments: null, wasSplit: false };
  }

  const norms = lineTexts.map(t => normalizeSubjectIdentity(t, existingSubjects));
  // 'General Subject' is normalizeSubjectIdentity's own explicit fallback
  // sentinel for "nothing meaningful resolved" (e.g. a line that's entirely
  // a teacher name, like "Prof. Rao") -- it must never count as a real,
  // confidently-distinct subject, or a lone teacher-name line would look
  // like a second session and trigger a false split.
  const allConfident = norms.every(n => n.canonicalName && n.canonicalName !== 'General Subject' && !looksLikeUnresolvedCodeResidue(n.canonicalName));
  const uniqueNames = new Set(norms.map(n => n.canonicalName.toLowerCase()));
  const allDistinct = allConfident && uniqueNames.size === norms.length;

  if (!allConfident || !allDistinct) return { fragments: null, wasSplit: false };
  return { fragments: lineTexts, wasSplit: true };
}

// A canonical name that never resolved past raw codes/branch-qualifiers
// (e.g. an unresolved "DS-AI", or a bare "AI") is a real, observed failure
// mode found against this codebase's own reference timetable data ("AI"
// aliases to the real subject "Artificial Intelligence" in
// CANONICAL_SUBJECT_MAP, but also appears as a branch qualifier inside
// codes like "DS-AI-A2") -- flag it for review instead of silently trusting
// a guess either way.
function looksLikeUnresolvedCodeResidue(canonicalName) {
  if (!canonicalName) return true;
  const trimmed = canonicalName.trim();
  return /^[A-Z0-9]+([\s-]+[A-Z0-9]+)*$/.test(trimmed);
}

// True when two words' vertical centers are close enough to plausibly be on
// the same physical text line -- scaled to each word's own bbox height
// rather than a fixed pixel guess. Guards detectDayAndTimeTokens's
// pairText/tripText lookahead against fusing the trailing word of one
// header line with the leading word of the NEXT line into a bogus token
// (real risk on a tightly-packed multi-row header, e.g. a period's start
// time on one line and its end time directly below it -- Tesseract's word
// array need not be grouped by line, so words[i+1] is not guaranteed to be
// on the same line as words[i]).
function wordsOnSameLine(a, b) {
  const heightA = (a.bbox?.y1 ?? a.cy) - (a.bbox?.y0 ?? a.cy);
  const heightB = (b.bbox?.y1 ?? b.cy) - (b.bbox?.y0 ?? b.cy);
  const tolerance = Math.max(8, Math.max(heightA, heightB) * 0.7);
  return Math.abs(a.cy - b.cy) < tolerance;
}

// ── OCR Header-Band Robustness Helpers (Stage A) ─────────────────
// Pure extraction of the day/time-token detection loop that
// reconstructTimetable2DGrid already used inline. Identical behavior --
// operates on whatever already-mapped `words` array the caller passes in,
// so reference-equality against that same array (used later for
// headerWordSet exclusion) is preserved when called from
// reconstructTimetable2DGrid itself.
function detectDayAndTimeTokens(words) {
  const dayTokens = [];
  const timeTokens = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const cleanWord = w.text.toLowerCase().replace(/[^a-z]/g, '');
    const stdDay = standardizeTimetableDay(cleanWord);
    if (stdDay && (cleanWord.length >= 3 || ['mon','tue','wed','thu','fri','sat'].includes(cleanWord))) {
      dayTokens.push({ word: w, stdDay, cx: w.cx, cy: w.cy });
      continue;
    }

    // Check single word or multi-word window for time range
    const timeWin1 = normalizeTimetableTime(w.text);
    if (timeWin1.isValid) {
      // A number that's already valid alone (e.g. "10:00") still commonly
      // has its own trailing "AM"/"PM" as a SEPARATE OCR word right after
      // it. If left dangling here, that bare meridiem word would fall
      // through to the NEXT loop iteration and could wrongly pair forward
      // with an unrelated neighboring column's number instead (real risk on
      // a tightly-packed multi-column header row: "10:00" "AM" "11:00" "AM"
      // side by side, where "AM" belongs to "10:00", not to "11:00").
      // Consume it now as this token's own meridiem suffix whenever it's
      // genuinely just "am"/"pm" on the same line, so nothing is left for
      // a later column to accidentally absorb.
      let token = { words: [w], timeNorm: timeWin1, cx: w.cx, cy: w.cy };
      if (i < words.length - 1 && wordsOnSameLine(w, words[i+1]) && /^(am|pm)$/i.test(words[i+1].text.trim())) {
        const paired = normalizeTimetableTime(`${w.text} ${words[i+1].text}`);
        if (paired.isValid) {
          token = {
            words: [w, words[i+1]],
            timeNorm: paired,
            cx: (w.cx + words[i+1].cx) / 2,
            cy: (w.cy + words[i+1].cy) / 2
          };
          i++;
        }
      }
      timeTokens.push(token);
    } else if (i < words.length - 1 && wordsOnSameLine(w, words[i+1])) {
      const pairText = `${w.text} ${words[i+1].text}`;
      const timeWin2 = normalizeTimetableTime(pairText);
      if (timeWin2.isValid) {
        const cx = (w.cx + words[i+1].cx) / 2;
        const cy = (w.cy + words[i+1].cy) / 2;
        timeTokens.push({ words: [w, words[i+1]], timeNorm: timeWin2, cx, cy });
        i++;
      } else if (i < words.length - 2 && wordsOnSameLine(w, words[i+2])) {
        const tripText = `${w.text} ${words[i+1].text} ${words[i+2].text}`;
        const timeWin3 = normalizeTimetableTime(tripText);
        if (timeWin3.isValid) {
          const cx = (w.cx + words[i+2].cx) / 2;
          const cy = (w.cy + words[i+2].cy) / 2;
          timeTokens.push({ words: [w, words[i+1], words[i+2]], timeNorm: timeWin3, cx, cy });
          i += 2;
        }
      }
    }
  }

  return { dayTokens, timeTokens };
}

// Real printed timetables commonly split a single period's start and end
// time across two separate physical header rows/lines instead of one
// "10:00 - 11:00" range on a single line (real evidence: an MGM University-
// style grid printing "10:00 AM" then "11:00 AM" as two stacked rows under
// the same period-number column). detectDayAndTimeTokens's single-timestamp
// branch treats EACH of those independently, synthesizing its own
// default-duration end time for both -- so a 6-period timetable like that
// produces ~12 bogus, overlapping "columns" instead of 6 real ones, which
// then corrupts every downstream cell-to-time-slot mapping.
//
// This merges pairs of such not-yet-a-real-range tokens (isRangeMatch ===
// false) that sit in the same column/row of the header (close together on
// the axis perpendicular to `primaryAxis`) but on two different header
// lines (spread apart along `primaryAxis`) into one token carrying the
// EARLIER one's start time and the LATER one's start time as the real end
// -- not either token's own synthesized default. Already-valid range
// tokens (isRangeMatch === true, e.g. a clean single-line "10:00 - 11:00")
// are never touched. `primaryAxis` is 'y' for Layout A (times spread
// horizontally as columns, so a split pair is stacked vertically) and 'x'
// for Layout B (times spread vertically as rows, so a split pair sits
// side-by-side horizontally).
function mergeSplitHeaderTimeTokens(timeTokens, primaryAxis) {
  if (!timeTokens || timeTokens.length < 2) return timeTokens || [];

  const primaryOf = (t) => primaryAxis === 'y' ? t.cy : t.cx;
  const crossOf = (t) => primaryAxis === 'y' ? t.cx : t.cy;
  const tokenExtent = (t) => {
    const vals = t.words.flatMap(w => primaryAxis === 'y' ? [w.bbox.y0, w.bbox.y1] : [w.bbox.x0, w.bbox.x1]);
    return Math.max(...vals) - Math.min(...vals);
  };

  const candidates = timeTokens.filter(t => t.timeNorm && t.timeNorm.isRangeMatch === false);
  if (candidates.length < 2) return timeTokens;

  const medianExtent = candidates
    .map(tokenExtent)
    .sort((a, b) => a - b)[Math.floor(candidates.length / 2)] || 20;

  const used = new Set();
  const merged = [];

  for (let i = 0; i < timeTokens.length; i++) {
    if (used.has(i)) continue;
    const a = timeTokens[i];
    if (!a.timeNorm || a.timeNorm.isRangeMatch !== false) { merged.push(a); continue; }

    let bestJ = -1, bestPrimaryGap = Infinity;
    for (let j = 0; j < timeTokens.length; j++) {
      if (j === i || used.has(j)) continue;
      const b = timeTokens[j];
      if (!b.timeNorm || b.timeNorm.isRangeMatch !== false) continue;
      const crossGap = Math.abs(crossOf(a) - crossOf(b));
      const primaryGap = Math.abs(primaryOf(a) - primaryOf(b));
      // Same column/row (tight cross-axis alignment), different header
      // line (a real but small gap along the primary axis) -- both scaled
      // to this header's own text size rather than a fixed pixel guess.
      if (crossGap < medianExtent * 1.5 && primaryGap > 0 && primaryGap < medianExtent * 4) {
        if (primaryGap < bestPrimaryGap) { bestPrimaryGap = primaryGap; bestJ = j; }
      }
    }

    if (bestJ !== -1) {
      const b = timeTokens[bestJ];
      const [earlier, later] = primaryOf(a) <= primaryOf(b) ? [a, b] : [b, a];
      merged.push({
        words: [...earlier.words, ...later.words],
        timeNorm: { time: earlier.timeNorm.time, end: later.timeNorm.time, isValid: true, isRangeMatch: true },
        cx: (earlier.cx + later.cx) / 2,
        cy: (earlier.cy + later.cy) / 2
      });
      used.add(i);
      used.add(bestJ);
    } else {
      merged.push(a);
      used.add(i);
    }
  }

  return merged;
}

// Crops the header band (day/time label row) out of the already-
// preprocessed image, using the topmost detected day token as the lower
// bound, upscales it, and runs one additional, isolated OCR pass over
// just that crop with PSM 6 (uniform block) -- restoring the worker's
// default PSM afterward no matter what happens. Returns recovered word
// entries (raw Tesseract shape) remapped into full-image coordinates, for
// the caller to merge onto the first pass's word list. Does not touch or
// depend on reconstructTimetable2DGrid in any way.
async function reOcrHeaderBandForTimeTokens(preprocessedDataUrl, worker, dayTokens) {
  if (!dayTokens || dayTokens.length === 0) return [];

  const topmostY0 = Math.min(...dayTokens.map(d => d.word.bbox.y0 ?? d.word.bbox?.y0 ?? Infinity));
  if (!isFinite(topmostY0)) return [];

  const cropSlackPx = 6;
  const cropBottomY = Math.round(topmostY0 + cropSlackPx);
  if (cropBottomY < 20) return [];

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load preprocessed image for header-band re-OCR"));
    image.src = preprocessedDataUrl;
  });

  const clampedBottom = Math.min(img.height, cropBottomY);
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = img.width * scale;
  canvas.height = clampedBottom * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, img.width, clampedBottom, 0, 0, canvas.width, canvas.height);
  const cropDataUrl = canvas.toDataURL('image/png', 0.92);
  canvas.width = 1;
  canvas.height = 1;

  let cropResult;
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    cropResult = await worker.recognize(cropDataUrl);
  } finally {
    // Always restore the default segmentation mode so nothing leaks into
    // later scans, even if the crop recognize() call above threw.
    // Tesseract.js's own default is '6' (SINGLE_BLOCK), not native
    // Tesseract's '3' -- verified: an untouched worker's output is
    // byte-identical to PSM 6 on the test-kit scans. Restoring '3' left the
    // shared, cached worker in a different, worse mode for every later scan
    // in the session (re-scans, attendance scans): on the SY-AIDS scan PSM 3
    // found 4 time labels vs 12 at PSM 6.
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
  }

  const cropWords = mapRawOcrWordsForDetection(cropResult?.data?.words);
  const { timeTokens: cropTimeTokens } = detectDayAndTimeTokens(cropWords);

  // Re-express each recovered token as ONE clean, self-contained range
  // string (e.g. "10:00 - 11:00"), not its raw constituent word(s). This
  // matters: detectDayAndTimeTokens's windowing checks a word's own text
  // first and only looks ahead at neighbors if that fails. A clean,
  // already-valid single token always matches on that first check and
  // never triggers a lookahead into whatever real word ends up next to
  // it once merged -- so it can't get accidentally absorbed into (or
  // accidentally absorb) unrelated neighboring content the way raw,
  // fragment-level words could.
  const recovered = [];
  cropTimeTokens.forEach(t => {
    const x0 = Math.min(...t.words.map(cw => cw.bbox.x0)) / scale;
    const y0 = Math.min(...t.words.map(cw => cw.bbox.y0)) / scale;
    const x1 = Math.max(...t.words.map(cw => cw.bbox.x1)) / scale;
    const y1 = Math.max(...t.words.map(cw => cw.bbox.y1)) / scale;
    const avgConf = t.words.reduce((sum, cw) => sum + cw.conf, 0) / t.words.length;
    recovered.push({
      text: `${t.timeNorm.time} - ${t.timeNorm.end}`,
      bbox: { x0, y0, x1, y1 },
      confidence: avgConf
    });
  });
  return recovered;
}

// True when a word's own center point falls inside a region's bbox --
// used to remove exactly the original (low-confidence) words a targeted
// cell re-OCR is about to replace, without relying on object identity
// (the reconstructor maps OCR words into its own new objects, so
// reference equality against the raw ocrResult.data.words array doesn't
// hold).
function isBboxInsideRegion(wordBbox, regionBbox) {
  if (!wordBbox || !regionBbox) return false;
  const cx = (wordBbox.x0 + wordBbox.x1) / 2;
  const cy = (wordBbox.y0 + wordBbox.y1) / 2;
  return cx >= regionBbox.x0 && cx <= regionBbox.x1 && cy >= regionBbox.y0 && cy <= regionBbox.y1;
}

// Generic targeted re-OCR of an arbitrary, already-known cell region.
// Unlike a naive whole-row or whole-line crop, the region here always
// comes from the real 2D grid clustering itself (reconstructTimetable2DGrid's
// own cluster.bbox), so it's already properly bounded to ONE cell and
// never spans multiple side-by-side columns -- empirically, cropping
// across column borders badly confuses OCR (border strokes read as
// garbage text, columns' text interleaved), while a single cell-sized
// crop upscaled 2x with PSM 6 (uniform block) reliably recovers dense,
// multi-line body text that a whole-image single pass garbles. Always
// restores the worker's default PSM afterward even if recognize() itself
// throws. Returns recovered words remapped into full-image coordinates.
async function reOcrCellRegion(preprocessedDataUrl, worker, bboxFullImage) {
  const PAD = 6;
  const SCALE = 2;

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load preprocessed image for cell re-OCR"));
    image.src = preprocessedDataUrl;
  });

  const x0 = Math.max(0, Math.floor(bboxFullImage.x0 - PAD));
  const y0 = Math.max(0, Math.floor(bboxFullImage.y0 - PAD));
  const x1 = Math.min(img.width, Math.ceil(bboxFullImage.x1 + PAD));
  const y1 = Math.min(img.height, Math.ceil(bboxFullImage.y1 + PAD));
  const cropW = x1 - x0;
  const cropH = y1 - y0;
  if (cropW < 10 || cropH < 10) return [];

  const canvas = document.createElement('canvas');
  canvas.width = cropW * SCALE;
  canvas.height = cropH * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x0, y0, cropW, cropH, 0, 0, canvas.width, canvas.height);
  const cropDataUrl = canvas.toDataURL('image/png', 0.92);
  canvas.width = 1;
  canvas.height = 1;

  let cropResult;
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    cropResult = await worker.recognize(cropDataUrl);
  } finally {
    // Always restore the default segmentation mode so nothing leaks into
    // later scans, even if the crop recognize() call above threw.
    // Tesseract.js's own default is '6' (SINGLE_BLOCK), not native
    // Tesseract's '3' -- verified: an untouched worker's output is
    // byte-identical to PSM 6 on the test-kit scans. Restoring '3' left the
    // shared, cached worker in a different, worse mode for every later scan
    // in the session (re-scans, attendance scans): on the SY-AIDS scan PSM 3
    // found 4 time labels vs 12 at PSM 6.
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
  }

  return (cropResult?.data?.words || [])
    .map(w => ({
      text: w.text,
      bbox: {
        x0: (w.bbox.x0 / SCALE) + x0,
        y0: (w.bbox.y0 / SCALE) + y0,
        x1: (w.bbox.x1 / SCALE) + x0,
        y1: (w.bbox.y1 / SCALE) + y0
      },
      confidence: w.confidence
    }))
    .filter(w => (w.text || '').trim().length > 0);
}

// A real printed timetable sometimes has one cell visually merged across
// two (or more) consecutive period columns -- e.g. a single "Community
// Engagement" block spanning periods 3 and 4 with no divider inside it.
// When that merged cell's text is unusually dense (several batch codes and
// a teacher code crammed together), the column-splitting heuristics above
// can occasionally cut it into two side-by-side clusters instead of
// recognizing it as one span, and each half independently resolves through
// the SAME normalization step -- so a single real class can come out as
// two adjacent rows that agree on subject/teacher/room/batches but each
// only cover one period. This collapses exactly that shape back into one
// row per day, spanning the full contiguous time range, rather than
// leaving a real class duplicated across periods. It never touches rows
// that differ in subject, teacher, room, type, or batches -- including two
// genuinely separate classes that happen to share a subject name but have
// a different teacher/room -- so it only ever removes a duplicate, never a
// real distinct class.
function mergeAdjacentDuplicatePeriods(schedule) {
  if (!schedule || schedule.length < 2) return schedule || [];

  const sameCell = (a, b) => {
    const norm = s => (s || '').trim().toLowerCase();
    if (norm(a.subject) !== norm(b.subject)) return false;
    if (norm(a.teacher) !== norm(b.teacher)) return false;
    if (norm(a.room) !== norm(b.room)) return false;
    if ((a.type || 'lecture') !== (b.type || 'lecture')) return false;
    const batchKey = item => (item.batches || []).slice().sort().join(',');
    return batchKey(a) === batchKey(b);
  };

  const dayOrder = [];
  const byDay = new Map();
  schedule.forEach(item => {
    if (!byDay.has(item.day)) { byDay.set(item.day, []); dayOrder.push(item.day); }
    byDay.get(item.day).push(item);
  });

  const merged = [];
  dayOrder.forEach(day => {
    const items = byDay.get(day).slice().sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    let i = 0;
    while (i < items.length) {
      let curr = items[i];
      let j = i + 1;
      while (j < items.length && items[j].time === curr.end && sameCell(curr, items[j])) {
        curr = {
          ...curr,
          end: items[j].end,
          endSlot: items[j].endSlot !== undefined ? items[j].endSlot : curr.endSlot,
          isUncertain: !!(curr.isUncertain || items[j].isUncertain),
          subjectInferred: !!(curr.subjectInferred || items[j].subjectInferred)
        };
        j++;
      }
      merged.push(curr);
      i = j;
    }
  });
  return merged;
}

// ── Table-Aware 2D Grid Reconstructor ────────────────────────────
function reconstructTimetable2DGrid(ocrData, existingSubjects = [], facultyLegend = {}, subjectLegend = {}) {
  if (!ocrData || !ocrData.words || ocrData.words.length === 0) {
    return { schedule: [], confidence: 0, ambiguous: true };
  }

  let words = ocrData.words.map(w => ({
    text: (w.text || '').trim(),
    bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
    conf: w.confidence || 0,
    cx: ((w.bbox?.x0 || 0) + (w.bbox?.x1 || 0)) / 2,
    cy: ((w.bbox?.y0 || 0) + (w.bbox?.y1 || 0)) / 2
  })).filter(w => w.text.length > 0);

  // Guard against footer/legend-table content (e.g. a "Subject /
  // Abbrivation / Lab / Hall No." or "Name of the faculty" key printed
  // below the grid) bleeding into whichever day happens to sit physically
  // last. Real evidence: on a compact layout, such a table can sit close
  // enough beneath the grid that its header row falls inside the last
  // day's otherwise-unbounded lower band (which only extends a fixed
  // +70px past that day's own row), fabricating a "row" out of words that
  // are actually legend/footer text. This only ever removes words when at
  // least one distinctive legend-header marker is legible in the OCR
  // output, and never touches anything above it.
  const LEGEND_BOUNDARY_MARKERS = ['abbrivat', 'abbreviat', 'facultyname', 'subjectname', 'nameofthefacult', 'nameoffacult'];
  let legendBoundaryY = Infinity;
  words.forEach(w => {
    const cleanW = w.text.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanW.length >= 6 && LEGEND_BOUNDARY_MARKERS.some(m => cleanW.includes(m))) {
      legendBoundaryY = Math.min(legendBoundaryY, w.bbox.y0);
    }
  });
  // Also catch the marker when it's spread across separate words on one
  // line (e.g. "Name of the facul[ty]", OCR-truncated on a real photo) --
  // the per-word check above only matches a single fused token, but a
  // less-compact layout OCRs each word of the legend header separately.
  const legendGuardLines = groupWordsIntoLines(words);
  legendGuardLines.forEach(line => {
    const sorted = [...line].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const cleanWords = sorted.map(w => w.text.toLowerCase().replace(/[^a-z]/g, ''));
    const nameIdx = cleanWords.findIndex((cw, i) => cw === 'name' && cleanWords.slice(i + 1, i + 4).some(w2 => w2.length >= 4 && w2.startsWith('facu')));
    if (nameIdx !== -1) {
      legendBoundaryY = Math.min(legendBoundaryY, sorted[nameIdx].bbox.y0);
    }
  });
  if (isFinite(legendBoundaryY)) {
    words = words.filter(w => w.cy < legendBoundaryY);
  }

  // 1. Identify Day Tokens and Time Tokens with coordinates
  const tokenDetection = detectDayAndTimeTokens(words);
  let { timeTokens } = tokenDetection;

  // De-duplicate and confidence-gate day tokens before anything below uses
  // them. detectDayAndTimeTokens matches ANY word in the whole photo that
  // reads as a day abbreviation, with no requirement that it actually sits
  // in the header row/column -- so a garbled body-cell word (a room code,
  // a teacher's initials, anything OCR misreads as e.g. "Tue" under
  // real-world lighting/glare/skew) is indistinguishable from a genuine
  // header label at this point. Left unfiltered, that spurious extra token
  // gets its own day-band interval below and either splits a real day's
  // row/column in two or pulls a neighboring day's content under the wrong
  // label -- this is the "Tuesday shows Monday's classes plus random other
  // classes" bug. A genuinely printed day header should read with
  // reasonable confidence (40 is the same floor Stage D above already
  // trusts for a recovered day label), and a real timetable prints each
  // day exactly once, so keeping only the single highest-confidence
  // candidate per weekday removes both a stray low-confidence misread and
  // a rarer same-day double-read, without needing to know the grid's
  // orientation yet.
  const bestDayTokenByDay = new Map();
  tokenDetection.dayTokens.forEach(t => {
    if ((t.word.conf || 0) <= 40) return;
    const existing = bestDayTokenByDay.get(t.stdDay);
    if (!existing || (t.word.conf || 0) > (existing.word.conf || 0)) {
      bestDayTokenByDay.set(t.stdDay, t);
    }
  });
  const dayTokens = Array.from(bestDayTokenByDay.values());

  // 2. Detect Orientation:
  // Layout A: Rows = Days (stacked vertically), Columns = Times (spread horizontally)
  // Layout B: Rows = Times (stacked vertically), Columns = Days (spread horizontally)
  const dayXSpread = dayTokens.length > 1 ? Math.max(...dayTokens.map(d => d.cx)) - Math.min(...dayTokens.map(d => d.cx)) : 0;
  const dayYSpread = dayTokens.length > 1 ? Math.max(...dayTokens.map(d => d.cy)) - Math.min(...dayTokens.map(d => d.cy)) : 0;
  const timeXSpread = timeTokens.length > 1 ? Math.max(...timeTokens.map(t => t.cx)) - Math.min(...timeTokens.map(t => t.cx)) : 0;
  const timeYSpread = timeTokens.length > 1 ? Math.max(...timeTokens.map(t => t.cy)) - Math.min(...timeTokens.map(t => t.cy)) : 0;

  let isLayoutA = true;
  let isLayoutB = false;

  if (dayXSpread > dayYSpread * 1.5 && timeYSpread >= timeXSpread) {
    isLayoutA = false;
    isLayoutB = true;
  } else if (dayYSpread >= dayXSpread) {
    isLayoutA = true;
    isLayoutB = false;
  }

  const schedule = [];
  const lowConfidenceClusters = [];
  // Below this average per-cluster OCR confidence, a cell is more likely
  // garbled than genuinely simple -- flagged for a later targeted re-OCR
  // retry (see reOcrCellRegion / extractTimetableFromImage) rather than
  // silently trusted or silently dropped.
  const CELL_RETRY_CONFIDENCE_THRESHOLD = 55;

  if (isLayoutA && dayTokens.length >= 1 && timeTokens.length >= 1) {
    // Layout A: Days are row headers along left, Times are column headers along top
    dayTokens.sort((a, b) => a.cy - b.cy);
    timeTokens = mergeSplitHeaderTimeTokens(timeTokens, 'y');
    timeTokens.sort((a, b) => a.cx - b.cx);

    const dayIntervals = [];
    for (let i = 0; i < dayTokens.length; i++) {
      const curr = dayTokens[i];
      const prevY = i > 0 ? (dayTokens[i - 1].cy + curr.cy) / 2 : curr.cy - 40;
      const nextY = i < dayTokens.length - 1 ? (curr.cy + dayTokens[i + 1].cy) / 2 : curr.cy + 70;
      dayIntervals.push({ day: curr.stdDay, minY: prevY, maxY: nextY });
    }

    const timeIntervals = [];
    for (let i = 0; i < timeTokens.length; i++) {
      const curr = timeTokens[i];
      const prevX = i > 0 ? (timeTokens[i - 1].cx + curr.cx) / 2 : curr.cx - 60;
      const nextX = i < timeTokens.length - 1 ? (curr.cx + timeTokens[i + 1].cx) / 2 : curr.cx + 90;
      timeIntervals.push({ timeNorm: curr.timeNorm, minX: prevX, maxX: nextX });
    }

    const headerWordSet = new Set([...dayTokens.map(d => d.word), ...timeTokens.flatMap(t => t.words)]);

    // Narrowest column width sizes the horizontal gap threshold that
    // separates genuinely distinct side-by-side cells from a single
    // label's own word spacing -- scales with the actual scanned table
    // instead of a fixed pixel guess. Uses the MINIMUM (not median/average)
    // column width deliberately: a real timetable's Recess columns make
    // period-to-period spacing uneven across one header row (adjacent
    // periods sit close together; a period separated from its neighbor by
    // a Recess column sits much farther apart), so a median/average width
    // gets pulled up by those wider Recess-adjacent gaps and ends up too
    // generous for the genuinely-adjacent, no-recess-between-them columns
    // -- letting two short, centered labels like "DEMP" and "DS" in
    // neighboring narrow columns wrongly merge into one cell.
    const colWidthsA = timeIntervals.map(t => t.maxX - t.minX).filter(w => w > 0);
    const narrowestColWidthA = colWidthsA.length ? Math.min(...colWidthsA) : 80;
    const xGapThresholdA = Math.max(18, narrowestColWidthA * 0.55);

    dayIntervals.forEach(dInt => {
      const dayBandWords = words.filter(w => {
        if (headerWordSet.has(w)) return false;
        return w.cy >= dInt.minY && w.cy < dInt.maxY;
      });
      if (dayBandWords.length === 0) return;

      // 1. Group into physical text lines (orientation-independent).
      const linesA = groupWordsIntoLines(dayBandWords);
      // 2. Split each line into horizontal segments on a real gap.
      const segmentsA = linesA.flatMap(line => splitLineByXGap(line, xGapThresholdA));
      // 3. Merge segments across lines into full cell clusters when their
      //    X-ranges substantially overlap.
      const clustersA = mergeSegmentsByAxisOverlap(segmentsA, 'x', 0.4);

      clustersA.forEach(cluster => {
        const cellWords = [...cluster.words].sort((a, b) => a.bbox.y0 === b.bbox.y0 ? a.bbox.x0 - b.bbox.x0 : a.bbox.y0 - b.bbox.y0);
        const cellRaw = cellWords.map(w => w.text).join(' ');
        if (cellRaw.length < 2 || /^(break|lunch|recess|tea|interval)$/i.test(cellRaw.trim())) return;

        const avgConfA = cellWords.reduce((sum, w) => sum + w.conf, 0) / cellWords.length;
        if (avgConfA < CELL_RETRY_CONFIDENCE_THRESHOLD) {
          lowConfidenceClusters.push({ day: dInt.day, bbox: cluster.bbox });
        }

        const span = computeIntervalSpan(cluster.bbox, timeIntervals, 'x', 0.35);
        if (!span) return;

        const { fragments: plusFragments, wasSplit: plusWasSplit } = splitMultiSessionCellText(cellRaw);
        let fragments = plusFragments;
        let lineSplitFallback = false;
        if (!plusWasSplit && !cellRaw.includes('+')) {
          const lineSplit = trySplitByIndependentLines(cluster.words, existingSubjects);
          if (lineSplit.wasSplit) {
            fragments = lineSplit.fragments;
            lineSplitFallback = true;
          }
        }
        const guardrailDeclinedSplit = cellRaw.includes('+') && !plusWasSplit;

        fragments.forEach(fragmentText => {
          const norm = normalizeSubjectIdentity(fragmentText, existingSubjects, null, facultyLegend, subjectLegend);
          if (!norm.canonicalName || TIMETABLE_JUNK_TOKENS.has(norm.canonicalName.toLowerCase())) return;

          const isUncertainRow = !norm.canonicalName
            || span.borderline
            || guardrailDeclinedSplit
            || lineSplitFallback
            || looksLikeUnresolvedCodeResidue(norm.canonicalName)
            // A fuzzy match means the raw OCR text didn't cleanly resolve to
            // any known subject and normalizeSubjectIdentity substituted the
            // closest EXISTING subject name it could find instead -- a real
            // college timetable's dense, multi-batch cells (e.g. "Community
            // Engagement- AI-A2,B2,C2,D2(SDJ)") are exactly the kind of text
            // that garbles under real-world OCR, and a garbled fragment can
            // land closest to a totally unrelated existing subject. That
            // guess was previously trusted at the same confidence as a clean
            // exact match, so a wrong substitution could sail straight into
            // the saved timetable unflagged. Now it's always surfaced in the
            // preview modal for the student to confirm or fix before saving.
            || !!norm.fuzzyMatchApplied;

          schedule.push({
            day: dInt.day,
            time: span.startInterval.timeNorm.time,
            end: span.endInterval.timeNorm.end,
            startSlot: span.startIdx,
            endSlot: span.endIdx,
            durationInSlots: span.durationInSlots,
            subject: norm.canonicalName,
            code: norm.canonicalCode,
            room: norm.room,
            teacher: norm.teacher,
            type: norm.classType,
            batches: norm.batches,
            isUncertain: isUncertainRow,
            subjectInferred: !!(norm.resolvedFromScanLegend || norm.digitConfusionCorrected)
          });
        });
      });
    });
  } else if (isLayoutB && dayTokens.length >= 1 && timeTokens.length >= 1) {
    // Layout B: Days are column headers along top, Times are row headers along left
    dayTokens.sort((a, b) => a.cx - b.cx);
    timeTokens = mergeSplitHeaderTimeTokens(timeTokens, 'x');
    timeTokens.sort((a, b) => a.cy - b.cy);

    const dayIntervals = [];
    for (let i = 0; i < dayTokens.length; i++) {
      const curr = dayTokens[i];
      const prevX = i > 0 ? (dayTokens[i - 1].cx + curr.cx) / 2 : curr.cx - 60;
      const nextX = i < dayTokens.length - 1 ? (curr.cx + dayTokens[i + 1].cx) / 2 : curr.cx + 90;
      dayIntervals.push({ day: curr.stdDay, minX: prevX, maxX: nextX });
    }

    const timeIntervals = [];
    for (let i = 0; i < timeTokens.length; i++) {
      const curr = timeTokens[i];
      const prevY = i > 0 ? (timeTokens[i - 1].cy + curr.cy) / 2 : curr.cy - 40;
      const nextY = i < timeTokens.length - 1 ? (curr.cy + timeTokens[i + 1].cy) / 2 : curr.cy + 70;
      timeIntervals.push({ timeNorm: curr.timeNorm, minY: prevY, maxY: nextY });
    }

    const headerWordSet = new Set([...dayTokens.map(d => d.word), ...timeTokens.flatMap(t => t.words)]);

    // Narrowest row height sizes the vertical gap threshold that separates
    // genuinely distinct stacked cells from one session's own stacked
    // subject/teacher/room lines. Uses the MINIMUM (not median) row height
    // for the same reason as Layout A's xGapThresholdA above: a Recess row
    // makes period-to-period spacing uneven, so a median gets pulled up by
    // the wider Recess-adjacent gaps and becomes too generous for
    // genuinely-adjacent rows.
    const rowHeightsB = timeIntervals.map(t => t.maxY - t.minY).filter(h => h > 0);
    const narrowestRowHeightB = rowHeightsB.length ? Math.min(...rowHeightsB) : 60;
    const yGapThresholdB = Math.max(14, narrowestRowHeightB * 0.5);

    dayIntervals.forEach(dInt => {
      const dayBandWords = words.filter(w => {
        if (headerWordSet.has(w)) return false;
        return w.cx >= dInt.minX && w.cx < dInt.maxX;
      });
      if (dayBandWords.length === 0) return;

      // Physical text lines (same orientation-independent grouping as
      // Layout A above). In this orientation the day-band is already a
      // narrow column, so distinct cells are separated vertically, not
      // horizontally: merge consecutive lines into one cluster when the
      // gap between them is small, start a new cluster otherwise.
      const linesB = groupWordsIntoLines(dayBandWords);
      const clustersB = mergeLinesByYGap(linesB, yGapThresholdB);

      clustersB.forEach(cluster => {
        const cellWords = [...cluster.words].sort((a, b) => a.bbox.y0 === b.bbox.y0 ? a.bbox.x0 - b.bbox.x0 : a.bbox.y0 - b.bbox.y0);
        const cellRaw = cellWords.map(w => w.text).join(' ');
        if (cellRaw.length < 2 || /^(break|lunch|recess|tea|interval)$/i.test(cellRaw.trim())) return;

        const avgConfB = cellWords.reduce((sum, w) => sum + w.conf, 0) / cellWords.length;
        if (avgConfB < CELL_RETRY_CONFIDENCE_THRESHOLD) {
          lowConfidenceClusters.push({ day: dInt.day, bbox: cluster.bbox });
        }

        const span = computeIntervalSpan(cluster.bbox, timeIntervals, 'y', 0.35);
        if (!span) return;

        const { fragments: plusFragments, wasSplit: plusWasSplit } = splitMultiSessionCellText(cellRaw);
        let fragments = plusFragments;
        let lineSplitFallback = false;
        if (!plusWasSplit && !cellRaw.includes('+')) {
          const lineSplit = trySplitByIndependentLines(cluster.words, existingSubjects);
          if (lineSplit.wasSplit) {
            fragments = lineSplit.fragments;
            lineSplitFallback = true;
          }
        }
        const guardrailDeclinedSplit = cellRaw.includes('+') && !plusWasSplit;

        fragments.forEach(fragmentText => {
          const norm = normalizeSubjectIdentity(fragmentText, existingSubjects, null, facultyLegend, subjectLegend);
          if (!norm.canonicalName || TIMETABLE_JUNK_TOKENS.has(norm.canonicalName.toLowerCase())) return;

          const isUncertainRow = !norm.canonicalName
            || span.borderline
            || guardrailDeclinedSplit
            || lineSplitFallback
            || looksLikeUnresolvedCodeResidue(norm.canonicalName)
            // A fuzzy match means the raw OCR text didn't cleanly resolve to
            // any known subject and normalizeSubjectIdentity substituted the
            // closest EXISTING subject name it could find instead -- a real
            // college timetable's dense, multi-batch cells (e.g. "Community
            // Engagement- AI-A2,B2,C2,D2(SDJ)") are exactly the kind of text
            // that garbles under real-world OCR, and a garbled fragment can
            // land closest to a totally unrelated existing subject. That
            // guess was previously trusted at the same confidence as a clean
            // exact match, so a wrong substitution could sail straight into
            // the saved timetable unflagged. Now it's always surfaced in the
            // preview modal for the student to confirm or fix before saving.
            || !!norm.fuzzyMatchApplied;

          schedule.push({
            day: dInt.day,
            time: span.startInterval.timeNorm.time,
            end: span.endInterval.timeNorm.end,
            startSlot: span.startIdx,
            endSlot: span.endIdx,
            durationInSlots: span.durationInSlots,
            subject: norm.canonicalName,
            code: norm.canonicalCode,
            room: norm.room,
            teacher: norm.teacher,
            type: norm.classType,
            batches: norm.batches,
            isUncertain: isUncertainRow,
            subjectInferred: !!(norm.resolvedFromScanLegend || norm.digitConfusionCorrected)
          });
        });
      });
    });
  }

  const dedupedSchedule = mergeAdjacentDuplicatePeriods(schedule);
  const confidence = Math.min(98, 75 + dedupedSchedule.length * 5);
  return { schedule: dedupedSchedule, confidence, ambiguous: dedupedSchedule.length === 0, lowConfidenceClusters };
}

// ── Multi-Strategy Timetable Parser (2D Grid + Geometric Rows + Text Stream) ───
function parseTimetableFromGrid(ocrData, existingSubjects = [], facultyLegend = {}, subjectLegend = {}) {
  if (!ocrData || !ocrData.words || ocrData.words.length === 0) {
    if (ocrData?.text) {
      const textFallback = parseTimetableFromTextStream(ocrData.text, existingSubjects);
      return { schedule: textFallback, confidence: textFallback.length ? 60 : 0, ambiguous: textFallback.length === 0 };
    }
    return { schedule: [], confidence: 0, ambiguous: true };
  }

  // Strategy 1: Table-Aware 2D Grid Reconstructor (Layout A & Layout B)
  try {
    const gridResult = reconstructTimetable2DGrid(ocrData, existingSubjects, facultyLegend, subjectLegend);
    if (gridResult.schedule && gridResult.schedule.length > 0) {
      return gridResult;
    }
  } catch (err) {
    console.warn("[TimetableParser] 2D grid reconstructor error, falling back to visual line clusterer:", err);
  }

  // Strategy 2: Visual Line / Card Clusterer (for list/card-based schedules)
  const words = ocrData.words.map(w => ({
    text: (w.text || '').trim(),
    bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
    conf: w.confidence || 0,
    cx: ((w.bbox?.x0 || 0) + (w.bbox?.x1 || 0)) / 2,
    cy: ((w.bbox?.y0 || 0) + (w.bbox?.y1 || 0)) / 2
  })).filter(w => w.text.length > 0);

  words.sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const visualLines = [];
  for (const word of words) {
    let added = false;
    for (const line of visualLines) {
      const avgY0 = line.reduce((sum, w) => sum + w.bbox.y0, 0) / line.length;
      const avgY1 = line.reduce((sum, w) => sum + w.bbox.y1, 0) / line.length;
      const wordH = word.bbox.y1 - word.bbox.y0;
      const overlap = Math.max(0, Math.min(word.bbox.y1, avgY1) - Math.max(word.bbox.y0, avgY0));
      if (wordH > 0 && (overlap / wordH) > 0.42) {
        line.push(word);
        added = true;
        break;
      }
    }
    if (!added) visualLines.push([word]);
  }
  visualLines.forEach(l => l.sort((a, b) => a.bbox.x0 - b.bbox.x0));

  const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const schedule = [];
  let currentDay = '';
  let foundCount = 0;

  for (const line of visualLines) {
    const lineStr = line.map(w => w.text).join(' ');
    const firstWord = (line[0]?.text || '').toLowerCase().replace(/[^a-z]/g, '');
    const matchedDay = dayNames.find(d => firstWord === d || firstWord.startsWith(d) || lineStr.toLowerCase().startsWith(d));

    if (matchedDay) {
      currentDay = standardizeTimetableDay(matchedDay);
    }

    const timeNorm = normalizeTimetableTime(lineStr);
    if (timeNorm.isValid) {
      let lineDay = currentDay;
      if (matchedDay) lineDay = standardizeTimetableDay(matchedDay);
      if (!lineDay) lineDay = 'Mon';

      const cell = cleanupTimetableDomain(lineStr, existingSubjects);
      if (!cell.isOff && cell.subject) {
        schedule.push({
          day: lineDay,
          time: timeNorm.time,
          end: timeNorm.end,
          subject: cell.subject,
          code: cell.code || '',
          room: cell.room || '',
          teacher: cell.teacher || '',
          type: cell.type || 'lecture',
          batches: cell.batches || [],
          isUncertain: cell.isUncertain
        });
        foundCount++;
      }
    }
  }

  // Strategy 3: Text stream linear extractor fallback
  if (schedule.length === 0 && ocrData.text) {
    const streamSchedule = parseTimetableFromTextStream(ocrData.text, existingSubjects);
    if (streamSchedule.length > 0) {
      return {
        schedule: streamSchedule,
        confidence: Math.min(90, 35 + streamSchedule.length * 10),
        ambiguous: false
      };
    }
  }

  const confidence = Math.min(95, 30 + foundCount * 12);
  return {
    schedule,
    confidence,
    ambiguous: schedule.length === 0 || confidence < 40
  };
}

// ── Text-Stream / Linear Schedule Extractor ────────────────────
function parseTimetableFromTextStream(rawText, existingSubjects = []) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const schedule = [];

  let currentDay = '';
  const dayRegex = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Mon|Tue|Wed|Thu|Fri|Sat)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dayMatch = line.match(dayRegex);

    if (dayMatch && (line.length < 25 || /^(?:day|daily|schedule)?\s*[:\-\s]*[A-Za-z]+\s*$/i.test(line))) {
      currentDay = standardizeTimetableDay(dayMatch[1]);
      continue;
    }

    const timeNorm = normalizeTimetableTime(line);
    if (timeNorm.isValid) {
      let lineDay = currentDay;
      if (dayMatch) {
        lineDay = standardizeTimetableDay(dayMatch[1]);
      }
      if (!lineDay) lineDay = 'Mon';

      const cellInfo = cleanupTimetableDomain(line, existingSubjects);
      if (cellInfo.isOff) continue;

      if (cellInfo.subject) {
        schedule.push({
          day: lineDay,
          time: timeNorm.time,
          end: timeNorm.end,
          subject: cellInfo.subject,
          code: cellInfo.code || '',
          room: cellInfo.room || '',
          teacher: cellInfo.teacher || '',
          type: cellInfo.type || 'lecture',
          batches: cellInfo.batches || [],
          isUncertain: cellInfo.isUncertain
        });
      }
    }
  }
  return schedule;
}

// True when an on-device (Tesseract) timetable row is evidently misread.
// Measured on scanner-practice-kit samples 07 and 11: rows like "c", "R R",
// "General Subject", "6102CR 6201LA CT 6103CR" (only room codes), a whole
// day's cells glued into one 25-word row, and classes at 00:10 all reached
// review unflagged. Short real codes ("DT", "OS", "MA", "OE-1") pass.
// The on-device result's confidence gate (see extractTimetableFromImage):
// at least 6 rows, under 40% flagged uncertain or junk, on 3+ days.
function deterministicPassesConfidenceGate(schedule) {
  const rows = schedule || [];
  if (rows.length < 6) return false;
  const uncertainRatio = rows.filter(r => r.isUncertain || looksLikeJunkTimetableRow(r)).length / rows.length;
  return uncertainRatio < 0.4 && new Set(rows.map(r => r.day)).size >= 3;
}

function looksLikeJunkTimetableRow(row) {
  const subject = String(row?.subject || '').trim();
  if (!subject || /^general subject$/i.test(subject)) return true;
  const hm = String(row.time || '').match(/^(\d{1,2}):(\d{2})/);
  if (hm && Number(hm[1]) < 6) return true;                                 // no classes between midnight and 6 AM
  const tokens = subject.split(/[\s,/|]+/).filter(Boolean);
  if (tokens.length > 8) return true;                                       // several cells glued together
  // Room / batch codes: 6102CR, W101, A1043, B212A, B1 (not OE-1 or EM-I).
  const isCode = t => /^(?:[A-Za-z]{0,3}\d{2,}[A-Za-z]{0,3}|[A-Za-z]\d)$/.test(t);
  const words = tokens.filter(t => !isCode(t) && /[A-Za-z]/.test(t));
  const codes = tokens.filter(isCode).length;
  if (words.join('').replace(/[^A-Za-z]/g, '').length < 2) return true;     // "c", "T1", nothing but codes
  if (codes >= 2 && codes > words.length) return true;                      // mostly room numbers
  if (words.length >= 2 && words.every(w => w.replace(/[^A-Za-z]/g, '').length === 1)) return true; // "R R"
  return false;
}

async function extractTimetableFromImage(base64Data, mimeType) {
  const existingSubjects = getSubjectList();

  updateTimetableLoadingModal("Preprocessing timetable image (adaptive contrast, scaling)...");
  const preprocessedDataUrl = await preprocessImageForOCR(base64Data, mimeType);
  
  updateTimetableLoadingModal("Scanning timetable text with local OCR...");
  const worker = await getTesseractWorker();
  const ocrResult = await worker.recognize(preprocessedDataUrl);

  // Diagnostic-only: surfaces exactly what Tesseract itself read off this
  // image, before any grid/parsing logic touches it -- the single fastest
  // way to tell "OCR read the photo badly" apart from "OCR read it fine but
  // parsing/mapping mangled it after". Cheap, console-only, no UI/behavior
  // impact; safe to leave in permanently the way the existing
  // [TesseractWorker]/[TimetableUpload] logs already are.
  console.log('[TimetableOCR] Raw Tesseract text:\n' + (ocrResult.data?.text || '(empty)'));
  console.log('[TimetableOCR] Raw word list (text @ confidence):',
    (ocrResult.data?.words || []).map(w => `"${w.text}"@${Math.round(w.confidence)}`).join('  '));

  // Parsed once, up front, from the first pass's own word list: many real
  // timetables print a "Name of the faculty" legend below the grid mapping
  // short initials (e.g. "VAK") used inside cells to the actual faculty
  // member's full name. See parseFacultyLegend's own comment for the
  // detection/parsing details -- this is deliberately independent of
  // Stage A/C/D's retries below, since the legend's physical position
  // never depends on how the grid itself gets recovered.
  const facultyLegend = parseFacultyLegend(ocrResult.data?.words);
  const subjectLegend = parseSubjectAbbreviationLegend(ocrResult.data?.words);

  // AI structured repair fallback (only if user has configured an API key
  // for at least one vision/text provider)
  const hasGroqKey = AIService.hasProvider('groq');
  const hasGeminiKey = AIService.hasProvider('gemini');
  const hasOpenRouterKey = AIService.hasProvider('openrouter');

  // Legends were already parsed from this same image by the Tesseract pass
  // above (facultyLegend/subjectLegend) -- hand them to the AI as a hint
  // instead of making it re-derive every abbreviation from pixels alone.
  // Deliberately phrased as "may be incomplete" since this first-pass OCR
  // read can itself be wrong; the model should verify against the photo,
  // not trust it blindly.
  const legendHint = (subjectLegend?.length || facultyLegend?.length)
    ? `\n\nA prior OCR pass already read a legend from this same image (may be incomplete or contain misreads -- verify against the photo, don't trust it blindly):\nSubject abbreviations: ${JSON.stringify(subjectLegend || [])}\nFaculty codes: ${JSON.stringify(facultyLegend || [])}`
    : '';

  // The vision call's image and prompt depend only on this first pass
  // (preprocessedDataUrl, ocrResult text, the legends above), none of which
  // Stages A-D below change (they only touch ocrResult.data.words). So it
  // can start here and run while those on-device retries do, instead of
  // after them: same request, same answer, sooner.
  let visionStepName = null;
  let visionStepVisible = false;
  const hasVisionProvider = hasGeminiKey || hasGroqKey || hasOpenRouterKey;
  const startVisionRead = () => {
    const request = (async () => {
      // The vision call asks for the GRID (which header columns each cell
      // covers), not clock times per row: the app computes times itself from
      // the printed header (expandGridCellsToScheduleRows). Measured on the
      // real SY-AIDS test-kit scan with the same model: the flat "time/end per
      // row" format read every cell correctly but cut most two-period merged
      // cells (MDM 3-5, the 10-12 lab blocks) to their first hour -- 74%
      // recall -- because the model had to derive each merged cell's end
      // time itself. The text-only repair path below keeps the flat format.
      const visionPrompt = VISION_GRID_INSTRUCTION + legendHint + `

The attached image is a photo of the same college timetable the OCR text below was read from. Use the image as the primary source of truth -- the OCR text is only a rough, possibly-garbled hint of what it contains, since it came from a classical OCR engine that may have misread skewed, poorly-lit, or handwritten text.

Rough OCR text (may be inaccurate):
${ocrResult.data.text || ''}`;
      // Reuse the already-preprocessed image (deskewed, contrast-enhanced,
      // capped at 2000px -- see preprocessImageForOCR above) instead of the
      // raw camera upload. Phone photos are routinely 3-8MB before this;
      // that full-size file was being base64-uploaded, unmodified, to every
      // vision provider on every scan. Smaller payload = faster network
      // transfer + faster model-side image processing, with no accuracy
      // loss since it's the exact same image Tesseract itself already reads.
      const visionDataUrl = await reencodeDataUrl(preprocessedDataUrl, mimeType, 0.92);
      const preprocessedBase64 = visionDataUrl.split(',')[1];
      // Provider names only reach the loading screen once the scan is actually
      // waiting on the AI, so they don't overwrite the on-device stage messages.
      return AIService.extractStructuredFromImage(preprocessedBase64, mimeType, visionPrompt, name => {
        visionStepName = name;
        if (visionStepVisible) updateTimetableLoadingModal(`Reading the photo with AI (${name})...`);
      });
    })();
    // An answer that ends up ignored must not surface as an unhandled rejection.
    request.catch(() => {});
    return request;
  };
  // Started early only when the first pass on its own already fails the
  // confidence gate, i.e. the AI will almost certainly be needed. A first
  // pass that already looks confident usually stays confident, so its scan
  // sends no AI request unless the final result fails the gate, when the
  // request starts below exactly as it always did. Parsed on a copy of the
  // words so this extra parse cannot change what the stages below read.
  let visionPromise = null;
  if (hasVisionProvider) {
    let firstPassConfident = false;
    try {
      const firstPassData = { ...ocrResult.data, words: (ocrResult.data?.words || []).map(w => ({ ...w, bbox: { ...w.bbox } })) };
      firstPassConfident = deterministicPassesConfidenceGate(parseTimetableFromGrid(firstPassData, existingSubjects, facultyLegend, subjectLegend)?.schedule);
    } catch (_) { /* unparseable first pass: not confident */ }
    if (!firstPassConfident) visionPromise = startVisionRead();
  }

  // Stage A: if the first pass found day labels but essentially no usable
  // time-range tokens, retry OCR on just the header band (cropped +
  // upscaled) before handing off to the deterministic parser. Only
  // triggers on an already-failing first pass, so a normal/clean scan is
  // completely unaffected.
  try {
    const firstPassWords = mapRawOcrWordsForDetection(ocrResult.data?.words);
    const { dayTokens: firstPassDayTokens, timeTokens: firstPassTimeTokens } = detectDayAndTimeTokens(firstPassWords);
    if (firstPassDayTokens.length >= 1 && firstPassTimeTokens.length <= 1) {
      updateTimetableLoadingModal("Re-scanning header row for class times...");
      const recoveredWords = await reOcrHeaderBandForTimeTokens(preprocessedDataUrl, worker, firstPassDayTokens);
      if (recoveredWords.length > 0) {
        // Prepended, not appended: a clean recovered token never looks
        // ahead past itself once it self-validates (see note above), so
        // placing it before the rest of the words means nothing already
        // in the array can accidentally window-match into it either.
        ocrResult.data.words = [...recoveredWords, ...(ocrResult.data.words || [])];
      }
    }
  } catch (err) {
    console.warn("[TimetableParser] Header-band retry OCR failed, continuing with first-pass data:", err);
  }

  // Stage D: if at least two day labels were found but the topmost one
  // isn't Monday and no Monday token exists anywhere yet, a leading row
  // may have been swallowed entirely -- this happens on real photos where
  // Monday's row sits with no visual gap against the header band above it.
  // A full-width crop of that band (like Stage A's) drags in the whole
  // multi-column numeric header table alongside the lone day label and
  // confuses PSM 6 into producing nothing usable there (verified
  // empirically); cropping just the day-label column's own width for an
  // estimated one-row-height band above the topmost known day avoids that
  // and reliably recovers the label. Requires >=2 day tokens so a row
  // spacing can be estimated; degrades to a no-op otherwise.
  //
  // Generalized from "missing Monday only": the first pass can drop ANY
  // day label, not just a leading one. Verified on the real SY-AIDS
  // test-kit scan: PSM 6 read WEDNESD/THURSDAY/FRIDAY/SATURDAY but dropped
  // both MONDAY and TUESDAY (each sits vertically centred between two
  // lines of cell text), so the old one-row band above Wednesday only ever
  // saw TUESDAY -- which it ignored for not being Monday -- and both rows'
  // classes were lost. Now the whole day-label column is re-read, spanning
  // as many rows above the topmost / below the bottommost known day as
  // weekdays could be missing there, and every weekday not already found is
  // added back, subject to the same >40 confidence bar plus a weekday-order
  // check against the days already found (so a stray substring match in
  // the wrong place can't be adopted).
  try {
    const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const postHeaderWords = mapRawOcrWordsForDetection(ocrResult.data?.words);
    const { dayTokens: postHeaderDayTokens } = detectDayAndTimeTokens(postHeaderWords);
    const known = new Map();
    postHeaderDayTokens.forEach(d => {
      const prev = known.get(d.stdDay);
      if (!prev || (d.word.conf || 0) > (prev.word.conf || 0)) known.set(d.stdDay, d);
    });
    // Only days missing BEFORE the last day found (leading or middle gaps)
    // trigger this. A missing trailing day (e.g. Saturday on a Mon-Fri
    // timetable) is ambiguous and never guessed at, so a normal scan pays
    // no extra OCR pass.
    const bottomIdx = Math.max(...[...known.keys()].map(d => WEEK.indexOf(d)));
    const missingDays = WEEK.filter((d, i) => !known.has(d) && i < bottomIdx);
    if (known.size >= 2 && missingDays.length > 0) {
      const sortedDays = [...known.values()].sort((a, b) => a.cy - b.cy);
      const ySpread = sortedDays[sortedDays.length - 1].cy - sortedDays[0].cy;
      const xSpread = Math.max(...sortedDays.map(d => d.cx)) - Math.min(...sortedDays.map(d => d.cx));
      const gaps = sortedDays.slice(1).map((d, i) => d.cy - sortedDays[i].cy).filter(g => g > 10);
      const rowSpacing = gaps.length ? Math.min(...gaps) : 0;
      // Days stacked vertically (Layout A) only -- same effective condition
      // the old version had via its rowSpacing > 10 guard.
      if (rowSpacing > 10 && ySpread > xSpread) {
        const topmost = sortedDays[0];
        const bottommost = sortedDays[sortedDays.length - 1];
        const rowsAbove = Math.max(0, WEEK.indexOf(topmost.stdDay));
        const dayLabelWidth = Math.max(...sortedDays.map(d => d.word.bbox.x1));
        const candidateBbox = {
          x0: 0,
          y0: Math.max(0, topmost.word.bbox.y0 - rowsAbove * rowSpacing - 20),
          x1: dayLabelWidth + 40,
          y1: bottommost.word.bbox.y1 + 20
        };
        if (candidateBbox.y1 > candidateBbox.y0) {
          updateTimetableLoadingModal("Re-scanning the day column for missing day rows...");
          // A full-page sparse-text (PSM 11) pass, filtered to the day-label
          // column window below -- NOT a cropped re-OCR. Verified on the
          // real SY-AIDS scan: a crop of that column, at any bounds or PSM,
          // read only "SATURDAY" (the boxed cells read as non-text once
          // isolated and upscaled), while the full-page PSM 11 pass read all
          // six labels at their true positions (MONDAY@96, TUESDAY@96...).
          let sparseWords = [];
          try {
            await worker.setParameters({ tessedit_pageseg_mode: '11' });
            const sparse = await worker.recognize(preprocessedDataUrl);
            sparseWords = sparse?.data?.words || [];
          } finally {
            await worker.setParameters({ tessedit_pageseg_mode: '6' });
          }
          const recoveredDayWords = sparseWords
            .map(w => ({ text: w.text, bbox: w.bbox, confidence: w.confidence }))
            .filter(w => w.bbox && isBboxInsideRegion(w.bbox, candidateBbox));
          const bestRecovered = new Map();
          recoveredDayWords.forEach(w => {
            const cleanWord = (w.text || '').toLowerCase().replace(/[^a-z]/g, '');
            const std = cleanWord.length >= 3 ? standardizeTimetableDay(cleanWord) : '';
            if (!std || !missingDays.includes(std) || (w.confidence || 0) <= 40) return;
            const cy = ((w.bbox?.y0 || 0) + (w.bbox?.y1 || 0)) / 2;
            const orderOk = [...known.values()].every(k => {
              const ki = WEEK.indexOf(k.stdDay), si = WEEK.indexOf(std);
              return ki < si ? k.cy < cy : k.cy > cy;
            });
            if (!orderOk) return;
            const prev = bestRecovered.get(std);
            if (!prev || (w.confidence || 0) > (prev.confidence || 0)) bestRecovered.set(std, w);
          });
          if (bestRecovered.size > 0) {
            // Prepended for the same reason Stage A prepends recovered
            // time tokens: a clean, self-validating recovered word
            // should never be at risk of an unrelated neighbor's
            // lookahead window absorbing it.
            ocrResult.data.words = [...bestRecovered.values(), ...(ocrResult.data.words || [])];
          }
        }
      }
    }
  } catch (err) {
    console.warn("[TimetableParser] Day-column retry OCR failed, continuing with prior data:", err);
  }

  updateTimetableLoadingModal("Reconstructing schedule rows and matching subjects...");
  let deterministicResult;
  try {
    deterministicResult = parseTimetableFromGrid(ocrResult.data, existingSubjects, facultyLegend, subjectLegend);
  } catch (err) {
    console.error("[TimetableParser] Error in grid parser, falling back to text stream:", err);
    try {
      const streamFallback = parseTimetableFromTextStream(ocrResult.data?.text || '', existingSubjects);
      deterministicResult = { schedule: streamFallback, confidence: streamFallback.length ? 50 : 0, ambiguous: streamFallback.length === 0 };
    } catch {
      deterministicResult = { schedule: [], confidence: 0, ambiguous: true };
    }
  }

  // Stage C: the 2D grid reconstructor flags any cell cluster whose OCR
  // confidence was too low to trust (dense multi-line body cells can hit
  // the same kind of OCR breakdown Stage A fixed for header numerals).
  // Each flagged region is already properly bounded to ONE cell by the
  // real clustering (never spans multiple side-by-side columns the way a
  // naive whole-row crop would), so a targeted crop + upscale + isolated
  // OCR pass can retry just that region safely. Only runs when something
  // was actually flagged, so a clean scan pays no extra cost, and the
  // retry result is only adopted if it doesn't produce fewer rows than
  // the first pass already found.
  if (deterministicResult?.lowConfidenceClusters?.length > 0) {
    try {
      updateTimetableLoadingModal("Re-scanning unclear cells for better accuracy...");
      let improvedWords = ocrResult.data.words || [];
      for (const region of deterministicResult.lowConfidenceClusters) {
        const recovered = await reOcrCellRegion(preprocessedDataUrl, worker, region.bbox);
        if (recovered.length > 0) {
          improvedWords = improvedWords.filter(w => !isBboxInsideRegion(w.bbox, region.bbox));
          improvedWords = [...improvedWords, ...recovered];
        }
      }
      const retryResult = parseTimetableFromGrid({ ...ocrResult.data, words: improvedWords }, existingSubjects, facultyLegend, subjectLegend);
      if ((retryResult?.schedule?.length || 0) >= (deterministicResult.schedule?.length || 0)) {
        deterministicResult = retryResult;
      }
    } catch (err) {
      console.warn("[TimetableParser] Cell-region retry OCR failed, continuing with prior result:", err);
    }
  }

  // Flag rows the on-device read clearly got wrong, BEFORE the confidence
  // gate below, so junk can't make a bad read look confident (which skipped
  // the AI) and the review screen highlights it. Flags only, never drops.
  (deterministicResult?.schedule || []).forEach(row => {
    if (!row.isUncertain && looksLikeJunkTimetableRow(row)) row.isUncertain = true;
  });

  // If the deterministic parser found a confident result, return
  // immediately -- "confident" now means non-empty, not mostly flagged
  // uncertain, AND covering a plausible chunk of a real week, so a photo
  // that produced a few rows but garbled most of them still gets a chance
  // at AI help below instead of being silently accepted as-is.
  //
  // The distinct-day and row-count floors below exist because per-row
  // uncertainty alone let a badly under-extracted result masquerade as
  // "confident": if the grid parser recovered only 2 rows out of a full
  // week and neither happened to be individually flagged, uncertainRatio
  // was 0/2 = 0, which passed the old < 0.4 check and returned those 2 rows
  // immediately -- AI extraction never even ran. That's the root cause a
  // real-device test surfaced as "0-2 entries from a full weekly
  // timetable" even though the vision fallback below already existed. A
  // week with real classes realistically has entries on 3+ days and more
  // than a handful of rows; anything less is itself a strong signal the
  // grid reconstruction missed most of the photo, regardless of whether
  // Tesseract felt confident about the few rows it did produce.
  const deterministicIsConfident = deterministicPassesConfidenceGate(deterministicResult.schedule);

  if (deterministicIsConfident) {
    return { schedule: deterministicResult.schedule, confidence: Math.max(70, deterministicResult.confidence) };
  }

  if (!hasGroqKey && !hasGeminiKey && !hasOpenRouterKey) {
    console.log("[ExtractionPipeline] AI Repair skipped (no API key). Using deterministic output.");
    // No AI provider to cross-check against, and this result already failed
    // the confidence gate above -- flagged so the preview modal can warn
    // the user to check it row-by-row instead of presenting it as reliable.
    return { ...deterministicResult, needsReview: true };
  }

  updateTimetableLoadingModal("Refining ambiguous timetable entries with AI...");
  const schemaInstruction = `Extract all weekly college class timetable entries from this raw OCR text.
Return JSON matching this exact structure:
{
  "schedule": [
    {
      "day": "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
      "time": "10:00",
      "end": "11:00",
      "subject": "Data Structures",
      "code": "DS",
      "room": "LT-2",
      "teacher": "Prof. Name",
      "type": "lecture" | "lab" | "project",
      "isUncertain": false
    }
  ]
}

Rules:
1. Day must be one of: Mon, Tue, Wed, Thu, Fri, Sat.
2. time and end must be 24-hour HH:MM format (e.g. 09:00, 10:30, 14:00).
3. Do not invent fake subjects or rooms if not present in text.
4. If an entry is ambiguous, mark isUncertain: true.
5. Merged cells: if one cell visually spans multiple consecutive periods (e.g.
   a single "OE-1" block covering periods 3 and 4), emit ONE row whose time
   is period 3's start and whose end is period 4's end -- do not duplicate
   the same subject into two separate rows for the two periods.
6. Stacked cells: if one time slot lists multiple different classes together
   (e.g. different batches sharing the same period, printed as separate
   lines in the same box), emit ONE row PER entry, all sharing that same
   day/time/end, differentiated by subject/code/teacher/room. Never merge
   them into a single row or drop all but one.
7. Legend expansion: if a subject/faculty legend is provided below, use it to
   expand abbreviations in the grid to their full names in "subject", and
   keep the short form in "code". Abbreviations sometimes appear in the grid
   in a slightly different form than the legend lists them (e.g. grid says
   "WEB DEV." while the legend lists "WD") -- match them by meaning, not
   exact string equality.
8. Inferred times: many timetables print only a period number or a shared
   duration label (e.g. "Lectures = 40 Min.") instead of a start/end time on
   every row. When that happens, compute each period's time from whatever IS
   printed -- an anchor time on one row, the stated duration, a recess
   position -- and fill time/end normally. Computing a time this way is NOT
   by itself a reason to set isUncertain: true; isUncertain is for when the
   subject, day, or which period a cell belongs to is genuinely unclear from
   the image, not for a time you derived rather than read verbatim.

This is an EXAMPLE of the clean formatting style to aim for (a DIFFERENT college's timetable -- copy the STYLE and STRUCTURE below, never this content, into whatever subjects/rooms/teachers this specific photo actually shows):
{ "day": "Mon", "time": "10:00", "end": "11:00", "subject": "Data Structures (DS)", "code": "DS", "room": "SF-31", "teacher": "Prof. VJM", "type": "lecture", "isUncertain": false }
{ "day": "Mon", "time": "12:00", "end": "12:45", "subject": "Recess", "code": "REC", "room": "—", "teacher": "—", "type": "off", "isUncertain": false }
{ "day": "Tue", "time": "10:00", "end": "12:00", "subject": "Web Development Lab", "code": "WEB DEV", "room": "FF-40", "teacher": "Prof. MKP", "type": "lab", "isUncertain": false }
Notice: full subject name with its short code in parentheses, "Prof. <initials>" for teacher when the photo only gives initials, "—" (em dash) for an unlisted room/teacher, and breaks/recess given their own row with type "off" rather than skipped.`;

  // Vision-first: send the actual photo to a multimodal model when any
  // vision-capable provider is configured -- this is the only path that can
  // recover information Tesseract lost at the pixel level (heavy skew, poor
  // lighting, handwriting), which text-only repair structurally cannot do
  // since it never sees the picture. extractStructuredFromImage rotates
  // across every configured provider (Gemini -> Groq -> OpenRouter) so one
  // provider being rate-limited no longer drops all the way down to
  // text-only repair or raw Tesseract -- it just tries the next one. Falls
  // through to text-only repair below only if no vision provider is
  // configured, or all configured ones failed/were empty.
  if (hasVisionProvider) {
    try {
      // Usually already running since the first OCR pass (see
      // startVisionRead above); otherwise it starts now, as it always did.
      if (!visionPromise) visionPromise = startVisionRead();
      visionStepVisible = true;
      if (visionStepName) updateTimetableLoadingModal(`Reading the photo with AI (${visionStepName})...`);
      const visionResult = await visionPromise;
      if (visionResult && Array.isArray(visionResult.schedule) && visionResult.schedule.length > 0) {
        // Grid-cell response (the requested format) -> rows with times from
        // the header; a model that ignored it and returned flat rows is
        // still accepted exactly as before.
        const isGridCells = Array.isArray(visionResult.periods)
          && visionResult.schedule.some(c => c && Array.isArray(c.periods) && Array.isArray(c.entries));
        const visionRows = isGridCells
          ? expandGridCellsToScheduleRows(visionResult.periods, visionResult.schedule)
          : visionResult.schedule;
        // Same back-to-back duplicate merge the on-device grid path already
        // applies (v156) -- e.g. two printed PBST periods become one 2-hour
        // block. Previously only the on-device path got this, so it never
        // reached AI-path scans, which is what real scans use.
        const sanitized = mergeAdjacentDuplicatePeriods(sanitizeAiScheduleRows(visionRows));
        if (sanitized.length > 0) {
          return { schedule: sanitized, confidence: 88 };
        }
      }
    } catch (err) {
      console.warn("[ExtractionPipeline] Vision AI Repair failed on every configured provider, falling back to text-only repair:", err);
    }
  }

  try {
    const rawOcrText = ocrResult.data.text;
    const aiResult = await AIService.generateContentFromText(rawOcrText, schemaInstruction + legendHint);
    if (aiResult && Array.isArray(aiResult.schedule) && aiResult.schedule.length > 0) {
      const sanitized = sanitizeAiScheduleRows(aiResult.schedule);
      // sanitized.length === 0 here means the text-repair call returned
      // *something* but every row got rejected by sanitizeAiScheduleRows --
      // that's a raw, un-repaired deterministic result reaching the user
      // exactly like the no-key path above, so it's flagged the same way
      // instead of wearing the AI path's confidence: 85 it didn't earn.
      if (sanitized.length > 0) {
        return { schedule: sanitized, confidence: 85 };
      }
      return { ...deterministicResult, needsReview: true };
    }
    return { ...deterministicResult, needsReview: true };
  } catch (err) {
    console.warn("[ExtractionPipeline] AI Repair failed:", err);
    return { ...deterministicResult, needsReview: true };
  }
}

// Shared sanitizer for AI-returned schedule rows (both the vision path and
// the text-only repair path), extracted so the two never drift apart.
// Rejects hallucinated rows with no subject, and re-runs each time value
// through the same normalizeTimetableTime used everywhere else so an AI
// model's own time formatting quirks don't bypass the app's own validation.
function sanitizeAiScheduleRows(rawRows) {
  return (rawRows || []).map(item => {
    const timeNorm = normalizeTimetableTime(`${item.time || '10:00'} - ${item.end || '11:00'}`);
    return {
      day: standardizeTimetableDay(item.day) || 'Mon',
      time: timeNorm.time || item.time || '10:00',
      end: timeNorm.end || item.end || '11:00',
      subject: (item.subject || '').trim(),
      code: (item.code || '').trim(),
      room: (item.room || '').trim(),
      teacher: (item.teacher || '').trim(),
      type: item.type || 'lecture',
      isUncertain: !!item.isUncertain || !item.subject
    };
  }).filter(r => r.subject.length > 0);
}

// Vision-AI prompt: asks for the table's structure (which header columns
// each cell spans) instead of per-row clock times. See the comment at the
// vision call in extractTimetableFromImage for the measured reason.
// `schedule` holds CELLS so AIService.extractStructuredFromImage's existing
// "non-empty schedule" acceptance check works unchanged.
const VISION_GRID_INSTRUCTION = `Read the weekly college class timetable in the attached image and return its GRID STRUCTURE as JSON matching exactly:
{
  "periods": [ { "n": 1, "start": "10:00 AM", "end": "11:00 AM" } ],
  "schedule": [
    { "day": "Mon", "periods": [1], "entries": [
      { "subject": "Data Structures", "code": "DS", "teacher": "Prof. VJM", "room": "", "batch": "", "type": "lecture", "isUncertain": false }
    ] }
  ]
}

Rules:
1. "periods" = the CLASS columns of the header, numbered 1, 2, 3... from left to right (use the column numbers printed in the header when there are any), each with its start and end time exactly as printed. Do NOT include recess/break/lunch columns and do not give them a number.
2. "schedule" = one object per non-empty class cell, for every day row, left to right. "day" is one of Mon, Tue, Wed, Thu, Fri, Sat.
3. "periods" on a cell = EVERY class-column number that cell covers. A cell merged across two or more columns (no vertical line between them) lists all of them, e.g. [3, 4] or [5, 6]; a single-column cell lists one number. Look at the column borders of every cell, especially lab blocks, cells in the last columns of the day, and cells directly after a recess column.
4. A cell listing several classes (different batches sharing the slot, one per line) gets one entry per class, all in that one cell object.
5. Skip empty cells and recess/break cells entirely.
6. "subject": the full subject name, expanded from the legend table when the grid uses an abbreviation (match by meaning -- the grid may write "WEB DEV." where the legend says "WD"). "code": the short form as printed. "batch": the batch/division exactly as printed in the cell (e.g. "AI-B2" or "A2,B2,C2,D2"), or "" if none. "teacher": "Prof. <initials>" when only initials are printed, or "". "room": the room printed in that cell, or "".
7. "type": "lab" for labs/practicals, "project" for projects/community work, otherwise "lecture".
8. Never invent subjects, rooms or teachers that are not in the image. Set "isUncertain": true only when a cell's subject, day or column span is genuinely unclear.
9. If the header prints only period numbers or a shared duration instead of times, compute each period's start/end from what IS printed.

Example of the shape only (a DIFFERENT college -- never copy this content):
{ "periods": [ { "n": 1, "start": "9:00 AM", "end": "10:00 AM" }, { "n": 2, "start": "10:00 AM", "end": "11:00 AM" }, { "n": 3, "start": "11:15 AM", "end": "12:15 PM" }, { "n": 4, "start": "12:15 PM", "end": "1:15 PM" } ],
  "schedule": [
    { "day": "Mon", "periods": [1], "entries": [ { "subject": "Operating Systems", "code": "OS", "teacher": "Prof. RKS", "room": "", "batch": "", "type": "lecture", "isUncertain": false } ] },
    { "day": "Mon", "periods": [3, 4], "entries": [
      { "subject": "Computer Networks Lab", "code": "CN", "teacher": "Prof. ABM", "room": "L-2", "batch": "B1", "type": "lab", "isUncertain": false },
      { "subject": "Operating Systems Lab", "code": "OS", "teacher": "Prof. RKS", "room": "L-3", "batch": "B2", "type": "lab", "isUncertain": false } ] }
  ] }`;

// Converts the grid-cell vision response into the flat rows the rest of the
// app uses. Each cell's time is derived from the header: start of its first
// covered period, end of its last -- so a merged cell always gets its full
// span. Recess rows are added for gaps between consecutive header periods
// that fall inside a day's classes (the flat format used to return these as
// rows too). The batch is appended in brackets so the existing batch filter
// (extractBatchTags) picks it up exactly as it does for on-device scans.
function expandGridCellsToScheduleRows(periodsHeader, cells) {
  const header = (periodsHeader || [])
    .map(p => {
      const n = parseInt(p && p.n, 10);
      const t = normalizeTimetableTime(`${(p && p.start) || ''} - ${(p && p.end) || ''}`);
      return { n, time: t.isValid ? t.time : '', end: t.isValid && t.isRangeMatch ? t.end : '' };
    })
    .filter(p => Number.isFinite(p.n) && p.time)
    .sort((a, b) => a.n - b.n);
  header.forEach((p, i) => {
    if (!p.end) p.end = header[i + 1] ? header[i + 1].time : '';
  });
  const byNum = new Map(header.filter(p => p.end).map(p => [p.n, p]));
  if (byNum.size === 0) return [];

  const rows = [];
  const dayBounds = new Map();
  (cells || []).forEach(cell => {
    const nums = (Array.isArray(cell && cell.periods) ? cell.periods : [])
      .map(x => parseInt(x, 10))
      .filter(x => byNum.has(x));
    if (!nums.length || !Array.isArray(cell.entries)) return;
    const first = byNum.get(Math.min(...nums));
    const last = byNum.get(Math.max(...nums));
    cell.entries.forEach(e => {
      if (!e || !(e.subject || e.code)) return;
      const batch = (e.batch || '').trim();
      rows.push({
        day: cell.day,
        time: first.time,
        end: last.end,
        subject: `${(e.subject || e.code || '').trim()}${batch ? ` (${batch})` : ''}`,
        code: e.code || '',
        room: e.room || '',
        teacher: e.teacher || '',
        type: e.type || 'lecture',
        isUncertain: !!e.isUncertain
      });
    });
    const b = dayBounds.get(cell.day) || { start: Infinity, end: -Infinity };
    b.start = Math.min(b.start, timeToMinutes(first.time));
    b.end = Math.max(b.end, timeToMinutes(last.end));
    dayBounds.set(cell.day, b);
  });

  const gaps = [];
  for (let i = 0; i + 1 < header.length; i++) {
    if (header[i].end && timeToMinutes(header[i + 1].time) - timeToMinutes(header[i].end) >= 5) {
      gaps.push({ time: header[i].end, end: header[i + 1].time });
    }
  }
  dayBounds.forEach((b, day) => {
    gaps.forEach(g => {
      if (timeToMinutes(g.time) >= b.start && timeToMinutes(g.end) <= b.end) {
        rows.push({ day, time: g.time, end: g.end, subject: 'Recess', code: 'REC', room: '—', teacher: '—', type: 'off', isUncertain: false });
      }
    });
  });
  return rows;
}

  return {
    detectSkewAngle, rotateCanvasByAngle, isDarkDominantForInvert,
    preprocessImageForOCR, bboxOfWords, splitLineByXGap,
    axisOverlapFraction, mergeSegmentsByAxisOverlap, mergeLinesByYGap,
    computeIntervalSpan, splitMultiSessionCellText,
    trySplitByIndependentLines, looksLikeUnresolvedCodeResidue,
    wordsOnSameLine, detectDayAndTimeTokens, mergeSplitHeaderTimeTokens,
    reOcrHeaderBandForTimeTokens, isBboxInsideRegion, reOcrCellRegion,
    mergeAdjacentDuplicatePeriods, reconstructTimetable2DGrid,
    parseTimetableFromGrid, parseTimetableFromTextStream,
    looksLikeJunkTimetableRow, extractTimetableFromImage,
    sanitizeAiScheduleRows, VISION_GRID_INSTRUCTION,
    expandGridCellsToScheduleRows
  };
}
