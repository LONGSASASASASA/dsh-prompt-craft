'use strict';

/**
 * Stylesheet for the client half, injected once into <head> under a stable
 * data attribute so hot reloads do not duplicate rules.
 *
 * Colors lean on the app's `--dsw-alias-*` / `--dsw-specific-*` design tokens with
 * neutral fallbacks, so the panel follows light/dark themes without shipping a
 * palette of its own.
 */

const STYLE_ID = 'dsh-prompt-craft/styles';

const CSS = `
.dpc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;
}
.dpc-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); color: var(--dsw-alias-label-primary, currentColor); }
/* A draft present: the icon is live, so it sits on a soft grey chip. */
.dpc-btn[data-filled='true'] { background: var(--dsw-alias-bg-module-platform, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, currentColor); background: color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 10%, transparent); }
.dpc-btn[data-filled='true']:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.18)); background: color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 16%, transparent); }
.dpc-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, #4f7cff); outline-offset: 1px; }
.dpc-btn[data-active='true'] { color: var(--dsw-static-blue-450, #4f7cff); background: var(--dsw-alias-state-business-tertiary, rgba(79,124,255,.14)); }
.dpc-btn[disabled] { cursor: default; opacity: .38; }
.dpc-btn[disabled]:hover { background: transparent; }
.dpc-btn svg { width: 16px; height: 16px; display: block; }
/* The panel's exit button: a soft red chip so it reads as "close" at a glance. */
.dpc-close {
  border-radius: 8px;
  background: rgba(229, 72, 77, .14);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d33d43) 16%, transparent);
  color: var(--dsw-alias-state-error-primary, #d33d43);
  box-shadow: inset 0 0 0 1px rgba(229, 72, 77, .26);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-error-primary, #d33d43) 30%, transparent);
}
.dpc-close:hover {
  background: rgba(229, 72, 77, .24);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d33d43) 28%, transparent);
  color: var(--dsw-alias-state-error-primary, #d33d43);
}

/**
 * The panel lives in the composer dock, whose parent (the composer stack) also
 * holds the input card. The inline inset below is only the first-paint fallback:
 * panel.js measures the card and overrides it with the card's real insets, so
 * the two boxes share their left and right edges in every layout (sidebars open
 * or closed, any window width) instead of the panel spanning the padding.
 */
.dpc-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0 16px 8px;
  border: 1px solid rgba(147, 189, 255, .62);
  border-radius: 18px;
  background: var(--dsw-specific-input-major, rgba(255, 255, 255, .94));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 8px 22px rgba(70, 128, 255, .10), 0 1px 2px rgba(0, 0, 0, .05);
  min-width: 0;
}
/* A masked gradient ring keeps the outline unbroken around all four corners;
   the solid border above is the fallback when mask compositing is missing. */
.dpc-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  background: linear-gradient(135deg,
    rgba(148, 190, 255, .95) 0%,
    rgba(200, 226, 255, .60) 34%,
    rgba(96, 154, 255, .88) 68%,
    rgba(186, 217, 255, .56) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
  display: none;
}
@supports ((mask-composite: exclude) or (-webkit-mask-composite: xor)) {
  .dpc-panel { border-color: transparent; }
  .dpc-panel::before { display: block; }
}
/* The ring must not scroll away with the content, so the scrolling lives in an
   inner box while the panel itself only paints the outline. */
.dpc-panel-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 16.5px;
  max-height: min(52vh, 520px);
  overflow: auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.dpc-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.dpc-head-main { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dpc-title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.dpc-title svg { width: 14px; height: 14px; color: var(--dsw-static-blue-450, #4f7cff); }
.dpc-meta { font-size: 12px; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dpc-head-actions { display: flex; align-items: center; gap: 4px; }

.dpc-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dpc-row-label { font-size: 12px; opacity: .62; }

.dpc-chip-group { display: inline-flex; padding: 1px; gap: 1px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.10)); }
.dpc-chip {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 7px;
  cursor: pointer;
  opacity: .78;
}
.dpc-chip:hover { opacity: 1; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.dpc-chip[data-selected='true'] {
  opacity: 1;
  background: var(--dsw-alias-bg-module-platform, #fff);
  box-shadow: 0 1px 3px rgba(0,0,0,.14);
  font-weight: 600;
}
.dpc-chip[disabled] { cursor: default; opacity: .4; }

.dpc-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.dpc-action:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dpc-action[data-variant='primary'] {
  border-color: transparent;
  background: var(--dsw-static-blue-450, #4f7cff);
  color: var(--dsw-alias-label-primary-inverted, #fff);
  font-weight: 600;
}
.dpc-action[data-variant='primary']:hover { filter: brightness(1.06); }
.dpc-action[data-variant='ghost'] { border-color: transparent; }
.dpc-action[disabled] { cursor: default; opacity: .45; }

.dpc-spinner {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));
  border-top-color: var(--dsw-static-blue-450, #4f7cff);
  animation: dpc-spin 720ms linear infinite;
  flex: none;
}
@keyframes dpc-spin { to { transform: rotate(360deg); } }

.dpc-summary { margin: 0; opacity: .85; }
.dpc-goal {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.26));
  background: var(--dsw-alias-bg-module-platform, rgba(127,127,127,.06));
}
.dpc-goal-label {
  display: block;
  font-size: 11px;
  letter-spacing: .02em;
  text-transform: none;
  opacity: .62;
  margin-top: 4px;
}
.dpc-goal-label:first-child { margin-top: 0; }
.dpc-goal-text { margin: 0; font-size: 13px; line-height: 1.45; }
.dpc-block { margin-top: 6px; }
.dpc-notes { margin: 0; padding-left: 18px; opacity: .78; font-size: 12px; }
.dpc-notes li { margin: 1px 0; }

.dpc-hunks { display: flex; flex-direction: column; gap: 6px; }
.dpc-hunk {
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.26));
  border-radius: 8px;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, transparent);
}
.dpc-hunk-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08));
}
.dpc-hunk-head input { margin: 0; accent-color: var(--dsw-static-blue-450, #4f7cff); }
.dpc-hunk-lines { padding: 4px 0; max-height: 220px; overflow: auto; }
.dpc-line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 1.45;
  padding: 0 10px 0 8px;
}
.dpc-line[data-kind='add'] { background: rgba(46,160,67,.16); }
.dpc-line[data-kind='remove'] { background: rgba(248,81,73,.14); text-decoration: line-through; opacity: .8; }
.dpc-line[data-kind='same'] { opacity: .55; }

.dpc-split { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
@media (max-width: 720px) { .dpc-split { grid-template-columns: 1fr; } }
.dpc-pane { min-width: 0; }
.dpc-pane-title { font-size: 12px; opacity: .62; margin-bottom: 3px; }
.dpc-pane-body {
  margin: 0;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.24));
  border-radius: 8px;
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 240px;
  overflow: auto;
}

.dpc-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 58px;
  padding: 7px 9px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, transparent);
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}
.dpc-textarea:focus { outline: 2px solid var(--dsw-focus-ring-color, #4f7cff); outline-offset: -1px; }

.dpc-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.dpc-footer-end { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }

.dpc-hint { font-size: 12px; opacity: .62; margin: 0; }
.dpc-error { color: var(--dsw-alias-state-error-primary, #d14343); font-size: 12px; margin: 0; }
.dpc-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  opacity: .8;
}

.dpc-settings { display: flex; flex-direction: column; gap: 14px; max-width: 760px; }
.dpc-settings-title { margin: 0; font-size: 15px; font-weight: 600; }
.dpc-settings-desc { margin: 0; font-size: 12px; opacity: .66; }
/* One settings card: a titled shell whose rows hold copy on the left and the
   control on the right, so the page reads as a list of settings, not a form. */
.dpc-card {
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22));
  border-radius: 14px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-base, #fff));
  overflow: hidden;
}
.dpc-card-head { padding: 14px 16px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.16)); }
.dpc-card-title { margin: 0; font-size: 15px; font-weight: 600; }
.dpc-card-desc { margin: 4px 0 0; font-size: 12px; opacity: .66; line-height: 1.5; }
.dpc-card-body { display: flex; flex-direction: column; }
.dpc-setting-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.12));
  flex-wrap: wrap;
}
.dpc-card-body > .dpc-setting-row:first-child { border-top: 0; }
.dpc-setting-text { flex: 1 1 240px; min-width: 0; }
.dpc-setting-title { margin: 0; font-size: 13px; font-weight: 600; }
.dpc-setting-desc { margin: 3px 0 0; font-size: 12px; opacity: .62; line-height: 1.5; }
.dpc-setting-control { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 220px; }
.dpc-setting-control .dpc-chip-group { align-self: flex-end; }
.dpc-card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.16));
}
/* Local model picker: one row per provider, one chip per model. */
.dpc-model-panel { display: flex; flex-direction: column; gap: 8px; padding: 0 16px 14px; }
.dpc-model-list { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.dpc-model-group { display: flex; flex-direction: column; gap: 5px; }
.dpc-model-group-name { font-size: 12px; opacity: .62; }
.dpc-model-options { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.dpc-model-option {
  padding: 5px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dpc-model-option:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dpc-model-option[data-selected='true'] {
  border-color: var(--dsw-static-blue-450, #4f7cff);
  background: var(--dsw-alias-state-business-tertiary, rgba(79,124,255,.12));
  color: var(--dsw-static-blue-450, #4f7cff);
}
.dpc-field { display: flex; flex-direction: column; gap: 5px; }
.dpc-field-label { font-size: 12px; font-weight: 600; }
.dpc-input {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 9px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, transparent);
  color: inherit;
  font: inherit;
  font-size: 13px;
}
.dpc-input:focus { outline: 2px solid var(--dsw-focus-ring-color, #4f7cff); outline-offset: -1px; }
.dpc-settings-footer { display: flex; align-items: center; gap: 8px; }
.dpc-saved { font-size: 12px; color: var(--dsw-alias-state-success-primary, #2ea043); }
`;

/**
 * @param {Document} [doc]
 * @returns {boolean} true when the stylesheet was inserted by this call
 */
function injectStyles(doc) {
  const document_ = doc === undefined ? (typeof document === 'object' ? document : undefined) : doc;
  if (document_ === undefined || document_ === null || typeof document_.createElement !== 'function') return false;
  if (typeof document_.querySelector === 'function' && document_.querySelector('style[data-dsh-prompt-craft="styles"]')) {
    return false;
  }
  const tag = document_.createElement('style');
  tag.setAttribute('data-dsh-prompt-craft', 'styles');
  tag.textContent = CSS;
  (document_.head || document_.documentElement).appendChild(tag);
  return true;
}

module.exports = { CSS, STYLE_ID, injectStyles };
