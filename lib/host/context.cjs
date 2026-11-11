'use strict';

/**
 * Read a short, sanitized slice of the live conversation for the enhancement
 * call. The plugin asks the model to rewrite a draft prompt; knowing what the
 * user is currently working on makes the rewrite serve the real goal instead
 * of guessing from one sentence.
 *
 * This is deliberately best-effort: sessions may be missing, disposed, or
 * belong to another fiber, and a plugin must never fail an enhancement just
 * because the history could not be read.
 */

const { normalizeContext } = require('../protocol.cjs');

/**
 * Join the text blocks of one message. Images, tool calls and other blocks
 * are ignored: the rewrite only needs the words.
 * @param {unknown} content
 * @returns {string}
 */
function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n');
}

/**
 * The live session registry keys sessions by their full id (`session-<uuid>`),
 * while some client surfaces only expose the bare uuid. Accept either form.
 * @param {any} sessions
 * @param {string} sessionId
 * @returns {any} the live session, or undefined
 */
function resolveSession(sessions, sessionId) {
  const direct = typeof sessions.get === 'function' ? sessions.get(sessionId) : undefined;
  if (direct) return direct;
  const prefixed = 'session-' + sessionId;
  if (!sessionId.startsWith('session-')) {
    const byPrefix = typeof sessions.get === 'function' ? sessions.get(prefixed) : undefined;
    if (byPrefix) return byPrefix;
  }
  if (typeof sessions.list === 'function') {
    const live = sessions.list();
    for (let index = 0; index < live.length; index += 1) {
      const candidate = live[index];
      const id = candidate && (candidate.id || candidate.sessionId);
      if (typeof id === 'string' && (id === sessionId || id === prefixed || id.endsWith('-' + sessionId))) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * @param {any} ctx cordis context
 * @param {string} sessionId
 * @returns {Array<{ role: 'user'|'assistant', text: string }>}
 */
function readSessionContext(ctx, sessionId) {
  try {
    if (!ctx || typeof ctx.get !== 'function') return [];
    if (typeof sessionId !== 'string' || !sessionId) return [];
    const sessions = ctx.get('sessions');
    if (!sessions || typeof sessions.get !== 'function') return [];
    const session = resolveSession(sessions, sessionId);
    if (!session || typeof session.deriveMessages !== 'function') return [];
    const messages = session.deriveMessages();
    if (!Array.isArray(messages)) return [];
    const picked = [];
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
      const text = textFromContent(message.content);
      if (!text.trim()) continue;
      picked.push({ role: message.role, text: text });
    }
    return normalizeContext(picked);
  } catch (error) {
    return [];
  }
}

module.exports = { readSessionContext, resolveSession, textFromContent };
