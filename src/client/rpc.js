'use strict';

/**
 * Browser side of the plugin RPC: POST JSON to the host route registered by
 * `src/host/rpc.cjs`, with a hard client-side timeout so a stalled stream never
 * pins the composer forever.
 */

const { RPC_PATH, ERROR_CODES } = require('../protocol.cjs');

const DEFAULT_TIMEOUT_MS = 150000;

/** Error carrying a stable wire code, details and host meta. */
class RpcError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [details]
   * @param {unknown} [meta]
   */
  constructor(code, message, details, meta) {
    super(message);
    this.name = 'PromptCraftRpcError';
    this.code = code;
    this.details = details;
    this.meta = meta;
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Call one host method.
 * @param {string} method
 * @param {Record<string, unknown>} params
 * @param {{timeoutMs?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<{result: any, meta: any}>}
 */
async function callHost(method, params, options) {
  const settings = options || {};
  const timeoutMs = typeof settings.timeoutMs === 'number' && settings.timeoutMs > 0 ? settings.timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const externalSignal = settings.signal;
  let abortedByExternal = false;

  /**
   * @returns {void}
   */
  function abort() {
    abortedByExternal = true;
    if (controller) {
      try {
        controller.abort();
      } catch (error) {
        /* ignore */
      }
    }
  }

  if (externalSignal) {
    if (externalSignal.aborted) abort();
    else if (typeof externalSignal.addEventListener === 'function') externalSignal.addEventListener('abort', abort, { once: true });
  }

  let timer = null;
  if (controller) {
    timer = setTimeout(function onTimeout() {
      try {
        controller.abort();
      } catch (error) {
        /* ignore */
      }
    }, timeoutMs);
  }

  const payload = Object.assign({ method }, isPlainObject(params) ? params : {});
  let response;
  try {
    response = await fetch(RPC_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    if (abortedByExternal) throw new RpcError('ABORTED', 'request was cancelled');
    if (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')) {
      throw new RpcError(ERROR_CODES.TIMEOUT, 'the request timed out', { timeoutMs: timeoutMs });
    }
    throw new RpcError(ERROR_CODES.NETWORK, 'cannot reach the plugin host', {
      reason: error && error.message ? String(error.message) : 'network error',
    });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }

  let text = '';
  try {
    text = await response.text();
  } catch (error) {
    throw new RpcError(ERROR_CODES.INTERNAL, 'failed to read the plugin response');
  }

  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new RpcError(ERROR_CODES.INTERNAL, 'the plugin returned malformed JSON', {
        status: response.status,
        excerpt: text.slice(0, 300),
      });
    }
  }

  if (!response.ok || !isPlainObject(body) || body.ok !== true) {
    const failure = body && isPlainObject(body.error) ? body.error : null;
    throw new RpcError(
      failure && typeof failure.code === 'string' ? failure.code : ERROR_CODES.INTERNAL,
      failure && typeof failure.message === 'string' ? failure.message : 'HTTP ' + response.status,
      failure ? failure.details : { status: response.status },
      body ? body.meta : undefined,
    );
  }

  return { result: body.result, meta: body.meta };
}

module.exports = { callHost, RpcError, DEFAULT_TIMEOUT_MS };
