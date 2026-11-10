'use strict';

/**
 * Loads the built browser bundle (lib/client.js) in a sandbox that mimics the
 * DSH web shell: a `window.__ModuleLoader__` queue, a minimal React, a fake
 * DOM and a stubbed `fetch`. This is the closest we can get to "does the
 * button actually work" without launching the harness.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_PATH = path.join(__dirname, '..', 'lib', 'client.js');
const PLUGIN_ID = 'dsh-prompt-craft';
const RPC_PATH = '/dsh-prompt-craft/rpc';

function createFakeReact() {
  return {
    createElement(type, props, ...children) {
      const normalized = children.length === 0 ? undefined : children.length === 1 ? children[0] : children;
      const nextProps = Object.assign({}, props || {});
      if (normalized !== undefined) nextProps.children = normalized;
      return { type, props: nextProps, children };
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, function noop() {}];
    },
    useEffect() {
      /* effects do not run in this sandbox */
    },
    useLayoutEffect() {
      /* effects do not run in this sandbox */
    },
    useRef(initial) {
      return { current: initial === undefined ? null : initial };
    },
    useCallback(fn) {
      return fn;
    },
    useMemo(fn) {
      return fn();
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      return getSnapshot();
    },
  };
}

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    entries,
  };
}

function createDocument() {
  const appended = [];
  return {
    appended,
    head: {
      appendChild(node) {
        appended.push(node);
      },
    },
    createElement(tagName) {
      return {
        tagName,
        dataset: {},
        textContent: '',
        setAttribute(name, value) {
          this[name] = value;
        },
      };
    },
    querySelector() {
      return null;
    },
  };
}

function jsonResponse(payload, status) {
  const code = typeof status === 'number' ? status : 200;
  return {
    ok: code >= 200 && code < 300,
    status: code,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

/**
 * @param {{ fetch: (url: string, init: any) => Promise<any>, navigator?: any, storage?: any }} options
 */
function loadBundle(options) {
  const registrations = [];
  const storage = options.storage || createStorage();
  const document = createDocument();
  const navigator = options.navigator || { language: 'zh-CN' };
  const window = {
    __ModuleLoader__: {
      load(registration) {
        registrations.push(registration);
      },
    },
  };
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  // eslint-disable-next-line no-new-func
  const run = new Function(
    'window',
    'document',
    'navigator',
    'localStorage',
    'fetch',
    'setTimeout',
    'clearTimeout',
    'AbortController',
    'console',
    source,
  );
  run(window, document, navigator, storage, options.fetch, setTimeout, clearTimeout, AbortController, console);
  assert.equal(registrations.length, 1, 'the bundle must register exactly one module');
  return { registrations, storage, document, window };
}

function createRequire(React) {
  return function requireShim(specifier) {
    if (specifier === 'react') return React;
    throw new Error('the bundle requested an unexpected external module: ' + specifier);
  };
}

function createSlots() {
  const injected = [];
  const registered = [];
  return {
    injected,
    registered,
    inject(key, mount) {
      injected.push(key);
      mount();
    },
    register(slotOptions, component) {
      registered.push({ key: slotOptions.name, options: slotOptions, component });
      return function dispose() {};
    },
  };
}

function componentFor(slots, key) {
  const entry = slots.registered.find((item) => item.key === key);
  assert.ok(entry, 'expected a component registered for ' + key);
  return entry.component;
}

function walk(node, visit) {
  if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node !== 'object') return;
  if (typeof node.type === 'function') {
    walk(node.type(node.props || {}), visit);
    return;
  }
  visit(node);
  if (Array.isArray(node.children)) for (const child of node.children) walk(child, visit);
}

function textOf(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'function') return textOf(node({}));
  if (typeof node === 'object') {
    if (typeof node.type === 'function') return textOf(node.type(node.props || {}));
    if (Array.isArray(node.children)) return node.children.map(textOf).join('');
  }
  return '';
}

function findButton(root, label) {
  let found = null;
  walk(root, (node) => {
    if (found || node.type !== 'button') return;
    if (textOf(node) === label) found = node;
  });
  return found;
}

function findNode(root, predicate) {
  let found = null;
  walk(root, (node) => {
    if (!found && predicate(node)) found = node;
  });
  return found;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function enhancedPayload(request) {
  return {
    ok: true,
    result: {
      kind: 'enhanced',
      goal: '让读者读完就知道海是什么样子',
      prompt: 'Write a poem about the sea, in four lines.',
      summary: '改得更具体了',
      elevation: ['从"写一首诗"抬到"让读者看见海"'],
      notes: ['加了行数约束'],
      scenario: 'writing',
    },
    meta: {
      provider: 'deepseek-account',
      model: 'deepseek-v4-flash',
      source: 'request',
      elapsedMs: 1234,
      mode: request.mode,
    },
  };
}

/**
 * Boot one isolated copy of the plugin with a stubbed host.
 * @param {{ reply?: (call: number, body: any) => {payload: any, status?: number}, directories?: any, storage?: any }} [options]
 */
function boot(options) {
  const settings = options || {};
  const calls = [];
  const storage = settings.storage || createStorage();
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const reply = settings.reply || ((n, request) => ({ payload: enhancedPayload(request) }));
    const answer = reply(calls.length, body) || {};
    return jsonResponse(answer.payload, answer.status);
  };
  const loaded = loadBundle({ fetch, storage });
  const React = createFakeReact();
  const plugin = loaded.registrations[0].factory(createRequire(React));
  const slots = createSlots();
  const directories = settings.directories || {
    directoryFor() {
      return {
        load() {
          return Promise.resolve();
        },
        store: {
          getSnapshot() {
            return {
              current: { provider: 'deepseek-account', model: 'deepseek-v4-flash' },
              groups: [
                {
                  id: 'deepseek-account',
                  name: 'DeepSeek Account',
                  models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4.1-Flash' }],
                },
              ],
            };
          },
        },
      };
    },
  };
  const locale = {
    getLocale() {
      return { active: settings.locale || 'zh', locales: [], revision: 0 };
    },
  };
  const ctx = {
    get(name) {
      if (name === 'slots') return slots;
      if (name === 'modelDirectories') return directories;
      if (name === 'locale') return locale;
      return undefined;
    },
  };
  plugin.apply(ctx);
  return { calls, storage, slots, plugin, ctx, React, loaded };
}

test('the bundle registers the plugin under the package id', () => {
  const loaded = loadBundle({ fetch: async () => jsonResponse({ ok: true }) });
  const registration = loaded.registrations[0];
  assert.equal(registration.id, PLUGIN_ID);

  const plugin = registration.factory(createRequire(createFakeReact()));
  assert.equal(plugin.name, PLUGIN_ID);
  assert.deepEqual(plugin.inject, ['slots']);
  assert.equal(typeof plugin.apply, 'function');
});

test('apply registers the button, the panel, the WeChat notice and the settings section', () => {
  const { slots, loaded } = boot();
  assert.deepEqual(slots.injected, [
    'conversation.input.right',
    'conversation.input.dock',
    'conversation.input.dock',
    'settings.section',
  ]);
  const button = slots.registered[0];
  assert.equal(button.options.id, 'prompt-craft');
  assert.equal(button.options.order, 10);
  const panel = slots.registered[1];
  assert.equal(panel.options.id, 'prompt-craft-panel');
  const notice = slots.registered[2];
  assert.equal(notice.options.id, 'prompt-craft-weixin');
  assert.equal(notice.options.order, 12);
  const section = slots.registered[3];
  assert.equal(section.options.id, 'prompt-craft');
  assert.equal(section.options.order, 40);
  assert.equal(typeof section.options.label, 'function');
  assert.equal(loaded.document.appended.length, 1, 'styles are injected once');
  assert.equal(loaded.document.appended[0]['data-dsh-prompt-craft'], 'styles');
});

test('apply is a no-op when the slots service is missing', () => {
  const loaded = loadBundle({ fetch: async () => jsonResponse({ ok: true }) });
  const plugin = loaded.registrations[0].factory(createRequire(createFakeReact()));
  assert.doesNotThrow(() => plugin.apply({ get: () => undefined }));
});

test('clicking the button enhances the draft, then the panel applies the result', async () => {
  const { calls, slots } = boot();
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  const EnhancePanel = componentFor(slots, 'conversation.input.dock');
  const drafts = [];
  const inputActions = {
    setDraft(text) {
      drafts.push(text);
    },
  };

  const button = EnhanceButton({
    sessionId: 'session-1',
    useInput: (selector) => selector({ draft: 'write a poem about the sea' }),
  });
  assert.equal(button.type, 'button');
  assert.equal(button.props.className, 'dpc-btn');
  assert.equal(button.props.disabled, false);
  assert.equal(button.props['data-busy'], 'false');
  assert.equal(button.props['data-filled'], 'true');
  assert.equal(button.props['aria-label'], '增强提示词');

  button.props.onClick();
  await flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RPC_PATH);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].body.method, 'enhance');
  assert.equal(calls[0].body.draft, 'write a poem about the sea');
  assert.equal(calls[0].body.mode, 'standard');
  assert.equal(calls[0].body.scenario, 'auto');
  assert.equal(calls[0].body.locale, 'zh');
  assert.deepEqual(calls[0].body.model, { provider: 'deepseek-account', model: 'deepseek-v4-flash' });

  const panel = EnhancePanel({ sessionId: 'session-1', inputActions });
  assert.equal(panel.type, 'div');
  assert.equal(panel.props.className, 'dpc-panel');
  const closeButton = findNode(panel, (node) => node.props
    && typeof node.props.className === 'string'
    && node.props.className.split(' ').indexOf('dpc-close') !== -1);
  assert.ok(closeButton, 'the panel exit button must carry the dpc-close chip class');
  assert.equal(closeButton.props['aria-label'], '关闭');
  assert.match(textOf(panel), /提示词增强/);
  assert.match(textOf(panel), /改得更具体了/);
  assert.match(textOf(panel), /让读者读完就知道海是什么样子/);
  assert.match(textOf(panel), /从"写一首诗"抬到"让读者看见海"/);
  assert.match(textOf(panel), /加了行数约束/);
  const compare = findNode(panel, (node) => node.props && node.props.className === 'dpc-split');
  assert.ok(compare, 'the rewrite must open in the compare view by default');
  assert.match(textOf(compare), /write a poem about the sea/);
  assert.match(textOf(compare), /Write a poem about the sea, in four lines\./);

  const applyAll = findButton(panel, '全部应用');
  assert.ok(applyAll, 'the apply-all button must be rendered');
  applyAll.props.onClick();
  assert.deepEqual(drafts, ['Write a poem about the sea, in four lines.']);

  const appliedPanel = EnhancePanel({ sessionId: 'session-1', inputActions });
  assert.match(textOf(appliedPanel), /已应用到输入框/);
  const undo = findButton(appliedPanel, '撤销');
  assert.ok(undo);
  undo.props.onClick();
  assert.deepEqual(drafts, ['Write a poem about the sea, in four lines.', 'write a poem about the sea']);
});

test('a questions answer re-runs the enhancement with hints', async () => {
  const { calls, slots } = boot({
    reply: (callCount) =>
      callCount === 1
        ? {
            payload: {
              ok: true,
              result: { kind: 'questions', questions: ['用哪种语言？', '要多少行？'], summary: '还差两个细节' },
              meta: { provider: 'deepseek-account', model: 'deepseek-v4-flash', source: 'request', elapsedMs: 300 },
            },
          }
        : { payload: enhancedPayload({ mode: 'standard' }) },
  });
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  const EnhancePanel = componentFor(slots, 'conversation.input.dock');
  const inputActions = { setDraft() {} };

  EnhanceButton({ sessionId: 's-2', useInput: (selector) => selector({ draft: '写一首诗' }) }).props.onClick();
  await flush();

  const questionsPanel = EnhancePanel({ sessionId: 's-2', inputActions });
  assert.match(textOf(questionsPanel), /先确认两件事/);
  assert.match(textOf(questionsPanel), /用哪种语言？/);

  const textarea = findNode(questionsPanel, (node) => node.type === 'textarea');
  assert.ok(textarea);
  textarea.props.onChange({ target: { value: '中文，四行' } });

  const refreshed = EnhancePanel({ sessionId: 's-2', inputActions });
  const submit = findButton(refreshed, '带着回答重写');
  assert.ok(submit);
  submit.props.onClick();
  await flush();

  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.method, 'enhance');
  assert.equal(calls[1].body.hints, '中文，四行');
});

test('a host error is shown with a retry affordance', async () => {
  const { slots } = boot({
    reply: () => ({
      status: 400,
      payload: { ok: false, error: { code: 'MODEL_UNRESOLVED', message: 'no model' } },
    }),
  });
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  const EnhancePanel = componentFor(slots, 'conversation.input.dock');
  const inputActions = { setDraft() {} };

  EnhanceButton({ sessionId: 's-3', useInput: (selector) => selector({ draft: 'hello' }) }).props.onClick();
  await flush();

  const panel = EnhancePanel({ sessionId: 's-3', inputActions });
  assert.match(textOf(panel), /增强失败/);
  assert.match(textOf(panel), /没有解析到当前会话的模型/);
  assert.ok(findButton(panel, '重试'));
});

test('the refine loop sends the previous rewrite and the instruction', async () => {
  const { calls, slots } = boot();
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  const EnhancePanel = componentFor(slots, 'conversation.input.dock');
  const inputActions = { setDraft() {} };
  const session = { sessionId: 's-4', useInput: (selector) => selector({ draft: 'write a poem about the sea' }) };

  EnhanceButton(session).props.onClick();
  await flush();

  const resultPanel = EnhancePanel({ sessionId: 's-4', inputActions });
  const refineToggle = findButton(resultPanel, '继续改…');
  assert.ok(refineToggle);
  refineToggle.props.onClick();

  const refineMode = EnhancePanel({ sessionId: 's-4', inputActions });
  const textarea = findNode(refineMode, (node) => node.type === 'textarea');
  assert.ok(textarea);
  textarea.props.onChange({ target: { value: '再短一点' } });

  const ready = EnhancePanel({ sessionId: 's-4', inputActions });
  const submit = findButton(ready, '再改一版');
  assert.ok(submit);
  submit.props.onClick();
  await flush();

  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.method, 'refine');
  assert.equal(calls[1].body.instruction, '再短一点');
  assert.equal(calls[1].body.previous, 'Write a poem about the sea, in four lines.');
});

test('the settings section renders one card with the local model list', () => {
  const storage = createStorage();
  const { slots } = boot({ storage });
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  EnhanceButton({ sessionId: 's-7', useInput: (selector) => selector({ draft: 'hi' }) });
  const SettingsSection = componentFor(slots, 'settings.section');

  const section = SettingsSection({});
  assert.equal(section.props.className, 'dpc-settings');
  assert.match(textOf(section), /增强设置/);
  assert.match(textOf(section), /微信 Bot/);
  const card = findNode(section, (node) => node.props && node.props.className === 'dpc-card');
  assert.ok(card, 'all settings must live in one card');
  assert.match(textOf(section), /提示词增强/);
  assert.match(textOf(section), /配置 ✨ 增强按钮的默认行为/);
  assert.match(textOf(section), /跟随当前会话模型/);
  assert.match(textOf(section), /DeepSeek-V4.1-Flash/);
  assert.match(textOf(section), /已从本机同步 1 个可用模型/);

  const save = findButton(section, '保存');
  assert.ok(save);
  save.props.onClick();

  const raw = storage.getItem('dsh-prompt-craft/settings/v1');
  assert.ok(raw, 'settings must be persisted');
  const persisted = JSON.parse(raw);
  assert.equal(persisted.mode, 'standard');
  assert.equal(persisted.scenario, 'auto');
  assert.equal(persisted.locale, 'auto');
});

test('the settings section falls back to manual model fields when nothing is synced', () => {
  const { slots } = boot({ directories: { directoryFor: () => ({ load: () => Promise.resolve(), store: { getSnapshot: () => ({ groups: [] }) } }) } });
  const SettingsSection = componentFor(slots, 'settings.section');

  const section = SettingsSection({});
  assert.match(textOf(section), /还没拿到本机模型列表/);
  assert.ok(findButton(section, '重新同步'));
  const inputs = [];
  walk(section, (node) => {
    if (node && node.type === 'input') inputs.push(node);
  });
  assert.equal(inputs.length, 3, 'provider, model and reasoning effort stay editable by hand');
});

test('an empty draft disables the button', () => {
  const { slots } = boot();
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  const button = EnhanceButton({ sessionId: 's-5', useInput: (selector) => selector({ draft: '   ' }) });
  assert.equal(button.props.disabled, true);
  assert.equal(button.props['data-filled'], 'false');
  assert.equal(button.props.title, '先写点内容再增强');
});

test('the UI falls back to English when the browser locale is not Chinese', () => {
  const loaded = loadBundle({ fetch: async () => jsonResponse({ ok: true }), navigator: { language: 'en-US' } });
  const plugin = loaded.registrations[0].factory(createRequire(createFakeReact()));
  const slots = createSlots();
  plugin.apply({ get: (name) => (name === 'slots' ? slots : undefined) });
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  const button = EnhanceButton({ sessionId: 's-6', useInput: (selector) => selector({ draft: 'hi' }) });
  assert.equal(button.props['aria-label'], 'Enhance prompt');
});

test('a host error also shows the upstream message', async () => {
  const { slots } = boot({
    reply: () => ({
      status: 502,
      payload: {
        ok: false,
        error: {
          code: 'LLM_FAILED',
          message: 'the model call did not complete',
          details: {
            reason: 'error',
            providerCode: 'INVALID_REQUEST',
            providerMessage: "Unsupported value: 'none'. Supported values are: 'low', 'medium', 'high'.",
          },
        },
      },
    }),
  });
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  const EnhancePanel = componentFor(slots, 'conversation.input.dock');

  EnhanceButton({ sessionId: 's-8', useInput: (selector) => selector({ draft: 'hello' }) }).props.onClick();
  await flush();

  const panel = EnhancePanel({ sessionId: 's-8', inputActions: { setDraft() {} } });
  assert.match(textOf(panel), /上游返回/);
  assert.match(textOf(panel), /Supported values are/);
});

test('the settings section can test the model route', async () => {
  const { calls, slots } = boot({
    reply: () => ({
      payload: {
        ok: true,
        result: {
          provider: 'deepseek-account',
          model: 'deepseek-v4-flash',
          effort: '',
          elapsedMs: 42,
          reply: 'OK',
        },
      },
    }),
  });
  const EnhanceButton = componentFor(slots, 'conversation.input.right');
  EnhanceButton({ sessionId: 's-9', useInput: (selector) => selector({ draft: 'hi' }) });

  const SettingsSection = componentFor(slots, 'settings.section');
  const section = SettingsSection({});
  const testButton = findButton(section, '测试模型');
  assert.ok(testButton, 'the settings must offer a model test');

  testButton.props.onClick();
  await flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.method, 'probe');
  assert.equal(calls[0].body.sessionId, 's-9');
  assert.deepEqual(calls[0].body.model, { provider: 'deepseek-account', model: 'deepseek-v4-flash' });
});
