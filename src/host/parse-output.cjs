'use strict';

/**
 * Parse and validate the model's JSON answer for one enhancement call.
 *
 * Models sometimes wrap JSON in markdown fences or prepend a sentence, so the
 * parser is deliberately forgiving about packaging and strict about content.
 * A parse failure is surfaced as a structured error, never as an empty result.
 */

const { LIMITS } = require('../protocol.cjs');
const { clampNotes, clampElevation, clampQuestions } = require('./templates.cjs');

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
 * Escape raw control characters that models sometimes put inside JSON strings
 * (a real newline inside the prompt field is the most common one) and drop
 * structural trailing commas, so the candidate can still be parsed.
 * @param {string} text
 * @returns {string}
 */
function repairJsonText(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        out += char;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        out += char;
        continue;
      }
      if (char === '"') {
        inString = false;
        out += char;
        continue;
      }
      if (char === '\n') {
        out += '\\n';
        continue;
      }
      if (char === '\r') {
        out += '\\r';
        continue;
      }
      if (char === '\t') {
        out += '\\t';
        continue;
      }
      if (char < ' ') {
        out += '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
        continue;
      }
      out += char;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '}' || char === ']') {
      out = out.replace(/[\s,]+$/, '');
    }
    out += char;
  }
  return out;
}

/**
 * @param {string} text
 * @returns {Record<string, unknown> | null}
 */
function tryParseObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

/**
 * Every balanced `{...}` candidate in source order.
 * @param {string} source
 * @returns {string[]}
 */
function balancedCandidates(source) {
  const out = [];
  for (let start = source.indexOf('{'); start !== -1; start = source.indexOf('{', start + 1)) {
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
          out.push(source.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Find the first balanced JSON object in a string, ignoring braces inside
 * strings. Every candidate is tried, not only the first one, and a candidate
 * that failed to parse is retried after mechanical repair (raw control
 * characters, trailing commas).
 * @param {string} text
 * @returns {Record<string, unknown> | null}
 */
function extractJsonObject(text) {
  const source = typeof text === 'string' ? text : '';
  const candidates = balancedCandidates(source);
  for (const candidate of candidates) {
    const direct = tryParseObject(candidate);
    if (direct) return direct;
    const repaired = tryParseObject(repairJsonText(candidate));
    if (repaired) return repaired;
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
 * @returns {{ kind: 'enhanced', prompt: string, goal: string, summary: string, notes: string[], elevation: string[], scenario: string } | { kind: 'questions', questions: string[], summary: string } | null}
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
    const goal = typeof record.goal === 'string' ? record.goal.trim().slice(0, 200) : '';
    return {
      kind: 'enhanced',
      prompt,
      goal,
      summary,
      notes: clampNotes(record.notes),
      elevation: clampElevation(record.elevation),
      scenario,
    };
  }

  return null;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function fencedBlocks(text) {
  const out = [];
  const pattern = /```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/g;
  let match = pattern.exec(text);
  while (match !== null) {
    out.push(match[1]);
    match = pattern.exec(text);
  }
  return out;
}

/**
 * @param {string} raw
 * @returns {{ ok: true, result: object } | { ok: false, code: string, message: string, excerpt: string }}
 */
function parseModelOutput(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const pieces = fencedBlocks(text);
  pieces.push(stripOuterFence(text));
  pieces.push(text);
  for (const piece of pieces) {
    const candidate = extractJsonObject(piece);
    const result = candidate ? normalizeResult(candidate) : null;
    if (result) return { ok: true, result };
  }
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
  repairJsonText,
  balancedCandidates,
  stripPromptFence,
  normalizeResult,
  parseModelOutput,
};
