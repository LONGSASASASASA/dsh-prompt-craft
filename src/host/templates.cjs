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
  'You are a prompt editor working inside a chat composer. The user wrote a draft prompt; your job is to rewrite that draft so it serves the goal behind it, not just the wording on its surface.',
  'Never answer, execute, or fulfill the draft as if you were the assistant handling it. The deliverable is the rewritten prompt text.',
  'Start from the goal. Read the draft as a request for an outcome: what does the user want the model to produce, and what should that outcome change for the user? State the outcome in one sentence in the goal field before you write the prompt.',
  'Raise the draft to that goal. The rewritten prompt must serve the underlying objective: keep the user\'s own framing where it is already right, and correct phrasing that would make a model produce something less useful than what the user actually needs.',
  'Broaden where it changes the answer: who the result is for, the context it enters, adjacent constraints, what must keep working, real risks, and alternatives worth considering. Skip generic background that would not change a capable model\'s answer.',
  'Deepen where it changes the answer: make hidden assumptions explicit, define what "done well" means, say how the result will be judged or verified, and name the trade-off that matters most. State success criteria the user implied but did not spell out.',
  'Stay faithful. Elevation has to come from the user\'s own intent and domain, never from invented facts, extra requirements they did not imply, or scope they cannot afford. When a fact is needed but unknown, leave a clearly marked placeholder in angle brackets such as <language/version>, or use the questions shape when the gap would change the whole rewrite.',
  'Preserve the user\'s language, intent, tone of address, and every literal token in the draft: placeholders and variables ({{name}}, {name}, {$x}, %s, <tag>), file paths, URLs, code blocks, quoted strings, numbers and identifiers. Do not translate, rename, or drop them.',
  'Raise the aim, not the word count. No preamble such as "here is an improved prompt", no explanations inside the prompt, no duplicated sections, and no corporate phrasing that would not make the request more useful.',
  'The prompt field must be directly usable as a prompt: plain text, no surrounding quotation marks, and no markdown code fence unless the draft itself contained a code fence.',
  'Return exactly one JSON object. No markdown fences, no prose before or after it.',
].join('\n');

/** Mode-specific editing instructions. */
const MODE_RULES = {
  light: [
    'Mode: LIGHT EDIT — aim first, smallest change.',
    'Fix vague verbs, ambiguity, and missing specifics the draft already implies. If the draft never says what the outcome is for, add one short goal line at the top.',
    'Keep the original structure and roughly the original length; no new sections, no template, no role preamble.',
  ].join('\n'),
  standard: [
    'Mode: STANDARD EDIT — goal-first rewrite.',
    'Open the prompt with the outcome the user wants and who it serves, then make the request self-contained: task, relevant context and inputs, constraints and boundaries, required output shape, and what counts as a good result.',
    'Make implicit requirements explicit only where the task clearly needs them. Keep it proportionate: three to six short sections, or one tight paragraph plus a short list.',
    'Prefer sharper judgement over more text: delete anything that would not change what a strong model does.',
  ].join('\n'),
  expert: [
    'Mode: EXPERT EDIT — elevated brief.',
    'Produce a prompt a strong model can execute without further questions, aimed at the user\'s real objective: the outcome and why it matters, context and boundaries, what to deliver including structure, the success criteria the result will be judged by, the main trade-off to respect, and a brief self-check before answering.',
    'Include a role or perspective only when it sharpens the answer. State assumptions explicitly instead of hiding them.',
    'Be dense rather than long. Every line must change what a model would do; delete filler. Do not exceed roughly 450 words.',
  ].join('\n'),
};

/** Scenario-specific instructions, added only when a scenario applies. */
const SCENARIO_RULES = {
  code: 'Scenario (code): aim at the real problem the code should solve, not just the snippet asked for: language, framework and version assumptions, input and output shape, error handling, what must keep working, and the acceptance criteria or tests that would prove it works.',
  writing: 'Scenario (writing): aim at what the reader should think, decide, or do after reading: audience, purpose, tone, length, format, must-include and must-avoid points, and the one idea the piece must land.',
  research: 'Scenario (research): aim at the decision or question the research should inform: scope, time range, source expectations, deliverable structure, how uncertainty should be reported, and what evidence would change the conclusion.',
  agent: 'Scenario (agent): aim at the mission the agent must accomplish: goal, operating constraints, available tools or inputs, what "done" looks like, how to check progress, when to stop and report back, and what it must never do.',
  general: '',
};

/** Response schema description shared by both shapes. */
const OUTPUT_SCHEMA = [
  'Respond with exactly one JSON object in one of these two shapes:',
  '{"kind":"enhanced","goal":"<one sentence: the outcome this prompt is meant to produce, in the user\'s language>","prompt":"<the rewritten prompt>","scenario":"code|writing|research|agent|general","summary":"<one sentence in the user\'s language: how the rewrite serves that goal>","elevation":["<from X to Y: how the aim was raised>","..."],"notes":["<short change note>","..."]}',
  '{"kind":"questions","questions":["<question 1>","<question 2>"],"summary":"<one sentence in the user\'s language>"}',
  'Notes: at most 4, each under 120 characters. Elevation: at most 3, each under 160 characters. Questions: at most 2, each under 200 characters, specific and answerable in one line.',
  'Use the questions shape only when the draft is missing information that would materially change the rewrite. Otherwise use the enhanced shape, even if the draft is already decent.',
].join('\n');

/**
 * @param {string} locale
 * @returns {string}
 */
function languageRule(locale) {
  return locale === 'en'
    ? 'Write goal, summary, elevation, notes and questions in English. The prompt field keeps the draft\'s own language.'
    : '用中文写 goal、summary、elevation、notes 和 questions（prompt 字段保持草稿本身的语言）。';
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
    'Rewrite the following draft prompt so that it serves the goal behind it.',
    'Keep its language and all literals. If the draft does not state its goal, infer it from what the user is asking for and put it in the goal field; do not invent facts to fill gaps.',
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
    'The refined prompt must keep serving the same goal; update goal, summary and elevation when the instruction changes the aim.',
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
 * Clamp the model-reported elevation notes (how the aim was raised).
 * @param {unknown} elevation
 * @returns {string[]}
 */
function clampElevation(elevation) {
  if (!Array.isArray(elevation)) return [];
  return elevation
    .filter((item) => typeof item === 'string' && item.trim())
    .slice(0, 3)
    .map((item) => item.trim().slice(0, 200));
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
  clampElevation,
  clampQuestions,
  LANGUAGE_RULE_ZH: languageRule('zh'),
  OUTPUT_SCHEMA,
};
