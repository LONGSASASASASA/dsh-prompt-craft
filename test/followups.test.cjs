'use strict';

/**
 * The follow-up strip talks to the host and fills the composer draft. These
 * tests exercise the client modules directly: a tiny hook runtime stands in
 * for React so effects actually run between renders, and a stubbed `fetch`
 * stands in for the plugin RPC route.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

/* ---------------------------------------------------------- hook runtime */

function createHookRuntime() {
  const hooks = [];
  let cursor = 0;
  let pending = [];

  return {
    begin() {
      cursor = 0;
      pending = [];
    },
    effect(run, deps) {
      const index = cursor;
      cursor += 1;
      const slot = hooks[index] || (hooks[index] = { deps: null, cleanup: null });
      const previous = slot.deps;
      const changed = !previous || !deps || deps.some(function differs(value, i) {
        return value !== previous[i];
      });
      if (changed) {
        pending.push({ slot, run });
        slot.deps = deps ? deps.slice() : null;
      }
    },
    ref(initial) {
      const index = cursor;
      cursor += 1;
      if (hooks[index] === undefined) {
        hooks[index] = { current: initial === undefined ? null : initial };
      }
      return hooks[index];
    },
    callback(fn) {
      cursor += 1;
      return fn;
    },
    memo(fn) {
      cursor += 1;
      return fn();
    },
    state(initial) {
      const index = cursor;
      cursor += 1;
      const slot = hooks[index] || (hooks[index] = { value: typeof initial === 'function' ? initial() : initial });
      return [
        slot.value,
        function setValue(next) {
          slot.value = typeof next === 'function' ? next(slot.value) : next;
        },
      ];
    },
    snapshot(getSnapshot) {
      cursor += 1;
      return getSnapshot();
    },
    reset() {
      hooks.length = 0;
      cursor = 0;
      pending = [];
    },
    flush() {
      const effects = pending;
      pending = [];
      for (const item of effects) {
        if (typeof item.slot.cleanup === 'function') {
          const cleanup = item.slot.cleanup;
          item.slot.cleanup = null;
          cleanup();
        }
        const cleanup = item.run();
        item.slot.cleanup = typeof cleanup === 'function' ? cleanup : null;
      }
    },
  };
}

const runtime = createHookRuntime();

const fakeReact = {
  createElement(type, props) {
    const children = [];
    for (let i = 2; i < arguments.length; i += 1) pushChildren(children, arguments[i]);
    return { type, props: props || {}, children };
  },
  useEffect: (run, deps) => runtime.effect(run, deps),
  useLayoutEffect: (run, deps) => runtime.effect(run, deps),
  useRef: (initial) => runtime.ref(initial),
  useCallback: (fn) => runtime.callback(fn),
  useMemo: (fn) => runtime.memo(fn),
  useState: (initial) => runtime.state(initial),
  useSyncExternalStore: (subscribe, getSnapshot) => runtime.snapshot(getSnapshot),
};

function pushChildren(out, value) {
  if (Array.isArray(value)) {
    for (const child of value) pushChildren(out, child);
    return;
  }
  out.push(value);
}

const originalLoad = Module._load;
Module._load = function loadReactStub(request, parent, isMain) {
  if (request === 'react') return fakeReact;
  return originalLoad.call(this, request, parent, isMain);
};

const protocol = require('../src/protocol.cjs');
const store = require('../src/client/store.js');
const actions = require('../src/client/actions.js');
const { FollowupBar, TURN_SETTLE_MS, SELECT_FILL_MS, selectRunning } = require('../src/client/followups.js');

Module._load = originalLoad;

/* --------------------------------------------------------------- helpers */

/** @returns {{actions: {setDraft: (value: string) => void}, drafts: string[]}} */
function createInputActions() {
  const drafts = [];
  return {
    drafts,
    actions: {
      setDraft(value) {
        drafts.push(value);
      },
    },
  };
}

function jsonResponse(payload, status) {
  const code = status || 200;
  return {
    ok: code < 400,
    status: code,
    text: async () => JSON.stringify(payload),
  };
}

function render(props) {
  runtime.begin();
  const tree = FollowupBar(props);
  runtime.flush();
  return tree;
}

function collect(node, visit) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, visit);
    return;
  }
  if (typeof node !== 'object') return;
  visit(node);
  for (const child of node.children || []) collect(child, visit);
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') return (node.children || []).map(textOf).join('');
  return '';
}

function findOptions(tree) {
  const options = [];
  collect(tree, function visit(node) {
    if (
      node.type === 'button' &&
      typeof node.props.className === 'string' &&
      /\bdpc-followups-option\b/.test(node.props.className)
    ) {
      options.push(node);
    }
  });
  return options;
}

function findNode(tree, predicate) {
  let found = null;
  collect(tree, function visit(node) {
    if (!found && predicate(node)) found = node;
  });
  return found;
}

function findClose(tree) {
  let found = null;
  collect(tree, function visit(node) {
    if (found) return;
    if (node.type === 'button' && typeof node.props.className === 'string' && /\bdpc-close\b/.test(node.props.className)) {
      found = node;
    }
  });
  return found;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs) {
  const limit = typeof timeoutMs === 'number' ? timeoutMs : 2000;
  const started = Date.now();
  while (Date.now() - started < limit) {
    if (predicate()) return true;
    await wait(10);
  }
  return false;
}

/* Each test renders the strip from a clean hook slate: the runtime persists
   hook slots for the lifetime of a test so re-renders keep state. */
test.beforeEach(() => {
  runtime.reset();
});

/* ----------------------------------------------------------------- tests */

test('selectRunning reads the session lifecycle flag', () => {
  assert.equal(selectRunning(undefined), false);
  assert.equal(selectRunning(null), false);
  assert.equal(selectRunning({}), false);
  assert.equal(selectRunning({ running: false }), false);
  assert.equal(selectRunning({ running: true }), true);
  assert.ok(TURN_SETTLE_MS > 0);
});

test('generateFollowups asks the host and stores four options at most', async () => {
  store.saveSettings({ locale: 'en' });
  const calls = [];
  global.fetch = async function fetchFollowups(url, init) {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({
      ok: true,
      result: { kind: 'followups', options: ['继续实现', '解释这段代码', '补一个测试', '收尾提交', '多余的第五条'] },
      meta: { elapsedMs: 12 },
    });
  };
  const options = await actions.generateFollowups('sess-generate');
  assert.deepEqual(options, ['继续实现', '解释这段代码', '补一个测试', '收尾提交']);
  const state = store.getSessionState('sess-generate');
  assert.equal(state.followupsStatus, 'ready');
  assert.equal(state.followups.length, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, protocol.RPC_PATH);
  assert.equal(calls[0].body.method, 'followups');
  assert.equal(calls[0].body.sessionId, 'sess-generate');
  assert.equal(calls[0].body.locale, 'en');
  assert.equal(calls[0].body.model, null);
  store.saveSettings({ locale: 'auto' });
});

test('a thin answer leaves the strip empty and hidden', async () => {
  global.fetch = async () => jsonResponse({ ok: true, result: { kind: 'followups', options: ['只有一条', '只有两条'] } });
  const options = await actions.generateFollowups('sess-thin');
  assert.equal(options, null);
  assert.deepEqual(store.getSessionState('sess-thin').followups, []);
  assert.equal(store.getSessionState('sess-thin').followupsStatus, 'idle');
});

test('a failed request leaves the strip empty and hidden', async () => {
  global.fetch = async () => {
    throw new Error('offline');
  };
  const options = await actions.generateFollowups('sess-fail');
  assert.equal(options, null);
  assert.deepEqual(store.getSessionState('sess-fail').followups, []);
  global.fetch = async () => jsonResponse({ ok: true, result: { kind: 'followups', options: [] } });
});

test('includeContext off never asks the host', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse({ ok: true, result: { kind: 'followups', options: [] } });
  };
  store.saveSettings({ includeContext: false });
  const options = await actions.generateFollowups('sess-nocontext');
  store.saveSettings({ includeContext: true });
  assert.equal(options, null);
  assert.equal(calls, 0);
});

test('clearFollowups cancels an in-flight request', async () => {
  let release = null;
  global.fetch = () =>
    new Promise((resolve) => {
      release = () =>
        resolve(
          jsonResponse({
            ok: true,
            result: { kind: 'followups', options: ['一', '二', '三'] },
          }),
        );
    });
  const pending = actions.generateFollowups('sess-cancel');
  actions.clearFollowups('sess-cancel');
  release();
  const options = await pending;
  assert.equal(options, null);
  assert.deepEqual(store.getSessionState('sess-cancel').followups, []);
  assert.equal(store.getSessionState('sess-cancel').followupsStatus, 'idle');
});

test('applyFollowup fills the draft and never sends', () => {
  const input = createInputActions();
  store.setSessionState('sess-apply', { followups: ['继续实现', '补测试', '解释改动'], followupsStatus: 'ready' });
  const written = actions.applyFollowup('sess-apply', input.actions, '补测试');
  assert.equal(written, true);
  assert.deepEqual(input.drafts, ['补测试']);
  assert.deepEqual(store.getSessionState('sess-apply').followups, []);
  assert.equal(typeof input.actions.submit, 'undefined');
});

test('FollowupBar renders radio rows under the animated label', () => {
  const input = createInputActions();
  store.setSessionState('sess-render', {
    followups: ['继续实现', '解释这段代码', '补一个测试'],
    followupsStatus: 'ready',
  });
  const tree = render({
    sessionId: 'sess-render',
    inputActions: input.actions,
    locale: 'zh',
  });
  assert.ok(tree, 'strip renders when options exist');
  assert.equal(tree.type, 'div');
  assert.equal(tree.props.className, 'dpc-followups');
  assert.equal(tree.props.role, 'group');
  assert.equal(tree.props['aria-label'], '接下来可以');

  const head = findNode(tree, (node) => node.props && node.props.className === 'dpc-followups-head');
  assert.ok(head, 'header row exists');
  assert.match(textOf(head), /接下来可以/);
  const mark = findNode(head, (node) => node.props && node.props.className === 'dpc-followups-mark');
  assert.ok(mark, 'animated icon cluster sits above the options');
  assert.equal(mark.props['aria-hidden'], 'true');
  let sparks = 0;
  collect(head, (node) => {
    if (node.props && node.props.className === 'dpc-followups-spark') sparks += 1;
  });
  assert.equal(sparks, 2, 'twinkling dots accompany the icon');

  const list = findNode(tree, (node) => node.props && node.props.className === 'dpc-followups-list');
  assert.ok(list, 'options list exists');
  assert.equal(list.props.role, 'radiogroup');
  const options = findOptions(tree);
  assert.equal(options.length, 3);
  assert.deepEqual(
    options.map((option) => option.props.title),
    ['继续实现', '解释这段代码', '补一个测试'],
  );
  for (const option of options) {
    assert.equal(option.props.role, 'radio');
    assert.equal(option.props['aria-checked'], 'false');
    assert.equal(option.props['data-selected'], 'false');
    const radio = findNode(option, (node) => node.props && node.props.className === 'dpc-followups-radio');
    assert.ok(radio, 'each row carries a radio control');
    assert.equal(radio.props['aria-hidden'], 'true');
  }
});

test('choosing a row lights it up first and fills the draft afterwards', async () => {
  const input = createInputActions();
  store.setSessionState('sess-pick', {
    followups: ['继续实现', '解释这段代码', '补一个测试'],
    followupsStatus: 'ready',
  });
  const props = { sessionId: 'sess-pick', inputActions: input.actions, locale: 'zh' };
  const first = render(props);
  findOptions(first)[1].props.onClick();

  const litTree = render(props);
  const lit = findOptions(litTree);
  assert.equal(lit[1].props['data-selected'], 'true', 'the chosen row lights up');
  assert.equal(lit[1].props['aria-checked'], 'true');
  assert.equal(lit[0].props['data-selected'], 'false');
  assert.deepEqual(input.drafts, [], 'the highlight shows before the draft changes');

  await wait(SELECT_FILL_MS + 80);
  assert.deepEqual(input.drafts, ['解释这段代码']);
  assert.equal(render(props), null, 'the strip hides once the draft is filled');
});

test('a second row cannot steal a pending selection', async () => {
  const input = createInputActions();
  store.setSessionState('sess-once', {
    followups: ['继续实现', '解释这段代码', '补一个测试'],
    followupsStatus: 'ready',
  });
  const props = { sessionId: 'sess-once', inputActions: input.actions, locale: 'zh' };
  findOptions(render(props))[0].props.onClick();
  findOptions(render(props))[2].props.onClick();
  await wait(SELECT_FILL_MS + 80);
  assert.deepEqual(input.drafts, ['继续实现']);
});

test('FollowupBar hides itself when there are no options', () => {
  const input = createInputActions();
  const tree = render({ sessionId: 'sess-empty', inputActions: input.actions });
  assert.equal(tree, null);
});

test('the dismiss button clears the suggestions', () => {
  const input = createInputActions();
  store.setSessionState('sess-dismiss', { followups: ['a', 'b', 'c'], followupsStatus: 'ready' });
  const tree = render({ sessionId: 'sess-dismiss', inputActions: input.actions });
  const close = findClose(tree);
  assert.ok(close, 'close button exists');
  close.props.onClick();
  assert.deepEqual(store.getSessionState('sess-dismiss').followups, []);
});

test('a finished turn requests suggestions after the settle delay', async () => {
  const calls = [];
  global.fetch = async function fetchTurn(url, init) {
    calls.push(JSON.parse(init.body));
    return jsonResponse({
      ok: true,
      result: { kind: 'followups', options: ['继续', '解释', '测试', '收尾'] },
    });
  };
  const input = createInputActions();
  const propsFor = (running) => ({
    sessionId: 'sess-turn',
    inputActions: input.actions,
    useSession: (selector) => selector({ running }),
  });

  render(propsFor(true));
  assert.equal(render(propsFor(false)), null, 'nothing shows before the answer arrives');
  assert.equal(calls.length, 0, 'the request waits for the turn to settle');

  const ready = await waitFor(() => store.getSessionState('sess-turn').followups.length === 4);
  assert.equal(ready, true);
  const tree = render(propsFor(false));
  assert.ok(tree, 'the strip appears once options arrive');
  assert.equal(findOptions(tree).length, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, 'sess-turn');
});

test('a new turn hides the previous suggestions', () => {
  const input = createInputActions();
  const propsFor = (running) => ({
    sessionId: 'sess-newturn',
    inputActions: input.actions,
    useSession: (selector) => selector({ running }),
  });
  store.setSessionState('sess-newturn', { followups: ['a', 'b', 'c'], followupsStatus: 'ready' });
  render(propsFor(false));
  render(propsFor(true));
  assert.deepEqual(store.getSessionState('sess-newturn').followups, []);
});

test('switching sessions re-baselines instead of generating', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse({ ok: true, result: { kind: 'followups', options: ['a', 'b', 'c'] } });
  };
  const input = createInputActions();
  render({ sessionId: 'sess-one', inputActions: input.actions, useSession: (selector) => selector({ running: true }) });
  render({ sessionId: 'sess-two', inputActions: input.actions, useSession: (selector) => selector({ running: false }) });
  await wait(TURN_SETTLE_MS + 40);
  assert.equal(calls, 0);
});
