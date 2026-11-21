'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RULES, RULE_IDS } = require('../src/protocol.cjs');
const { rulesBlock, clampRationale } = require('../src/host/rules.cjs');

test('the public rule list is stable and every rule has a first-party source', () => {
  assert.equal(RULES.length, 14);
  assert.deepEqual(RULE_IDS, ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14']);
  const known = new Set([
    'https://code.claude.com/docs/en/prompt-library',
    'https://code.claude.com/docs/en/best-practices',
    'https://www.anthropic.com/research/effective-context-engineering-for-ai-agents',
    'https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering',
    'https://github.com/github/spec-kit',
    'https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide',
  ]);
  for (const rule of RULES) {
    assert.match(rule.id, /^R\d+$/);
    assert.ok(rule.zh.length > 0 && rule.en.length > 0);
    assert.ok(Array.isArray(rule.sources) && rule.sources.length > 0);
    for (const source of rule.sources) assert.ok(known.has(source), rule.id + ' cites unknown source ' + source);
  }
});

test('公开经验按需引用，不强制编码流程', () => {
 const block = rulesBlock('general');
 assert.match(block,/仅在不增加用户要求时适用/);
 assert.doesNotMatch(block,/R5 |R6 |coding agent/);
 assert.match(rulesBlock('code'),/R2 /);
});

test('clampRationale keeps only citations of real rules', () => {
  const kept = clampRationale([
    { change: '  把结果写进开头  ', rules: ['r1', 'R5', 'R99'] },
    { change: '', rules: ['R2'] },
    { change: '点名文件', rules: ['nope'] },
    { change: '补验收标准', rules: ['R4', 'R5', 'R6', 'R7'] },
  ]);
  assert.deepEqual(kept, [
    { change: '把结果写进开头', rules: ['R1', 'R5'] },
    { change: '补验收标准', rules: ['R4', 'R5', 'R6'] },
  ]);
  assert.equal(clampRationale('nope').length, 0);
});

test('clampRationale bounds the list and long changes', () => {
  const many = [];
  for (let index = 0; index < 9; index += 1) many.push({ change: 'c' + index, rules: ['R1'] });
  assert.equal(clampRationale(many).length, 6);

  const long = clampRationale([{ change: 'x'.repeat(300), rules: ['R1'] }]);
  assert.equal(long[0].change.length, 160);
});
