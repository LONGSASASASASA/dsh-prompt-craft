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
  'button.tooltip': '用 AI 改写当前草稿：diff 预览、分段接受',
  'button.empty': '先写点内容再增强',

  'panel.title': '提示词增强',
  'panel.running': '正在增强…',
  'panel.cancel': '取消',
  'panel.close': '关闭',

  'mode.label': '力度',
  'mode.light': '轻',
  'mode.standard': '标准',
  'mode.expert': '专家',
  'mode.light.hint': '只理顺表达与结构',
  'mode.standard.hint': '补结构、补约束',
  'mode.expert.hint': '按高质量提示词重写',

  'scenario.label': '场景',
  'scenario.auto': '自动',
  'scenario.code': '代码',
  'scenario.writing': '写作',
  'scenario.research': '调研',
  'scenario.agent': '智能体',
  'scenario.general': '通用',

  'result.summary': '改写说明',
  'result.notes': '主要改动',
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
  'error.timeout': '请求超时，请稍后重试。',
  'error.network': '无法连接插件后端，请重启 DSH 后再试。',
  'error.generic': '请求失败：{message}',

  'settings.title': '提示词增强',
  'settings.desc': '配置 ✨ 增强按钮的默认行为。配置保存在本机浏览器存储里，不会上传。',
  'settings.language': '界面语言',
  'settings.language.auto': '跟随系统',
  'settings.language.zh': '中文',
  'settings.language.en': 'English',
  'settings.defaultMode': '默认力度',
  'settings.defaultScenario': '默认场景',
  'settings.model': '增强使用的模型',
  'settings.model.session': '跟随当前会话模型',
  'settings.model.custom': '指定模型',
  'settings.model.provider': 'Provider（如 deepseek-account）',
  'settings.model.model': 'Model（如 deepseek-v4-flash）',
  'settings.model.effort': '思考强度（可留空）',
  'settings.model.effortPlaceholder': '如 max；留空则用默认',
  'settings.model.hint': '指定后会忽略会话当前模型；留空即跟随会话。',
  'settings.save': '保存',
  'settings.saved': '已保存',
};

const EN = {
  'button.label': 'Enhance prompt',
  'button.tooltip': 'Rewrite the draft with AI: diff preview, per-section accept',
  'button.empty': 'Write something first',

  'panel.title': 'Prompt enhancement',
  'panel.running': 'Enhancing…',
  'panel.cancel': 'Cancel',
  'panel.close': 'Close',

  'mode.label': 'Strength',
  'mode.light': 'Light',
  'mode.standard': 'Standard',
  'mode.expert': 'Expert',
  'mode.light.hint': 'Tidy wording and structure only',
  'mode.standard.hint': 'Add structure and constraints',
  'mode.expert.hint': 'Rewrite as a high-quality prompt',

  'scenario.label': 'Scenario',
  'scenario.auto': 'Auto',
  'scenario.code': 'Code',
  'scenario.writing': 'Writing',
  'scenario.research': 'Research',
  'scenario.agent': 'Agent',
  'scenario.general': 'General',

  'result.summary': 'What changed',
  'result.notes': 'Edits',
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
  'error.timeout': 'The request timed out. Please retry.',
  'error.network': 'Cannot reach the plugin host. Restart DSH and retry.',
  'error.generic': 'Request failed: {message}',

  'settings.title': 'Prompt enhancement',
  'settings.desc': 'Defaults for the ✨ enhance button. Settings stay in this browser and are never uploaded.',
  'settings.language': 'Language',
  'settings.language.auto': 'System',
  'settings.language.zh': '中文',
  'settings.language.en': 'English',
  'settings.defaultMode': 'Default strength',
  'settings.defaultScenario': 'Default scenario',
  'settings.model': 'Model used for enhancement',
  'settings.model.session': 'Follow the session model',
  'settings.model.custom': 'Use a specific model',
  'settings.model.provider': 'Provider (e.g. deepseek-account)',
  'settings.model.model': 'Model (e.g. deepseek-v4-flash)',
  'settings.model.effort': 'Reasoning effort (optional)',
  'settings.model.effortPlaceholder': 'e.g. max; empty uses the default',
  'settings.model.hint': 'A specific model overrides the session model; leave empty to follow the session.',
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
