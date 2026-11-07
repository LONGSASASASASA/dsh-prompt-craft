'use strict';

/**
 * Stylesheet for the client half, injected once into <head> under a stable
 * data attribute so hot reloads do not duplicate rules.
 *
 * Colors lean on the app's `--dsw-*` design tokens with neutral fallbacks, so
 * the panel follows light/dark themes without shipping a palette.
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
  color: var(--dsw-color-icon-secondary, currentColor);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;
}
.dpc-btn:hover { background: var(--dsw-color-surface-hover, rgba(127,127,127,.14)); color: var(--dsw-color-icon-primary, currentColor); }
.dpc-btn:focus-visible { outline: 2px solid var(--dsw-color-focus-ring, #4f7cff); outline-offset: 1px; }
.dpc-btn[data-active='true'] { color: var(--dsw-color-accent, #4f7cff); background: var(--dsw-color-accent-weak, rgba(79,124,255,.14)); }
.dpc-btn[disabled] { cursor: default; opacity: .38; }
.dpc-btn[disabled]:hover { background: transparent; }
.dpc-btn svg { width: 16px; height: 16px; display: block; }

.dpc-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 8px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-color-border-weak, rgba(127,127,127,.28));
  border-radius: 12px;
  background: var(--dsw-color-surface-raised, rgba(127,127,127,.06));
  color: var(--dsw-color-text-primary, inherit);
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 6px 18px rgba(0,0,0,.10);
  max-height: min(52vh, 520px);
  overflow: auto;
}

.dpc-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.dpc-head-main { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dpc-title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.dpc-title svg { width: 14px; height: 14px; color: var(--dsw-color-accent, #4f7cff); }
.dpc-meta { font-size: 12px; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dpc-head-actions { display: flex; align-items: center; gap: 4px; }

.dpc-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dpc-row-label { font-size: 12px; opacity: .62; }

.dpc-chip-group { display: inline-flex; padding: 1px; gap: 1px; border-radius: 8px; background: var(--dsw-color-surface-sunken, rgba(127,127,127,.10)); }
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
.dpc-chip:hover { opacity: 1; background: var(--dsw-color-surface-hover, rgba(127,127,127,.14)); }
.dpc-chip[data-selected='true'] {
  opacity: 1;
  background: var(--dsw-color-surface-raised, #fff);
  box-shadow: 0 1px 3px rgba(0,0,0,.14);
  font-weight: 600;
}
.dpc-chip[disabled] { cursor: default; opacity: .4; }

.dpc-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--dsw-color-border-weak, rgba(127,127,127,.3));
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.dpc-action:hover { background: var(--dsw-color-surface-hover, rgba(127,127,127,.12)); }
.dpc-action[data-variant='primary'] {
  border-color: transparent;
  background: var(--dsw-color-accent, #4f7cff);
  color: var(--dsw-color-accent-contrast, #fff);
  font-weight: 600;
}
.dpc-action[data-variant='primary']:hover { filter: brightness(1.06); }
.dpc-action[data-variant='ghost'] { border-color: transparent; }
.dpc-action[disabled] { cursor: default; opacity: .45; }

.dpc-spinner {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid var(--dsw-color-border-weak, rgba(127,127,127,.35));
  border-top-color: var(--dsw-color-accent, #4f7cff);
  animation: dpc-spin 720ms linear infinite;
  flex: none;
}
@keyframes dpc-spin { to { transform: rotate(360deg); } }

.dpc-summary { margin: 0; opacity: .85; }
.dpc-notes { margin: 0; padding-left: 18px; opacity: .78; font-size: 12px; }
.dpc-notes li { margin: 1px 0; }

.dpc-hunks { display: flex; flex-direction: column; gap: 6px; }
.dpc-hunk {
  border: 1px solid var(--dsw-color-border-weak, rgba(127,127,127,.26));
  border-radius: 8px;
  overflow: hidden;
  background: var(--dsw-color-surface-base, transparent);
}
.dpc-hunk-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  background: var(--dsw-color-surface-sunken, rgba(127,127,127,.08));
}
.dpc-hunk-head input { margin: 0; accent-color: var(--dsw-color-accent, #4f7cff); }
.dpc-hunk-lines { padding: 4px 0; max-height: 220px; overflow: auto; }
.dpc-line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
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
  border: 1px solid var(--dsw-color-border-weak, rgba(127,127,127,.24));
  border-radius: 8px;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
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
  border: 1px solid var(--dsw-color-border-weak, rgba(127,127,127,.3));
  border-radius: 8px;
  background: var(--dsw-color-surface-base, transparent);
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}
.dpc-textarea:focus { outline: 2px solid var(--dsw-color-focus-ring, #4f7cff); outline-offset: -1px; }

.dpc-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.dpc-footer-end { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }

.dpc-hint { font-size: 12px; opacity: .62; margin: 0; }
.dpc-error { color: var(--dsw-color-danger, #d14343); font-size: 12px; margin: 0; }
.dpc-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--dsw-color-surface-sunken, rgba(127,127,127,.12));
  opacity: .8;
}

.dpc-settings { display: flex; flex-direction: column; gap: 14px; max-width: 620px; }
.dpc-settings-title { margin: 0; font-size: 15px; font-weight: 600; }
.dpc-settings-desc { margin: 0; font-size: 12px; opacity: .66; }
.dpc-field { display: flex; flex-direction: column; gap: 5px; }
.dpc-field-label { font-size: 12px; font-weight: 600; }
.dpc-input {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 9px;
  border: 1px solid var(--dsw-color-border-weak, rgba(127,127,127,.3));
  border-radius: 8px;
  background: var(--dsw-color-surface-base, transparent);
  color: inherit;
  font: inherit;
  font-size: 13px;
}
.dpc-input:focus { outline: 2px solid var(--dsw-color-focus-ring, #4f7cff); outline-offset: -1px; }
.dpc-settings-footer { display: flex; align-items: center; gap: 8px; }
.dpc-saved { font-size: 12px; color: var(--dsw-color-success, #2ea043); }
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
