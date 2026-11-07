'use strict';

/**
 * Client entry: registers the toolbar button, the inline panel and the
 * settings section into the DSH slot service.
 *
 * The bundle is produced by `scripts/build.mjs` and wrapped in the host's
 * `window.__ModuleLoader__.load({ id, factory })` envelope.
 */

const { PLUGIN_ID } = require('../protocol.cjs');
const { injectStyles } = require('./styles.js');
const actions = require('./actions.js');
const panelStore = require('./store.js');
const { EnhanceButton } = require('./button.js');
const { EnhancePanel } = require('./panel.js');
const { SettingsSection } = require('./settings.js');

/**
 * @param {any} slots slot service
 * @param {string} key slot key
 * @param {Record<string, unknown>} options registration options
 * @param {any} component React component
 * @returns {void}
 */
function register(slots, key, options, component) {
  const mount = function mount() {
    return slots.register(options, component);
  };
  if (typeof slots.inject === 'function') {
    slots.inject(key, mount);
    return;
  }
  mount();
}

/**
 * @param {any} ctx plugin context
 * @returns {void}
 */
function apply(ctx) {
  let slots = null;
  try {
    slots = ctx && typeof ctx.get === 'function' ? ctx.get('slots') : ctx && ctx.slots;
  } catch (error) {
    slots = null;
  }
  if (!slots || typeof slots.register !== 'function') return;

  try {
    actions.setContext(ctx);
    injectStyles(typeof document === 'object' ? document : undefined);
    register(
      slots,
      'conversation.input.right',
      { name: 'conversation.input.right', id: 'prompt-craft', order: 10, label: 'Prompt enhancement' },
      EnhanceButton,
    );
    register(
      slots,
      'conversation.input.dock',
      { name: 'conversation.input.dock', id: 'prompt-craft-panel', order: 20, label: 'Prompt enhancement panel' },
      EnhancePanel,
    );
    register(
      slots,
      'settings.section',
      { name: 'settings.section', id: 'prompt-craft', order: 40, label: function label() { return 'Prompt enhancement'; } },
      SettingsSection,
    );
  } catch (error) {
    /* A host without one of these slots must not break the whole app. */
  }
  // Touch the store once so persisted settings load eagerly (best effort).
  try {
    panelStore.getSettings();
  } catch (error) {
    /* ignore */
  }
}

module.exports = {
  name: PLUGIN_ID,
  inject: ['slots'],
  apply: apply,
};
