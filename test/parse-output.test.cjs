'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LIMITS } = require('../src/protocol.cjs');
const {
  stripOuterFence,
  extractJsonObject,
  repairJsonText,
  stripPromptFence,
  normalizeResult,
  parseModelOutput,
} = require('../src/host/parse-output.cjs');

const ENHANCED = JSON.stringify({
  kind: 'enhanced',
  prompt: 'Rewrite the request as a checklist.',
  scenario: 'writing',
  summary: 'Structured the draft.',
  notes: ['added output format'],
});

test('stripOuterFence unwraps a single fence', () => {
  assert.equal(stripOuterFence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripOuterFence('```\nplain\n```'), 'plain');
  assert.equal(stripOuterFence('no fence'), 'no fence');
  assert.equal(stripOuterFence('```json\n{"a":1}\n``` trailing'), '```json\n{"a":1}\n``` trailing');
});

test('extractJsonObject balances braces and ignores them inside strings', () => {
  assert.deepEqual(extractJsonObject('prefix {"a":1} suffix'), { a: 1 });
  assert.deepEqual(extractJsonObject('{"prompt":"use {x} and } here"}'), { prompt: 'use {x} and } here' });
  assert.deepEqual(extractJsonObject('{"a":{"b":[1,2]}}'), { a: { b: [1, 2] } });
  assert.equal(extractJsonObject('no brace at all'), null);
  assert.equal(extractJsonObject('{"a":'), null);
  assert.equal(extractJsonObject('[1,2,3]'), null);
  assert.deepEqual(extractJsonObject('{"a":1}{"b":2}'), { a: 1 });
});

test('stripPromptFence removes a fence wrapping the prompt value', () => {
  assert.equal(stripPromptFence('```text\nhello\n```'), 'hello');
  assert.equal(stripPromptFence('  hello  '), 'hello');
  assert.equal(stripPromptFence('hello ```code``` tail'), 'hello ```code``` tail');
});

test('normalizeResult accepts the enhanced shape', () => {
  const result = normalizeResult({
    kind: 'enhanced',
    prompt: 'Better prompt',
    scenario: 'code',
    summary: 's'.repeat(500),
    goal: 'Ship a working parser',
    elevation: ['from "fix the bug" to "make the parser trustworthy"'],
    notes: [' one ', 'two', 'three', 'four', 'five'],
  });
  assert.equal(result.kind, 'enhanced');
  assert.equal(result.prompt, 'Better prompt');
  assert.equal(result.scenario, 'code');
  assert.equal(result.summary.length, 400);
  assert.equal(result.goal, 'Ship a working parser');
  assert.deepEqual(result.elevation, ['from "fix the bug" to "make the parser trustworthy"']);
  assert.equal(result.notes.length, 4);
});

test('normalizeResult fills goal and elevation defaults', () => {
  const result = normalizeResult({ kind: 'enhanced', prompt: 'Prompt with a goal', goal: '  g '.repeat(100) });
  assert.equal(result.kind, 'enhanced');
  assert.equal(result.goal.length, 200);
  assert.deepEqual(result.elevation, []);

  const plain = normalizeResult({ kind: 'enhanced', prompt: 'no extra fields' });
  assert.equal(plain.goal, '');
  assert.deepEqual(plain.elevation, []);
});

test('normalizeResult tolerates a missing kind when a prompt exists', () => {
  const result = normalizeResult({ prompt: 'Just a prompt' });
  assert.equal(result.kind, 'enhanced');
  assert.equal(result.scenario, 'general');
  assert.deepEqual(result.notes, []);
});

test('normalizeResult rejects empty and oversized prompts', () => {
  assert.equal(normalizeResult({ kind: 'enhanced', prompt: '   ' }), null);
  assert.equal(normalizeResult({ kind: 'enhanced', prompt: 42 }), null);
  assert.equal(normalizeResult({ kind: 'enhanced', prompt: 'x'.repeat(LIMITS.MAX_PROMPT_CHARS + 1) }), null);
});

test('normalizeResult accepts the questions shape', () => {
  const result = normalizeResult({ kind: 'questions', questions: ['which language?', 'which version?', 'extra'], summary: 'need info' });
  assert.equal(result.kind, 'questions');
  assert.deepEqual(result.questions, ['which language?', 'which version?']);
  assert.equal(result.summary, 'need info');

  assert.equal(normalizeResult({ kind: 'questions', questions: [] }), null);
  assert.equal(normalizeResult({ kind: 'questions' }), null);
});

test('normalizeResult rejects unknown kinds without a prompt', () => {
  const tolerated = normalizeResult({ kind: 'unknown', prompt: 'x' });
  assert.equal(tolerated.kind, 'enhanced');
  assert.equal(tolerated.prompt, 'x');

  assert.equal(normalizeResult({ kind: 'unknown' }), null);
  assert.equal(normalizeResult(null), null);
  assert.equal(normalizeResult([1]), null);
});

test('parseModelOutput parses a bare JSON object', () => {
  const parsed = parseModelOutput(ENHANCED);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.result.kind, 'enhanced');
});

test('parseModelOutput parses fenced JSON and JSON with prose around it', () => {
  const fenced = parseModelOutput('```json\n' + ENHANCED + '\n```');
  assert.equal(fenced.ok, true);

  const prose = parseModelOutput('Sure, here you go:\n' + ENHANCED + '\nHope that helps!');
  assert.equal(prose.ok, true);
});

test('parseModelOutput reports BAD_MODEL_OUTPUT with an excerpt', () => {
  const parsed = parseModelOutput('I cannot do that.');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, 'BAD_MODEL_OUTPUT');
  assert.equal(parsed.excerpt, 'I cannot do that.');

  const long = parseModelOutput('x'.repeat(1000));
  assert.equal(long.excerpt.length, 400);
});

test('parseModelOutput treats non-string input as empty', () => {
  const parsed = parseModelOutput(null);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.excerpt, '');
});

test('salvages a prompt that contains raw newlines inside the JSON string', () => {
  const raw = '{"kind":"enhanced","prompt":"line one\nline two","notes":["kept"]}';
  const parsed = parseModelOutput(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.result.prompt, 'line one\nline two');
  assert.deepEqual(parsed.result.notes, ['kept']);
});

test('salvages structural trailing commas', () => {
  const raw = '{"kind":"enhanced","prompt":"ok","notes":["a","b",],}';
  const parsed = parseModelOutput(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.result.prompt, 'ok');
  assert.deepEqual(parsed.result.notes, ['a', 'b']);
});

test('skips a broken candidate and parses the next balanced object', () => {
  const raw = 'first {"broken": } then {"kind":"enhanced","prompt":"recovered"}';
  const parsed = parseModelOutput(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.result.prompt, 'recovered');
});

test('parses a fenced object even with prose around the fence', () => {
  const raw = 'Here you go:\n```json\n{"kind":"enhanced","prompt":"inside"}\n```\nHope it helps.';
  const parsed = parseModelOutput(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.result.prompt, 'inside');
});

test('repairJsonText only touches bare control characters inside strings', () => {
  const repaired = repairJsonText('{"prompt":"a\nb\tc","keep":"\\\\n"}');
  assert.equal(repaired.includes('a\\nb\\tc'), true);
  assert.equal(repaired.includes('"keep":"\\\\n"'), true);
});
