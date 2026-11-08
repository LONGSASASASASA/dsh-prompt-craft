'use strict';

/**
 * WeChat (iLink) bridge for dsh-prompt-craft.
 *
 * The official Weixin channel is distributed as an OpenClaw plugin. We only
 * borrow the documented iLink HTTP protocol here so the plugin can hold a bot
 * session by itself: scan a QR code, long-poll `getupdates`, and hand inbound
 * text to the composer through the plugin's own RPC route.
 *
 * Design notes:
 *  - no external runtime, no OpenClaw: plain `fetch` against ilinkai.weixin.qq.com
 *  - the bot token lives in ~/.dsh/prompt-craft/weixin.json (0600)
 *  - inbound text is never executed: it is only offered to a composer, which
 *    fills the draft; nothing is sent back to WeChat by this module
 *  - iLink sessions expire after ~24h; the server answers errcode -14 and the
 *    bridge pauses until the user scans a new QR code
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { LIMITS } = require('../protocol.cjs');

const API_BASE = 'https://ilinkai.weixin.qq.com';
const APP_ID = 'bot';
/** 2.4.10 encoded as 0x00MMNNPP. */
const APP_CLIENT_VERSION = 132106;
const CHANNEL_VERSION = '0.4.0';
const BOT_AGENT = 'dsh-prompt-craft/0.4.0';

const QR_LONG_POLL_TIMEOUT_MS = 40 * 1000;
const LONG_POLL_TIMEOUT_MS = 38 * 1000;
const API_TIMEOUT_MS = 15 * 1000;
const LOGIN_TTL_MS = 5 * 60 * 1000;
const SESSION_EXPIRED_ERRCODE = -14;
const SEEN_LIMIT = 200;

/**
 * @typedef {{ id: string, from: string, text: string, at: number, chat: 'direct'|'group' }} PendingMessage
 * @typedef {{ botToken: string, ilinkBotId: string, baseUrl: string, ilinkUserId: string, savedAt: number }} Account
 */

/**
 * @param {number} length
 * @returns {number}
 */
function randomUint32() {
  return crypto.randomBytes(4).readUInt32BE(0) >>> 0;
}

/** `X-WECHAT-UIN`: random uint32 -> decimal string -> base64. */
function wechatUin() {
  return Buffer.from(String(randomUint32()), 'utf8').toString('base64');
}

/** @returns {Record<string, string>} */
function commonHeaders() {
  return {
    'iLink-App-Id': APP_ID,
    'iLink-App-ClientVersion': String(APP_CLIENT_VERSION),
    'X-WECHAT-UIN': wechatUin(),
  };
}

/**
 * @param {string|undefined} token
 * @returns {Record<string, string>}
 */
function authenticatedHeaders(token) {
  const headers = Object.assign(
    {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': wechatUin(),
    },
    commonHeaders(),
  );
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

/** @returns {Record<string, string>} */
function baseInfo() {
  return { channel_version: CHANNEL_VERSION, bot_agent: BOT_AGENT };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function readText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Extract the first text item from an inbound iLink message.
 * @param {any} msg
 * @returns {string}
 */
function extractText(msg) {
  const items = msg && Array.isArray(msg.item_list) ? msg.item_list : [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 1 && item.text_item && typeof item.text_item.text === 'string') {
      return item.text_item.text;
    }
    // Voice messages carry their local transcription on the voice item.
    if (item.type === 3 && item.voice_item && typeof item.voice_item.text === 'string') {
      return item.voice_item.text;
    }
  }
  return '';
}

/**
 * @param {string} text
 * @returns {string} text with control characters removed and hard limits applied
 */
function sanitizeInbound(text) {
  const cleaned = String(text)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
  return cleaned.length > LIMITS.MAX_WEIXIN_TEXT_CHARS ? cleaned.slice(0, LIMITS.MAX_WEIXIN_TEXT_CHARS) : cleaned;
}

/**
 * @param {string} [dshHome]
 * @returns {string} absolute path of the credential file
 */
function defaultStorePath(dshHome) {
  const home = dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'prompt-craft', 'weixin.json');
}

class WeixinBridge {
  /**
   * @param {{ storePath?: string, fetchImpl?: typeof fetch, log?: (message: string) => void, now?: () => number }} [options]
   */
  constructor(options) {
    const opts = options || {};
    this.storePath = opts.storePath || defaultStorePath();
    this.fetchImpl = opts.fetchImpl || ((...args) => globalThis.fetch(...args));
    this.log = opts.log || function noop() {};
    this.now = opts.now || Date.now;

    /** @type {'idle'|'waiting'|'connected'|'paused'} */
    this.state = 'idle';
    /** @type {null | { qrcode: string, qrcodeUrl: string, startedAt: number, status: string, verifyRequired: boolean, verifyCode: string, error: string }} */
    this.login = null;
    /** @type {Account|null} */
    this.account = null;
    /** @type {PendingMessage[]} */
    this.queue = [];
    /** @type {Set<string>} */
    this.seen = new Set();
    this.seenOrder = [];
    this.cursor = '';
    this.lastError = null;
    this.lastMessageAt = 0;
    this.connectedAt = 0;
    this.loginLoopRunning = false;
    this.monitorRunning = false;
    this.stopped = false;
    this.loginTimer = null;

    this.load();
    if (this.account) {
      this.state = 'connected';
      this.connectedAt = this.now();
      this.startMonitor();
    }
  }

  /* ---------------------------------------------------------------- storage */

  load() {
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.botToken === 'string' && parsed.botToken) {
        this.account = {
          botToken: parsed.botToken,
          ilinkBotId: readText(parsed.ilinkBotId),
          baseUrl: readText(parsed.baseUrl) || API_BASE,
          ilinkUserId: readText(parsed.ilinkUserId),
          savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
        };
        this.cursor = readText(parsed.cursor);
      }
    } catch (error) {
      /* missing or unreadable store is fine */
    }
  }

  save() {
    try {
      const dir = path.dirname(this.storePath);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const payload = JSON.stringify(
        Object.assign({}, this.account, { cursor: this.cursor }),
        null,
        2,
      );
      fs.writeFileSync(this.storePath, payload, { mode: 0o600 });
      try {
        fs.chmodSync(this.storePath, 0o600);
      } catch (error) {
        /* best effort on platforms without chmod */
      }
    } catch (error) {
      this.log('weixin: could not persist credentials: ' + String(error && error.message));
    }
  }

  clearStorage() {
    try {
      fs.unlinkSync(this.storePath);
    } catch (error) {
      /* already gone */
    }
  }

  /* ------------------------------------------------------------- utilities */

  /**
   * @param {string} url
   * @param {Record<string, string>} headers
   * @param {number} timeoutMs
   * @param {AbortSignal|undefined} externalSignal
   * @param {string|undefined} body JSON payload for POST requests
   * @returns {Promise<Response>}
   */
  async request(url, headers, timeoutMs, externalSignal, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    const onAbort = () => controller.abort();
    if (externalSignal) externalSignal.addEventListener('abort', onAbort, { once: true });
    /** @type {Record<string, any>} */
    const init = { headers: headers, signal: controller.signal };
    if (typeof body === 'string') {
      init.method = 'POST';
      init.body = body;
    }
    try {
      return await this.fetchImpl(url, init);
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * @param {string} endpoint
   * @param {any} body
   * @param {{ token?: string, baseUrl?: string, timeoutMs?: number }} [options]
   * @returns {Promise<any>}
   */
  async postJson(endpoint, body, options) {
    const opts = options || {};
    const base = (opts.baseUrl || API_BASE).replace(/\/$/, '');
    const url = base + '/' + endpoint;
    const response = await this.request(
      url,
      authenticatedHeaders(opts.token),
      opts.timeoutMs || API_TIMEOUT_MS,
      undefined,
      JSON.stringify(body === undefined ? {} : body),
    );
    const text = await response.text();
    if (!response.ok) throw new Error('weixin ' + endpoint + ' HTTP ' + response.status + ': ' + text.slice(0, 200));
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('weixin ' + endpoint + ' returned non-JSON: ' + text.slice(0, 200));
    }
  }

  /**
   * @param {string} endpoint
   * @param {{ baseUrl?: string, timeoutMs?: number }} [options]
   * @returns {Promise<any>}
   */
  async getJson(endpoint, options) {
    const opts = options || {};
    const base = (opts.baseUrl || API_BASE).replace(/\/$/, '');
    const response = await this.request(
      base + '/' + endpoint,
      commonHeaders(),
      opts.timeoutMs || API_TIMEOUT_MS,
      undefined,
    );
    const text = await response.text();
    if (!response.ok) throw new Error('weixin ' + endpoint + ' HTTP ' + response.status + ': ' + text.slice(0, 200));
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('weixin ' + endpoint + ' returned non-JSON: ' + text.slice(0, 200));
    }
  }

  /* ------------------------------------------------------------ login flow */

  /**
   * Start a QR login. Returns the public login snapshot.
   * @returns {Promise<any>}
   */
  async startLogin() {
    if (this.state === 'connected') return this.status();
    if (this.login && this.state === 'waiting' && this.now() - this.login.startedAt < LOGIN_TTL_MS) {
      return this.status();
    }
    this.state = 'waiting';
    this.login = null;
    const tokens = this.account && this.account.botToken ? [this.account.botToken] : [];
    const response = await this.postJson('ilink/bot/get_bot_qrcode?bot_type=3', {
      local_token_list: tokens,
    });
    const qrcode = readText(response && response.qrcode);
    const qrcodeUrl = readText(response && response.qrcode_img_content);
    if (!qrcode || !qrcodeUrl) throw new Error('weixin: the server returned no QR code');
    this.login = {
      qrcode: qrcode,
      qrcodeUrl: qrcodeUrl,
      startedAt: this.now(),
      status: 'wait',
      verifyRequired: false,
      verifyCode: '',
      error: '',
    };
    this.lastError = null;
    this.startLoginLoop();
    return this.status();
  }

  /**
   * Feed the numeric pairing code shown in WeChat.
   * @param {string} code
   * @returns {any}
   */
  submitVerifyCode(code) {
    const cleaned = String(code || '').replace(/[^0-9]/g, '').slice(0, 8);
    if (!this.login || this.state !== 'waiting') throw new Error('weixin: no login in progress');
    if (!cleaned) throw new Error('weixin: verify code is empty');
    this.login.verifyCode = cleaned;
    return this.status();
  }

  startLoginLoop() {
    if (this.loginLoopRunning) return;
    this.loginLoopRunning = true;
    const tick = async () => {
      if (this.stopped) {
        this.loginLoopRunning = false;
        return;
      }
      const login = this.login;
      if (this.state !== 'waiting' || !login) {
        this.loginLoopRunning = false;
        return;
      }
      if (this.now() - login.startedAt > LOGIN_TTL_MS) {
        this.login.status = 'expired';
        this.state = 'idle';
        this.loginLoopRunning = false;
        return;
      }
      try {
        let endpoint = 'ilink/bot/get_qrcode_status?qrcode=' + encodeURIComponent(login.qrcode);
        if (login.verifyCode) endpoint += '&verify_code=' + encodeURIComponent(login.verifyCode);
        const response = await this.getJson(endpoint, {
          baseUrl: login.baseUrl || API_BASE,
          timeoutMs: QR_LONG_POLL_TIMEOUT_MS,
        });
        const status = readText(response && response.status) || 'wait';
        if (status !== login.status) this.log('weixin: login status ' + status);
        login.status = status;

        if (status === 'need_verifycode') {
          login.verifyRequired = true;
          login.verifyCode = '';
          login.error = '';
        } else if (status === 'verify_code_blocked') {
          login.verifyRequired = true;
          login.verifyCode = '';
          login.error = 'verify-code-blocked';
        } else if (status === 'scaned_but_redirect') {
          const host = readText(response && response.redirect_host);
          if (host) {
            /* Keep the current base URL but remember the redirect host for polling. */
            login.baseUrl = 'https://' + host.replace(/^https?:\/\//, '').replace(/\/$/, '');
          }
        } else if (status === 'confirmed') {
          const botToken = readText(response && response.bot_token);
          const ilinkBotId = readText(response && response.ilink_bot_id);
          if (!botToken || !ilinkBotId) throw new Error('weixin: login confirmed without credentials');
          this.account = {
            botToken: botToken,
            ilinkBotId: ilinkBotId,
            baseUrl: readText(response && response.baseurl) || login.baseUrl || API_BASE,
            ilinkUserId: readText(response && response.ilink_user_id),
            savedAt: this.now(),
          };
          this.cursor = '';
          this.save();
          this.state = 'connected';
          this.connectedAt = this.now();
          this.login = null;
          this.loginLoopRunning = false;
          this.startMonitor();
          this.log('weixin: connected as ' + ilinkBotId);
          return;
        } else if (status === 'expired' || status === 'binded_redirect') {
          this.login.status = status;
          this.state = 'idle';
          this.loginLoopRunning = false;
          return;
        }
        setTimeout(tick, 600);
      } catch (error) {
        login.error = String((error && error.message) || error).slice(0, 200);
        this.lastError = login.error;
        setTimeout(tick, 2500);
      }
    };
    setTimeout(tick, 0);
  }

  /* --------------------------------------------------------------- monitor */

  startMonitor() {
    if (this.monitorRunning || this.stopped || !this.account) return;
    this.monitorRunning = true;
    const tick = async () => {
      if (this.stopped || this.state !== 'connected' || !this.account) {
        this.monitorRunning = false;
        return;
      }
      const account = this.account;
      try {
        const response = await this.postJson(
          'ilink/bot/getupdates',
          { get_updates_buf: this.cursor || '', base_info: baseInfo() },
          { token: account.botToken, baseUrl: account.baseUrl, timeoutMs: LONG_POLL_TIMEOUT_MS },
        );
        if (response && typeof response.errcode === 'number' && response.errcode === SESSION_EXPIRED_ERRCODE) {
          this.pause();
          return;
        }
        if (response && typeof response.ret === 'number' && response.ret !== 0) {
          // A non-zero ret is an application-level failure (bad request, stale
          // cursor, rate limit...). Surface it and back off instead of treating
          // the empty payload as "no messages".
          this.lastError = 'getupdates ret ' + response.ret;
          this.log('weixin: getupdates returned ret ' + response.ret);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          setTimeout(tick, 200);
          return;
        }
        if (response && typeof response.get_updates_buf === 'string') {
          const changed = response.get_updates_buf !== this.cursor;
          this.cursor = response.get_updates_buf;
          if (changed) this.save();
        }
        const messages = response && Array.isArray(response.msgs) ? response.msgs : [];
        for (const message of messages) this.ingest(message);
        this.lastError = null;
      } catch (error) {
        const message = String((error && error.message) || error);
        if (/aborted|abort/i.test(message)) {
          /* long-poll timeout is normal: retry immediately */
        } else {
          this.lastError = message.slice(0, 200);
          this.log('weixin: getupdates failed: ' + this.lastError);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      setTimeout(tick, 200);
    };
    setTimeout(tick, 0);
  }

  ingest(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'object') return;
    const text = sanitizeInbound(extractText(rawMessage));
    if (!text) return;
    const id = readText(rawMessage.message_id) || readText(rawMessage.client_id) || 'anon-' + this.now() + '-' + Math.random();
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.seenOrder.push(id);
    while (this.seenOrder.length > SEEN_LIMIT) {
      const dropped = this.seenOrder.shift();
      this.seen.delete(dropped);
    }
    const from = readText(rawMessage.from_user_id);
    const groupId = readText(rawMessage.group_id);
    const entry = {
      id: id,
      from: from,
      text: text,
      at: typeof rawMessage.create_time_ms === 'number' ? rawMessage.create_time_ms : this.now(),
      chat: groupId ? 'group' : 'direct',
    };
    this.queue.push(entry);
    while (this.queue.length > LIMITS.MAX_WEIXIN_QUEUE) this.queue.shift();
    this.lastMessageAt = this.now();
    this.log('weixin: queued message from ' + (from || 'unknown'));
  }

  pause() {
    this.state = 'paused';
    this.monitorRunning = false;
    this.lastError = 'session-expired';
    this.log('weixin: session expired; waiting for a new QR scan');
  }

  /* ---------------------------------------------------------------- public */

  status() {
    const login = this.login;
    return {
      state: this.state,
      login: login
        ? {
            qrcodeUrl: login.qrcodeUrl,
            status: login.status,
            verifyRequired: login.verifyRequired,
            error: login.error || null,
            expiresAt: login.startedAt + LOGIN_TTL_MS,
          }
        : null,
      account: this.account
        ? { ilinkBotId: this.account.ilinkBotId, savedAt: this.account.savedAt }
        : null,
      connectedAt: this.connectedAt || null,
      lastError: this.lastError,
      lastMessageAt: this.lastMessageAt || null,
      queueSize: this.queue.length,
    };
  }

  /**
   * Hand queued messages to the caller; they are consumed.
   * @returns {PendingMessage[]}
   */
  takePending() {
    if (this.queue.length === 0) return [];
    const messages = this.queue.slice();
    this.queue.length = 0;
    return messages;
  }

  /**
   * Inspect queued messages without consuming them.
   * @returns {PendingMessage[]}
   */
  peekPending() {
    return this.queue.slice();
  }

  /**
   * Drop queued messages without handing them out.
   * @returns {number} how many were dropped
   */
  clearPending() {
    const count = this.queue.length;
    this.queue.length = 0;
    return count;
  }

  logout() {
    this.stop();
    this.account = null;
    this.cursor = '';
    this.queue.length = 0;
    this.login = null;
    this.state = 'idle';
    this.connectedAt = 0;
    this.clearStorage();
    this.stopped = false;
    return this.status();
  }

  stop() {
    this.stopped = true;
    this.loginLoopRunning = false;
    this.monitorRunning = false;
    if (this.loginTimer) clearTimeout(this.loginTimer);
  }
}

/**
 * @param {{ storePath?: string, fetchImpl?: typeof fetch, log?: (message: string) => void }} [options]
 * @returns {WeixinBridge}
 */
function createWeixinBridge(options) {
  return new WeixinBridge(options);
}

module.exports = {
  WeixinBridge,
  createWeixinBridge,
  defaultStorePath,
  extractText,
  sanitizeInbound,
  API_BASE,
};
