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
const VERSION = '0.6.0';

/** RPC method names. */
const METHODS = Object.freeze({
  ENHANCE: 'enhance',
  REFINE: 'refine',
  PING: 'ping',
  /** Cheap round trip used by the settings page to verify a model route. */
  PROBE: 'probe',
  /** Draft 3-4 next-message options after a completed turn (fill-only). */
  FOLLOWUPS: 'followups',
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

/**
 * Public prompt-writing rules the enhancer must apply, one id per rule.
 *
 * Every rule is traceable to a published, first-party source (see `sources`).
 * The host injects the rule ids and guidance into the system prompt and the
 * answer must cite the ids it actually applied, so each edit in the result can
 * be explained. Keep ids stable: answers and the UI both reference them.
 */
const RULES = Object.freeze([
  Object.freeze({
    id: 'R1',
    zh: '先写结果，再写步骤',
    en: 'start with the outcome, not the procedure',
    sources: [
      'https://code.claude.com/docs/en/prompt-library',
      'https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering',
    ],
  }),
  Object.freeze({
    id: 'R2',
    zh: '点名具体文件 / 组件 / 接口',
    en: 'name the concrete file, component, route, or command',
    sources: [
      'https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering',
      'https://code.claude.com/docs/en/prompt-library',
    ],
  }),
  Object.freeze({
    id: 'R3',
    zh: '只写代码里看不到的上下文',
    en: 'add only context the repository cannot reveal',
    sources: [
      'https://code.claude.com/docs/en/best-practices',
      'https://www.anthropic.com/research/effective-context-engineering-for-ai-agents',
    ],
  }),
  Object.freeze({
    id: 'R4',
    zh: '把「做好」写成可验证的标准',
    en: 'define done as an observable target',
    sources: [
      'https://code.claude.com/docs/en/prompt-library',
      'https://github.com/github/spec-kit',
    ],
  }),
  Object.freeze({
    id: 'R5',
    zh: '要求跑检查并给出证据',
    en: 'require a verification loop and its evidence',
    sources: [
      'https://code.claude.com/docs/en/prompt-library',
      'https://code.claude.com/docs/en/best-practices',
    ],
  }),
  Object.freeze({
    id: 'R6',
    zh: '复用现有组件与设计 token',
    en: 'reuse existing components, tokens, and conventions',
    sources: [
      'https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide',
      'https://code.claude.com/docs/en/prompt-library',
    ],
  }),
  Object.freeze({
    id: 'R7',
    zh: '计划随任务规模伸缩',
    en: 'right-size the process to the task',
    sources: [
      'https://github.com/github/spec-kit',
      'https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide',
    ],
  }),
  Object.freeze({
    id: 'R8',
    zh: '写清输出形式、长度与受众',
    en: 'state the answer shape, length, and audience',
    sources: [
      'https://code.claude.com/docs/en/prompt-library',
      'https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide',
    ],
  }),
  Object.freeze({
    id: 'R9',
    zh: '用祈使句写规则，关键的放前面',
    en: 'write requirements as directives, most important first',
    sources: ['https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering'],
  }),
  Object.freeze({
    id: 'R10',
    zh: '不靠 IMPORTANT / 大写 / “一步步想”加码',
    en: 'do not pad with emphasis or step-by-step incantations',
    sources: ['https://code.claude.com/docs/en/best-practices'],
  }),
  Object.freeze({
    id: 'R11',
    zh: '用小节组织，示例少而典型',
    en: 'organize with short sections and a few canonical examples',
    sources: ['https://www.anthropic.com/research/effective-context-engineering-for-ai-agents'],
  }),
  Object.freeze({
    id: 'R12',
    zh: '缺信息才问，否则写明假设继续',
    en: 'ask only when the gap changes the outcome',
    sources: [
      'https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide',
      'https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering',
    ],
  }),
  Object.freeze({
    id: 'R13',
    zh: '未知信息用占位符，不臆造',
    en: 'never invent files, APIs, versions, or requirements',
    sources: ['https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide'],
  }),
  Object.freeze({
    id: 'R14',
    zh: '多步任务拆成有序可验收的小步',
    en: 'split multi-part work into ordered, verifiable steps',
    sources: [
      'https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering',
      'https://github.com/github/spec-kit',
    ],
  }),
]);

const RULE_IDS = Object.freeze(RULES.map((rule) => rule.id));

/** Wire limits enforced on both sides. */
const LIMITS = Object.freeze({
  MAX_BODY_BYTES: 1024 * 1024,
  MAX_DRAFT_CHARS: 20000,
  MAX_PREVIOUS_CHARS: 30000,
  MAX_INSTRUCTION_CHARS: 2000,
  MAX_ID_CHARS: 200,
  MAX_MODEL_CHARS: 200,
  MAX_PROMPT_CHARS: 30000,
  MAX_QUESTIONS: 1,
  /** Follow-up suggestions shown above the composer after a completed turn. */
  MIN_FOLLOWUPS: 3,
  MAX_FOLLOWUPS: 4,
  MAX_FOLLOWUP_CHARS: 240,
  /** Conversation context: how much recent history may accompany a request. */
  MAX_CONTEXT_MESSAGES: 6,
  MAX_CONTEXT_MESSAGE_CHARS: 700,
  MAX_CONTEXT_CHARS: 3000,
  /** WeChat bridge: messages kept while nobody is looking at a composer. */
  MAX_WEIXIN_QUEUE: 20,
  /** WeChat bridge: one inbound text is clipped to this many characters. */
  MAX_WEIXIN_TEXT_CHARS: 8000,
});

/**
 * Token budget for the enhancement call.
 *
 * Reasoning models spend output tokens on hidden thinking before they write a
 * single character of the answer, so a budget that is generous for a plain
 * model can truncate a reasoning model mid-JSON. HIGH tiers get room to think
 * *and* write; `tokenBudgetFor` is the only place that decides.
 */
const TOKEN_BUDGET = Object.freeze({
  DEFAULT: 4096,
  REASONING: 8000,
  HEAVY_REASONING: 16000,
  MAX: 32768,
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
function validateClarification(value) {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value) || value.length > 12) return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, '澄清记录过长，请开始一次新的增强') };
  let total = 0;
  const items = [];
  for (const item of value) {
    if (!isPlainObject(item) || typeof item.question !== 'string' || typeof item.answer !== 'string' || item.question.length > 300 || item.answer.length > 2000) return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, '澄清内容无效或过长') };
    total += item.question.length + item.answer.length;
    items.push({ question: item.question, answer: item.answer });
  }
  return total > 12000 ? { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, '澄清内容超限，请开始一次新的增强') } : { ok: true, value: items };
}

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
  const clarification = validateClarification(body.clarification);
  if (!clarification.ok) return clarification;
  return {
    ok: true,
    value: {
      draft,
      polishOnly: body.polishOnly === true,
      clarification: clarification.value,
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
  const clarification = validateClarification(body.clarification);
  if (!clarification.ok) return clarification;
  return {
    ok: true,
    value: {
      draft,
      polishOnly: body.polishOnly === true,
      clarification: clarification.value,
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
 * Validate a `followups` request body (next-message options after a turn).
 *
 * Follow-ups are generated from the session's own recent messages, so a
 * session id is required; the caller never ships the conversation itself.
 * @param {unknown} body
 * @returns {{ ok: true, value: { sessionId: string, locale: string, model: object|null } } | { ok: false, error: { code: string, message: string } }}
 */
function validateFollowups(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'request body must be an object') };
  }
  const sessionId = readString(body.sessionId, LIMITS.MAX_ID_CHARS).trim();
  if (!sessionId) {
    return { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'followups need a session id') };
  }
  return {
    ok: true,
    value: {
      sessionId,
      locale: body.locale === 'en' ? 'en' : 'zh',
      model: normalizeModel(body.model),
    },
  };
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
  const effort = normalizeEffort(reasoningEffort);
  if (!effort) return TOKEN_BUDGET.DEFAULT;
  if (effort === 'high' || effort === 'xhigh' || effort === 'max') return TOKEN_BUDGET.HEAVY_REASONING;
  return TOKEN_BUDGET.REASONING;
}

module.exports = {
  PLUGIN_ID,
  RPC_PATH,
  VERSION,
  METHODS,
  MODES,
  SCENARIOS,
  REASONING_EFFORTS,
  RULES,
  RULE_IDS,
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
  validateFollowups,
  tokenBudgetFor,
};
