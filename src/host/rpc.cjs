'use strict';

/**
 * Host half of dsh-prompt-craft: one exact HTTP route that performs the
 * prompt-enhancement calls and returns strict JSON to the browser.
 *
 * Security: the DSH web server applies no authentication to plugin routes, so
 * this route enforces method, content type, origin, and body-size fences itself.
 */

const {
  RPC_PATH,
  VERSION,
  PLUGIN_ID,
  METHODS,
  LIMITS,
  ERROR_CODES,
  REASONING_EFFORTS,
  validateEnhance,
  validateRefine,
  validateProbe,
  tokenBudgetFor,
  isPlainObject,
} = require('../protocol.cjs');
const {
  buildEnhancePrompt,
  buildRefinePrompt,
  buildProbePrompt,
  buildRepairMessages,
} = require('./templates.cjs');
const { parseModelOutput } = require('./parse-output.cjs');
const { resolveModel } = require('./resolve-model.cjs');

/** Hard ceiling for one model round trip. */
const REQUEST_TIMEOUT_MS = 120000;
/** Sampling temperature: low enough to stay faithful to the draft. */
const TEMPERATURE = 0.4;

/**
 * @param {any} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  if (res.headersSent && typeof res.end === 'function') {
    res.end(body);
    return;
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * @param {{ code: string, message: string, details?: Record<string, unknown> }} error
 * @returns {number}
 */
function statusFor(error) {
  switch (error.code) {
    case ERROR_CODES.BAD_REQUEST:
    case ERROR_CODES.MODEL_UNRESOLVED:
      return 400;
    case ERROR_CODES.FORBIDDEN:
      return 403;
    case ERROR_CODES.NOT_FOUND:
      return 404;
    case ERROR_CODES.METHOD_NOT_ALLOWED:
      return 405;
    case ERROR_CODES.PAYLOAD_TOO_LARGE:
      return 413;
    case ERROR_CODES.TIMEOUT:
      return 504;
    case ERROR_CODES.LLM_FAILED:
    case ERROR_CODES.BAD_MODEL_OUTPUT:
      return 502;
    default:
      return 500;
  }
}

/**
 * @param {string} method
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @returns {{ code: string, message: string, details?: Record<string, unknown> }}
 */
function makeError(method, message, details) {
  return details ? { code: method, message, details } : { code: method, message };
}

/**
 * Read a bounded JSON body.
 * @param {AsyncIterable<Buffer|string>} req
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > maxBytes) {
      const error = new Error('request body is too large');
      error.code = ERROR_CODES.PAYLOAD_TOO_LARGE;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Same-origin fence for a loopback web UI.
 * @param {{ headers?: Record<string, any> }} req
 * @returns {boolean}
 */
function isTrustedRequest(req) {
  const headers = (req && req.headers) || {};
  const site = String(headers['sec-fetch-site'] || '').toLowerCase();
  if (site === 'cross-site') return false;
  const origin = headers.origin;
  if (origin) {
    try {
      const parsed = new URL(String(origin));
      const host = String(headers.host || '').toLowerCase();
      if (host && parsed.host.toLowerCase() !== host) return false;
      if (!host && parsed.hostname && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname)) return false;
    } catch (error) {
      return false;
    }
  }
  return true;
}

/**
 * Drain a dsh-llm stream into text plus its terminal finish reason.
 * @param {AsyncIterable<any>} stream
 * @param {number} timeoutMs
 * @returns {Promise<{ text: string, finish?: { kind: string, failure?: any } }>}
 */
async function readStream(stream, timeoutMs) {
  const parts = [];
  let finish;
  let timer;
  let timedOut = false;
  const iterator = typeof stream[Symbol.asyncIterator] === 'function' ? stream[Symbol.asyncIterator]() : stream;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const error = new Error('the model call timed out');
      error.code = ERROR_CODES.TIMEOUT;
      reject(error);
    }, timeoutMs);
  });
  if (timer && typeof timer.unref === 'function') timer.unref();
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), timeout]);
      if (!next || next.done) break;
      const chunk = next.value;
      if (!chunk || typeof chunk !== 'object') continue;
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        parts.push(chunk.text);
      } else if (chunk.type === 'block-end' && chunk.block && chunk.block.type === 'text') {
        if (parts.length === 0 && typeof chunk.block.text === 'string') parts.push(chunk.block.text);
      } else if (chunk.type === 'finish') {
        finish = chunk.reason;
      }
    }
  } finally {
    clearTimeout(timer);
    if (timedOut && typeof iterator.return === 'function') {
      try {
        await iterator.return();
      } catch (error) {
        /* the stream already failed; nothing to release */
      }
    }
  }
  return { text: parts.join(''), finish };
}

/**
 * @param {{ kind: string, failure?: { code?: string, message?: string } }|undefined} finish
 * @param {string} text
 * @returns {{ code: string, message: string, details?: Record<string, unknown> } | null}
 */
function finishFailure(finish, text) {
  if (!finish || finish.kind === 'stop' || finish.kind === 'tool-calls') return null;
  if (finish.kind === 'max-tokens') return null;
  const failure = finish.failure || {};
  const details = {
    reason: finish.kind,
    providerCode: failure.code || failure.kind || 'unknown',
    partialChars: typeof text === 'string' ? text.length : 0,
  };
  const message = typeof failure.message === 'string' ? failure.message.trim() : '';
  if (message) details.providerMessage = message.slice(0, 1200);
  for (const key of ['status', 'param', 'type', 'retryAfter', 'hint']) {
    const value = failure[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      details[key] = typeof value === 'string' ? value.slice(0, 400) : value;
    }
  }
  return makeError(ERROR_CODES.LLM_FAILED, 'the model call did not complete', details);
}

/**
 * Pull the acceptable values out of a provider message such as
 * `Unsupported value: 'none'. Supported values are: 'low', 'medium', 'high'.`
 * @param {string} message
 * @returns {string[]}
 */
function supportedEffortsFrom(message) {
  const match = /supported values? (?:are|is)\s*:?\s*([^.]*)/i.exec(message);
  if (!match) return [];
  const quoted = match[1].match(/'([a-zA-Z_-]+)'/g);
  if (!quoted) return [];
  return quoted
    .map((token) => token.replace(/'/g, '').toLowerCase())
    .filter((effort) => REASONING_EFFORTS.indexOf(effort) !== -1);
}

/**
 * Decide whether one failed call deserves a quiet second attempt.
 *
 * Custom pi-ai routes turn "no effort" into `reasoning.effort: "none"`, which
 * strict gateways reject (noki: `Unsupported value: 'none'`). Others reject a
 * sampling temperature. Both are recoverable without asking the user.
 *
 * @param {{ provider: string, model: string, reasoningEffort?: string }} model
 * @param {{ kind: string, failure?: any }|undefined} finish
 * @returns {{ model: object, note: Record<string, string>, dropTemperature?: boolean } | null}
 */
function planRetry(model, finish) {
  const failure = (finish && finish.failure) || {};
  const message = String(failure.message || '');
  if (!message) return null;
  // The user picked an effort explicitly; never silently change it.
  if (model.reasoningEffort) return null;
  if (/reasoning|effort|unsupported value/i.test(message)) {
    const efforts = supportedEffortsFrom(message);
    if (efforts.length > 0) {
      const pick = efforts.indexOf('low') === -1 ? efforts[0] : 'low';
      return {
        model: Object.assign({}, model, { reasoningEffort: pick }),
        note: { reasoningEffort: pick },
      };
    }
  }
  if (/temperature/i.test(message) && /unsupported|invalid|not supported/i.test(message)) {
    return { model, note: { temperatureOmitted: 'true' }, dropTemperature: true };
  }
  return null;
}

/**
 * One call, plus the transparent retry described in {@link planRetry}.
 * @returns {Promise<{ text: string, finish?: any, effort: string, retry?: Record<string, string> }>}
 */
async function callModelAuto(llm, prompt, model, timeoutMs) {
  const first = await callModel(llm, prompt, model, timeoutMs);
  if (!first.finish || first.finish.kind !== 'error') return first;
  const retry = planRetry(model, first.finish);
  if (!retry) return first;
  const second = await callModel(llm, prompt, retry.model, timeoutMs, {
    dropTemperature: retry.dropTemperature,
  });
  second.retry = retry.note;
  return second;
}

/**
 * @param {any} llm
 * @param {{ system: string, messages: any[] }} prompt
 * @param {{ provider: string, model: string, reasoningEffort?: string }} model
 * @param {number} timeoutMs
 * @returns {Promise<{ text: string, finish?: any }>}
 */
async function callModel(llm, prompt, model, timeoutMs, extra) {
  const omitTemperature = !!(extra && extra.dropTemperature);
  const options = {
    provider: model.provider,
    model: model.model,
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: tokenBudgetFor(model.reasoningEffort),
  };
  if (!omitTemperature) options.temperature = TEMPERATURE;
  if (model.reasoningEffort) options.reasoningEffort = model.reasoningEffort;
  const stream = llm.stream(options);
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw makeError(ERROR_CODES.INTERNAL, 'the language model service returned no stream');
  }
  const result = await readStream(stream, timeoutMs);
  result.effort = model.reasoningEffort || '';
  return result;
}

/**
 * Wrap the model's unusable answer as a replayable assistant turn.
 *
 * DSH's `LlmRuntime.forAdapter()` reads `message.source.replayState` on every
 * assistant message, so an assistant turn without `source` makes the whole
 * call fail with `Cannot read properties of undefined (reading 'replayState')`.
 * Tagging the turn with its producer keeps the repair round working.
 * @param {string} text
 * @param {{ provider: string, model: string }} model
 * @returns {{ role: 'assistant', source: { kind: 'model', provider: string, model: string }, content: Array<{ type: 'text', text: string }> }}
 */
function assistantRepairMessage(text, model) {
  return {
    role: 'assistant',
    source: { kind: 'model', provider: model.provider, model: model.model },
    content: [{ type: 'text', text: String(text || '').slice(0, 4000) }],
  };
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeRepairError(error) {
  const message = error && error.message ? String(error.message) : String(error);
  return message.slice(0, 300);
}

/**
 * One model call, then a second stricter call when the answer was not JSON.
 * The repair round is best-effort: when it cannot run at all (adapter/host
 * failure) the caller still gets the actionable "not JSON" outcome instead of
 * an internal TypeError from the host.
 * @param {any} llm
 * @param {{ system: string, messages: any[] }} prompt
 * @param {{ provider: string, model: string, reasoningEffort?: string }} model
 * @param {number} timeoutMs
 * @returns {Promise<{ ok: true, result: object } | { ok: false, code: string, message: string, excerpt?: string, details?: object }>}
 */
async function generateResult(llm, prompt, model, timeoutMs) {
  const first = await callModelAuto(llm, prompt, model, timeoutMs);
  const failure = finishFailure(first.finish, first.text);
  if (failure) {
    if (first.retry) failure.details.retriedWith = first.retry;
    return { ok: false, ...failure };
  }
  const parsed = parseModelOutput(first.text);
  if (parsed.ok) {
    return first.retry ? Object.assign({}, parsed, { retried: first.retry }) : parsed;
  }
  if (first.finish && first.finish.kind === 'max-tokens') {
    return {
      ok: false,
      code: ERROR_CODES.BAD_MODEL_OUTPUT,
      message: 'the model output was truncated before the JSON was complete',
      excerpt: parsed.excerpt,
    };
  }
  const repairPrompt = {
    system: prompt.system,
    messages: prompt.messages.concat([assistantRepairMessage(first.text, model)], buildRepairMessages()),
  };
  let second;
  try {
    second = await callModelAuto(llm, repairPrompt, model, timeoutMs);
  } catch (error) {
    return {
      ok: false,
      code: ERROR_CODES.BAD_MODEL_OUTPUT,
      message: parsed.message || 'the model did not return the expected JSON',
      excerpt: parsed.excerpt,
      details: { repairFailed: true, repairError: describeRepairError(error) },
    };
  }
  const secondFailure = finishFailure(second.finish, second.text);
  if (secondFailure) {
    const providerMessage = (secondFailure.details && secondFailure.details.providerMessage) || '';
    if (/Cannot read properties of undefined|is not a function|is not iterable/i.test(providerMessage)) {
      return {
        ok: false,
        code: ERROR_CODES.BAD_MODEL_OUTPUT,
        message: parsed.message || 'the model did not return the expected JSON',
        excerpt: parsed.excerpt,
        details: { repairFailed: true, repairError: providerMessage.slice(0, 300) },
      };
    }
    if (second.retry) secondFailure.details.retriedWith = second.retry;
    return { ok: false, ...secondFailure };
  }
  const repaired = parseModelOutput(second.text);
  return second.retry && repaired.ok ? Object.assign({}, repaired, { retried: second.retry }) : repaired;
}

/**
 * Build the RPC request handler.
 * @param {{ getLlm: () => any, resolveModelFn: (model: any, sessionId: string) => any, weixin?: any, timeoutMs?: number, version?: string }} deps
 * @returns {(req: any, res: any) => Promise<void>}
 */
function createHandler(deps) {
  const timeoutMs = deps.timeoutMs || REQUEST_TIMEOUT_MS;
  const version = deps.version || VERSION;

  return async function handler(req, res) {
    try {
      if (!req || req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: makeError(ERROR_CODES.METHOD_NOT_ALLOWED, 'use POST') });
        return;
      }
      const contentType = String((req.headers && req.headers['content-type']) || '');
      if (contentType.indexOf('application/json') === -1) {
        sendJson(res, 400, {
          ok: false,
          error: makeError(ERROR_CODES.BAD_REQUEST, 'content-type must be application/json'),
        });
        return;
      }
      if (!isTrustedRequest(req)) {
        sendJson(res, 403, { ok: false, error: makeError(ERROR_CODES.FORBIDDEN, 'cross-origin request refused') });
        return;
      }

      let body;
      try {
        body = JSON.parse(await readBody(req, LIMITS.MAX_BODY_BYTES));
      } catch (error) {
        if (error && error.code === ERROR_CODES.PAYLOAD_TOO_LARGE) {
          sendJson(res, 413, { ok: false, error: makeError(ERROR_CODES.PAYLOAD_TOO_LARGE, error.message) });
          return;
        }
        sendJson(res, 400, { ok: false, error: makeError(ERROR_CODES.BAD_REQUEST, 'request body is not valid JSON') });
        return;
      }

      const method = body && typeof body === 'object' ? body.method : undefined;
      if (method === METHODS.PING) {
        sendJson(res, 200, { ok: true, result: { plugin: PLUGIN_ID, version } });
        return;
      }
      if (
        method === METHODS.WEIXIN_STATUS ||
        method === METHODS.WEIXIN_LOGIN ||
        method === METHODS.WEIXIN_VERIFY ||
        method === METHODS.WEIXIN_LOGOUT ||
        method === METHODS.WEIXIN_PENDING ||
        method === METHODS.WEIXIN_CLEAR
      ) {
        const weixin = deps.weixin;
        if (!weixin) {
          sendJson(res, 500, {
            ok: false,
            error: makeError(ERROR_CODES.INTERNAL, 'the weixin bridge is unavailable'),
          });
          return;
        }
        try {
          if (method === METHODS.WEIXIN_STATUS) {
            sendJson(res, 200, { ok: true, result: weixin.status() });
            return;
          }
          if (method === METHODS.WEIXIN_LOGIN) {
            sendJson(res, 200, { ok: true, result: await weixin.startLogin() });
            return;
          }
          if (method === METHODS.WEIXIN_VERIFY) {
            const code = isPlainObject(body) ? body.code : undefined;
            sendJson(res, 200, { ok: true, result: weixin.submitVerifyCode(code) });
            return;
          }
          if (method === METHODS.WEIXIN_LOGOUT) {
            sendJson(res, 200, { ok: true, result: weixin.logout() });
            return;
          }
          if (method === METHODS.WEIXIN_CLEAR) {
            sendJson(res, 200, { ok: true, result: { cleared: weixin.clearPending() } });
            return;
          }
          const consume = isPlainObject(body) ? body.consume !== false : true;
          const messages = consume ? weixin.takePending() : weixin.peekPending();
          sendJson(res, 200, { ok: true, result: { messages } });
        } catch (error) {
          sendJson(res, 500, {
            ok: false,
            error: makeError(ERROR_CODES.INTERNAL, error && error.message ? String(error.message) : 'weixin bridge error'),
          });
        }
        return;
      }

      if (method === METHODS.PROBE) {
        const probeCheck = validateProbe(body);
        if (!probeCheck.ok) {
          sendJson(res, statusFor(probeCheck.error), { ok: false, error: probeCheck.error });
          return;
        }
        const probe = probeCheck.value;
        const startedProbe = Date.now();
        const resolved = deps.resolveModelFn(probe.model, probe.sessionId);
        if (!resolved) {
          sendJson(res, 400, {
            ok: false,
            error: makeError(ERROR_CODES.MODEL_UNRESOLVED, 'no provider/model could be resolved for this session', {
              hint: 'pick a model in the composer or pin provider/model in the plugin settings',
            }),
          });
          return;
        }
        let probeLlm;
        try {
          probeLlm = deps.getLlm();
        } catch (error) {
          sendJson(res, 500, {
            ok: false,
            error: makeError(ERROR_CODES.INTERNAL, error && error.message ? error.message : 'llm unavailable'),
          });
          return;
        }
        const probeMeta = {
          provider: resolved.provider,
          model: resolved.model,
          source: resolved.source,
          effort: resolved.reasoningEffort || '',
        };
        try {
          const attempt = await callModelAuto(probeLlm, buildProbePrompt(), resolved, Math.min(timeoutMs, 60000));
          probeMeta.elapsedMs = Date.now() - startedProbe;
          probeMeta.effort = attempt.effort || '';
          const failure = finishFailure(attempt.finish, attempt.text);
          if (failure) {
            if (attempt.retry) failure.details.retriedWith = attempt.retry;
            sendJson(res, statusFor(failure), { ok: false, error: failure, meta: probeMeta });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            result: {
              provider: resolved.provider,
              model: resolved.model,
              effort: attempt.effort || '',
              elapsedMs: probeMeta.elapsedMs,
              reply: String(attempt.text || '').trim().slice(0, 120),
            },
            meta: probeMeta,
          });
        } catch (error) {
          const code = error && typeof error.code === 'string' ? error.code : ERROR_CODES.INTERNAL;
          sendJson(res, statusFor({ code }), {
            ok: false,
            error: makeError(code, error && error.message ? String(error.message) : 'probe failed'),
            meta: probeMeta,
          });
        }
        return;
      }

      const started = Date.now();
      const validated =
        method === METHODS.ENHANCE
          ? validateEnhance(body)
          : method === METHODS.REFINE
            ? validateRefine(body)
            : null;

      if (!validated) {
        sendJson(res, 404, { ok: false, error: makeError(ERROR_CODES.NOT_FOUND, 'unknown method') });
        return;
      }
      if (!validated.ok) {
        sendJson(res, statusFor(validated.error), { ok: false, error: validated.error });
        return;
      }

      const request = validated.value;
      const model = deps.resolveModelFn(request.model, request.sessionId);
      if (!model) {
        sendJson(res, 400, {
          ok: false,
          error: makeError(ERROR_CODES.MODEL_UNRESOLVED, 'no provider/model could be resolved for this session', {
            hint: 'pick a model in the composer or set provider/model in the plugin settings',
          }),
        });
        return;
      }

      let llm;
      try {
        llm = deps.getLlm();
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: makeError(ERROR_CODES.INTERNAL, error && error.message ? error.message : 'llm unavailable'),
        });
        return;
      }

      const prompt =
        method === METHODS.REFINE
          ? buildRefinePrompt({
              mode: request.mode,
              scenario: request.scenario,
              draft: request.draft,
              previous: request.previous,
              instruction: request.instruction,
              locale: request.locale,
            })
          : buildEnhancePrompt({
              mode: request.mode,
              scenario: request.scenario,
              draft: request.draft,
              hints: request.hints,
              locale: request.locale,
            });

      const outcome = await generateResult(llm, prompt, model, timeoutMs);
      const meta = {
        provider: model.provider,
        model: model.model,
        source: model.source,
        elapsedMs: Date.now() - started,
        mode: request.mode,
        effort: model.reasoningEffort || '',
      };
      if (outcome.retried) meta.retriedWith = outcome.retried;

      if (!outcome.ok) {
        const details = Object.assign({}, outcome.details || {}, outcome.excerpt ? { excerpt: outcome.excerpt } : {});
        sendJson(res, statusFor(outcome), {
          ok: false,
          error: makeError(outcome.code, outcome.message, Object.keys(details).length > 0 ? details : undefined),
          meta,
        });
        return;
      }
      sendJson(res, 200, { ok: true, result: outcome.result, meta });
    } catch (error) {
      const code = error && typeof error.code === 'string' ? error.code : ERROR_CODES.INTERNAL;
      sendJson(res, statusFor({ code }), {
        ok: false,
        error: makeError(code, error && error.message ? String(error.message) : 'internal error'),
      });
    }
  };
}

/**
 * Register the plugin's route on the DSH web server.
 * @param {any} ctx cordis context (webServer and llm already injected)
 * @returns {() => void} disposer
 */
function registerRpc(ctx, options) {
  if (!ctx || !ctx.webServer || typeof ctx.webServer.register !== 'function') {
    throw new Error('dsh-prompt-craft: the web server service is unavailable');
  }
  const handler = createHandler({
    getLlm: () => {
      const llm = ctx.get('llm');
      if (!llm || typeof llm.stream !== 'function') throw new Error('the llm service is unavailable');
      return llm;
    },
    resolveModelFn: (model, sessionId) => resolveModel(ctx, model, sessionId),
    weixin: options && options.weixin,
  });
  return ctx.webServer.register({ kind: 'exact', path: RPC_PATH, handler });
}

module.exports = {
  createHandler,
  registerRpc,
  readBody,
  readStream,
  isTrustedRequest,
  sendJson,
  statusFor,
  generateResult,
  planRetry,
  callModelAuto,
};
