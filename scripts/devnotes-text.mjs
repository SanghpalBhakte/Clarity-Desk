// scripts/devnotes-text.mjs
//
// Turns a commit subject + body into a Dev Notes summary and points.
// Used by generate-devnotes.mjs; kept separate so tests can import it
// without running the generator.

export function stripFooter(body) {
  return body
    .split('\n')
    .filter((line) => !/^Co-Authored-By:/i.test(line.trim()) && !/^Claude-Session:/i.test(line.trim()))
    .join('\n')
    .trim();
}

// Commit bodies are hard-wrapped. Join the wrapped lines back into whole
// blocks: a new block starts only at a "- " / "* " line or after a blank line.
function toBlocks(cleanBody) {
  const blocks = [];
  let cur = null;
  for (const raw of cleanBody.split('\n')) {
    const line = raw.trim();
    if (!line) { cur = null; continue; }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      cur = { bullet: true, text: bullet[1] };
      blocks.push(cur);
    } else if (cur) {
      cur.text += ' ' + line;
    } else {
      cur = { bullet: false, text: line };
      blocks.push(cur);
    }
  }
  return blocks;
}

function firstSentence(text) {
  const m = text.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : text;
}

// Summary: first sentence of the first prose paragraph (else the subject).
// Points: the bullets if there are any, else the prose paragraphs, with the
// summary sentence taken off the front so it never shows twice.
export function toSummaryAndPoints(subject, cleanBody) {
  const blocks = toBlocks(cleanBody);
  const prose = blocks.filter((b) => !b.bullet).map((b) => b.text);
  const bullets = blocks.filter((b) => b.bullet).map((b) => b.text);

  const summary = prose.length ? firstSentence(prose[0]) : subject;

  let points;
  if (bullets.length) {
    points = bullets;
  } else {
    points = prose.slice();
    if (points.length) points[0] = points[0].slice(summary.length).trim();
  }
  points = points.filter((p) => p && p !== summary);

  return { summary, points };
}
