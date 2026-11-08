'use strict';

/**
 * Host-side tests for the WeChat (iLink) bridge. No network: `fetchImpl` is
 * scripted per call and the credential store points at a temp directory.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  WeixinBridge,
  extractText,
  sanitizeInbound,
  defaultStorePath,
} = require('../src/host/weixin.cjs');

function createStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-wx-'));
  return path.join(dir, 'prompt-craft', 'weixin.json');
}

function jsonResponse(payload, status) {
  const code = typeof status === 'number' ? status : 200;
  return {
    ok: code >= 200 && code < 300,
    status: code,
    text: async function text() {
      return typeof payload === 'string' ? payload : JSON.stringify(payload);
    },
  };
}

/**
 * @param {(url: string, index: number) => any} router
 * @returns {{ calls: { url: string, headers: Record<string, string> }[], fetchImpl: (url: string, init: any) => Promise<any> }}
 */
function scriptedFetch(router) {
  const calls = [];
  return {
    calls,
    fetchImpl: async function fetchImpl(url, init) {
      calls.push({
        url: String(url),
        headers: (init && init.headers) || {},
        method: (init && init.method) || 'GET',
        body: init && typeof init.body === 'string' ? init.body : '',
      });
      const response = router(String(url), calls.length);
      if (response instanceof Error) throw response;
      return response || jsonResponse({});
    },
  };
}

function writeAccount(storePath, overrides) {
  const account = Object.assign(
    {
      botToken: 'bot-token-1',
      ilinkBotId: 'bot-1',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      ilinkUserId: 'user-1',
      savedAt: 1,
      cursor: '',
    },
    overrides || {},
  );
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(account, null, 2), { mode: 0o600 });
  return account;
}

async function waitFor(predicate, message, timeoutMs) {
  const limit = timeoutMs || 4000;
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - start > limit) throw new Error('timed out waiting for ' + (message || 'condition'));
    await new Promise(function sleep(resolve) {
      setTimeout(resolve, 15);
    });
  }
}

test('extractText reads only text items and sanitizes control characters', () => {
  assert.equal(extractText({ item_list: [{ type: 1, text_item: { text: ' hello ' } }] }), ' hello ');
  assert.equal(sanitizeInbound(extractText({ item_list: [{ type: 1, text_item: { text: ' hello ' } }] })), 'hello');
  assert.equal(extractText({ item_list: [{ type: 2, image_item: {} }] }), '');
  assert.equal(extractText({ item_list: [{ type: 3, voice_item: { text: '语音转写' } }] }), '语音转写');
  assert.equal(extractText({ item_list: [] }), '');
  assert.equal(extractText(null), '');
  const sanitized = sanitizeInbound(' a\u0000b\u0007c \n ');
  assert.equal(sanitized, 'abc');
  assert.equal(sanitizeInbound('x'.repeat(9000)).length, 8000);
  assert.equal(sanitizeInbound('   '), '');
});

test('defaultStorePath lives under DSH_HOME', () => {
  assert.equal(
    defaultStorePath('C:/tmp/dsh-home'),
    path.join('C:/tmp/dsh-home', 'prompt-craft', 'weixin.json'),
  );
});

test('startLogin shows the QR, then confirmed persists the account', async () => {
  const storePath = createStorePath();
  let statusCalls = 0;
  const { calls, fetchImpl } = scriptedFetch(function router(url) {
    if (url.includes('get_bot_qrcode')) {
      return jsonResponse({ ret: 0, qrcode: 'qr-1', qrcode_img_content: 'https://liteapp.weixin.qq.com/q/abc' });
    }
    if (url.includes('get_qrcode_status')) {
      statusCalls += 1;
      if (statusCalls === 1) return jsonResponse({ ret: 0, status: 'wait' });
      return jsonResponse({
        ret: 0,
        status: 'confirmed',
        bot_token: 'tok-abc',
        ilink_bot_id: 'bot-42',
        baseurl: 'https://ilinkai.weixin.qq.com',
        ilink_user_id: 'wx-user',
      });
    }
    return jsonResponse({ msgs: [], get_updates_buf: '' });
  });

  const bridge = new WeixinBridge({ storePath: storePath, fetchImpl: fetchImpl, log: function noop() {} });
  try {
    const snapshot = await bridge.startLogin();
    assert.equal(snapshot.state, 'waiting');
    assert.equal(snapshot.login.qrcodeUrl, 'https://liteapp.weixin.qq.com/q/abc');
    assert.ok(calls[0].url.includes('get_bot_qrcode?bot_type=3'));
    assert.equal(calls[0].headers['iLink-App-Id'], 'bot');

    await waitFor(function connected() {
      return bridge.status().state === 'connected';
    }, 'bridge to connect');
    const status = bridge.status();
    assert.equal(status.account.ilinkBotId, 'bot-42');
    assert.ok(status.connectedAt);

    const stored = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(stored.botToken, 'tok-abc');
    assert.equal(stored.ilinkBotId, 'bot-42');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(storePath).mode & 0o777, 0o600);
    }
  } finally {
    bridge.stop();
  }
});

test('need_verifycode asks for the numeric code and retries with it', async () => {
  const storePath = createStorePath();
  let statusCalls = 0;
  const { calls, fetchImpl } = scriptedFetch(function router(url) {
    if (url.includes('get_bot_qrcode')) {
      return jsonResponse({ qrcode: 'qr-2', qrcode_img_content: 'https://liteapp.weixin.qq.com/q/xyz' });
    }
    if (url.includes('get_qrcode_status')) {
      statusCalls += 1;
      if (statusCalls === 1) return jsonResponse({ status: 'scaned' });
      if (statusCalls === 2) return jsonResponse({ status: 'need_verifycode' });
      return jsonResponse({
        status: 'confirmed',
        bot_token: 'tok-2',
        ilink_bot_id: 'bot-2',
        baseurl: 'https://ilinkai.weixin.qq.com',
      });
    }
    return jsonResponse({ msgs: [], get_updates_buf: '' });
  });

  const bridge = new WeixinBridge({ storePath: storePath, fetchImpl: fetchImpl, log: function noop() {} });
  try {
    await bridge.startLogin();
    await waitFor(function verifyRequired() {
      return bridge.status().login && bridge.status().login.verifyRequired;
    }, 'verify code request');
    bridge.submitVerifyCode('12ab34');
    await waitFor(function connected() {
      return bridge.status().state === 'connected';
    }, 'bridge to connect after verify');
    assert.ok(
      calls.some(function withCode(call) {
        return call.url.includes('verify_code=1234');
      }),
      'poll should carry the numeric verify code',
    );
  } finally {
    bridge.stop();
  }
});

test('monitor queues text messages, dedupes them and caps the queue', async () => {
  const storePath = createStorePath();
  writeAccount(storePath);
  const message = function make(id, text, extra) {
    return Object.assign({ message_id: id, from_user_id: 'wx-peer', item_list: [{ type: 1, text_item: { text: text } }] }, extra || {});
  };
  let served = false;
  const { fetchImpl } = scriptedFetch(function router(url) {
    if (url.includes('getupdates')) {
      if (served) return jsonResponse({ ret: 0, msgs: [], get_updates_buf: 'cursor-1' });
      served = true;
      return jsonResponse({
        ret: 0,
        msgs: [
          message('m1', 'hello'),
          message('m2', 'world', { group_id: 'g1' }),
          message('m1', 'hello'),
          { message_id: 'm3', item_list: [{ type: 2, image_item: {} }] },
        ],
        get_updates_buf: 'cursor-1',
      });
    }
    return jsonResponse({});
  });

  const bridge = new WeixinBridge({ storePath: storePath, fetchImpl: fetchImpl, log: function noop() {} });
  try {
    await waitFor(function queued() {
      return bridge.peekPending().length === 2;
    }, 'two text messages');
    const pending = bridge.peekPending();
    assert.deepEqual(pending.map(function texts(entry) { return entry.text; }), ['hello', 'world']);
    assert.equal(pending[1].chat, 'group');
    assert.equal(pending[0].chat, 'direct');
    assert.equal(bridge.peekPending().length, 2, 'peek must not consume');
    assert.equal(bridge.takePending().length, 2);
    assert.equal(bridge.peekPending().length, 0);

    for (let i = 0; i < 25; i += 1) bridge.ingest(message('cap-' + i, 'line ' + i));
    assert.equal(bridge.peekPending().length, 20, 'queue is capped');
    assert.equal(bridge.clearPending(), 20);
    assert.equal(bridge.peekPending().length, 0);
  } finally {
    bridge.stop();
  }
});

test('session expiry (-14) pauses the bridge instead of hammering the server', async () => {
  const storePath = createStorePath();
  writeAccount(storePath);
  const { fetchImpl } = scriptedFetch(function router(url) {
    if (url.includes('getupdates')) return jsonResponse({ ret: 0, errcode: -14, errmsg: 'session timeout' });
    return jsonResponse({});
  });
  const bridge = new WeixinBridge({ storePath: storePath, fetchImpl: fetchImpl, log: function noop() {} });
  try {
    await waitFor(function paused() {
      return bridge.status().state === 'paused';
    }, 'bridge to pause');
    assert.equal(bridge.status().lastError, 'session-expired');
  } finally {
    bridge.stop();
  }
});

test('network errors are recorded and retried without throwing', async () => {
  const storePath = createStorePath();
  writeAccount(storePath);
  const { fetchImpl } = scriptedFetch(function router(url) {
    if (url.includes('getupdates')) return new Error('boom');
    return jsonResponse({});
  });
  const bridge = new WeixinBridge({ storePath: storePath, fetchImpl: fetchImpl, log: function noop() {} });
  try {
    await waitFor(function recorded() {
      return bridge.status().lastError === 'boom';
    }, 'lastError to be recorded');
  } finally {
    bridge.stop();
  }
});

test('logout clears credentials, queue and state', async () => {
  const storePath = createStorePath();
  writeAccount(storePath);
  const { fetchImpl } = scriptedFetch(function router() {
    return jsonResponse({ ret: 0, msgs: [], get_updates_buf: '' });
  });
  const bridge = new WeixinBridge({ storePath: storePath, fetchImpl: fetchImpl, log: function noop() {} });
  try {
    bridge.ingest({ message_id: 'm9', from_user_id: 'x', item_list: [{ type: 1, text_item: { text: 'queued' } }] });
    assert.equal(bridge.peekPending().length, 1);
    const status = bridge.logout();
    assert.equal(status.state, 'idle');
    assert.equal(status.queueSize, 0);
    assert.equal(status.account, null);
    assert.equal(fs.existsSync(storePath), false);
  } finally {
    bridge.stop();
  }
});

test('getupdates is a POST with the cursor and base_info in the JSON body', async () => {
  const storePath = createStorePath();
  writeAccount(storePath);
  const { calls, fetchImpl } = scriptedFetch(function router(url) {
    if (url.includes('getupdates')) {
      return jsonResponse({
        ret: 0,
        msgs: [{ message_id: 'm1', from_user_id: 'user-1', item_list: [{ type: 1, text_item: { text: 'hi' } }] }],
        get_updates_buf: 'cursor-2',
      });
    }
    return jsonResponse({ ret: 0 });
  });
  const bridge = new WeixinBridge({ storePath: storePath, fetchImpl: fetchImpl, log: function noop() {} });
  try {
    await waitFor(function queued() {
      return bridge.peekPending().length === 1;
    }, 'message to be queued');
    const poll = calls.find(function isPoll(call) {
      return call.url.includes('getupdates');
    });
    assert.ok(poll, 'getupdates was called');
    assert.equal(poll.method, 'POST');
    const body = JSON.parse(poll.body);
    assert.equal(body.get_updates_buf, '');
    assert.equal(body.base_info.channel_version, '0.4.0');
    assert.equal(body.base_info.bot_agent, 'dsh-prompt-craft/0.4.0');
  } finally {
    bridge.stop();
  }
});

test('a non-zero getupdates ret is surfaced instead of being treated as an empty poll', async () => {
  const storePath = createStorePath();
  writeAccount(storePath);
  const { fetchImpl } = scriptedFetch(function router(url) {
    if (url.includes('getupdates')) return jsonResponse({ ret: -1 });
    return jsonResponse({ ret: 0 });
  });
  const bridge = new WeixinBridge({ storePath: storePath, fetchImpl: fetchImpl, log: function noop() {} });
  try {
    await waitFor(function recorded() {
      return bridge.status().lastError === 'getupdates ret -1';
    }, 'ret -1 to be recorded');
    assert.equal(bridge.status().state, 'connected');
    assert.equal(bridge.peekPending().length, 0);
  } finally {
    bridge.stop();
  }
});
