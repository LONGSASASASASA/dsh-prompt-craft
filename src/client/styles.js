'use strict';

/**
 * All plugin styles live in one scoped stylesheet.
 *
 * Visual language: a quiet glass instrument panel that borrows the structure of
 * the DSH host UI instead of inventing a theme of its own —
 *
 *  - layers: recessed track (bg-layer-3) < surface < raised pill, same mental
 *    model as the official composer;
 *  - one accent (blue) used for the primary action, selection and the goal rail,
 *    never as a decorative fill;
 *  - a 1.5px gradient hairline around raised surfaces, drawn with a masked ring
 *    so it follows the radius exactly at every corner;
 *  - motion is short (150–220ms) and only explains a state change.
 *
 * Every colour resolves through a `--dsw-*` host token with a neutral fallback,
 * so light and dark themes are both first-class.
 */

const STYLE_ID = 'dsh-prompt-craft/styles';

const CSS = `
.dpc-panel,
.dpc-btn,
.dpc-settings,
.dpc-card,
.dpc-action,
.dpc-chip,
.dpc-model-option {
  --dpc-ease: cubic-bezier(.16, 1, .3, 1);
  --dpc-ease-settle: cubic-bezier(.34, 1.4, .4, 1);
  --dpc-r-lg: 20px;
  --dpc-r-md: 14px;
  --dpc-r-sm: 10px;
  --dpc-r-xs: 8px;
  --dpc-line: var(--dsw-alias-border-l2, rgba(127, 127, 127, .26));
  --dpc-line-strong: color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 18%, transparent);
  --dpc-surface: var(--dsw-specific-input-major, #ffffff);
  --dpc-surface-2: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, .07));
  --dpc-surface-3: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
  --dpc-fg: var(--dsw-alias-label-primary, #0f1115);
  --dpc-fg-2: var(--dsw-alias-label-secondary, #5b6169);
  --dpc-fg-3: color-mix(in srgb, var(--dpc-fg-2) 76%, transparent);
  --dpc-accent: var(--dsw-static-blue-450, #4f7cff);
  --dpc-accent-soft: color-mix(in srgb, var(--dpc-accent) 12%, transparent);
  --dpc-accent-line: color-mix(in srgb, var(--dpc-accent) 34%, transparent);
  --dpc-grad: linear-gradient(135deg, color-mix(in srgb, var(--dpc-accent) 62%, #ffffff) 0%, var(--dpc-accent) 52%, color-mix(in srgb, var(--dpc-accent) 58%, #8f6bff) 100%);
  --dpc-danger: var(--dsw-alias-state-error-primary, #d6424b);
  --dpc-danger-soft: color-mix(in srgb, var(--dpc-danger) 12%, transparent);
  --dpc-success: var(--dsw-alias-state-success-primary, #16875c);
  --dpc-success-soft: color-mix(in srgb, var(--dpc-success) 12%, transparent);
  --dpc-add: color-mix(in srgb, var(--dpc-success) 9%, transparent);
  --dpc-del: color-mix(in srgb, var(--dpc-danger) 9%, transparent);
  --dpc-mono: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  --dpc-shadow-1: 0 1px 2px rgba(16, 24, 40, .05), 0 10px 28px -18px rgba(16, 24, 40, .35);
  --dpc-shadow-2: 0 18px 48px -24px rgba(16, 24, 40, .45);
  --dpc-ring: 0 0 0 3px color-mix(in srgb, var(--dpc-accent) 24%, transparent);
}

.dpc-panel,
.dpc-settings { color: var(--dpc-fg); font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
.dpc-panel *,
.dpc-settings *,
.dpc-btn * { box-sizing: border-box; }
.dpc-panel :focus-visible,
.dpc-settings :focus-visible,
.dpc-btn:focus-visible,
.dpc-action:focus-visible,
.dpc-chip:focus-visible,
.dpc-model-option:focus-visible {
  outline: none;
  box-shadow: var(--dpc-ring);
}
.dpc-panel ::selection { background: var(--dpc-accent-soft); }
.dpc-ic { display: inline-flex; flex: 0 0 auto; align-items: center; }

/* ---------- composer trigger ---------- */
.dpc-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--dpc-r-xs);
  background: transparent;
  color: var(--dpc-fg-2);
  cursor: pointer;
  transition: background 150ms var(--dpc-ease), color 150ms var(--dpc-ease), transform 150ms var(--dpc-ease);
}
.dpc-btn:hover { background: var(--dpc-surface-3); color: var(--dpc-fg); }
.dpc-btn:active { transform: scale(.94); }
.dpc-btn[data-filled='true'] {
  background: color-mix(in srgb, var(--dpc-fg) 9%, transparent);
  color: var(--dpc-fg);
}
.dpc-btn[data-filled='true']:hover {
  background: color-mix(in srgb, var(--dpc-fg) 15%, transparent);
}
.dpc-btn[data-active='true'] {
  background: var(--dpc-accent-soft);
  color: var(--dpc-accent);
}
.dpc-btn:disabled { opacity: .42; cursor: default; background: transparent; }
.dpc-btn[data-busy='true'] { color: var(--dpc-accent); }

.dpc-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, currentColor 26%, transparent);
  border-top-color: currentColor;
  animation: dpc-spin .7s linear infinite;
}

/* ---------- panel shell ---------- */
.dpc-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0 16px 10px;
  border-radius: var(--dpc-r-lg);
  min-width: 0;
  isolation: isolate;
  container-type: inline-size;
  background: color-mix(in srgb, var(--dpc-surface) 90%, transparent);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  backdrop-filter: blur(18px) saturate(150%);
  box-shadow: var(--dpc-shadow-1), inset 0 1px 0 color-mix(in srgb, #ffffff 42%, transparent);
  animation: dpc-rise 220ms var(--dpc-ease) both;
}
/* gradient hairline: masked ring keeps the radius continuous at all corners */
.dpc-panel::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--dpc-accent) 42%, #ffffff) 0%,
    color-mix(in srgb, var(--dpc-accent) 14%, transparent) 34%,
    color-mix(in srgb, var(--dpc-accent) 52%, var(--dpc-accent-soft)) 68%,
    color-mix(in srgb, var(--dpc-accent) 16%, transparent) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
.dpc-panel-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 12px;
  max-height: min(56vh, 560px);
  overflow: auto;
  border-radius: inherit;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--dpc-fg) 18%, transparent) transparent;
}
.dpc-panel-inner::-webkit-scrollbar { width: 8px; height: 8px; }
.dpc-panel-inner::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--dpc-fg) 16%, transparent);
}

/* ---------- panel header ---------- */
.dpc-head { display: flex; align-items: center; gap: 10px; }
.dpc-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--dpc-grad);
  color: #ffffff;
  box-shadow: 0 4px 12px -6px var(--dpc-accent);
}
.dpc-head-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dpc-title { font-size: 14px; font-weight: 600; letter-spacing: -.005em; }
.dpc-meta {
  font-size: 11.5px;
  color: var(--dpc-fg-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dpc-head-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.dpc-close {
  width: 28px;
  height: 28px;
  border-radius: var(--dpc-r-xs);
  background: var(--dpc-danger-soft);
  color: var(--dpc-danger);
}
.dpc-close:hover { background: color-mix(in srgb, var(--dpc-danger) 20%, transparent); color: var(--dpc-danger); }

/* ---------- controls ---------- */
.dpc-controls { display: flex; align-items: flex-start; gap: 18px; flex-wrap: wrap; }
.dpc-control { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.dpc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dpc-row-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--dpc-fg-3);
  letter-spacing: .02em;
}
.dpc-chip-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
  border-radius: var(--dpc-r-sm);
  background: var(--dpc-surface-2);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dpc-fg) 6%, transparent);
}
.dpc-chip {
  min-height: 24px;
  padding: 3px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dpc-fg-2);
  font: inherit;
  font-size: 12px;
  line-height: 1.3;
  cursor: pointer;
  transition: background 140ms var(--dpc-ease), color 140ms var(--dpc-ease), box-shadow 140ms var(--dpc-ease);
}
.dpc-chip:hover { color: var(--dpc-fg); background: color-mix(in srgb, var(--dpc-fg) 6%, transparent); }
.dpc-chip[data-selected='true'] {
  background: var(--dpc-surface);
  color: var(--dpc-fg);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .10), inset 0 0 0 1px color-mix(in srgb, var(--dpc-fg) 8%, transparent);
}
.dpc-chip:disabled { opacity: .5; cursor: default; }

/* ---------- goal ---------- */
.dpc-goal {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px 10px 14px;
  border-radius: 12px;
  background:
    linear-gradient(100deg, color-mix(in srgb, var(--dpc-accent) 11%, transparent), transparent 72%),
    var(--dpc-surface-2);
  border: 1px solid color-mix(in srgb, var(--dpc-accent) 20%, transparent);
}
.dpc-goal::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 11px;
  bottom: 11px;
  width: 3px;
  border-radius: 999px;
  background: var(--dpc-grad);
}
.dpc-goal-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .04em;
  color: color-mix(in srgb, var(--dpc-accent) 70%, var(--dpc-fg-2));
}
.dpc-goal-text { margin: 0; font-size: 13.5px; line-height: 1.55; font-weight: 500; }

/* ---------- result text ---------- */
.dpc-summary { margin: 0; color: var(--dpc-fg); font-size: 13px; line-height: 1.6; }
.dpc-block { display: flex; flex-direction: column; gap: 6px; }
.dpc-block-head {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: .04em;
  color: var(--dpc-fg-3);
}
.dpc-notes { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
.dpc-notes li { display: flex; align-items: flex-start; gap: 7px; color: var(--dpc-fg-2); font-size: 12.5px; line-height: 1.55; }
.dpc-notes li > .dpc-ic { margin-top: 3px; color: var(--dpc-accent); }
.dpc-notes[data-tone='muted'] li > .dpc-ic { color: var(--dpc-fg-3); }
.dpc-notes[data-tone='plain'] li { padding-left: 2px; }

.dpc-hint { margin: 0; font-size: 12px; color: var(--dpc-fg-3); }

/* ---------- diff hunks ---------- */
.dpc-viewbar { display: flex; align-items: center; gap: 8px; }
.dpc-hunks { display: flex; flex-direction: column; gap: 8px; }
.dpc-hunk {
  border: 1px solid var(--dpc-line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--dpc-surface);
}
.dpc-hunk-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--dpc-surface-2);
  border-bottom: 1px solid var(--dpc-line);
  cursor: pointer;
  user-select: none;
}
.dpc-hunk-head input[type='checkbox'] {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--dpc-accent);
  cursor: pointer;
}
.dpc-hunk-name {
  font-family: var(--dpc-mono);
  font-size: 11.5px;
  color: var(--dpc-fg-2);
  white-space: nowrap;
}
.dpc-badge {
  flex: 0 0 auto;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--dpc-fg-2);
  background: color-mix(in srgb, var(--dpc-fg) 8%, transparent);
}
.dpc-badge[data-kind='add'] { color: var(--dpc-success); background: var(--dpc-success-soft); }
.dpc-badge[data-kind='remove'] { color: var(--dpc-danger); background: var(--dpc-danger-soft); }
.dpc-badge[data-kind='replace'] { color: var(--dpc-accent); background: var(--dpc-accent-soft); }
.dpc-hunk-lines {
  margin: 0;
  padding: 6px 0;
  font-family: var(--dpc-mono);
  font-size: 12px;
  line-height: 1.6;
  max-height: 300px;
  overflow: auto;
}
.dpc-line {
  display: block;
  padding: 0 10px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--dpc-fg-2);
}
.dpc-line::before {
  content: attr(data-sign);
  display: inline-block;
  width: 22px;
  margin-right: 6px;
  text-align: center;
  vertical-align: top;
}
.dpc-line[data-kind='remove'] { background: var(--dpc-del); color: color-mix(in srgb, var(--dpc-danger) 72%, var(--dpc-fg)); }
.dpc-line[data-kind='add'] { background: var(--dpc-add); color: color-mix(in srgb, var(--dpc-success) 76%, var(--dpc-fg)); }
.dpc-line[data-kind='same'] { color: var(--dpc-fg-3); }

/* ---------- compare ---------- */
.dpc-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
.dpc-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--dpc-line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--dpc-surface);
}
.dpc-pane-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  font-size: 11.5px;
  color: var(--dpc-fg-3);
  background: var(--dpc-surface-2);
  border-bottom: 1px solid var(--dpc-line);
}
.dpc-pane[data-side='after'] .dpc-pane-title { color: color-mix(in srgb, var(--dpc-accent) 72%, var(--dpc-fg-2)); }
.dpc-pane-body {
  margin: 0;
  padding: 10px;
  font-family: var(--dpc-mono);
  font-size: 12px;
  line-height: 1.6;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---------- footer + actions ---------- */
.dpc-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  flex-wrap: wrap;
  padding-top: 2px;
}
.dpc-footer-end { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.dpc-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 5px 12px;
  border: 1px solid var(--dpc-line);
  border-radius: 9px;
  background: var(--dpc-surface);
  color: var(--dpc-fg);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 150ms var(--dpc-ease), border-color 150ms var(--dpc-ease), transform 150ms var(--dpc-ease), box-shadow 150ms var(--dpc-ease);
}
.dpc-action:hover { background: var(--dpc-surface-3); border-color: var(--dpc-line-strong); }
.dpc-action:active { transform: translateY(1px); }
.dpc-action[data-variant='ghost'] {
  border-color: transparent;
  background: transparent;
  color: var(--dpc-fg-2);
}
.dpc-action[data-variant='ghost']:hover { background: var(--dpc-surface-3); color: var(--dpc-fg); }
.dpc-action[data-variant='primary'] {
  border: 0;
  background: var(--dpc-grad);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 6px 16px -8px var(--dpc-accent), inset 0 1px 0 rgba(255, 255, 255, .22);
}
.dpc-action[data-variant='primary']:hover { transform: translateY(-1px); box-shadow: 0 10px 22px -10px var(--dpc-accent), inset 0 1px 0 rgba(255, 255, 255, .28); }
.dpc-action[data-variant='primary']:active { transform: translateY(0); }
.dpc-action:disabled,
.dpc-action[data-variant='primary']:disabled {
  opacity: .45;
  cursor: default;
  transform: none;
  box-shadow: none;
}
.dpc-action[data-variant='danger'] { color: var(--dpc-danger); border-color: color-mix(in srgb, var(--dpc-danger) 26%, transparent); background: var(--dpc-danger-soft); }
.dpc-action[data-variant='danger']:hover { background: color-mix(in srgb, var(--dpc-danger) 18%, transparent); }

.dpc-saved {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--dpc-success);
}
.dpc-field { display: flex; flex-direction: column; gap: 6px; }
.dpc-field-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--dpc-fg);
}
.dpc-error {
  margin: 0;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dpc-danger) 24%, transparent);
  background: var(--dpc-danger-soft);
  color: color-mix(in srgb, var(--dpc-danger) 86%, var(--dpc-fg));
  font-size: 12.5px;
  line-height: 1.5;
}
.dpc-textarea,
.dpc-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--dpc-line);
  border-radius: var(--dpc-r-sm);
  background: var(--dpc-surface);
  color: var(--dpc-fg);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  resize: vertical;
  transition: border-color 150ms var(--dpc-ease), box-shadow 150ms var(--dpc-ease);
}
.dpc-textarea { min-height: 56px; }
.dpc-textarea:focus,
.dpc-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--dpc-accent) 62%, transparent);
  box-shadow: var(--dpc-ring);
}
.dpc-textarea::placeholder,
.dpc-input::placeholder { color: var(--dpc-fg-3); }
.dpc-refine { display: flex; align-items: stretch; gap: 8px; flex-wrap: wrap; }
.dpc-refine .dpc-textarea { flex: 1 1 280px; min-height: 40px; }

/* ---------- settings ---------- */
.dpc-settings { display: flex; flex-direction: column; gap: 16px; max-width: 860px; }
.dpc-hero { display: flex; align-items: flex-start; gap: 12px; }
.dpc-hero-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--dpc-grad);
  color: #ffffff;
  box-shadow: 0 8px 20px -10px var(--dpc-accent);
}
.dpc-hero-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dpc-hero-title { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
.dpc-hero-desc { margin: 0; max-width: 620px; font-size: 12.5px; line-height: 1.6; color: var(--dpc-fg-2); }.dpc-card {
  border: 1px solid var(--dpc-line);
  border-radius: var(--dpc-r-md);
  background: color-mix(in srgb, var(--dpc-surface) 94%, transparent);
  box-shadow: var(--dpc-shadow-1);
  overflow: hidden;
  container-type: inline-size;
}
.dpc-card-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 13px 16px 11px;
  border-bottom: 1px solid var(--dpc-line);
  background: var(--dpc-surface-2);
}
.dpc-card-title { margin: 0; font-size: 13.5px; font-weight: 600; }
.dpc-card-desc { margin: 0; font-size: 12px; color: var(--dpc-fg-3); line-height: 1.55; }
.dpc-section-head {
  padding: 12px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--dpc-fg-3);
}
.dpc-setting-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 16px;
  border-top: 1px solid var(--dpc-line);
  flex-wrap: wrap;
}
.dpc-section-head + .dpc-setting-row { border-top: 0; }
.dpc-setting-text { display: flex; flex-direction: column; gap: 3px; max-width: 440px; min-width: 0; }
.dpc-setting-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--dpc-fg); }
.dpc-setting-desc { margin: 0; font-size: 12px; line-height: 1.55; color: var(--dpc-fg-3); }
.dpc-setting-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
  flex: 0 0 auto;
  min-width: 0;
  margin-left: auto;
}
.dpc-model-panel { display: flex; flex-direction: column; gap: 8px; padding: 10px 16px 14px; border-top: 1px dashed var(--dpc-line); }
.dpc-model-list { display: flex; flex-direction: column; gap: 10px; }
.dpc-model-group { display: flex; flex-direction: column; gap: 6px; }
.dpc-model-group-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--dpc-fg-3);
  letter-spacing: .02em;
}
.dpc-model-options { display: flex; flex-wrap: wrap; gap: 6px; }
.dpc-model-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 5px 10px;
  border: 1px solid var(--dpc-line);
  border-radius: 9px;
  background: var(--dpc-surface);
  color: var(--dpc-fg-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 150ms var(--dpc-ease), background 150ms var(--dpc-ease), color 150ms var(--dpc-ease);
}
.dpc-model-option:hover { border-color: var(--dpc-line-strong); color: var(--dpc-fg); }
.dpc-model-option[data-selected='true'] {
  border-color: color-mix(in srgb, var(--dpc-accent) 56%, transparent);
  background: var(--dpc-accent-soft);
  color: color-mix(in srgb, var(--dpc-accent) 78%, var(--dpc-fg));
  font-weight: 500;
}
.dpc-model-option .dpc-ic { color: currentColor; }
.dpc-card-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--dpc-line);
  background: color-mix(in srgb, var(--dpc-surface-2) 82%, transparent);
}
.dpc-settings-footer { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--dpc-line); }

@keyframes dpc-spin { to { transform: rotate(360deg); } }
@keyframes dpc-rise {
  from { opacity: 0; transform: translateY(7px) scale(.995); }
  to { opacity: 1; transform: none; }
}
@keyframes dpc-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* The settings card lives in a narrow pane inside the host settings page, so
   the layout reacts to the card's own width rather than the window width. */
@container (max-width: 560px) {
  .dpc-setting-row { flex-direction: column; gap: 9px; }
  .dpc-setting-control { justify-content: flex-start; width: 100%; margin-left: 0; }
  .dpc-model-panel { padding-inline: 14px; }
  .dpc-card-foot { flex-wrap: wrap; }
}

@media (max-width: 720px) {
  .dpc-split { grid-template-columns: minmax(0, 1fr); }
  .dpc-setting-row { flex-direction: column; gap: 9px; }
  .dpc-setting-control { justify-content: flex-start; width: 100%; margin-left: 0; }
  .dpc-panel { margin-bottom: 8px; }
}

@media (prefers-reduced-motion: reduce) {
  .dpc-panel,
  .dpc-spinner,
  .dpc-btn,
  .dpc-action,
  .dpc-chip,
  .dpc-model-option,
  .dpc-textarea,
  .dpc-input {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
`;

/**
 * @param {any} doc document to inject into (defaults to the global one)
 * @returns {void}
 */
function injectStyles(doc) {
  const target = doc || (typeof document === 'object' ? document : null);
  if (!target || typeof target.createElement !== 'function') return;
  const existing = typeof target.querySelector === 'function'
    ? target.querySelector('style[data-dsh-prompt-craft="styles"]')
    : null;
  if (existing) return;
  const tag = target.createElement('style');
  tag.setAttribute('data-dsh-prompt-craft', 'styles');
  tag.textContent = CSS;
  if (target.head && typeof target.head.appendChild === 'function') target.head.appendChild(tag);
}

module.exports = { CSS, STYLE_ID, injectStyles };
