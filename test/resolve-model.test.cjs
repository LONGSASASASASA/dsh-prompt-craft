'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { coerceSelection, resolveModel } = require('../src/host/resolve-model.cjs');

test('coerceSelection reads the wire shape', () => {
  assert.deepEqual(coerceSelection({ provider: 'deepseek-account', model: 'deepseek-flash' }), {
    provider: 'deepseek-account',
    model: 'deepseek-flash',
  });
  assert.deepEqual(
    coerceSelection({ provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' }),
    { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' },
  );
});

test('coerceSelection reads alternative field names', () => {
  assert.deepEqual(coerceSelection({ providerId: 'p', modelId: 'm' }), { provider: 'p', model: 'm' });
  assert.deepEqual(coerceSelection({ route: 'p', name: 'm' }), { provider: 'p', model: 'm' });
  assert.deepEqual(coerceSelection('deepseek-account/deepseek-flash'), {
    provider: 'deepseek-account',
    model: 'deepseek-flash',
  });
});

test('coerceSelection unwraps nested selections', () => {
  assert.deepEqual(coerceSelection({ current: { provider: 'p', model: 'm' } }), { provider: 'p', model: 'm' });
  assert.deepEqual(coerceSelection({ selection: { current: { provider: 'p', model: 'm' } } }), {
    provider: 'p',
    model: 'm',
  });
  assert.deepEqual(coerceSelection({ config: { model: { provider: 'p', model: 'm' } } }), {
    provider: 'p',
    model: 'm',
  });
});

test('coerceSelection rejects unusable values', () => {
  assert.equal(coerceSelection(null), null);
  assert.equal(coerceSelection(undefined), null);
  assert.equal(coerceSelection(''), null);
  assert.equal(coerceSelection('no-slash'), null);
  assert.equal(coerceSelection('p/'), null);
  assert.equal(coerceSelection({}), null);
  assert.equal(coerceSelection({ provider: 'p' }), null);
  assert.equal(coerceSelection({ provider: 'p', model: 'p' }), null);
  assert.equal(coerceSelection([{ provider: 'p', model: 'm' }]), null);
});

test('coerceSelection gives up after four nesting levels', () => {
  const deep = { a: { b: { c: { d: { e: { provider: 'p', model: 'm' } } } } } };
  const wrapped = { current: { current: { current: { current: deep } } } };
  assert.equal(coerceSelection(wrapped), null);
});

/** @param {Record<string, any>} services */
function fakeCtx(services) {
  return {
    get(name) {
      return services[name];
    },
  };
}

test('resolveModel prefers the explicit client selection', () => {
  const ctx = fakeCtx({
    agents: { get: () => ({ model: { current: () => ({ provider: 'agent', model: 'agent-model' }) } }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'default-model' }) },
  });
  const resolved = resolveModel(ctx, { provider: 'client', model: 'client-model' }, 's-1');
  assert.deepEqual(resolved, { provider: 'client', model: 'client-model', source: 'request' });
});

test('resolveModel falls back to the live agent', () => {
  const ctx = fakeCtx({
    agents: { get: () => ({ model: { current: () => ({ provider: 'agent', model: 'agent-model' }) } }) },
    sessions: { get: () => ({ requestHeader: () => ({ config: { provider: 'header', model: 'header-model' } }) }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'default-model' }) },
  });
  const resolved = resolveModel(ctx, null, 's-1');
  assert.equal(resolved.source, 'agent');
  assert.equal(resolved.provider, 'agent');
});

test('resolveModel falls back to the session request header', () => {
  const ctx = fakeCtx({
    agents: { get: () => undefined },
    sessions: { get: () => ({ requestHeader: () => ({ config: { provider: 'header', model: 'header-model' } }) }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'default-model' }) },
  });
  const resolved = resolveModel(ctx, null, 's-1');
  assert.deepEqual(resolved, { provider: 'header', model: 'header-model', source: 'session-header' });
});

test('resolveModel falls back to the deployment default', () => {
  const ctx = fakeCtx({
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'default-model' }) },
  });
  const resolved = resolveModel(ctx, null, 's-1');
  assert.deepEqual(resolved, { provider: 'default', model: 'default-model', source: 'default' });
});

test('resolveModel returns null when nothing can be resolved', () => {
  assert.equal(resolveModel(fakeCtx({}), null, 's-1'), null);
  assert.equal(resolveModel(fakeCtx({ agents: { get: () => ({}) } }), null, 's-1'), null);
  assert.equal(resolveModel(null, null, undefined), null);
});

test('resolveModel survives throwing services', () => {
  const ctx = {
    get(name) {
      if (name === 'agents') throw new Error('no agents');
      if (name === 'sessions') return { get: () => { throw new Error('boom'); } };
      if (name === 'agentDefaultModel') return { currentSelection: () => { throw new Error('boom'); } };
      return undefined;
    },
  };
  assert.equal(resolveModel(ctx, null, 's-1'), null);
});

test('resolveModel ignores a sessionId it was given but whose agent is absent', () => {
  const ctx = fakeCtx({
    agents: { get: () => null },
    sessions: { get: () => null },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
  });
  const resolved = resolveModel(ctx, null, 'unknown');
  assert.equal(resolved.source, 'default');
});
