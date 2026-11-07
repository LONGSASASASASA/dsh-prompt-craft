'use strict';

/**
 * dsh-prompt-craft — host half.
 *
 * Registers exactly one HTTP route (`POST /dsh-prompt-craft/rpc`) that turns a
 * composer draft into a rewritten prompt using the session's current model.
 * The browser half (lib/client.js) provides the ✨ button, the diff panel and
 * the settings page.
 */

const { PLUGIN_ID, VERSION } = require('../protocol.cjs');
const { registerRpc } = require('./rpc.cjs');

/** @type {{ name: string, version: string, inject: string[], apply: (ctx: any) => void }} */
const plugin = {
  name: PLUGIN_ID,
  version: VERSION,
  inject: ['webServer', 'llm'],
  /**
   * @param {any} ctx cordis context
   */
  apply(ctx) {
    const dispose = registerRpc(ctx);
    if (typeof dispose === 'function') {
      ctx.effect(() => dispose, 'dsh-prompt-craft: rpc route');
    }
  },
};

module.exports = plugin;
module.exports.default = plugin;
module.exports.plugin = plugin;
