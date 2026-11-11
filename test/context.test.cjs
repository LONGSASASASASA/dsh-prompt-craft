'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { readSessionContext, resolveSession, textFromContent } = require('../src/host/context.cjs');
const { LIMITS } = require('../src/protocol.cjs');

function ctxWith(sessions) {
  return {
    get(name) {
      return name === 'sessions' ? sessions : undefined;
    },
  };
}

function sessionWith(messages) {
  return {
    deriveMessages() {
      return messages;
    },
  };
}

test('textFromContent joins text blocks and ignores everything else', () => {
  assert.equal(textFromContent('plain'), 'plain');
  assert.equal(
    textFromContent([
      { type: 'text', text: 'hello' },
      { type: 'image', source: 'x' },
      { type: 'text', text: 'world' },
      null,
      'nope',
    ]),
    'hello\nworld',
  );
  assert.equal(textFromContent({ type: 'text', text: 'nope' }), '');
  assert.equal(textFromContent(undefined), '');
});

test('readSessionContext maps only user and assistant text', () => {
  const messages = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: [{ type: 'text', text: '我们在做图片压缩脚本' }] },
    { role: 'assistant', content: '  先确认目录和格式  ' },
    { role: 'tool', content: 'tool output' },
    { role: 'user', content: [{ type: 'image', source: 'x' }] },
  ];
  const session = sessionWith(messages);
  const sessions = {
    get(id) {
      return id === 'session-abc' ? session : undefined;
    },
  };

  assert.deepEqual(readSessionContext(ctxWith(sessions), 'session-abc'), [
    { role: 'user', text: '我们在做图片压缩脚本' },
    { role: 'assistant', text: '先确认目录和格式' },
  ]);
});

test('readSessionContext accepts a bare uuid for a prefixed live session', () => {
  const session = sessionWith([{ role: 'user', content: 'hi' }]);
  const sessions = {
    get(id) {
      return id === 'session-98dded05-7544-4e1e-9109-633b0419802c' ? session : undefined;
    },
    list() {
      return [session];
    },
  };
  assert.equal(resolveSession(sessions, 'session-98dded05-7544-4e1e-9109-633b0419802c'), session);
  assert.deepEqual(readSessionContext(ctxWith(sessions), '98dded05-7544-4e1e-9109-633b0419802c'), [
    { role: 'user', text: 'hi' },
  ]);
});

test('readSessionContext is best-effort when the session surface is missing', () => {
  assert.deepEqual(readSessionContext(undefined, 'x'), []);
  assert.deepEqual(readSessionContext({}, 'x'), []);
  assert.deepEqual(readSessionContext(ctxWith(undefined), 'x'), []);
  assert.deepEqual(readSessionContext(ctxWith({}), 'x'), []);
  assert.deepEqual(readSessionContext(ctxWith({ get: () => undefined }), 'x'), []);
  assert.deepEqual(readSessionContext(ctxWith({ get: () => ({}) }), ''), []);
  assert.deepEqual(
    readSessionContext(
      ctxWith({
        get() {
          return sessionWith([{ role: 'user', content: 'hi' }]);
        },
      }),
      'x',
    ),
    [{ role: 'user', text: 'hi' }],
  );
  assert.deepEqual(
    readSessionContext(ctxWith({ get: () => ({ deriveMessages: () => [null, { role: 'user', content: '' }] }) }), 'x'),
    [],
  );
});

test('readSessionContext keeps only the most recent bounded history', () => {
  const messages = Array.from({ length: 9 }, (_, index) => ({ role: 'user', content: 'm' + index }));
  const sessions = { get: () => sessionWith(messages) };
  const context = readSessionContext(ctxWith(sessions), 'x');
  assert.equal(context.length, LIMITS.MAX_CONTEXT_MESSAGES);
  assert.equal(context[0].text, 'm3');
  assert.equal(context[context.length - 1].text, 'm8');
});
