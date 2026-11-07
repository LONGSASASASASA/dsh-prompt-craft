'use strict';

const MAX_DIFF_LINES = 4000;
const TRAILING_META = '__dshDiffTrailingNewlines';

/**
 * Normalize line endings and report whether the text ends with a newline.
 * @param {string|null|undefined} text Text to normalize.
 * @returns {{text: string, trailingNewline: boolean}} Normalized text and flag.
 */
function normalizeText(text) {
  const source = text == null ? '' : String(text);
  const normalized = source.replace(/\r\n?/g, '\n');
  return { text: normalized, trailingNewline: normalized.endsWith('\n') };
}

// Split normalized text into logical lines, dropping the trailing empty tail.
function toLines(normalized) {
  if (normalized.text === '') return [];
  const lines = normalized.text.split('\n');
  if (normalized.trailingNewline) lines.pop();
  return lines;
}

// Build an LCS-based line operation sequence.
function buildOperations(oldLines, newLines) {
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  if (oldCount === 0) return newLines.map((line) => ({ type: 'add', line }));
  if (newCount === 0) return oldLines.map((line) => ({ type: 'remove', line }));

  const width = newCount + 1;
  const table = new Uint32Array((oldCount + 1) * width);
  for (let oldIndex = oldCount - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newCount - 1; newIndex >= 0; newIndex -= 1) {
      const cell = oldIndex * width + newIndex;
      if (oldLines[oldIndex] === newLines[newIndex]) {
        table[cell] = table[cell + width + 1] + 1;
      } else {
        table[cell] = Math.max(table[cell + width], table[cell + 1]);
      }
    }
  }

  const operations = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldCount && newIndex < newCount) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      operations.push({ type: 'same', line: oldLines[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
    } else if (
      table[(oldIndex + 1) * width + newIndex] >=
      table[oldIndex * width + newIndex + 1]
    ) {
      operations.push({ type: 'remove', line: oldLines[oldIndex] });
      oldIndex += 1;
    } else {
      operations.push({ type: 'add', line: newLines[newIndex] });
      newIndex += 1;
    }
  }
  while (oldIndex < oldCount) {
    operations.push({ type: 'remove', line: oldLines[oldIndex] });
    oldIndex += 1;
  }
  while (newIndex < newCount) {
    operations.push({ type: 'add', line: newLines[newIndex] });
    newIndex += 1;
  }
  return operations;
}

// Build the whole-file replace used above the LCS size guard.
function wholeReplaceHunk(oldLines, newLines) {
  return [{
    id: 'h1',
    kind: 'replace',
    oldStart: oldLines.length > 0 ? 1 : 0,
    newStart: newLines.length > 0 ? 1 : 0,
    oldLines: oldLines.slice(),
    newLines: newLines.slice(),
    accepted: true,
  }];
}

// Attach private trailing-newline facts without changing the enumerable shape.
function tagTrailing(hunks, oldTrailing, newTrailing) {
  const value = [oldTrailing, newTrailing];
  for (const hunk of hunks) {
    Object.defineProperty(hunk, TRAILING_META, { value, enumerable: false });
  }
  return hunks;
}

/**
 * Compute line hunks between an original prompt and its enhancement.
 * @param {string|null|undefined} oldText Original text.
 * @param {string|null|undefined} newText Enhanced text.
 * @returns {Array<{id: string, kind: 'same'|'add'|'remove'|'replace',
 *   oldStart: number, newStart: number, oldLines: string[],
 *   newLines: string[], accepted: boolean}>} Hunks in document order.
 */
function computeHunks(oldText, newText) {
  const oldNormalized = normalizeText(oldText);
  const newNormalized = normalizeText(newText);
  const oldLines = toLines(oldNormalized);
  const newLines = toLines(newNormalized);

  if (oldLines.length > MAX_DIFF_LINES || newLines.length > MAX_DIFF_LINES) {
    return tagTrailing(
      wholeReplaceHunk(oldLines, newLines),
      oldNormalized.trailingNewline,
      newNormalized.trailingNewline,
    );
  }

  const operations = buildOperations(oldLines, newLines);
  const hunks = [];
  let operationIndex = 0;
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let hunkNumber = 1;

  while (operationIndex < operations.length) {
    const isSame = operations[operationIndex].type === 'same';
    const oldStart = oldLineNumber;
    const newStart = newLineNumber;
    const hunkOldLines = [];
    const hunkNewLines = [];

    while (operationIndex < operations.length) {
      const operation = operations[operationIndex];
      if ((operation.type === 'same') !== isSame) break;
      if (operation.type !== 'add') {
        hunkOldLines.push(operation.line);
        oldLineNumber += 1;
      }
      if (operation.type !== 'remove') {
        hunkNewLines.push(operation.line);
        newLineNumber += 1;
      }
      operationIndex += 1;
    }

    let kind;
    if (isSame) kind = 'same';
    else if (hunkOldLines.length === 0) kind = 'add';
    else if (hunkNewLines.length === 0) kind = 'remove';
    else kind = 'replace';

    hunks.push({
      id: `h${hunkNumber}`,
      kind,
      oldStart: hunkOldLines.length > 0 ? oldStart : 0,
      newStart: hunkNewLines.length > 0 ? newStart : 0,
      oldLines: hunkOldLines,
      newLines: hunkNewLines,
      accepted: true,
    });
    hunkNumber += 1;
  }

  // A newline-only toggle has no changed line to attach to. Represent it as a
  // replace hunk so accepting it can select the enhanced trailing-newline state.
  if (
    oldNormalized.trailingNewline !== newNormalized.trailingNewline &&
    !hunks.some((hunk) => hunk.kind !== 'same')
  ) {
    hunks.length = 0;
    hunks.push(wholeReplaceHunk(oldLines, newLines)[0]);
  }

  return tagTrailing(
    hunks,
    oldNormalized.trailingNewline,
    newNormalized.trailingNewline,
  );
}

/**
 * Apply accepted hunks and return the merged prompt.
 *
 * Same hunks are always kept. Accepted change hunks contribute enhanced lines;
 * rejected ones contribute original lines. Unknown ids are ignored. The merged
 * text uses the enhanced trailing-newline state only when every change hunk is
 * accepted; otherwise it keeps the original state.
 * @param {object[]} hunks Hunks produced by computeHunks.
 * @param {string[]|Set<string>} acceptedIds Accepted hunk ids.
 * @returns {string} Merged prompt text.
 */
function applyHunks(hunks, acceptedIds) {
  const accepted = acceptedIds instanceof Set
    ? acceptedIds
    : new Set(acceptedIds || []);
  const outputLines = [];
  let changeCount = 0;
  let allChangesAccepted = true;

  for (const hunk of hunks) {
    const isSame = hunk.kind === 'same';
    const isAccepted = accepted.has(hunk.id);
    if (!isSame) {
      changeCount += 1;
      if (!isAccepted) allChangesAccepted = false;
    }
    const lines = isSame || !isAccepted ? hunk.oldLines : hunk.newLines;
    for (const line of lines) outputLines.push(line);
  }

  const metaHunk = hunks.find((hunk) => hunk[TRAILING_META]);
  const trailing = metaHunk ? metaHunk[TRAILING_META] : [false, false];
  const useNewTrailing = changeCount > 0 && allChangesAccepted;
  const trailingNewline = trailing[useNewTrailing ? 1 : 0];
  return outputLines.join('\n') + (trailingNewline ? '\n' : '');
}

/**
 * Summarize hunk and changed-line counts.
 * @param {object[]} hunks Hunks produced by computeHunks.
 * @returns {{hunks: number, changed: number, added: number, removed: number,
 *   replaced: number, sameLines: number}} Summary counts.
 */
function stats(hunks) {
  const summary = {
    hunks: hunks.length,
    changed: 0,
    added: 0,
    removed: 0,
    replaced: 0,
    sameLines: 0,
  };

  for (const hunk of hunks) {
    if (hunk.kind === 'same') {
      summary.sameLines += hunk.oldLines.length;
    } else {
      summary.changed += 1;
      if (hunk.kind !== 'remove') summary.added += hunk.newLines.length;
      if (hunk.kind !== 'add') summary.removed += hunk.oldLines.length;
      if (hunk.kind === 'replace') summary.replaced += 1;
    }
  }
  return summary;
}

module.exports = { computeHunks, applyHunks, stats, normalizeText };
