'use strict';

/**
 * dsh-prompt-craft — host half.
 *
 * Registers exactly one HTTP route (`POST /dsh-prompt-craft/rpc`) that turns a
 * composer draft into a rewritten prompt using the session's current model,
 * plus a small WeChat (iLink) bridge that hands inbound messages to a composer.
 * The browser half (lib/client.js) provides the ✨ button, the diff panel, the
 * settings page and the WeChat tab.
 */

const { PLUGIN_ID, VERSION } = require('../protocol.cjs');
const { registerRpc } = require('./rpc.cjs');
const { createWeixinBridge } = require('./weixin.cjs');

/** @type {{ name: string, version: string, inject: string[], apply: (ctx: any) => void }} */
const plugin = {
  name: PLUGIN_ID,
  version: VERSION,
  inject: ['webServer', 'llm'],
  /**
   * @param {any} ctx cordis context
   */
  apply(ctx) {
    let bridge = null;
    try {
      bridge = createWeixinBridge({
        log: function log(message) {
          try {
            ctx.logger ? ctx.logger.info(message) : undefined;
          } catch (error) {
            /* logging must never break the bridge */
          }
        },
      });
    } catch (error) {
      bridge = null;
    }

    const dispose = registerRpc(ctx, { weixin: bridge });
    const cleanup = () => {
      try {
        if (bridge) bridge.stop();
      } catch (error) {
        /* ignore */
      }
      if (typeof dispose === 'function') dispose();
    };
    if (ctx && typeof ctx.effect === 'function') {
      ctx.effect(() => cleanup, 'dsh-prompt-craft: rpc route');
    }
  },
};

module.exports = plugin;
module.exports.default = plugin;
module.exports.plugin = plugin;
