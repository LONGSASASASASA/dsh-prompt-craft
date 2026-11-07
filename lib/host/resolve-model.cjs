'use strict';

/**
 * Resolve which provider/model an enhancement call should use.
 *
 * Priority:
 *  1. the explicit selection sent by the client (it reads the composer's
 *     authoritative per-session model directory),
 *  2. the live agent's current model (`ctx.agents.get(id).model.current()`),
 *  3. the session's last request header (`ctx.sessions.get(id).requestHeader()`),
 *  4. the deployment default (`ctx.agentDefaultModel.currentSelection()`).
 *
 * Every step is defensive: services may be absent in other compositions, and
 * accessors may throw while an agent is being created.
 */

const { LIMITS, readString } = require('../protocol.cjs');

const MAX_DEPTH = 4;

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {{ provider: string, model: string, reasoningEffort?: string } | null}
 */
function coerceSelection(value, depth) {
  const level = typeof depth === 'number' ? depth : 0;
  if (value === null || value === undefined || level > MAX_DEPTH) return null;

  if (typeof value === 'string') {
    const text = value.trim();
    const slash = text.indexOf('/');
    if (slash > 0 && slash < text.length - 1) {
      return { provider: text.slice(0, slash), model: text.slice(slash + 1) };
    }
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const record = /** @type {Record<string, any>} */ (value);

  const providerCandidates = ['provider', 'providerId', 'route'];
  const modelCandidates = ['model', 'modelId', 'name', 'id'];
  for (const providerKey of providerCandidates) {
    const provider = readString(record[providerKey], LIMITS.MAX_MODEL_CHARS).trim();
    if (!provider) continue;
    for (const modelKey of modelCandidates) {
      const model = readString(record[modelKey], LIMITS.MAX_MODEL_CHARS).trim();
      if (!model || model === provider) continue;
      const effort = readString(record.reasoningEffort || record.effort, 40).trim();
      return effort ? { provider, model, reasoningEffort: effort } : { provider, model };
    }
  }

  for (const key of ['selection', 'current', 'selected', 'config', 'model']) {
    const nested = coerceSelection(record[key], level + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * @param {() => unknown} read
 * @returns {unknown}
 */
function safeCall(read) {
  try {
    return read();
  } catch (error) {
    return undefined;
  }
}

/**
 * @param {any} ctx cordis context
 * @param {string} name
 * @returns {any}
 */
function safeService(ctx, name) {
  try {
    return ctx && typeof ctx.get === 'function' ? ctx.get(name) : undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * @param {any} ctx
 * @param {{ provider: string, model: string, reasoningEffort?: string } | null | undefined} requestModel
 * @param {string | undefined} sessionId
 * @returns {{ provider: string, model: string, reasoningEffort?: string, source: 'request' | 'agent' | 'session-header' | 'default' } | null}
 */
function resolveModel(ctx, requestModel, sessionId) {
  const explicit = coerceSelection(requestModel);
  if (explicit) return Object.assign(explicit, { source: 'request' });

  if (sessionId) {
    const agents = safeService(ctx, 'agents');
    if (agents && typeof agents.get === 'function') {
      const agent = safeCall(() => agents.get(sessionId));
      const model = agent && agent.model;
      const current =
        model && typeof model.current === 'function'
          ? safeCall(() => model.current())
          : typeof model === 'function'
            ? safeCall(model)
            : undefined;
      const fromAgent = coerceSelection(current);
      if (fromAgent) return Object.assign(fromAgent, { source: 'agent' });
    }

    const sessions = safeService(ctx, 'sessions');
    if (sessions && typeof sessions.get === 'function') {
      const session = safeCall(() => sessions.get(sessionId));
      const header =
        session && typeof session.requestHeader === 'function' ? safeCall(() => session.requestHeader()) : undefined;
      const fromHeader = coerceSelection(header && (header.config || header));
      if (fromHeader) return Object.assign(fromHeader, { source: 'session-header' });
    }
  }

  const defaults = safeService(ctx, 'agentDefaultModel');
  if (defaults && typeof defaults.currentSelection === 'function') {
    const fromDefault = coerceSelection(safeCall(() => defaults.currentSelection()));
    if (fromDefault) return Object.assign(fromDefault, { source: 'default' });
  }

  return null;
}

module.exports = { resolveModel, coerceSelection };
