'use strict';

/**
 * Minimal dependency-free i18n for the client half.
 *
 * The plugin ships its own dictionary instead of registering into the host
 * `locale` service: the composer area renders before locale plugins are
 * guaranteed to have loaded, and a missing namespace would throw.
 */

const ZH = {
  'button.label': '增强提示词',
  'button.tooltip': '用 AI 改写当前草稿：以目标为导向、diff 预览、分段接受',
  'button.empty': '先写点内容再增强',

  'panel.title': '提示词增强',
  'panel.running': '正在增强…',
  'panel.cancel': '取消',
  'panel.close': '关闭',

  'mode.label': '力度',
  'mode.light': '轻改',
  'mode.standard': '目标导向',
  'mode.expert': '立意升维',
  'mode.light.hint': '理顺表达，把目标说清楚',
  'mode.standard.hint': '围绕真正想要的结果重写',
  'mode.expert.hint': '目标、成功标准、边界与取舍一次写全',

  'scenario.label': '场景',
  'scenario.auto': '自动',
  'scenario.code': '代码',
  'scenario.writing': '写作',
  'scenario.research': '调研',
  'scenario.agent': '智能体',
  'scenario.general': '通用',

  'result.summary': '改写说明',
  'result.notes': '主要改动',
  'result.goal': '真正的目标',
  'result.elevation': '立意升维',
  'result.acceptAll': '全部应用',
  'result.acceptSelected': '应用选中 {n}/{total}',
  'result.discard': '放弃',
  'result.refine': '继续改…',
  'result.refinePlaceholder': '例如：再简洁一点；补上输出格式要求',
  'result.refineSubmit': '再改一版',
  'result.view.sections': '分段',
  'result.view.compare': '对比',
  'result.before': '原文',
  'result.after': '增强后',
  'result.noChanges': '模型没有改动草稿内容。',
  'result.hunkLabel': '第 {old} 行起 → 第 {next} 行起',
  'result.kind.add': '新增',
  'result.kind.remove': '删除',
  'result.kind.replace': '修改',
  'result.applied': '已应用到输入框',
  'result.undo': '撤销',
  'result.retry': '重试',
  'applied.done': '完成',

  'question.title': '先确认两件事',
  'question.hint': '回答后重写会更贴合需求；也可以让模型自行取舍。',
  'question.placeholder': '简要回答，每行一条…',
  'question.submit': '带着回答重写',
  'question.assume': '按缺省值直接改',

  'error.title': '增强失败',
  'error.badOutput': '模型返回的内容不是约定的 JSON。',
  'error.model': '没有解析到当前会话的模型，请在输入框选择模型，或到设置里指定。',
  'error.providerDetail': '上游返回',
  'error.timeout': '请求超时，请稍后重试。',
  'error.network': '无法连接插件后端，请重启 DSH 后再试。',
  'error.generic': '请求失败：{message}',

  'settings.title': '提示词增强',
  'settings.desc': '配置 ✨ 增强按钮的默认行为。配置保存在本机浏览器存储里，不会上传。',
  'settings.section.defaults': '默认行为',
  'settings.section.model': '使用模型',
  'settings.footer.note': '设置只保存在本机浏览器存储，不会上传。',
  'settings.tab.behavior': '增强设置',
  'settings.tab.weixin': '微信 Bot',

  'weixin.desc': '把一个微信 Bot 连到本机：在微信里给它发消息，内容会出现在输入框草稿里。只填入、不发送，随时可撤销。',
  'weixin.onlyFills': '不会自动发送，也不会回复微信；连接凭据只保存在本机（~/.dsh/prompt-craft/weixin.json，仅本账号可读）。',
  'weixin.error': '连接出错：{message}',
  'weixin.connected': '已连接',
  'weixin.botId': 'Bot 标识：{id}',
  'weixin.connectedAt': '授权时间：{when}',
  'weixin.queueSize': '待填入消息：{n} 条',
  'weixin.disconnect': '断开连接',
  'weixin.qrLabel': '微信 Bot 登录二维码',
  'weixin.scanHint': '用手机微信扫描这个二维码，按手机上的提示确认登录。',
  'weixin.loginStatus.wait': '等待扫码…',
  'weixin.loginStatus.scaned': '已扫码，请在手机上确认',
  'weixin.loginStatus.need_verifycode': '需要在手机上核对数字，输入后继续',
  'weixin.loginStatus.verify_code_blocked': '验证次数过多，请重新扫码',
  'weixin.loginStatus.confirmed': '已确认，正在连接…',
  'weixin.loginStatus.expired': '二维码已过期，请刷新',
  'weixin.loginStatus.scaned_but_redirect': '已扫码，正在切换节点…',
  'weixin.verifyLabel': '手机微信上显示的数字',
  'weixin.verifyPlaceholder': '例如 1234',
  'weixin.verifySubmit': '提交数字',
  'weixin.refreshQr': '刷新二维码',
  'weixin.paused': '连接已断开（微信 Bot 会话 24 小时到期）',
  'weixin.pausedHint': '重新扫码即可继续接收消息；本机凭据仍保留，扫码后自动恢复。',
  'weixin.login': '连接微信 Bot',
  'weixin.idleHint': '还没有连接。点下方按钮生成二维码，用手机微信扫码授权。',
  'weixin.autoFill': '收到消息自动填入输入框',
  'weixin.autoFillHint': '关闭后只提示有新消息，点「填入」才写进草稿。',
  'weixin.undo': '撤销填入',
  'weixin.fill': '填入草稿',
  'weixin.ignore': '忽略这组消息',
  'weixin.close': '关闭提示',
  'weixin.noticeTitle': '收到 {n} 条微信消息',
  'weixin.noticeFrom': '来自 {from}',
  'settings.language': '界面语言',
  'settings.language.auto': '跟随 DSH 界面',
  'settings.language.zh': '中文',
  'settings.language.en': 'English',
  'settings.language.desc': '插件自己写的文案（面板、提示）用哪种语言；默认跟随 DSH 的界面语言。',
  'settings.defaultMode': '默认力度',
  'settings.defaultMode.desc': '点 ✨ 时默认用哪一档，面板里仍可临时切换。',
  'settings.defaultScenario': '默认场景',
  'settings.defaultScenario.desc': '给模型一个场景线索；自动会按草稿内容判断。',
  'settings.model': '增强使用的模型',
  'settings.model.desc': '默认跟随当前会话的模型；也可以从本机已连接的模型里指定一个。',
  'settings.model.session': '跟随当前会话模型',
  'settings.model.custom': '指定模型',
  'settings.model.sync': '已从本机同步 {n} 个可用模型。',
  'settings.model.empty': '还没拿到本机模型列表：打开一次任意对话，或点「重新同步」。',
  'settings.model.refresh': '重新同步',
  'settings.model.effortShort': '思考强度（留空用模型默认）',
  'settings.model.provider': 'Provider（如 deepseek-account）',
  'settings.model.model': 'Model（如 deepseek-v4-flash）',
  'settings.model.effort': '思考强度（可留空）',
  'settings.model.effortPlaceholder': '如 max；留空则用默认',
  'settings.model.hint': '指定后会忽略会话当前模型；留空即跟随会话。',
  'settings.model.test': '测试模型',
  'settings.model.testing': '正在测试…',
  'settings.model.testOk': '已连通 · {model} · {ms} 秒',
  'settings.model.testFail': '测试失败：{message}',
  'settings.save': '保存',
  'settings.saved': '已保存',
};

const EN = {
  'button.label': 'Enhance prompt',
  'button.tooltip': 'Rewrite the draft around its real goal: diff preview, per-section accept',
  'button.empty': 'Write something first',

  'panel.title': 'Prompt enhancement',
  'panel.running': 'Enhancing…',
  'panel.cancel': 'Cancel',
  'panel.close': 'Close',

  'mode.label': 'Strength',
  'mode.light': 'Light',
  'mode.standard': 'Goal-first',
  'mode.expert': 'Elevated',
  'mode.light.hint': 'Tidy wording, make the goal explicit',
  'mode.standard.hint': 'Rewrite around the outcome you actually want',
  'mode.expert.hint': 'Outcome, success criteria, boundaries and trade-offs',

  'scenario.label': 'Scenario',
  'scenario.auto': 'Auto',
  'scenario.code': 'Code',
  'scenario.writing': 'Writing',
  'scenario.research': 'Research',
  'scenario.agent': 'Agent',
  'scenario.general': 'General',

  'result.summary': 'What changed',
  'result.notes': 'Edits',
  'result.goal': 'Goal it serves',
  'result.elevation': 'How the aim was raised',
  'result.acceptAll': 'Apply all',
  'result.acceptSelected': 'Apply selected ({n}/{total})',
  'result.discard': 'Discard',
  'result.refine': 'Keep refining…',
  'result.refinePlaceholder': 'e.g. shorter, or add an output format',
  'result.refineSubmit': 'Refine again',
  'result.view.sections': 'Sections',
  'result.view.compare': 'Compare',
  'result.before': 'Before',
  'result.after': 'After',
  'result.noChanges': 'The model did not change the draft.',
  'result.hunkLabel': 'old line {old} → new line {next}',
  'result.kind.add': 'add',
  'result.kind.remove': 'remove',
  'result.kind.replace': 'change',
  'result.applied': 'Applied to the composer',
  'result.undo': 'Undo',
  'result.retry': 'Retry',
  'applied.done': 'Done',

  'question.title': 'A couple of details first',
  'question.hint': 'Answering makes the rewrite sharper; or let the model decide.',
  'question.placeholder': 'Short answers, one per line…',
  'question.submit': 'Rewrite with answers',
  'question.assume': 'Use sensible defaults',

  'error.title': 'Enhancement failed',
  'error.badOutput': 'The model did not return the expected JSON.',
  'error.model': 'No model could be resolved. Pick one in the composer or set it in settings.',
  'error.providerDetail': 'Upstream said',
  'error.timeout': 'The request timed out. Please retry.',
  'error.network': 'Cannot reach the plugin host. Restart DSH and retry.',
  'error.generic': 'Request failed: {message}',

  'settings.title': 'Prompt enhancement',
  'settings.desc': 'Defaults for the ✨ enhance button. Settings stay in this browser and are never uploaded.',
  'settings.section.defaults': 'Defaults',
  'settings.section.model': 'Model',
  'settings.footer.note': 'Settings stay in this browser and are never uploaded.',
  'settings.tab.behavior': 'Enhancement',
  'settings.tab.weixin': 'WeChat Bot',

  'weixin.desc': 'Connect a WeChat bot to this machine: send it a message and the text appears in the composer draft. Fill only, never send.',
  'weixin.onlyFills': 'Nothing is sent back to WeChat. Credentials stay on this machine (~/.dsh/prompt-craft/weixin.json, readable by your account only).',
  'weixin.error': 'Connection error: {message}',
  'weixin.connected': 'Connected',
  'weixin.botId': 'Bot ID: {id}',
  'weixin.connectedAt': 'Authorized: {when}',
  'weixin.queueSize': 'Messages waiting: {n}',
  'weixin.disconnect': 'Disconnect',
  'weixin.qrLabel': 'WeChat bot sign-in QR code',
  'weixin.scanHint': 'Scan this QR code with WeChat and confirm on your phone.',
  'weixin.loginStatus.wait': 'Waiting for the scan…',
  'weixin.loginStatus.scaned': 'Scanned — confirm on your phone',
  'weixin.loginStatus.need_verifycode': 'Enter the number shown in WeChat',
  'weixin.loginStatus.verify_code_blocked': 'Too many attempts — scan again',
  'weixin.loginStatus.confirmed': 'Confirmed — connecting…',
  'weixin.loginStatus.expired': 'QR expired — refresh it',
  'weixin.loginStatus.scaned_but_redirect': 'Scanned — switching hosts…',
  'weixin.verifyLabel': 'Number shown in WeChat',
  'weixin.verifyPlaceholder': 'e.g. 1234',
  'weixin.verifySubmit': 'Submit number',
  'weixin.refreshQr': 'New QR code',
  'weixin.paused': 'Disconnected (WeChat bot sessions expire after 24 hours)',
  'weixin.pausedHint': 'Scan again to resume; credentials stay saved locally.',
  'weixin.login': 'Connect WeChat bot',
  'weixin.idleHint': 'Not connected yet. Generate a QR code and scan it with WeChat.',
  'weixin.autoFill': 'Fill new messages into the composer automatically',
  'weixin.autoFillHint': 'When off, a notice appears and you decide when to fill.',
  'weixin.undo': 'Undo fill',
  'weixin.fill': 'Fill draft',
  'weixin.ignore': 'Ignore these messages',
  'weixin.close': 'Dismiss',
  'weixin.noticeTitle': '{n} WeChat message(s)',
  'weixin.noticeFrom': 'from {from}',
  'settings.language': 'Language',
  'settings.language.auto': 'Follow the DSH UI',
  'settings.language.zh': '中文',
  'settings.language.en': 'English',
  'settings.language.desc': 'Which language the plugin uses for its own copy; by default it follows the DSH interface.',
  'settings.defaultMode': 'Default strength',
  'settings.defaultMode.desc': 'What the ✨ button starts with; the panel can still switch it.',
  'settings.defaultScenario': 'Default scenario',
  'settings.defaultScenario.desc': 'A hint for the model; auto reads it from the draft.',
  'settings.model': 'Model used for enhancement',
  'settings.model.desc': 'Follow the current conversation by default, or pick one of the models this machine already has.',
  'settings.model.session': 'Follow the session model',
  'settings.model.custom': 'Use a specific model',
  'settings.model.sync': '{n} models synced from this machine.',
  'settings.model.empty': 'No local model list yet: open any conversation once, or press "Sync again".',
  'settings.model.refresh': 'Sync again',
  'settings.model.effortShort': 'Reasoning effort (empty uses the model default)',
  'settings.model.provider': 'Provider (e.g. deepseek-account)',
  'settings.model.model': 'Model (e.g. deepseek-v4-flash)',
  'settings.model.effort': 'Reasoning effort (optional)',
  'settings.model.effortPlaceholder': 'e.g. max; empty uses the default',
  'settings.model.hint': 'A specific model overrides the session model; leave empty to follow the session.',
  'settings.model.test': 'Test model',
  'settings.model.testing': 'Testing…',
  'settings.model.testOk': 'Connected · {model} · {ms}s',
  'settings.model.testFail': 'Test failed: {message}',
  'settings.save': 'Save',
  'settings.saved': 'Saved',
};

const DICTIONARIES = { zh: ZH, en: EN };

/**
 * @param {string} locale
 * @returns {Record<string, string>}
 */
function dictionary(locale) {
  return DICTIONARIES[locale] === undefined ? ZH : DICTIONARIES[locale];
}

/**
 * @param {string|undefined} language
 * @returns {'zh'|'en'}
 */
function normalizeLocale(language) {
  if (language === 'zh' || language === 'en') return language;
  const nav = typeof navigator === 'object' && navigator !== null ? navigator : undefined;
  const raw = nav && typeof nav.language === 'string' ? nav.language : '';
  return raw.toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
}

/**
 * @param {string} locale
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
function translate(locale, key, vars) {
  const dict = dictionary(locale);
  let text = dict[key] !== undefined ? dict[key] : (ZH[key] !== undefined ? ZH[key] : key);
  if (vars) {
    for (const name of Object.keys(vars)) {
      text = text.split('{' + name + '}').join(String(vars[name]));
    }
  }
  return text;
}

/**
 * Bind a locale so components do not pass it around.
 * @param {string} locale
 * @returns {(key: string, vars?: Record<string, string|number>) => string}
 */
function createTranslator(locale) {
  return function t(key, vars) {
    return translate(locale, key, vars);
  };
}

module.exports = { normalizeLocale, translate, createTranslator, DICTIONARIES };
