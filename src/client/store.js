'use strict';

/**
 * Client-side state: per-session enhancement state plus persisted defaults.
 *
 * Kept framework-agnostic: `subscribe` + `getSnapshot` pairs feed React through
 * `useSyncExternalStore` (with a tiny fallback for older React builds).
 */

const React = require('react');
const { MODES, SCENARIOS } = require('../protocol.cjs');

const SETTINGS_KEY = 'dsh-prompt-craft/settings/v1';
const MAX_TEXT_FIELD = 200;

/** @type {{mode: string, scenario: string, locale: string, provider: string, model: string, reasoningEffort: string, weixinAutoFill: boolean, includeContext: boolean}} */
const DEFAULT_SETTINGS = {
  mode: 'standard',
  scenario: 'auto',
  locale: 'auto',
  provider: '',
  model: '',
  reasoningEffort: '',
  weixinAutoFill: true,
  includeContext: true,
};

function getStorage() {
  try {
    if (typeof localStorage === 'object' && localStorage !== null) return localStorage;
  } catch (error) {
    return null;
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @param {number} [max]
 * @returns {string}
 */
function readText(value, fallback, max) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (!text) return fallback;
  return text.length > (max || MAX_TEXT_FIELD) ? text.slice(0, max || MAX_TEXT_FIELD) : text;
}

/**
 * @param {unknown} candidate
 * @returns {typeof DEFAULT_SETTINGS}
 */
function sanitizeSettings(candidate) {
  const source = typeof candidate === 'object' && candidate !== null ? candidate : {};
  const mode = MODES.indexOf(source.mode) === -1 ? DEFAULT_SETTINGS.mode : source.mode;
  const scenario = SCENARIOS.indexOf(source.scenario) === -1 ? DEFAULT_SETTINGS.scenario : source.scenario;
  const locale = source.locale === 'zh' || source.locale === 'en' ? source.locale : 'auto';
  return {
    mode,
    scenario,
    locale,
    provider: readText(source.provider, '', MAX_TEXT_FIELD),
    model: readText(source.model, '', MAX_TEXT_FIELD),
    reasoningEffort: readText(source.reasoningEffort, '', 40),
    weixinAutoFill: source.weixinAutoFill === false ? false : true,
    includeContext: source.includeContext === false ? false : true,
  };
}

let settingsSnapshot = /** @type {null | typeof DEFAULT_SETTINGS} */ (null);
const settingsListeners = new Set();

function loadSettings() {
  const storage = getStorage();
  if (!storage) return Object.assign({}, DEFAULT_SETTINGS);
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
    return sanitizeSettings(JSON.parse(raw));
  } catch (error) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

/** @returns {typeof DEFAULT_SETTINGS} */
function getSettings() {
  if (settingsSnapshot === null) settingsSnapshot = loadSettings();
  return settingsSnapshot;
}

/**
 * Persist a settings patch and notify subscribers.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 * @returns {typeof DEFAULT_SETTINGS} the new snapshot
 */
function saveSettings(patch) {
  const merged = sanitizeSettings(Object.assign({}, getSettings(), patch));
  settingsSnapshot = merged;
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    } catch (error) {
      /* storage may be unavailable in private windows; settings still apply live */
    }
  }
  for (const listener of settingsListeners) {
    try {
      listener();
    } catch (error) {
      /* a broken subscriber must not break the others */
    }
  }
  return merged;
}

/**
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
function subscribeSettings(listener) {
  settingsListeners.add(listener);
  return function unsubscribe() {
    settingsListeners.delete(listener);
  };
}

/** Session-scoped panel state defaults. */
const SESSION_DEFAULTS = Object.freeze({
  open: false,
  status: 'idle',
  mode: null,
  scenario: null,
  base: '',
  hints: '',
  previous: '',
  result: null,
  hunks: [],
  accepted: {},
  view: 'compare',
  error: null,
  answers: '',
  refineText: '',
  showRefine: false,
  meta: null,
  applied: false,
  appliedText: '',
  weixinNotice: null,
  weixinBefore: '',
  runId: 0,
});

const sessionStates = new Map();
const sessionListeners = new Map();

/**
 * @param {unknown} sessionId
 * @returns {string}
 */
function sessionKey(sessionId) {
  return typeof sessionId === 'string' && sessionId ? sessionId : 'default';
}

/**
 * @param {unknown} sessionId
 * @returns {typeof SESSION_DEFAULTS}
 */
function getSessionState(sessionId) {
  const key = sessionKey(sessionId);
  let state = sessionStates.get(key);
  if (state === undefined) {
    state = Object.assign({}, SESSION_DEFAULTS);
    sessionStates.set(key, state);
  }
  return state;
}

/**
 * @param {unknown} sessionId
 * @param {Partial<typeof SESSION_DEFAULTS>} patch
 * @returns {typeof SESSION_DEFAULTS} the new snapshot
 */
function setSessionState(sessionId, patch) {
  const key = sessionKey(sessionId);
  const previous = getSessionState(key);
  const next = Object.assign({}, previous, patch);
  sessionStates.set(key, next);
  const listeners = sessionListeners.get(key);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        /* isolate subscribers */
      }
    }
  }
  return next;
}

/**
 * @param {unknown} sessionId
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
function subscribeSession(sessionId, listener) {
  const key = sessionKey(sessionId);
  let listeners = sessionListeners.get(key);
  if (listeners === undefined) {
    listeners = new Set();
    sessionListeners.set(key, listeners);
  }
  listeners.add(listener);
  return function unsubscribe() {
    const current = sessionListeners.get(key);
    if (current === undefined) return;
    current.delete(listener);
    if (current.size === 0) sessionListeners.delete(key);
  };
}

/**
 * React binding with a fallback for builds without `useSyncExternalStore`.
 * @param {(listener: () => void) => () => void} subscribe
 * @param {() => any} getSnapshot
 * @returns {any}
 */
function useStore(subscribe, getSnapshot) {
  if (typeof React.useSyncExternalStore === 'function') {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }
  const [value, setValue] = React.useState(getSnapshot);
  React.useEffect(
    function subscribeOnMount() {
      return subscribe(function onChange() {
        setValue(getSnapshot());
      });
    },
    [subscribe, getSnapshot],
  );
  return value;
}

/** @returns {typeof DEFAULT_SETTINGS} */
function useSettings() {
  return useStore(subscribeSettings, getSettings);
}

/**
 * @param {unknown} sessionId
 * @returns {typeof SESSION_DEFAULTS}
 */
function useSessionState(sessionId) {
  const key = sessionKey(sessionId);
  const subscribe = React.useCallback(
    function subscribeToSession(listener) {
      return subscribeSession(key, listener);
    },
    [key],
  );
  const read = React.useCallback(
    function readSessionState() {
      return getSessionState(key);
    },
    [key],
  );
  return useStore(subscribe, read);
}

module.exports = {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  subscribeSettings,
  useSettings,
  getSessionState,
  setSessionState,
  subscribeSession,
  useSessionState,
  sessionKey,
  sanitizeSettings,
};
