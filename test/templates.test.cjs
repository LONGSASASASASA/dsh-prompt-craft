'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const templates = require('../src/host/templates.cjs');

test('buildSystem contains the base rules, mode rules, scenario rules and schema', () => {
  const system = templates.buildSystem({ mode: 'expert', scenario: 'code', locale: 'zh' });
  assert.match(system, /prompt editor working inside a chat composer/);
  assert.match(system, /EXPERT EDIT/);
  assert.match(system, /Scenario \(code\)/);
  assert.match(system, /用中文写 summary/);
  assert.match(system, /"kind":"enhanced"/);
  assert.match(system, /"kind":"questions"/);
});

test('buildSystem mode selection is exclusive and falls back to standard', () => {
  const light = templates.buildSystem({ mode: 'light', scenario: 'general', locale: 'en' });
  assert.match(light, /LIGHT EDIT/);
  assert.doesNotMatch(light, /STANDARD EDIT/);
  assert.doesNotMatch(light, /EXPERT EDIT/);

  const fallback = templates.buildSystem({ mode: 'nonsense', scenario: 'general', locale: 'en' });
  assert.match(fallback, /STANDARD EDIT/);
  assert.match(fallback, /Write summary, notes and questions in English\./);
  assert.doesNotMatch(fallback, /Scenario \(/);
});

test('buildSystem keeps the user language in the prompt field but localizes metadata', () => {
  const zh = templates.buildSystem({ mode: 'standard', scenario: 'auto', locale: 'zh' });
  const en = templates.buildSystem({ mode: 'standard', scenario: 'auto', locale: 'en' });
  assert.match(zh, /prompt 字段保持草稿本身的语言/);
  assert.match(en, /Write summary, notes and questions in English/);
  assert.notEqual(zh, en);
});

test('buildEnhancePrompt wraps the draft in fences', () => {
  const prompt = templates.buildEnhancePrompt({ mode: 'standard', scenario: 'auto', draft: 'hello world', locale: 'en' });
  assert.equal(prompt.messages.length, 1);
  assert.equal(prompt.messages[0].role, 'user');
  const text = prompt.messages[0].content[0].text;
  assert.match(text, /<<<DRAFT\nhello world\nDRAFT>>>/);
  assert.doesNotMatch(text, /ANSWERS/);
  assert.match(prompt.system, /STANDARD EDIT/);
});

test('buildEnhancePrompt appends answers and a do-not-ask reminder', () => {
  const prompt = templates.buildEnhancePrompt({
    mode: 'light',
    scenario: 'code',
    draft: 'fix it',
    locale: 'zh',
    hints: 'it is TypeScript',
  });
  const text = prompt.messages[0].content[0].text;
  assert.match(text, /<<<ANSWERS\nit is TypeScript\nANSWERS>>>/);
  assert.match(text, /Do not ask these questions again/);
});

test('buildRefinePrompt includes previous rewrite and instruction', () => {
  const prompt = templates.buildRefinePrompt({
    mode: 'standard',
    scenario: 'writing',
    draft: 'original draft',
    previous: 'previous rewrite',
    instruction: 'make it shorter',
    locale: 'en',
  });
  const text = prompt.messages[0].content[0].text;
  assert.match(text, /Original draft prompt:/);
  assert.match(text, /<<<PREVIOUS\nprevious rewrite\nPREVIOUS>>>/);
  assert.match(text, /<<<INSTRUCTION\nmake it shorter\nINSTRUCTION>>>/);
  assert.match(prompt.system, /REFINE round/);
});

test('buildRefinePrompt omits the previous block when there is none', () => {
  const prompt = templates.buildRefinePrompt({
    mode: 'standard',
    scenario: 'auto',
    draft: 'draft',
    previous: '',
    instruction: 'shorter',
    locale: 'zh',
  });
  const text = prompt.messages[0].content[0].text;
  assert.doesNotMatch(text, /PREVIOUS/);
  assert.match(text, /<<<INSTRUCTION\nshorter\nINSTRUCTION>>>/);
});

test('buildRepairMessages asks for bare JSON', () => {
  const messages = templates.buildRepairMessages();
  assert.equal(messages.length, 1);
  assert.match(messages[0].content[0].text, /ONLY the JSON object/);
});

test('clampNotes keeps at most four trimmed notes', () => {
  const notes = templates.clampNotes([' a ', '', null, 'b', 'c', 'd', 'e']);
  assert.deepEqual(notes, ['a', 'b', 'c', 'd']);

  const longNote = templates.clampNotes(['x'.repeat(500)]);
  assert.equal(longNote[0].length, 160);
  assert.deepEqual(templates.clampNotes('nope'), []);
});

test('clampQuestions keeps at most two trimmed questions', () => {
  const questions = templates.clampQuestions([' q1 ', 'q2', 'q3']);
  assert.deepEqual(questions, ['q1', 'q2']);

  const longQuestion = templates.clampQuestions(['x'.repeat(1000)]);
  assert.equal(longQuestion[0].length, 300);
  assert.deepEqual(templates.clampQuestions(undefined), []);
});
