'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const protocol = require('../src/protocol.cjs');
const { normalizeEffort, normalizeModel, validateProbe } = protocol;

test('protocol constants are stable', () => {
  assert.equal(protocol.PLUGIN_ID, 'dsh-prompt-craft');
  assert.equal(protocol.RPC_PATH, '/dsh-prompt-craft/rpc');
  assert.deepEqual(protocol.MODES, ['light', 'standard', 'expert']);
  assert.deepEqual(protocol.SCENARIOS, ['auto', 'code', 'writing', 'research', 'agent', 'general']);
  assert.equal(protocol.LIMITS.MAX_BODY_BYTES, 1024 * 1024);
  assert.equal(protocol.LIMITS.MAX_DRAFT_CHARS, 20000);
  assert.equal(protocol.LIMITS.MAX_QUESTIONS, 2);
});

test('normalizeMode falls back to standard', () => {
  assert.equal(protocol.normalizeMode('expert'), 'expert');
  assert.equal(protocol.normalizeMode('light'), 'light');
  assert.equal(protocol.normalizeMode('nope'), 'standard');
  assert.equal(protocol.normalizeMode(undefined), 'standard');
  assert.equal(protocol.normalizeMode('EXPERT'), 'standard');
});

test('normalizeScenario falls back to auto', () => {
  assert.equal(protocol.normalizeScenario('code'), 'code');
  assert.equal(protocol.normalizeScenario('nope'), 'auto');
  assert.equal(protocol.normalizeScenario(null), 'auto');
});

test('normalizeModel requires provider and model', () => {
  assert.deepEqual(protocol.normalizeModel({ provider: 'deepseek-account', model: 'deepseek-flash' }), {
    provider: 'deepseek-account',
    model: 'deepseek-flash',
  });
  assert.deepEqual(
    protocol.normalizeModel({ provider: ' deepseek-account ', model: 'deepseek-flash', reasoningEffort: ' max ' }),
    { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' },
  );
  assert.equal(protocol.normalizeModel({ provider: '', model: 'x' }), null);
  assert.equal(protocol.normalizeModel({ provider: 'x' }), null);
  assert.equal(protocol.normalizeModel('x/y'), null);
  assert.equal(protocol.normalizeModel(null), null);
});

test('tokenBudgetFor grows with reasoning intensity', () => {
  assert.equal(protocol.tokenBudgetFor(undefined), 4096);
  assert.equal(protocol.tokenBudgetFor(''), 4096);
  assert.equal(protocol.tokenBudgetFor('off'), 4096);
  assert.equal(protocol.tokenBudgetFor('minimal'), 8000);
  assert.equal(protocol.tokenBudgetFor('low'), 8000);
  assert.equal(protocol.tokenBudgetFor('medium'), 8000);
  assert.equal(protocol.tokenBudgetFor('high'), 16000);
  assert.equal(protocol.tokenBudgetFor('xhigh'), 16000);
  assert.equal(protocol.tokenBudgetFor('max'), 16000);
  assert.equal(protocol.tokenBudgetFor('nonsense'), 4096);
});

test('validateEnhance accepts a normal body', () => {
  const result = protocol.validateEnhance({
    draft: 'write a poem',
    mode: 'expert',
    scenario: 'writing',
    sessionId: 's-1',
    locale: 'en',
    hints: '  about the sea  ',
    model: { provider: 'deepseek-account', model: 'deepseek-flash' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.draft, 'write a poem');
  assert.equal(result.value.mode, 'expert');
  assert.equal(result.value.scenario, 'writing');
  assert.equal(result.value.sessionId, 's-1');
  assert.equal(result.value.locale, 'en');
  assert.equal(result.value.hints, 'about the sea');
  assert.deepEqual(result.value.model, { provider: 'deepseek-account', model: 'deepseek-flash' });
});

test('validateEnhance rejects missing, empty, and oversized drafts', () => {
  assert.equal(protocol.validateEnhance(null).ok, false);
  assert.equal(protocol.validateEnhance({ draft: '   ' }).ok, false);
  assert.equal(protocol.validateEnhance({ draft: '   ' }).error.code, 'BAD_REQUEST');
  const oversized = protocol.validateEnhance({ draft: 'x'.repeat(protocol.LIMITS.MAX_DRAFT_CHARS + 1) });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.error.details.actual, protocol.LIMITS.MAX_DRAFT_CHARS + 1);
});

test('validateEnhance normalizes hostile input instead of throwing', () => {
  const result = protocol.validateEnhance({
    draft: 'draft',
    mode: 42,
    scenario: 'weird',
    locale: 'fr',
    sessionId: { toString: () => 'nope' },
    hints: ['not', 'a', 'string'],
    model: 'not-an-object',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.mode, 'standard');
  assert.equal(result.value.scenario, 'auto');
  assert.equal(result.value.locale, 'zh');
  assert.equal(result.value.sessionId, '');
  assert.equal(result.value.hints, '');
  assert.equal(result.value.model, null);
});

test('validateRefine requires a draft and an instruction', () => {
  assert.equal(protocol.validateRefine({}).ok, false);
  const missingInstruction = protocol.validateRefine({ draft: 'draft' });
  assert.equal(missingInstruction.ok, false);
  assert.equal(missingInstruction.error.message, 'instruction is empty');

  const ok = protocol.validateRefine({ draft: 'draft', instruction: 'shorter', previous: 'older' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.instruction, 'shorter');
  assert.equal(ok.value.previous, 'older');
});

test('validateRefine enforces the previous-prompt and instruction limits', () => {
  const longPrevious = protocol.validateRefine({
    draft: 'draft',
    instruction: 'x',
    previous: 'p'.repeat(protocol.LIMITS.MAX_PREVIOUS_CHARS + 1),
  });
  assert.equal(longPrevious.ok, false);

  const longInstruction = protocol.validateRefine({
    draft: 'draft',
    instruction: 'x'.repeat(protocol.LIMITS.MAX_INSTRUCTION_CHARS + 1),
  });
  assert.equal(longInstruction.ok, false);
  assert.equal(longInstruction.error.message, 'instruction is too long');
});

test('normalizeEffort forwards only supported reasoning levels', () => {
  assert.equal(normalizeEffort('low'), 'low');
  assert.equal(normalizeEffort(' HIGH '), 'high');
  assert.equal(normalizeEffort('max'), 'max');
  assert.equal(normalizeEffort('off'), '');
  assert.equal(normalizeEffort('none'), '');
  assert.equal(normalizeEffort('auto'), '');
  assert.equal(normalizeEffort('weird'), '');
  assert.equal(normalizeEffort(undefined), '');
});

test('normalizeModel drops an unsupported reasoning effort', () => {
  assert.deepEqual(normalizeModel({ provider: 'p', model: 'm', reasoningEffort: 'none' }), {
    provider: 'p',
    model: 'm',
  });
  assert.deepEqual(normalizeModel({ provider: 'p', model: 'm', reasoningEffort: 'xhigh' }), {
    provider: 'p',
    model: 'm',
    reasoningEffort: 'xhigh',
  });
});

test('validateProbe needs a model or a session', () => {
  const missing = validateProbe({});
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'BAD_REQUEST');

  const byModel = validateProbe({ model: { provider: 'noki', model: 'gpt-6.1-sol', reasoningEffort: 'low' } });
  assert.equal(byModel.ok, true);
  assert.deepEqual(byModel.value.model, { provider: 'noki', model: 'gpt-6.1-sol', reasoningEffort: 'low' });

  const bySession = validateProbe({ sessionId: 's-1' });
  assert.equal(bySession.ok, true);
  assert.equal(bySession.value.model, null);
  assert.equal(bySession.value.sessionId, 's-1');
});

test('normalizeContext keeps only recent, text-only, bounded history', () => {
  assert.deepEqual(protocol.normalizeContext('nope'), []);
  assert.deepEqual(protocol.normalizeContext([{ role: 'system', text: 'ignored' }]), []);

  const cleaned = protocol.normalizeContext([
    { role: 'system', text: 'prompt' },
    { role: 'tool', text: 'result' },
    { role: 'user', text: '  这 是 用户 说的话  ' },
    { role: 'assistant', content: 'not text role' },
    { role: 'assistant', text: 'reply' },
  ]);
  assert.deepEqual(cleaned, [
    { role: 'user', text: '这 是 用户 说的话' },
    { role: 'assistant', text: 'reply' },
  ]);

  const clipped = protocol.normalizeContext([{ role: 'user', text: 'x'.repeat(5000) }]);
  assert.equal(clipped[0].text.length, protocol.LIMITS.MAX_CONTEXT_MESSAGE_CHARS);

  const many = Array.from({ length: 10 }, (_, index) => ({ role: 'user', text: 'm' + index }));
  assert.deepEqual(
    protocol.normalizeContext(many).map((message) => message.text),
    ['m4', 'm5', 'm6', 'm7', 'm8', 'm9'],
  );

  const huge = Array.from({ length: 6 }, () => ({
    role: 'user',
    text: 'y'.repeat(protocol.LIMITS.MAX_CONTEXT_MESSAGE_CHARS),
  }));
  const trimmed = protocol.normalizeContext(huge);
  const total = trimmed.reduce((sum, message) => sum + message.text.length, 0);
  assert.ok(total <= protocol.LIMITS.MAX_CONTEXT_CHARS);
  assert.ok(trimmed.length < huge.length);
});

test('validateEnhance and validateRefine send context by default and honour an opt-out', () => {
  const defaults = protocol.validateEnhance({ draft: 'hi' });
  assert.equal(defaults.ok, true);
  assert.equal(defaults.value.withContext, true);

  const off = protocol.validateEnhance({ draft: 'hi', withContext: false });
  assert.equal(off.value.withContext, false);

  const refine = protocol.validateRefine({ draft: 'hi', instruction: 'shorter' });
  assert.equal(refine.ok, true);
  assert.equal(refine.value.withContext, true);
});
