'use strict';

/**
 * Prompt templates for the enhancement call.
 *
 * Wording is original to this plugin; it only borrows the *approach* of
 * published prompt-optimizer tools (rewrite the prompt instead of executing it,
 * preserve variables, ask when essential context is missing).
 */

const { LIMITS } = require('../protocol.cjs');

/** Base discipline applied to every call. */
const BASE_RULES = [
  'You are a prompt editor working inside a chat composer. The user wrote a draft prompt; your job is to rewrite that draft so it works better as a prompt.',
  'Never answer, execute, or fulfill the draft as if you were the assistant handling it. The deliverable is the rewritten prompt text.',
  'Preserve the user\'s language, intent, tone of address, and every literal token in the draft: placeholders and variables ({{name}}, {name}, {$x}, %s, <tag>), file paths, URLs, code blocks, quoted strings, numbers and identifiers. Do not translate, rename, or drop them.',
  'Do not invent domain facts. When a detail is unknown but harmless, leave a clearly marked placeholder in angle brackets such as <language/version>. When an unknown detail would change the whole rewrite, use the questions shape below instead of guessing.',
  'Keep the rewrite minimal and coherent. No preamble such as "here is an improved prompt", no explanations inside the prompt, no length padding, no duplicated sections.',
  'The prompt field must be directly usable as a prompt: plain text, no surrounding quotation marks, and no markdown code fence unless the draft itself contained a code fence.',
  'Return exactly one JSON object. No markdown fences, no prose before or after it.',
].join('\n');

/** Mode-specific editing instructions. */
const MODE_RULES = {
  light: [
    'Mode: LIGHT EDIT.',
    'Keep the original structure and roughly the original length. Fix vague verbs, ambiguity, and missing specifics that the draft already implies.',
    'Do not add new sections or turn it into a template. Prefer the smallest change that makes the request unambiguous.',
  ].join('\n'),
  standard: [
    'Mode: STANDARD EDIT.',
    'Restructure the draft into a clear, self-contained prompt. Make implicit requirements explicit (goal, context, constraints, output format) when the task clearly needs them.',
    'Keep it proportionate: three to six short sections or one tight paragraph plus a short list is usually enough.',
  ].join('\n'),
  expert: [
    'Mode: EXPERT EDIT.',
    'Produce a fully structured prompt that a strong model can follow without further questions: role or perspective (only when it helps), context, task, constraints, output format, and a short self-check.',
    'Be dense rather than long. Every line must change what a model would do; delete filler. Do not exceed roughly 400 words.',
  ].join('\n'),
};

/** Scenario-specific instructions, added only when a scenario applies. */
const SCENARIO_RULES = {
  code: 'Scenario (code): pin down language, framework, version assumptions, input and output shape, error handling, and acceptance criteria. Ask for the smallest working solution when appropriate.',
  writing: 'Scenario (writing): pin down audience, purpose, tone, length, format, and any must-include or must-avoid points.',
  research: 'Scenario (research): pin down scope, time range, source expectations, deliverable structure, and how uncertainty should be reported.',
  agent: 'Scenario (agent): pin down the goal, operating constraints, available tools or inputs, success criteria, and when to stop and report back.',
  general: '',
};

/** Response schema description shared by both shapes. */
const OUTPUT_SCHEMA = [
  'Respond with exactly one JSON object in one of these two shapes:',
  '{"kind":"enhanced","prompt":"<the rewritten prompt>","scenario":"code|writing|research|agent|general","summary":"<one sentence in the user\'s language>","notes":["<short change note>","..."]}',
  '{"kind":"questions","questions":["<question 1>","<question 2>"],"summary":"<one sentence in the user\'s language>"}',
  'Notes: at most 4, each under 120 characters. Questions: at most 2, each under 200 characters, specific and answerable in one line.',
  'Use the questions shape only when the draft is missing information that would materially change the rewrite. Otherwise use the enhanced shape, even if the draft is already decent.',
].join('\n');

/**
 * @param {string} locale
 * @returns {string}
 */
function languageRule(locale) {
  return locale === 'en'
    ? 'Write summary, notes and questions in English.'
    : '用中文写 summary、notes 和 questions（prompt 字段保持草稿本身的语言）。';
}

/**
 * @param {{ mode: string, scenario: string, locale: string }} input
 * @returns {string}
 */
function buildSystem(input) {
  const blocks = [BASE_RULES];
  blocks.push(MODE_RULES[input.mode] || MODE_RULES.standard);
  const scenarioRule = SCENARIO_RULES[input.scenario];
  if (scenarioRule) blocks.push(scenarioRule);
  blocks.push(languageRule(input.locale));
  blocks.push(OUTPUT_SCHEMA);
  return blocks.join('\n\n');
}

/**
 * @param {string} draft
 * @param {string} [locale]
 * @returns {string}
 */
function buildEnhanceUserText(draft, locale, hints) {
  const parts = [
    'Rewrite the following draft prompt.',
    'Keep its language and all literals. Improve clarity, specificity, and structure only as much as the mode allows.',
    '',
    '<<<DRAFT',
    draft,
    'DRAFT>>>',
  ];
  if (hints) {
    parts.push(
      '',
      'The user answered your earlier clarifying questions. Use these answers to fill in the missing facts:',
      '<<<ANSWERS',
      hints,
      'ANSWERS>>>',
      '',
      'Do not ask these questions again; return the enhanced prompt.',
    );
  }
  return parts.join('\n');
}

/**
 * @param {{ mode: string, scenario: string, draft: string, locale?: string, hints?: string }} input
 * @returns {{ system: string, messages: Array<{role: 'user', content: Array<{type: 'text', text: string}>}> }}
 */
function buildEnhancePrompt(input) {
  const messages = [
    {
      role: 'user',
      content: [{ type: 'text', text: buildEnhanceUserText(input.draft, input.locale, input.hints) }],
    },
  ];
  return { system: buildSystem({ mode: input.mode, scenario: input.scenario, locale: input.locale || 'zh' }), messages };
}

/**
 * Prompt for "continue refining" / "user answered the questions".
 * @param {{ mode: string, scenario: string, draft: string, previous: string, instruction: string, locale?: string }} input
 * @returns {{ system: string, messages: Array<{role: 'user', content: Array<{type: 'text', text: string}>}> }}
 */
function buildRefinePrompt(input) {
  const system = [
    buildSystem({ mode: input.mode, scenario: input.scenario, locale: input.locale || 'zh' }),
    'This is a REFINE round: the user has already seen one rewrite (or answered clarifying questions). Apply their instruction to the original draft and return a complete new prompt, not a diff and not a comment.',
    'Do not ask the same questions again unless the new instruction is genuinely insufficient.',
  ].join('\n\n');
  const parts = ['Original draft prompt:', '<<<DRAFT', input.draft, 'DRAFT>>>'];
  if (input.previous) {
    parts.push(
      '',
      'Previous rewrite (for reference, do not copy blindly):',
      '<<<PREVIOUS',
      input.previous,
      'PREVIOUS>>>',
    );
  }
  parts.push(
    '',
    'User instruction for this round:',
    '<<<INSTRUCTION',
    input.instruction,
    'INSTRUCTION>>>',
    '',
    'Return the refined prompt using the same JSON protocol as before.',
  );
  const userText = parts.join('\n');
  return {
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  };
}

/**
 * Follow-up message appended when the first answer was not valid JSON.
 * @returns {Array<{role: 'user', content: Array<{type: 'text', text: string}>}>}
 */
function buildRepairMessages() {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Your previous output was not a valid JSON object. Reply again with ONLY the JSON object described in the system prompt. No prose, no markdown fences, no trailing text.',
        },
      ],
    },
  ];
}

/**
 * Clamp model-reported notes.
 * @param {unknown} notes
 * @returns {string[]}
 */
function clampNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter((note) => typeof note === 'string' && note.trim())
    .slice(0, 4)
    .map((note) => note.trim().slice(0, 160));
}

/**
 * Clamp model-reported questions.
 * @param {unknown} questions
 * @returns {string[]}
 */
function clampQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions
    .filter((question) => typeof question === 'string' && question.trim())
    .slice(0, LIMITS.MAX_QUESTIONS)
    .map((question) => question.trim().slice(0, 300));
}

module.exports = {
  buildSystem,
  buildEnhancePrompt,
  buildRefinePrompt,
  buildRepairMessages,
  clampNotes,
  clampQuestions,
  LANGUAGE_RULE_ZH: languageRule('zh'),
  OUTPUT_SCHEMA,
};
