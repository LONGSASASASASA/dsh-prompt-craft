'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEnhance, validateRefine } = require('../src/protocol.cjs');
const templates = require('../src/host/templates.cjs');

test('明确输入不再受升维或文言模板驱动', () => {
  const system = templates.buildSystem({ mode: 'expert', scenario: 'general', locale: 'zh' });
  assert.match(system, /忠实原意优先/);
  assert.match(system, /每轮最多一个/);
  assert.doesNotMatch(system, /compact classical register|Raise the draft|You rewrite draft prompts for a coding agent/);
});
test('仅润色是显式契约，继续改稿也保留澄清记录', () => {
  const clarification = [{ question: '希望是什么感觉？', answer: '简洁克制，不要毛玻璃' }];
  const request = validateEnhance({ draft: '高级一点', polishOnly: true, clarification });
  assert.equal(request.value.polishOnly, true);
  assert.deepEqual(request.value.clarification, clarification);
  const refine = validateRefine({ draft: '高级一点', instruction: '更短', clarification });
  assert.deepEqual(refine.value.clarification, clarification);
  const prompt = templates.buildEnhancePrompt({ ...request.value });
  assert.match(prompt.system, /仅润色原文/);
  assert.match(prompt.messages[0].content[0].text, /简洁克制，不要毛玻璃/);
});
test('提问一次一个，回答后仍可澄清新歧义', () => {
  assert.deepEqual(templates.clampQuestions(['一？', '二？']), ['一？']);
  const text = templates.buildEnhancePrompt({ draft: '改高级点', hints: '简洁', mode: 'standard' }).messages[0].content[0].text;
  assert.doesNotMatch(text, /return the enhanced prompt|Do not ask these questions again/);
});
