'use strict';

/**
 * WeChat (iLink) bridge UI.
 *
 * The host half talks to `ilinkai.weixin.qq.com`; this half only renders the
 * connection tab and the "message arrived" notice, and it fills the composer
 * through `inputActions.setDraft` — the plugin never sends anything back to
 * WeChat and never submits the draft on its own.
 */

const React = require('react');
const qrcode = require('qrcode-generator');
const { translate, normalizeLocale } = require('./i18n.js');
const store = require('./store.js');
const actions = require('./actions.js');

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;
const useCallback = React.useCallback;
const useRef = React.useRef || function useRefFallback(initial) {
  return { current: initial === undefined ? null : initial };
};

/** How often the tab refreshes the bridge state (ms). */
const STATUS_POLL_MS = 1500;
/** How often an idle composer checks for waiting messages (ms). */
const MESSAGE_POLL_MS = 2500;

/**
 * @param {unknown} value
 * @returns {string}
 */
function readId(value) {
  return typeof value === 'string' && value ? value : '';
}

/**
 * @param {number} ms
 * @returns {string}
 */
function formatWhen(ms) {
  if (!ms || typeof ms !== 'number') return '';
  try {
    return new Date(ms).toLocaleString();
  } catch (error) {
    return '';
  }
}

/**
 * Terminal QR code rendered as inline SVG (no external image, no network).
 * @param {{ value?: string, size?: number, label?: string }} props
 * @returns {any}
 */
function QrCode(props) {
  const value = typeof props.value === 'string' ? props.value : '';
  const size = typeof props.size === 'number' && props.size > 0 ? props.size : 168;
  if (!value) return null;
  let code = null;
  try {
    code = qrcode(0, 'M');
    code.addData(value);
    code.make();
  } catch (error) {
    code = null;
  }
  if (!code) {
    return h('div', { className: 'dpc-qr-fallback' }, value);
  }
  const count = code.getModuleCount();
  const cell = size / count;
  const cells = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) {
        cells.push(
          h('rect', {
            key: row + ':' + col,
            x: col * cell,
            y: row * cell,
            width: cell + 0.02,
            height: cell + 0.02,
          }),
        );
      }
    }
  }
  return h(
    'svg',
    {
      className: 'dpc-qr',
      viewBox: '0 0 ' + size + ' ' + size,
      width: size,
      height: size,
      role: 'img',
      'aria-label': props.label || 'QR code',
    },
    h('rect', { key: 'bg', x: 0, y: 0, width: size, height: size, fill: '#ffffff' }),
    h('g', { key: 'cells', fill: '#111318' }, cells),
  );
}

/**
 * Poll the bridge while the settings tab is open.
 * @returns {{ status: any, error: string, loading: boolean, busy: boolean, refresh: () => void, startLogin: () => void, submitVerify: (code: string) => void, logout: () => void, cancelLogin: () => void }}
 */
function useWeixinStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(() => {
    actions
      .weixinStatus()
      .then((next) => {
        if (!alive.current) return;
        setStatus(next);
        setError('');
        setLoading(false);
      })
      .catch((failure) => {
        if (!alive.current) return;
        setError(failure && failure.message ? String(failure.message) : 'bridge unavailable');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const timer = setInterval(refresh, STATUS_POLL_MS);
    return function cleanup() {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const run = useCallback(
    (task) => {
      setBusy(true);
      task()
        .then((next) => {
          if (!alive.current) return;
          if (next) setStatus(next);
          setError('');
        })
        .catch((failure) => {
          if (!alive.current) return;
          setError(failure && failure.message ? String(failure.message) : 'request failed');
        })
        .finally(() => {
          if (alive.current) setBusy(false);
          refresh();
        });
    },
    [refresh],
  );

  const startLogin = useCallback(() => run(() => actions.weixinStartLogin()), [run]);
  const submitVerify = useCallback((code) => run(() => actions.weixinSubmitVerify(code)), [run]);
  const logout = useCallback(() => run(() => actions.weixinLogout()), [run]);

  return { status, error, loading, busy, refresh, startLogin, submitVerify, logout };
}

/**
 * The "WeChat Bot" tab inside the plugin settings page.
 * @param {{ t: (key: string, vars?: Record<string, string | number>) => string }} props
 * @returns {any}
 */
function WeixinTab(props) {
  const t = props.t;
  const bridge = useWeixinStatus();
  const settings = store.useSettings();
  const [verifyCode, setVerifyCode] = useState('');
  const status = bridge.status || {};
  const state = readId(status.state) || 'idle';
  const login = status.login || null;
  const account = status.account || null;
  const queueSize = typeof status.queueSize === 'number' ? status.queueSize : 0;

  const rows = [];
  rows.push(
    h(
      'div',
      { key: 'intro', className: 'dpc-wx-intro' },
      h('p', { className: 'dpc-wx-desc' }, t('weixin.desc')),
      h('p', { className: 'dpc-wx-fine' }, t('weixin.onlyFills')),
    ),
  );

  if (bridge.error) {
    rows.push(h('p', { key: 'error', className: 'dpc-wx-error' }, t('weixin.error', { message: bridge.error })));
  }

  if (state === 'connected') {
    rows.push(
      h(
        'div',
        { key: 'account', className: 'dpc-wx-account' },
        h('div', { className: 'dpc-wx-account-line' }, h('span', { className: 'dpc-wx-dot' }), t('weixin.connected')),
        h('p', { className: 'dpc-wx-meta' }, t('weixin.botId', { id: readId(account && account.ilinkBotId) || '-' })),
        account && account.savedAt
          ? h('p', { className: 'dpc-wx-meta' }, t('weixin.connectedAt', { when: formatWhen(account.savedAt) }))
          : null,
        h('p', { className: 'dpc-wx-meta' }, t('weixin.queueSize', { n: queueSize })),
      ),
    );
    rows.push(
      h(
        'div',
        { key: 'actions', className: 'dpc-wx-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-action',
            'data-variant': 'ghost',
            disabled: bridge.busy,
            onClick: bridge.logout,
          },
          t('weixin.disconnect'),
        ),
      ),
    );
  } else if (state === 'waiting' || state === 'login') {
    const loginStatus = readId(login && login.status) || 'wait';
    const qrValue = readId(login && login.qrcodeUrl);
    rows.push(
      h(
        'div',
        { key: 'qr', className: 'dpc-wx-qr-wrap' },
        h(QrCode, { value: qrValue, size: 168, label: t('weixin.qrLabel') }),
        h('p', { className: 'dpc-wx-hint' }, t('weixin.scanHint')),
        h('p', { className: 'dpc-wx-meta' }, t('weixin.loginStatus.' + loginStatus, { status: loginStatus })),
      ),
    );
    if (loginStatus === 'need_verifycode' || loginStatus === 'verify_code_blocked') {
      rows.push(
        h(
          'div',
          { key: 'verify', className: 'dpc-wx-verify' },
          h('label', { className: 'dpc-wx-label', htmlFor: 'dpc-wx-code' }, t('weixin.verifyLabel')),
          h('input', {
            id: 'dpc-wx-code',
            className: 'dpc-input',
            inputMode: 'numeric',
            autoComplete: 'one-time-code',
            maxLength: 8,
            placeholder: t('weixin.verifyPlaceholder'),
            value: verifyCode,
            onChange: (event) => setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 8)),
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'dpc-action',
              'data-variant': 'primary',
              disabled: bridge.busy || verifyCode.length < 4,
              onClick: () => bridge.submitVerify(verifyCode),
            },
            t('weixin.verifySubmit'),
          ),
        ),
      );
    }
    rows.push(
      h(
        'div',
        { key: 'login-actions', className: 'dpc-wx-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-action',
            'data-variant': 'ghost',
            disabled: bridge.busy,
            onClick: bridge.startLogin,
          },
          t('weixin.refreshQr'),
        ),
      ),
    );
  } else if (state === 'paused') {
    rows.push(
      h(
        'div',
        { key: 'paused', className: 'dpc-wx-account' },
        h('div', { className: 'dpc-wx-account-line dpc-wx-paused' }, t('weixin.paused')),
        h('p', { className: 'dpc-wx-fine' }, t('weixin.pausedHint')),
      ),
    );
    rows.push(
      h(
        'div',
        { key: 'paused-actions', className: 'dpc-wx-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-action',
            'data-variant': 'primary',
            disabled: bridge.busy,
            onClick: bridge.startLogin,
          },
          t('weixin.login'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-action',
            'data-variant': 'ghost',
            disabled: bridge.busy,
            onClick: bridge.logout,
          },
          t('weixin.disconnect'),
        ),
      ),
    );
  } else {
    rows.push(
      h(
        'div',
        { key: 'idle', className: 'dpc-wx-idle' },
        h('p', { className: 'dpc-wx-fine' }, t('weixin.idleHint')),
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-action',
            'data-variant': 'primary',
            disabled: bridge.busy || bridge.loading,
            onClick: bridge.startLogin,
          },
          t('weixin.login'),
        ),
      ),
    );
  }

  rows.push(
    h(
      'label',
      { key: 'autofill', className: 'dpc-wx-toggle' },
      h('input', {
        type: 'checkbox',
        checked: settings.weixinAutoFill !== false,
        onChange: (event) => store.saveSettings({ weixinAutoFill: event.target.checked }),
      }),
      h('span', null, t('weixin.autoFill')),
    ),
  );
  rows.push(h('p', { key: 'autofill-hint', className: 'dpc-wx-fine' }, t('weixin.autoFillHint')));

  return h('div', { className: 'dpc-wx' }, rows);
}

/**
 * Poll for inbound WeChat messages while a composer is mounted.
 *
 * Auto-fill is on by default: the text lands in the draft and a notice offers
 * an undo. With the setting off, the queue is only reported and the notice can
 * fill it on demand.
 *
 * @param {unknown} sessionId
 * @param {() => any} getInputActions
 * @param {() => string} getDraft
 * @returns {() => void} stop function
 */
function startComposerPoller(sessionId, getInputActions, getDraft) {
  let stopped = false;
  let busy = false;
  let timer = null;

  function schedule() {
    if (stopped) return;
    timer = setTimeout(tick, MESSAGE_POLL_MS);
  }

  function tick() {
    if (stopped || busy) return;
    busy = true;
    const settings = store.getSettings();
    const autoFill = settings.weixinAutoFill !== false;
    actions
      .weixinPending(autoFill)
      .then((messages) => {
        if (stopped || !Array.isArray(messages) || messages.length === 0) return;
        const inputActions = typeof getInputActions === 'function' ? getInputActions() : null;
        if (!inputActions) return;
        if (autoFill) {
          const draft = typeof getDraft === 'function' ? getDraft() : '';
          actions.applyWeixinDraft(sessionId, inputActions, draft, messages);
        } else {
          actions.noteWeixinQueue(sessionId, messages);
        }
      })
      .catch(() => {
        /* the host may be restarting; the next tick retries */
      })
      .finally(() => {
        busy = false;
        schedule();
      });
  }

  schedule();
  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Notice shown above the composer after WeChat text arrived.
 * @param {any} props session-scope slot props
 * @returns {any}
 */
function WeixinNotice(props) {
  const sessionId = props.sessionId || (props.session && props.session.sessionId);
  const inputActions = props.inputActions || (props.session && props.session.inputActions);
  const snapshot = typeof props.useInput === 'function' ? props.useInput((value) => value) : null;
  const draft = snapshot && typeof snapshot.draft === 'string' ? snapshot.draft : '';
  const state = store.useSessionState(sessionId);
  const notice = state.weixinNotice;
  if (!notice) return null;
  const locale = props.locale ? normalizeLocale(props.locale) : actions.currentLocale();
  const t = (key, vars) => translate(locale, key, vars);
  const from = readId(notice.from);

  const buttons = [];
  if (notice.filled) {
    buttons.push(
      h(
        'button',
        {
          key: 'undo',
          type: 'button',
          className: 'dpc-action',
          'data-variant': 'ghost',
          onClick: () => actions.undoWeixinDraft(sessionId, inputActions),
        },
        t('weixin.undo'),
      ),
    );
  } else {
    buttons.push(
      h(
        'button',
        {
          key: 'fill',
          type: 'button',
          className: 'dpc-action',
          'data-variant': 'primary',
          onClick: () => {
            actions
              .consumeWeixin(sessionId, inputActions, draft)
              .catch(() => actions.dismissWeixinNotice(sessionId));
          },
        },
        t('weixin.fill'),
      ),
      h(
        'button',
        {
          key: 'ignore',
          type: 'button',
          className: 'dpc-action',
          'data-variant': 'ghost',
          onClick: () => {
            actions.weixinClear().catch(() => undefined);
            actions.dismissWeixinNotice(sessionId);
          },
        },
        t('weixin.ignore'),
      ),
    );
  }
  buttons.push(
    h(
      'button',
      {
        key: 'close',
        type: 'button',
        className: 'dpc-btn dpc-close',
        title: t('weixin.close'),
        'aria-label': t('weixin.close'),
        onClick: () => actions.dismissWeixinNotice(sessionId),
      },
      h('span', { 'aria-hidden': 'true' }, '\u00d7'),
    ),
  );

  return h(
    'div',
    { className: 'dpc-notice', role: 'status' },
    h(
      'div',
      { className: 'dpc-notice-text' },
      h('span', { className: 'dpc-notice-title' }, t('weixin.noticeTitle', { n: notice.count })),
      from ? h('span', { className: 'dpc-notice-from' }, t('weixin.noticeFrom', { from: from })) : null,
    ),
    h('div', { className: 'dpc-notice-actions' }, buttons),
  );
}

module.exports = {
  QrCode,
  useWeixinStatus,
  WeixinTab,
  WeixinNotice,
  startComposerPoller,
  STATUS_POLL_MS,
  MESSAGE_POLL_MS,
};
