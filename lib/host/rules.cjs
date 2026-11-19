'use strict';

/**
 * Prompt-writing rules, derived from published first-party guidance and shown
 * to the model on every enhancement call.
 *
 * `protocol.cjs` owns the public list (id + titles + source links) because the
 * client renders it too; this module owns the instructions that tell the
 * editor model how to apply each rule when rewriting a draft prompt.
 */

const { RULES, RULE_IDS } = require('../protocol.cjs');

/** One actionable instruction per rule, written for the editor model. */
const GUIDANCE = {
  R1: 'Open the rewritten prompt with the result to produce and who consumes it. Keep ordered steps only where order actually matters.',
  R2: 'Replace vague references such as "this", "the page" or "that component" with the file, component, route, function or command involved.',
  R3: 'Include only facts the repository cannot reveal: decisions, constraints, versions, required commands, and things that must keep working. Drop anything a capable agent can read from the code.',
  R4: 'Turn "done" into observable criteria: tests to pass, commands to run, thresholds to hit, or an explicit acceptance checklist.',
  R5: 'Ask for the check to run (tests, build, lint, typecheck) and for its evidence — command plus result — instead of a claim that it works.',
  R6: 'Tell the agent to reuse the existing components, design tokens and conventions; forbid hard-coded colors or new primitives unless the draft requires them.',
  R7: 'Match process to size: a short plan for multi-file work, no ceremony for a small fix.',
  R8: 'State how the answer should arrive: diff, files touched, summary length, language, and audience. Leave nothing about the output shape implicit.',
  R9: 'Phrase requirements as imperatives and put the non-negotiables first. Do not write "remember to" reminders.',
  R10: 'Do not add IMPORTANT markers, all-caps pep talks, or "think step by step" instructions; reasoning depth is configured outside the prompt.',
  R11: 'Group the prompt with short labeled sections (context, task, constraints, output) and at most two representative examples — never a catalogue of edge cases.',
  R12: 'Ask for missing information only when the gap would change the design; otherwise state the assumption in one line and continue.',
  R13: 'Never invent file names, APIs, versions, owners or requirements. Leave a <placeholder> or ask instead.',
  R14: 'For multi-part work, split it into ordered steps that can each be verified before the next one starts.',
};

/**
 * System-prompt block that makes the rules binding and citable.
 * @param {string} [scenario]
 * @returns {string}
 */
function rulesBlock(scenario) {
  const lines = [
    'You rewrite draft prompts for a coding agent. Apply these published rules; the rationale field must cite the ids of the rules you actually used.',
    '',
  ];
  for (const rule of RULES) {
    lines.push(rule.id + ' ' + rule.en + ' — ' + GUIDANCE[rule.id]);
  }
  if (scenario === 'code') {
    lines.push(
      '',
      'This draft is about code: prefer concrete file/component/route names, acceptance checks the agent can run, and the project conventions the agent must keep.',
    );
  }
  return lines.join('\n');
}

/**
 * Normalize model-reported rationale: keep only citations of real rules,
 * bound their count and length.
 * @param {unknown} rationale
 * @returns {Array<{ change: string, rules: string[] }>}
 */
function clampRationale(rationale) {
  if (!Array.isArray(rationale)) return [];
  const out = [];
  for (const item of rationale) {
    if (!item || typeof item !== 'object') continue;
    const change = typeof item.change === 'string' ? item.change.trim().slice(0, 160) : '';
    if (!change) continue;
    const cited = Array.isArray(item.rules) ? item.rules : [];
    const rules = cited
      .filter((id) => typeof id === 'string' && RULE_IDS.indexOf(id.trim().toUpperCase()) !== -1)
      .map((id) => id.trim().toUpperCase())
      .slice(0, 3);
    if (rules.length === 0) continue;
    out.push({ change, rules });
    if (out.length >= 6) break;
  }
  return out;
}

module.exports = {
  rulesBlock,
  clampRationale,
  GUIDANCE,
  RULE_IDS,
};
