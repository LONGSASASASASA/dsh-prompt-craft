'use strict';

/**
 * Shared contract between the host half (Node) and the client half (browser).
 *
 * Kept dependency-free and side-effect free so it can be `require`d by the
 * host plugin, bundled into the browser bundle, and unit-tested directly.
 */

/** Package / plugin id, must equal the npm package name. */
const PLUGIN_ID = 'dsh-prompt-craft';
/** Host HTTP route serving the plugin RPC. */
const RPC_PATH = '/dsh-prompt-craft/rpc';
/** Wire version of the plugin's own protocol. */
const VERSION = '0.4.5';

/** RPC method names. */
const METHODS = Object.freeze({
  ENHANCE: 'enhance',
  REFINE: 'refine',
  PING: 'ping',
  /** Cheap round trip used by the settings page to verify a model route. */
  PROBE: 'probe',
  /** WeChat (iLink) bridge: read connection state. */
  WEIXIN_STATUS: 'weixin/status',
  /** WeChat (iLink) bridge: start a QR login. */
  WEIXIN_LOGIN: 'weixin/login',
  /** WeChat (iLink) bridge: submit the numeric pairing code shown in WeChat. */
  WEIXIN_VERIFY: 'weixin/verify',
  /** WeChat (iLink) bridge: drop the session and stored credentials. */
  WEIXIN_LOGOUT: 'weixin/logout',
  /** WeChat (iLink) bridge: consume messages waiting for a composer. */
  WEIXIN_PENDING: 'weixin/pending',
  /** WeChat (iLink) bridge: drop the pending queue without filling anything. */
  WEIXIN_CLEAR: 'weixin/clear',
});

/** Strength modes, weakest first. */
const MODES = Object.freeze(['light', 'standard', 'expert']);
/** Scenarios the host may report; `auto` means "let the model decide". */
const SCENARIOS = Object.freeze(['auto', 'code', 'writing', 'research', 'agent', 'general']);

/**
 * Reasoning efforts the plugin is willing to forward. Routes disagree about
 * which levels they accept (`noki` takes low..max but rejects `none`), so the
 * host only transmits values from this list and lets the adapter/provider
 * decide the rest.
 */
const REASONING_EFFORTS = Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/** Wire limits enforced on both sides. */
const LIMITS = Object.freeze({
  MAX_BODY_BYTES: 1024 * 1024,
  MAX_DRAFT_CHARS: 20000,
  MAX_PREVIOUS_CHARS: 30000,
  MAX_INSTRUCTION_CHARS: 2000,
  MAX_ID_CHARS: 200,
  MAX_MODEL_CHARS: 200,
  MAX_PROMPT_CHARS: 30000,
  MAX_QUESTIONS: 2,
  /** Conversation context: how much recent history may accompany a request. */
  MAX_CONTEXT_MESSAGES: 6,
  MAX_CONTEXT_MESSAGE_CHARS: 700,
  MAX_CONTEXT_CHARS: 3000,
  /** WeChat bridge: messages kept while nobody is looking at a composer. */
  MAX_WEIXIN_QUEUE: 20,
  /** WeChat bridge: one inbound text is clipped to this many characters. */
  MAX_WEIXIN_TEXT_CHARS: 8000,
});

/** Token budget for the enhancement call. */
const TOKEN_BUDGET = Object.freeze({
  DEFAULT: 4096,
  REASONING: 8000,
});

/** Stable error codes returned by the host. */
const ERROR_CODES = Object.freeze({
  BAD_REQUEST: 'BAD_REQUEST',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  FORBIDDEN: 'FORBIDDEN',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  NOT_FOUND: 'NOT_FOUND',
  MODEL_UNRESOLVED: 'MODEL_UNRESOLVED',
  LLM_FAILED: 'LLM_FAILED',
  BAD_MODEL_OUTPUT: 'BAD_MODEL_OUTPUT',
  TIMEOUT: 'TIMEOUT',
  INTERNAL: 'INTERNAL',
  /** Client-only: the plugin host route could not be reached. */
  NETWORK: 'NETWORK',
  /** Client-only: the request was cancelled by the user. */
  ABORTED: 'ABORTED',
});

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a bounded string field.
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function readString(value, max) {
  if (typeof value !== 'string') return '';
  const text = value;
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * @param {unknown} value
 * @returns {'light'|'standard'|'expert'}
 */
function normalizeMode(value) {
  return MODES.indexOf(value) === -1 ? 'standard' : /** @type {any} */ (value);
}

/**
 * @param {unknown} value
 * @returns {'auto'|'code'|'writing'|'research'|'agent'|'general'}
 */
function normalizeScenario(value) {
  return SCENARIOS.indexOf(value) === -1 ? 'auto' : /** @type {any} */ (value);
}

/**
 * Coerce a reasoning effort into a value the plugin may forward.
 *
 * `off`, `none`, `auto` and empty all mean "do not send an effort": some
 * routes (pi-ai's openai-responses builder for custom providers) turn a
 * missing effort into `reasoning.effort: "none"`, which strict gateways such
 * as noki reject, so the host retries with a supported level instead.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeEffort(value) {
  const effort = readString(value, 40).trim().toLowerCase();
  return REASONING_EFFORTS.indexOf(effort) === -1 ? '' : effort;
}

/**
 * Coerce a model selection hint into the wire shape.
 * @param {unknown} value
 * @returns {{ provider: string, model: string, reasoningEffort?: string } | null}
 */
function normalizeModel(value) {
  if (!isPlainObject(value)) return null;
  const provider = readString(value.provider, LIMITS.MAX_MODEL_CHARS).trim();
  const model = readString(value.model, LIMITS.MAX_MODEL_CHARS).trim();
  if (!provider || !model) return null;
  const effort = normalizeEffort(value.reasoningEffort);
  return effort ? { provider, model, reasoningEffort: effort } : { provider, model };
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
function makeError(code, message, details) {
  return details ? { code, message, details } : { code, message };
}

/**
 * Validate an `enhance` request body.
 * @param {unknown} body
 * @returns {{ ok: true, value: { draft: string, mode: string, scenario: string, sessionId: string, locale: string, model: object|null } } | { ok: false, error: { code: string, message: string } }}
 */
function validateEnhance(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'request body must be an object') };
  }
  const draft = typeof body.draft === 'string' ? body.draft : '';
  if (!draft.trim()) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'draft is empty') };
  }
  if (draft.length > LIMITS.MAX_DRAFT_CHARS) {
    return {
      ok: false,
      error: makeError(ERROR_CODES.BAD_REQUEST, 'draft is too long', {
        max: LIMITS.MAX_DRAFT_CHARS,
        actual: draft.length,
      }),
    };
  }
  return {
    ok: true,
    value: {
      draft,
      hints: readString(body.hints, LIMITS.MAX_INSTRUCTION_CHARS).trim(),
      mode: normalizeMode(body.mode),
      scenario: normalizeScenario(body.scenario),
      sessionId: readString(body.sessionId, LIMITS.MAX_ID_CHARS),
      locale: body.locale === 'en' ? 'en' : 'zh',
      model: normalizeModel(body.model),
      /** Attach recent conversation history so the rewrite knows the situation. */
      withContext: body.withContext !== false,
    },
  };
}

/**
 * Validate a `refine` request body.
 * @param {unknown} body
 * @returns {{ ok: true, value: { draft: string, previous: string, instruction: string, mode: string, scenario: string, sessionId: string, locale: string, model: object|null } } | { ok: false, error: { code: string, message: string } }}
 */
function validateRefine(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'request body must be an object') };
  }
  const draft = typeof body.draft === 'string' ? body.draft : '';
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  const previous = typeof body.previous === 'string' ? body.previous : '';
  if (!draft.trim()) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'draft is empty') };
  }
  if (!instruction) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'instruction is empty') };
  }
  if (draft.length > LIMITS.MAX_DRAFT_CHARS || previous.length > LIMITS.MAX_PREVIOUS_CHARS) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'draft or previous prompt is too long') };
  }
  if (instruction.length > LIMITS.MAX_INSTRUCTION_CHARS) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'instruction is too long') };
  }
  return {
    ok: true,
    value: {
      draft,
      previous,
      instruction,
      mode: normalizeMode(body.mode),
      scenario: normalizeScenario(body.scenario),
      sessionId: readString(body.sessionId, LIMITS.MAX_ID_CHARS),
      locale: body.locale === 'en' ? 'en' : 'zh',
      model: normalizeModel(body.model),
      withContext: body.withContext !== false,
    },
  };
}

/**
 * Validate a `probe` request body (settings page "test model" button).
 * @param {unknown} body
 * @returns {{ ok: true, value: { model: { provider: string, model: string, reasoningEffort?: string }, sessionId: string } } | { ok: false, error: { code: string, message: string } }}
 */
function validateProbe(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'request body must be an object') };
  }
  const sessionId = readString(body.sessionId, LIMITS.MAX_ID_CHARS);
  const model = normalizeModel(body.model);
  if (!model && !sessionId) {
    return {
      ok: false,
      error: makeError(ERROR_CODES.BAD_REQUEST, 'probe needs an explicit model or a session id', {
        hint: 'pick a model in the settings page',
      }),
    };
  }
  return { ok: true, value: { model, sessionId } };
}

/**
 * Normalize a short conversation history into the wire shape used by the
 * prompt templates. The host reads it from the live session, but the same
 * clamping applies to any caller and is covered by tests.
 *
 * Only the most recent usable messages survive: system/developer/tool
 * messages are dropped, each text is clipped, and the total is trimmed from
 * the oldest end so a chatty history can never inflate the request.
 *
 * @param {unknown} value
 * @returns {Array<{ role: 'user'|'assistant', text: string }>}
 */
function normalizeContext(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isPlainObject(entry)) continue;
    const role = entry.role === 'user' ? 'user' : entry.role === 'assistant' ? 'assistant' : '';
    if (!role) continue;
    const text = readString(typeof entry.text === 'string' ? entry.text : '', LIMITS.MAX_CONTEXT_MESSAGE_CHARS)
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    cleaned.push({ role, text });
  }
  const recent = cleaned.slice(-LIMITS.MAX_CONTEXT_MESSAGES);
  let total = recent.reduce((sum, message) => sum + message.text.length, 0);
  while (recent.length > 0 && total > LIMITS.MAX_CONTEXT_CHARS) {
    total -= recent[0].text.length;
    recent.shift();
  }
  return recent;
}

/**
 * Pick the token budget for one call.
 * @param {string|undefined} reasoningEffort
 * @returns {number}
 */
function tokenBudgetFor(reasoningEffort) {
  return reasoningEffort ? TOKEN_BUDGET.REASONING : TOKEN_BUDGET.DEFAULT;
}

module.exports = {
  PLUGIN_ID,
  RPC_PATH,
  VERSION,
  METHODS,
  MODES,
  SCENARIOS,
  REASONING_EFFORTS,
  LIMITS,
  TOKEN_BUDGET,
  ERROR_CODES,
  isPlainObject,
  readString,
  normalizeMode,
  normalizeScenario,
  normalizeEffort,
  normalizeModel,
  normalizeContext,
  makeError,
  validateEnhance,
  validateRefine,
  validateProbe,
  tokenBudgetFor,
};
