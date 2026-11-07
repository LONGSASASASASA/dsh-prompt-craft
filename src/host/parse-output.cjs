'use strict';

/**
 * Parse and validate the model's JSON answer for one enhancement call.
 *
 * Models sometimes wrap JSON in markdown fences or prepend a sentence, so the
 * parser is deliberately forgiving about packaging and strict about content.
 * A parse failure is surfaced as a structured error, never as an empty result.
 */

const { LIMITS } = require('../protocol.cjs');
const { clampNotes, clampQuestions } = require('./templates.cjs');

/**
 * Remove one markdown code fence that wraps the whole text.
 * @param {string} text
 * @returns {string}
 */
function stripOuterFence(text) {
  const trimmed = text.trim();
  const match = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

/**
 * Find the first balanced JSON object in a string, ignoring braces inside
 * strings, and parse it.
 * @param {string} text
 * @returns {Record<string, unknown> | null}
 */
function extractJsonObject(text) {
  const source = typeof text === 'string' ? text : '';
  const start = source.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = source.slice(start, index + 1);
        try {
          const parsed = JSON.parse(candidate);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (error) {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Strip one fence that wraps the whole prompt value (models add these despite instructions).
 * @param {string} prompt
 * @returns {string}
 */
function stripPromptFence(prompt) {
  const trimmed = prompt.trim();
  if (!/^```/.test(trimmed)) return prompt.trim();
  const match = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

/**
 * Normalize a parsed model answer into the plugin's result shape.
 * @param {unknown} value
 * @returns {{ kind: 'enhanced', prompt: string, summary: string, notes: string[], scenario: string } | { kind: 'questions', questions: string[], summary: string } | null}
 */
function normalizeResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  const kind = typeof record.kind === 'string' ? record.kind.trim().toLowerCase() : '';
  const summary = typeof record.summary === 'string' ? record.summary.trim().slice(0, 400) : '';

  if (kind === 'questions') {
    const questions = clampQuestions(record.questions);
    if (!questions.length) return null;
    return { kind: 'questions', questions, summary };
  }

  if (kind === 'enhanced' || kind === '' || typeof record.prompt === 'string') {
    const prompt = typeof record.prompt === 'string' ? stripPromptFence(record.prompt) : '';
    if (!prompt.trim()) return null;
    if (prompt.length > LIMITS.MAX_PROMPT_CHARS) return null;
    const scenario =
      typeof record.scenario === 'string' && record.scenario.trim() ? record.scenario.trim().slice(0, 24) : 'general';
    return { kind: 'enhanced', prompt, summary, notes: clampNotes(record.notes), scenario };
  }

  return null;
}

/**
 * @param {string} raw
 * @returns {{ ok: true, result: object } | { ok: false, code: string, message: string, excerpt: string }}
 */
function parseModelOutput(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const candidate = extractJsonObject(stripOuterFence(text));
  const result = candidate ? normalizeResult(candidate) : null;
  if (result) return { ok: true, result };
  const excerpt = text.trim().slice(0, 400);
  return {
    ok: false,
    code: 'BAD_MODEL_OUTPUT',
    message: 'the model did not return the expected JSON',
    excerpt,
  };
}

module.exports = {
  stripOuterFence,
  extractJsonObject,
  stripPromptFence,
  normalizeResult,
  parseModelOutput,
};
