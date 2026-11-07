'use strict';

/**
 * Imperative actions shared by the toolbar button, the panel and the settings
 * page. Components stay presentational; every network call and every draft
 * write goes through here so the optimistic state machine stays consistent.
 */

const { METHODS, LIMITS, ERROR_CODES, normalizeMode, normalizeScenario } = require('../protocol.cjs');
const { callHost, RpcError } = require('./rpc.js');
const store = require('./store.js');
const diff = require('./diff.js');
const { normalizeLocale } = require('./i18n.js');

const MAX_HINTS_CHARS = LIMITS.MAX_INSTRUCTION_CHARS;

/** Set once by the client entry so we can read the session model directory. */
let pluginContext = null;

/**
 * @param {unknown} ctx
 * @returns {void}
 */
function setContext(ctx) {
  pluginContext = ctx;
}

/**
 * @param {string} name
 * @returns {any}
 */
function service(name) {
  try {
    if (pluginContext && typeof pluginContext.get === 'function') return pluginContext.get(name);
  } catch (error) {
    return undefined;
  }
  return undefined;
}

/**
 * Best-effort read of the model currently selected for a session. The
 * authoritative source lives in the model-selection feature; anything
 * unexpected degrades to "let the host decide".
 * @param {unknown} sessionId
 * @returns {{provider: string, model: string, reasoningEffort?: string} | null}
 */
function modelHintFor(sessionId) {
  const directories = service('modelDirectories');
  if (!directories || typeof directories.directoryFor !== 'function') return null;
  try {
    const directory = directories.directoryFor(sessionId);
    const snapshot = directory && directory.store && typeof directory.store.getSnapshot === 'function'
      ? directory.store.getSnapshot()
      : null;
    if (!snapshot) return null;
    const current = snapshot.current || snapshot.pending;
    if (!current || typeof current !== 'object') return null;
    const provider = typeof current.provider === 'string' ? current.provider : '';
    const model = typeof current.model === 'string' ? current.model : '';
    if (!provider || !model) return null;
    const hint = { provider: provider, model: model };
    if (typeof current.reasoningEffort === 'string' && current.reasoningEffort) {
      hint.reasoningEffort = current.reasoningEffort;
    }
    return hint;
  } catch (error) {
    return null;
  }
}

/**
 * Resolve the plugin's own configured model override, if any.
 * @returns {{provider: string, model: string, reasoningEffort?: string} | null}
 */
function modelOverride() {
  const settings = store.getSettings();
  if (!settings.provider || !settings.model) return null;
  const override = { provider: settings.provider, model: settings.model };
  if (settings.reasoningEffort) override.reasoningEffort = settings.reasoningEffort;
  return override;
}

/**
 * @returns {'zh'|'en'}
 */
function currentLocale() {
  return normalizeLocale(store.getSettings().locale);
}

/** @param {unknown} sessionId */
function nextRunId(sessionId) {
  const current = store.getSessionState(sessionId);
  const runId = current.runId + 1;
  store.setSessionState(sessionId, { runId: runId });
  return runId;
}

/**
 * Abort an in-flight request for a session and mark its state idle.
 * @param {unknown} sessionId
 * @returns {void}
 */
function cancelEnhance(sessionId) {
  const key = store.sessionKey(sessionId);
  const controller = inflight.get(key);
  if (controller) {
    inflight.delete(key);
    try {
      controller.abort();
    } catch (error) {
      /* ignore */
    }
  }
  nextRunId(key);
  store.setSessionState(key, { status: 'idle', error: null, open: true });
}

/** @type {Map<string, AbortController>} */
const inflight = new Map();

/**
 * @param {unknown} error
 * @returns {{code: string, message: string, details: unknown}}
 */
function describeError(error) {
  if (error instanceof RpcError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return {
    code: ERROR_CODES.INTERNAL,
    message: error && error.message ? String(error.message) : 'unexpected error',
    details: undefined,
  };
}

/**
 * @param {any} inputActions
 * @param {string} text
 * @returns {boolean} whether the draft was written
 */
function writeDraft(inputActions, text) {
  if (!inputActions || typeof inputActions.setDraft !== 'function') return false;
  try {
    inputActions.setDraft(text);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * @param {unknown} sessionId
 * @param {any} response
 * @param {string} baseDraft
 * @returns {{kind: string, prompt?: string}}
 */
function presentResult(sessionId, response, baseDraft) {
  const result = response && response.result ? response.result : null;
  const meta = response && response.meta ? response.meta : null;

  if (!result || result.kind === 'questions') {
    /* eslint-disable-next-line no-use-before-define */
    const questions = Array.isArray(result && result.questions) ? result.questions.slice(0, LIMITS.MAX_QUESTIONS) : [];
    store.setSessionState(sessionId, {
      status: 'questions',
      result: { kind: 'questions', questions: questions, summary: result && result.summary ? String(result.summary) : '' },
      meta: meta,
      error: null,
    });
    return { kind: 'questions' };
  }

  const prompt = typeof result.prompt === 'string' ? result.prompt : '';
  const hunks = diff.computeHunks(baseDraft, prompt);
  const accepted = {};
  for (const hunk of hunks) {
    if (hunk.kind !== 'same') accepted[hunk.id] = true;
  }
  store.setSessionState(sessionId, {
    status: 'result',
    result: {
      kind: 'enhanced',
      prompt: prompt,
      goal: typeof result.goal === 'string' ? result.goal : '',
      summary: typeof result.summary === 'string' ? result.summary : '',
      notes: Array.isArray(result.notes) ? result.notes.filter(function isText(item) { return typeof item === 'string' && item; }).slice(0, 4) : [],
      elevation: Array.isArray(result.elevation) ? result.elevation.filter(function isText(item) { return typeof item === 'string' && item; }).slice(0, 3) : [],
      scenario: typeof result.scenario === 'string' ? result.scenario : '',
    },
    hunks: hunks,
    accepted: accepted,
    meta: meta,
    error: null,
    applied: false,
    appliedText: '',
    view: 'compare',
  });
  return { kind: 'enhanced', prompt: prompt };
}

/**
 * Run one enhancement round from a fixed base draft.
 * @param {unknown} sessionId
 * @param {string} draft
 * @param {{mode?: string, scenario?: string, hints?: string, answers?: string}} [overrides]
 * @returns {Promise<{kind: string, prompt?: string} | null>}
 */
async function enhance(sessionId, draft, overrides) {
  const baseDraft = typeof draft === 'string' ? draft : '';
  if (!baseDraft.trim()) return null;

  const options = overrides || {};
  const settings = store.getSettings();
  const current = store.getSessionState(sessionId);
  const mode = normalizeMode(options.mode || current.mode || settings.mode);
  const scenario = normalizeScenario(options.scenario || current.scenario || settings.scenario);
  const hints = typeof options.hints === 'string' ? options.hints.slice(0, MAX_HINTS_CHARS) : '';
  const answers = typeof options.answers === 'string' ? options.answers.slice(0, MAX_HINTS_CHARS) : current.answers;

  const key = store.sessionKey(sessionId);
  cancelInflight(key);
  const runId = nextRunId(key);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  if (controller) inflight.set(key, controller);

  store.setSessionState(key, {
    open: true,
    status: 'running',
    base: baseDraft,
    hints: hints,
    mode: mode,
    scenario: scenario,
    answers: answers,
    result: null,
    hunks: [],
    accepted: {},
    error: null,
    applied: false,
    appliedText: '',
    showRefine: false,
    view: 'compare',
    meta: null,
  });

  try {
    const response = await callHost(
      METHODS.ENHANCE,
      {
        draft: baseDraft,
        hints: hints,
        mode: mode,
        scenario: scenario,
        sessionId: String(sessionId || ''),
        locale: currentLocale(),
        model: modelOverride() || modelHintFor(sessionId),
      },
      { signal: controller ? controller.signal : undefined },
    );
    if (store.getSessionState(key).runId !== runId) return null;
    return presentResult(key, response, baseDraft);
  } catch (error) {
    if (store.getSessionState(key).runId !== runId) return null;
    const described = describeError(error);
    if (described.code === ERROR_CODES.ABORTED) return null;
    store.setSessionState(key, { status: 'error', error: described });
    return null;
  } finally {
    if (inflight.get(key) === controller) inflight.delete(key);
  }
}

/**
 * Abort without bumping the run id (used right before starting a new round).
 * @param {string} key
 * @returns {void}
 */
function cancelInflight(key) {
  const controller = inflight.get(key);
  if (!controller) return;
  inflight.delete(key);
  try {
    controller.abort();
  } catch (error) {
    /* ignore */
  }
}

/**
 * Refine the previous result with a free-form instruction.
 * @param {unknown} sessionId
 * @param {string} instruction
 * @returns {Promise<{kind: string, prompt?: string} | null>}
 */
async function refine(sessionId, instruction) {
  const key = store.sessionKey(sessionId);
  const current = store.getSessionState(key);
  const text = typeof instruction === 'string' ? instruction.trim() : '';
  if (!text || !current.base) return null;

  const settings = store.getSettings();
  const mode = normalizeMode(current.mode || settings.mode);
  const scenario = normalizeScenario(current.scenario || settings.scenario);
  const previous = current.result && current.result.kind === 'enhanced' ? current.result.prompt : '';

  cancelInflight(key);
  const runId = nextRunId(key);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  if (controller) inflight.set(key, controller);

  store.setSessionState(key, {
    open: true,
    status: 'running',
    showRefine: true,
    error: null,
    mode: mode,
    scenario: scenario,
  });

  try {
    const response = await callHost(
      METHODS.REFINE,
      {
        draft: current.base,
        previous: previous,
        instruction: text.slice(0, MAX_HINTS_CHARS),
        mode: mode,
        scenario: scenario,
        sessionId: String(sessionId || ''),
        locale: currentLocale(),
        model: modelOverride() || modelHintFor(sessionId),
      },
      { signal: controller ? controller.signal : undefined },
    );
    if (store.getSessionState(key).runId !== runId) return null;
    store.setSessionState(key, { refineText: '' });
    return presentResult(key, response, current.base);
  } catch (error) {
    if (store.getSessionState(key).runId !== runId) return null;
    const described = describeError(error);
    if (described.code === ERROR_CODES.ABORTED) return null;
    store.setSessionState(key, { status: 'error', error: described });
    return null;
  } finally {
    if (inflight.get(key) === controller) inflight.delete(key);
  }
}

/**
 * Re-run with the user's answers to the model's clarifying questions.
 * @param {unknown} sessionId
 * @returns {Promise<{kind: string, prompt?: string} | null>}
 */
function enhanceWithAnswers(sessionId) {
  const key = store.sessionKey(sessionId);
  const current = store.getSessionState(key);
  const answers = typeof current.answers === 'string' ? current.answers.trim() : '';
  if (!answers) return Promise.resolve(null);
  return enhance(key, current.base, { hints: answers, mode: current.mode, scenario: current.scenario });
}

/**
 * Skip the questions and let the model choose sensible defaults.
 * @param {unknown} sessionId
 * @returns {Promise<{kind: string, prompt?: string} | null>}
 */
function enhanceAssumingDefaults(sessionId) {
  const key = store.sessionKey(sessionId);
  const current = store.getSessionState(key);
  return enhance(key, current.base, {
    hints: 'The user skipped the questions. Choose the most reasonable defaults, and return the enhanced prompt without asking again.',
    mode: current.mode,
    scenario: current.scenario,
  });
}

/**
 * Retry the last operation from the current base draft.
 * @param {unknown} sessionId
 * @returns {Promise<{kind: string, prompt?: string} | null>}
 */
function retry(sessionId) {
  const key = store.sessionKey(sessionId);
  const current = store.getSessionState(key);
  if (current.hints) return enhance(key, current.base, { hints: current.hints, mode: current.mode, scenario: current.scenario });
  return enhance(key, current.base, { mode: current.mode, scenario: current.scenario });
}

/**
 * @param {unknown} sessionId
 * @returns {string[]} accepted hunk ids
 */
function acceptedIds(sessionId) {
  const current = store.getSessionState(sessionId);
  return Object.keys(current.accepted).filter(function isAccepted(id) {
    return current.accepted[id] === true;
  });
}

/**
 * Merge the accepted hunks into the final text.
 * @param {unknown} sessionId
 * @returns {string}
 */
function mergedText(sessionId) {
  const current = store.getSessionState(sessionId);
  return diff.applyHunks(current.hunks, new Set(acceptedIds(sessionId)));
}

/**
 * @param {unknown} sessionId
 * @param {string} hunkId
 * @param {boolean} accepted
 * @returns {void}
 */
function toggleHunk(sessionId, hunkId, accepted) {
  const current = store.getSessionState(sessionId);
  const next = Object.assign({}, current.accepted);
  next[hunkId] = accepted === true;
  store.setSessionState(sessionId, { accepted: next });
}

/**
 * Toggle every change hunk at once.
 * @param {unknown} sessionId
 * @param {boolean} accepted
 * @returns {void}
 */
function toggleAllHunks(sessionId, accepted) {
  const current = store.getSessionState(sessionId);
  const next = {};
  for (const hunk of current.hunks) {
    if (hunk.kind === 'same') continue;
    next[hunk.id] = accepted === true;
  }
  store.setSessionState(sessionId, { accepted: next });
}

/**
 * Write the merged result into the composer draft.
 * @param {unknown} sessionId
 * @param {any} inputActions
 * @returns {boolean}
 */
function applyResult(sessionId, inputActions) {
  const key = store.sessionKey(sessionId);
  const current = store.getSessionState(key);
  if (!current.result || current.result.kind !== 'enhanced' || current.hunks.length === 0) return false;
  const text = mergedText(key);
  if (!writeDraft(inputActions, text)) return false;
  store.setSessionState(key, { status: 'applied', applied: true, appliedText: text, open: true });
  return true;
}

/**
 * Restore the original draft captured when the enhancement started.
 * @param {unknown} sessionId
 * @param {any} inputActions
 * @returns {boolean}
 */
function undoApplied(sessionId, inputActions) {
  const key = store.sessionKey(sessionId);
  const current = store.getSessionState(key);
  if (!current.applied) return false;
  if (!writeDraft(inputActions, current.base)) return false;
  store.setSessionState(key, { status: 'result', applied: false, appliedText: '' });
  return true;
}

/**
 * Close the panel and reset transient state, keeping the last result.
 * @param {unknown} sessionId
 * @returns {void}
 */
function closePanel(sessionId) {
  const key = store.sessionKey(sessionId);
  const current = store.getSessionState(key);
  cancelInflight(key);
  store.setSessionState(key, {
    open: false,
    runId: current.runId + 1,
    status: current.status === 'running' ? 'idle' : current.status,
    error: null,
    showRefine: false,
    refineText: '',
  });
}

/**
 * Forget the result entirely and start fresh on the next click.
 * @param {unknown} sessionId
 * @returns {void}
 */
function discard(sessionId) {
  const key = store.sessionKey(sessionId);
  cancelInflight(key);
  store.setSessionState(key, {
    open: false,
    status: 'idle',
    runId: store.getSessionState(key).runId + 1,
    base: '',
    hints: '',
    result: null,
    hunks: [],
    accepted: {},
    error: null,
    answers: '',
    refineText: '',
    showRefine: false,
    meta: null,
    applied: false,
    appliedText: '',
  });
}

/**
 * Open the panel without running a request.
 * @param {unknown} sessionId
 * @returns {void}
 */
function openPanel(sessionId) {
  store.setSessionState(sessionId, { open: true });
}

module.exports = {
  setContext,
  modelHintFor,
  modelOverride,
  currentLocale,
  enhance,
  refine,
  enhanceWithAnswers,
  enhanceAssumingDefaults,
  retry,
  cancelEnhance,
  applyResult,
  undoApplied,
  acceptedIds,
  mergedText,
  toggleHunk,
  toggleAllHunks,
  closePanel,
  discard,
  openPanel,
  writeDraft,
  describeError,
};
