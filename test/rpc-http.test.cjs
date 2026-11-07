'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LIMITS, METHODS, RPC_PATH } = require('../src/protocol.cjs');
const {
  createHandler,
  registerRpc,
  readBody,
  readStream,
  isTrustedRequest,
  statusFor,
} = require('../src/host/rpc.cjs');

/**
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [options]
 */
function makeReq(options) {
  const settings = options || {};
  const bytes = Buffer.from(settings.body || '', 'utf8');
  return {
    method: settings.method || 'POST',
    headers: Object.assign({ 'content-type': 'application/json', host: '127.0.0.1:55338' }, settings.headers),
    async *[Symbol.asyncIterator]() {
      if (bytes.length > 0) yield bytes;
    },
  };
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    headersSent: false,
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk);
    },
  };
}

function jsonOf(res) {
  return JSON.parse(res.body);
}

/** @param {string} text */
function textStream(text, finish) {
  return {
    stream() {
      return (async function* run() {
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text };
        yield { type: 'block-end', index: 0, block: { type: 'text', text } };
        yield { type: 'finish', reason: finish || { kind: 'stop' } };
      })();
    },
  };
}

/** @param {Array<{stream: Function}>} streams */
function sequencedLlm(streams) {
  let index = 0;
  return {
    calls: 0,
    stream() {
      const next = streams[Math.min(index, streams.length - 1)];
      index += 1;
      this.calls += 1;
      return next.stream();
    },
  };
}

function hangingLlm() {
  return {
    stream() {
      return {
        [Symbol.asyncIterator]() {
          let settle;
          return {
            // Behaves like a real async generator: the pending next() settles
            // when the consumer calls return(), so no promise is left dangling.
            next: () =>
              new Promise((resolve) => {
                settle = resolve;
              }),
            return: () => {
              if (settle) settle({ done: true, value: undefined });
              return Promise.resolve({ done: true, value: undefined });
            },
          };
        },
      };
    },
  };
}

function handlerWith(overrides) {
  const options = overrides || {};
  return createHandler({
    getLlm: options.getLlm || (() => textStream('{"kind":"enhanced","prompt":"better prompt"}')),
    resolveModelFn:
      options.resolveModelFn || (() => ({ provider: 'deepseek-account', model: 'deepseek-flash', source: 'request' })),
    timeoutMs: options.timeoutMs,
    version: options.version,
  });
}

async function invoke(handler, options) {
  const req = makeReq(options);
  const res = makeRes();
  await handler(req, res);
  return { req, res };
}

test('handler rejects non-POST with 405', async () => {
  const { res } = await invoke(handlerWith(), { method: 'GET', body: '{}' });
  assert.equal(res.statusCode, 405);
  assert.equal(jsonOf(res).error.code, 'METHOD_NOT_ALLOWED');
});

test('handler requires a JSON content type', async () => {
  const { res } = await invoke(handlerWith(), {
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ method: 'ping' }),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(jsonOf(res).error.code, 'BAD_REQUEST');
});

test('handler refuses cross-origin requests', async () => {
  const crossSite = await invoke(handlerWith(), {
    headers: { 'sec-fetch-site': 'cross-site' },
    body: JSON.stringify({ method: 'ping' }),
  });
  assert.equal(crossSite.res.statusCode, 403);

  const badOrigin = await invoke(handlerWith(), {
    headers: { origin: 'http://evil.example', host: '127.0.0.1:55338' },
    body: JSON.stringify({ method: 'ping' }),
  });
  assert.equal(badOrigin.res.statusCode, 403);
  assert.equal(jsonOf(badOrigin.res).error.code, 'FORBIDDEN');
});

test('handler accepts same-origin and missing-origin requests', async () => {
  const sameOrigin = await invoke(handlerWith(), {
    headers: { origin: 'http://127.0.0.1:55338' },
    body: JSON.stringify({ method: 'ping' }),
  });
  assert.equal(sameOrigin.res.statusCode, 200);
});

test('handler answers ping', async () => {
  const { res } = await invoke(handlerWith({ version: '9.9.9' }), { body: JSON.stringify({ method: 'ping' }) });
  assert.equal(res.statusCode, 200);
  const payload = jsonOf(res);
  assert.equal(payload.ok, true);
  assert.equal(payload.result.plugin, 'dsh-prompt-craft');
  assert.equal(payload.result.version, '9.9.9');
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('handler rejects oversized bodies with 413', async () => {
  const payload = JSON.stringify({ method: 'ping', pad: 'x'.repeat(LIMITS.MAX_BODY_BYTES) });
  const { res } = await invoke(handlerWith(), { body: payload });
  assert.equal(res.statusCode, 413);
  assert.equal(jsonOf(res).error.code, 'PAYLOAD_TOO_LARGE');
});

test('handler rejects invalid JSON with 400', async () => {
  const { res } = await invoke(handlerWith(), { body: '{not json' });
  assert.equal(res.statusCode, 400);
});

test('handler rejects unknown methods with 404', async () => {
  const { res } = await invoke(handlerWith(), { body: JSON.stringify({ method: 'nope' }) });
  assert.equal(res.statusCode, 404);
  assert.equal(jsonOf(res).error.code, 'NOT_FOUND');
});

test('handler rejects an empty draft with 400', async () => {
  const { res } = await invoke(handlerWith(), { body: JSON.stringify({ method: METHODS.ENHANCE, draft: '  ' }) });
  assert.equal(res.statusCode, 400);
  assert.equal(jsonOf(res).error.message, 'draft is empty');
});

test('handler reports MODEL_UNRESOLVED with a hint', async () => {
  const { res } = await invoke(handlerWith({ resolveModelFn: () => null }), {
    body: JSON.stringify({ method: METHODS.ENHANCE, draft: 'hello' }),
  });
  assert.equal(res.statusCode, 400);
  const payload = jsonOf(res);
  assert.equal(payload.error.code, 'MODEL_UNRESOLVED');
  assert.match(payload.error.details.hint, /pick a model/);
});

test('handler returns 500 when the llm service is unavailable', async () => {
  const { res } = await invoke(
    handlerWith({
      getLlm: () => {
        throw new Error('no llm');
      },
    }),
    { body: JSON.stringify({ method: METHODS.ENHANCE, draft: 'hello' }) },
  );
  assert.equal(res.statusCode, 500);
  assert.equal(jsonOf(res).error.code, 'INTERNAL');
});

test('handler returns the enhanced result with meta', async () => {
  const llm = textStream(
    JSON.stringify({
      kind: 'enhanced',
      prompt: 'Do X, then Y.',
      scenario: 'code',
      summary: 'Made it concrete.',
      notes: ['pinned the output format'],
    }),
  );
  const { res } = await invoke(handlerWith({ getLlm: () => llm }), {
    body: JSON.stringify({ method: METHODS.ENHANCE, draft: 'do stuff', mode: 'light' }),
  });
  assert.equal(res.statusCode, 200);
  const payload = jsonOf(res);
  assert.equal(payload.ok, true);
  assert.equal(payload.result.kind, 'enhanced');
  assert.equal(payload.result.prompt, 'Do X, then Y.');
  assert.equal(payload.meta.provider, 'deepseek-account');
  assert.equal(payload.meta.model, 'deepseek-flash');
  assert.equal(payload.meta.source, 'request');
  assert.equal(payload.meta.mode, 'light');
  assert.equal(typeof payload.meta.elapsedMs, 'number');
});

test('handler returns the questions shape', async () => {
  const llm = textStream(JSON.stringify({ kind: 'questions', questions: ['Which language?'], summary: 'Need one detail.' }));
  const { res } = await invoke(handlerWith({ getLlm: () => llm }), {
    body: JSON.stringify({ method: METHODS.ENHANCE, draft: 'write a function' }),
  });
  assert.equal(res.statusCode, 200);
  const payload = jsonOf(res);
  assert.equal(payload.result.kind, 'questions');
  assert.deepEqual(payload.result.questions, ['Which language?']);
});

test('handler repairs a non-JSON answer with one extra call', async () => {
  const llm = sequencedLlm([
    textStream('I think you should be clearer.'),
    textStream('{"kind":"enhanced","prompt":"Be concrete.","summary":"ok"}'),
  ]);
  const { res } = await invoke(handlerWith({ getLlm: () => llm }), {
    body: JSON.stringify({ method: METHODS.ENHANCE, draft: 'be clearer' }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(llm.calls, 2);
  assert.equal(jsonOf(res).result.prompt, 'Be concrete.');
});

test('handler returns 502 when both answers are unusable', async () => {
  const llm = sequencedLlm([textStream('nope'), textStream('still nope')]);
  const { res } = await invoke(handlerWith({ getLlm: () => llm }), {
    body: JSON.stringify({ method: METHODS.ENHANCE, draft: 'x' }),
  });
  assert.equal(res.statusCode, 502);
  assert.equal(jsonOf(res).error.code, 'BAD_MODEL_OUTPUT');
});

test('handler reports a failed finish as LLM_FAILED', async () => {
  const llm = textStream('partial', { kind: 'error', failure: { code: 'RATE_LIMIT' } });
  const { res } = await invoke(handlerWith({ getLlm: () => llm }), {
    body: JSON.stringify({ method: METHODS.ENHANCE, draft: 'x' }),
  });
  assert.equal(res.statusCode, 502);
  const payload = jsonOf(res);
  assert.equal(payload.error.code, 'LLM_FAILED');
  assert.equal(payload.error.details.reason, 'error');
  assert.equal(payload.error.details.providerCode, 'RATE_LIMIT');
});

test('handler returns 504 when the model hangs', async () => {
  const { res } = await invoke(handlerWith({ getLlm: () => hangingLlm(), timeoutMs: 25 }), {
    body: JSON.stringify({ method: METHODS.ENHANCE, draft: 'x' }),
  });
  assert.equal(res.statusCode, 504);
  assert.equal(jsonOf(res).error.code, 'TIMEOUT');
});

test('handler supports the refine method', async () => {
  let lastSystem = '';
  const llm = {
    stream(options) {
      lastSystem = options.system;
      return textStream('{"kind":"enhanced","prompt":"Shorter.","summary":"ok"}').stream();
    },
  };
  const { res } = await invoke(handlerWith({ getLlm: () => llm }), {
    body: JSON.stringify({ method: METHODS.REFINE, draft: 'x', instruction: 'shorter', previous: 'y' }),
  });
  assert.equal(res.statusCode, 200);
  assert.match(lastSystem, /REFINE round/);
  assert.equal(jsonOf(res).result.prompt, 'Shorter.');
});

test('readBody enforces the byte cap', async () => {
  const req = makeReq({ body: 'x'.repeat(20) });
  assert.equal(await readBody(req, 100), 'x'.repeat(20));
  await assert.rejects(() => readBody(makeReq({ body: 'x'.repeat(200) }), 100), /too large/);
});

test('readStream collects deltas and the finish reason', async () => {
  const result = await readStream(textStream('hello').stream(), 1000);
  assert.equal(result.text, 'hello');
  assert.equal(result.finish.kind, 'stop');
});

test('readStream falls back to the block-end text', async () => {
  const stream = (async function* run() {
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'from block' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  })();
  const result = await readStream(stream, 1000);
  assert.equal(result.text, 'from block');
});

test('isTrustedRequest accepts loopback same-origin calls', () => {
  assert.equal(isTrustedRequest({ headers: {} }), true);
  assert.equal(isTrustedRequest({ headers: { host: '127.0.0.1:1', origin: 'http://127.0.0.1:1' } }), true);
  assert.equal(isTrustedRequest({ headers: { origin: 'not a url' } }), false);
  assert.equal(isTrustedRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), false);
});

test('statusFor maps error codes to HTTP statuses', () => {
  assert.equal(statusFor({ code: 'BAD_REQUEST' }), 400);
  assert.equal(statusFor({ code: 'MODEL_UNRESOLVED' }), 400);
  assert.equal(statusFor({ code: 'FORBIDDEN' }), 403);
  assert.equal(statusFor({ code: 'NOT_FOUND' }), 404);
  assert.equal(statusFor({ code: 'METHOD_NOT_ALLOWED' }), 405);
  assert.equal(statusFor({ code: 'PAYLOAD_TOO_LARGE' }), 413);
  assert.equal(statusFor({ code: 'TIMEOUT' }), 504);
  assert.equal(statusFor({ code: 'LLM_FAILED' }), 502);
  assert.equal(statusFor({ code: 'BAD_MODEL_OUTPUT' }), 502);
  assert.equal(statusFor({ code: 'INTERNAL' }), 500);
  assert.equal(statusFor({ code: 'SOMETHING_NEW' }), 500);
});

test('registerRpc registers one exact route and returns its disposer', () => {
  const registrations = [];
  const disposer = () => {};
  const ctx = {
    webServer: {
      register(route) {
        registrations.push(route);
        return disposer;
      },
    },
    get(name) {
      return name === 'llm' ? { stream: () => {} } : undefined;
    },
  };
  const dispose = registerRpc(ctx);
  assert.equal(typeof dispose, 'function');
  assert.equal(dispose, disposer);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].kind, 'exact');
  assert.equal(registrations[0].path, RPC_PATH);
  assert.equal(typeof registrations[0].handler, 'function');

  assert.throws(() => registerRpc({}), /web server service is unavailable/);
});
