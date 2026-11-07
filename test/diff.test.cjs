'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeHunks,
  applyHunks,
  stats,
  normalizeText,
} = require('../src/client/diff.js');

function allIds(hunks) {
  return hunks.map((hunk) => hunk.id);
}

function changeHunks(hunks) {
  return hunks.filter((hunk) => hunk.kind !== 'same');
}

function assertRoundTrip(oldText, newText, label) {
  const hunks = computeHunks(oldText, newText);
  const oldNormalized = normalizeText(oldText).text;
  const newNormalized = normalizeText(newText).text;

  assert.equal(
    applyHunks(hunks, allIds(hunks)),
    newNormalized,
    `${label}: accepting every hunk must reproduce the enhanced text`,
  );
  assert.equal(
    applyHunks(hunks, []),
    oldNormalized,
    `${label}: accepting nothing must reproduce the original text`,
  );

  return hunks;
}

test('normalizeText handles empty input, line endings, and trailing newline', () => {
  assert.deepEqual(normalizeText(null), {
    text: '',
    trailingNewline: false,
  });
  assert.deepEqual(normalizeText(undefined), {
    text: '',
    trailingNewline: false,
  });
  assert.deepEqual(normalizeText(''), {
    text: '',
    trailingNewline: false,
  });
  assert.deepEqual(normalizeText('a\r\nb\rc\r\n'), {
    text: 'a\nb\nc\n',
    trailingNewline: true,
  });
  assert.deepEqual(normalizeText('a\r\nb\rc'), {
    text: 'a\nb\nc',
    trailingNewline: false,
  });
  assert.deepEqual(normalizeText('\n'), {
    text: '\n',
    trailingNewline: true,
  });
});

test('empty to empty produces no hunks and empty output', () => {
  const hunks = computeHunks('', '');

  assert.deepEqual(hunks, []);
  assert.equal(applyHunks(hunks, []), '');
  assert.equal(applyHunks(hunks, allIds(hunks)), '');
  assert.deepEqual(stats(hunks), {
    hunks: 0,
    changed: 0,
    added: 0,
    removed: 0,
    replaced: 0,
    sameLines: 0,
  });
});

test('empty to text produces one add hunk', () => {
  const hunks = computeHunks('', 'hello');
  const expected = {
    id: 'h1',
    kind: 'add',
    oldStart: 0,
    newStart: 1,
    oldLines: [],
    newLines: ['hello'],
    accepted: true,
  };

  assert.equal(hunks.length, 1);
  assert.deepEqual(hunks[0], expected);
  assert.equal(applyHunks(hunks, []), '');
  assert.equal(applyHunks(hunks, allIds(hunks)), 'hello');
});

test('text to empty produces one remove hunk', () => {
  const hunks = computeHunks('hello', '');
  const expected = {
    id: 'h1',
    kind: 'remove',
    oldStart: 1,
    newStart: 0,
    oldLines: ['hello'],
    newLines: [],
    accepted: true,
  };

  assert.equal(hunks.length, 1);
  assert.deepEqual(hunks[0], expected);
  assert.equal(applyHunks(hunks, []), 'hello');
  assert.equal(applyHunks(hunks, allIds(hunks)), '');
});

test('identical text produces same hunks that round-trip either way', () => {
  const text = 'alpha\nbeta\ngamma';
  const hunks = computeHunks(text, text);

  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].kind, 'same');
  assert.deepEqual(hunks[0].oldLines, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(hunks[0].newLines, hunks[0].oldLines);
  assert.equal(applyHunks(hunks, []), text);
  assert.equal(applyHunks(hunks, allIds(hunks)), text);
});

test('single-line word change produces one replace hunk', () => {
  const hunks = computeHunks('hello world', 'hello there');

  assert.equal(hunks.length, 1);
  assert.deepEqual(hunks[0], {
    id: 'h1',
    kind: 'replace',
    oldStart: 1,
    newStart: 1,
    oldLines: ['hello world'],
    newLines: ['hello there'],
    accepted: true,
  });
  assert.equal(applyHunks(hunks, []), 'hello world');
  assert.equal(applyHunks(hunks, allIds(hunks)), 'hello there');
});

test('pure insertion in the middle is one add hunk', () => {
  const oldText = 'a\nb\nc';
  const newText = 'a\nx\nb\nc';
  const hunks = computeHunks(oldText, newText);

  assert.deepEqual(hunks.map((hunk) => hunk.kind), ['same', 'add', 'same']);
  assert.equal(hunks[1].id, 'h2');
  assert.equal(hunks[1].oldStart, 0);
  assert.equal(hunks[1].newStart, 2);
  assert.deepEqual(hunks[1].oldLines, []);
  assert.deepEqual(hunks[1].newLines, ['x']);
  assert.equal(applyHunks(hunks, ['h2']), newText);
  assert.equal(applyHunks(hunks, []), oldText);
});

test('pure deletion in the middle is one remove hunk', () => {
  const oldText = 'a\nx\nb';
  const newText = 'a\nb';
  const hunks = computeHunks(oldText, newText);

  assert.deepEqual(hunks.map((hunk) => hunk.kind), ['same', 'remove', 'same']);
  assert.equal(hunks[1].id, 'h2');
  assert.equal(hunks[1].oldStart, 2);
  assert.equal(hunks[1].newStart, 0);
  assert.deepEqual(hunks[1].oldLines, ['x']);
  assert.deepEqual(hunks[1].newLines, []);
  assert.equal(applyHunks(hunks, ['h2']), newText);
  assert.equal(applyHunks(hunks, []), oldText);
});

test('two separated edits produce two change hunks in document order', () => {
  const oldText = 'one\ntwo\nthree\nfour\nfive';
  const newText = 'one\nTWO\nthree\nFOUR\nfive';
  const hunks = computeHunks(oldText, newText);
  const changes = changeHunks(hunks);

  assert.deepEqual(
    hunks.map((hunk) => hunk.kind),
    ['same', 'replace', 'same', 'replace', 'same'],
  );
  assert.deepEqual(
    changes.map((hunk) => hunk.id),
    ['h2', 'h4'],
  );
  assert.deepEqual(allIds(hunks), ['h1', 'h2', 'h3', 'h4', 'h5']);
  assert.equal(applyHunks(hunks, allIds(hunks)), newText);
  assert.equal(applyHunks(hunks, ['h1']), oldText);
  assert.equal(applyHunks(hunks, ['h2']), 'one\nTWO\nthree\nfour\nfive');
  assert.equal(applyHunks(hunks, ['h4']), 'one\ntwo\nthree\nFOUR\nfive');
});

test('round-trips are exact across newline, CRLF, unicode, and large inputs', () => {
  const lines300 = Array.from({ length: 300 }, (_, index) => `line ${index + 1}`);
  const enhanced300 = lines300.slice();
  enhanced300[9] = 'line 10 (enhanced)';
  enhanced300[149] = 'line 150 (enhanced)';
  enhanced300[299] = 'line 300 (enhanced)';

  const cases = [
    {
      label: 'trailing newline',
      oldText: '# Title\n\nIntro line\n',
      newText: '# Title\n\nEnhanced intro line\n',
    },
    {
      label: 'no trailing newline',
      oldText: 'alpha\nbeta',
      newText: 'alpha\nbeta\ngamma',
    },
    {
      label: 'CRLF input',
      oldText: 'line one\r\nline two\r\nline three\r\n',
      newText: 'line one\r\nLINE TWO\r\nline three',
    },
    {
      label: 'unicode Chinese text',
      oldText: '你好，世界\n这是提示词。',
      newText: '你好，世界！\n这是增强后的提示词。\n请保持简洁。',
    },
    {
      label: '300 lines with three scattered edits',
      oldText: lines300.join('\n'),
      newText: `${enhanced300.join('\n')}\n`,
    },
    {
      label: 'trailing-newline-only change',
      oldText: 'same line\n',
      newText: 'same line',
    },
  ];

  for (const item of cases) {
    const hunks = assertRoundTrip(item.oldText, item.newText, item.label);

    if (item.label === '300 lines with three scattered edits') {
      assert.ok(
        changeHunks(hunks).length >= 3,
        'the 300-line case should expose at least three change hunks',
      );
    }
  }
});

test('duplicate identical lines still round-trip', () => {
  const oldText = 'begin\ndup\ndup\ndup\nend';
  const newText = 'begin\ndup\nCHANGED\ndup\ndup\nend';
  const hunks = assertRoundTrip(oldText, newText, 'duplicate lines');

  assert.ok(changeHunks(hunks).length >= 1);
  assert.equal(applyHunks(hunks, allIds(hunks)), newText);
});

test('stats counts hunks and line totals on a known example', () => {
  const hunks = computeHunks('a\nb\nc\nd', 'a\nB\nc\nd\ne');

  assert.deepEqual(stats(hunks), {
    hunks: 4,
    changed: 2,
    added: 2,
    removed: 1,
    replaced: 1,
    sameLines: 3,
  });
});

test('inputs over 4000 lines fall back to one replace hunk', () => {
  const oldLines = Array.from({ length: 4001 }, (_, index) => `old ${index + 1}`);
  const newLines = oldLines.slice();
  newLines[2000] = 'new middle';
  const oldText = oldLines.join('\n');
  const newText = newLines.join('\n');
  const hunks = computeHunks(oldText, newText);

  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].kind, 'replace');
  assert.equal(hunks[0].oldStart, 1);
  assert.equal(hunks[0].newStart, 1);
  assert.equal(applyHunks(hunks, []), oldText);
  assert.equal(applyHunks(hunks, allIds(hunks)), newText);
});

test('accepted ids may be a Set and unknown ids are ignored', () => {
  const oldText = 'a\nb\nc';
  const newText = 'a\nB\nc';
  const hunks = computeHunks(oldText, newText);
  const accepted = new Set(['h2', 'does-not-exist', 'h99']);

  assert.equal(applyHunks(hunks, accepted), newText);
  assert.equal(applyHunks(hunks, ['does-not-exist']), oldText);
});
