'use strict';

/**
 * Settings section registered as "提示词增强" / "Prompt enhancement" in the app
 * settings.
 *
 * Layout: a page header (mark + title + one sentence of context) above a single
 * card that is split into short sections. Each row pairs a sentence of copy with
 * its control, and the model section lists the models this machine already has
 * (synced from the conversation's model directory) as selectable tiles instead
 * of asking for a provider/model pair from memory.
 *
 * Settings stay in the browser (localStorage) — no credentials, no telemetry.
 */

const React = require('react');
const actions = require('./actions.js');
const store = require('./store.js');
const { createTranslator } = require('./i18n.js');
const { MODES, SCENARIOS } = require('../protocol.cjs');
const icons = require('./icons.js');

const h = React.createElement;

/**
 * @param {{options: Array<[string, string]>, value: string, onChange: (value: string) => void, name: string}} props
 * @returns {any}
 */
function Chips(props) {
  return h(
    'div',
    { className: 'dpc-chip-group', role: 'radiogroup', 'aria-label': props.name },
    props.options.map(function renderChip(option) {
      const value = option[0];
      return h(
        'button',
        {
          key: value,
          type: 'button',
          className: 'dpc-chip',
          role: 'radio',
          'aria-checked': props.value === value ? 'true' : 'false',
          'data-selected': props.value === value ? 'true' : 'false',
          onClick: function onSelect() {
            props.onChange(value);
          },
        },
        option[1],
      );
    }),
  );
}

/**
 * @param {Record<string, any>} props
 * @returns {any}
 */
function SettingsSection(props) {
  const saved = store.useSettings();
  const [draft, setDraft] = React.useState(saved);
  const [justSaved, setJustSaved] = React.useState(false);
  const [, bumpRevision] = React.useState(0);
  const t = createTranslator(actions.currentLocale());

  React.useEffect(
    function syncFromStore() {
      setDraft(saved);
    },
    [saved],
  );

  React.useEffect(
    function clearSavedFlag() {
      if (!justSaved) return undefined;
      const timer = setTimeout(function reset() {
        setJustSaved(false);
      }, 2000);
      return function cleanup() {
        clearTimeout(timer);
      };
    },
    [justSaved],
  );

  React.useEffect(function loadCatalogOnce() {
    actions.refreshModelCatalog().then(function settled() {
      bumpRevision(function next(value) {
        return value + 1;
      });
    });
    return undefined;
  }, []);

  const update = function update(patch) {
    setDraft(function apply(next) {
      return Object.assign({}, next, patch);
    });
    setJustSaved(false);
  };

  const save = function save() {
    store.saveSettings(draft);
    setJustSaved(true);
  };

  const modeOptions = MODES.map(function modeOption(mode) {
    return [mode, t('mode.' + mode)];
  });
  const scenarioOptions = SCENARIOS.map(function scenarioOption(scenario) {
    return [scenario, t('scenario.' + scenario)];
  });

  const customModel = draft.provider.trim().length > 0 || draft.model.trim().length > 0;
  const catalog = actions.modelCatalog();
  const groups = catalog ? catalog.groups : [];
  let modelCount = 0;
  for (const group of groups) modelCount += group.models.length;

  const refreshModels = function refreshModels() {
    actions.refreshModelCatalog().then(function settled() {
      bumpRevision(function next(value) {
        return value + 1;
      });
    });
  };

  const modelPicker = function modelPicker() {
    if (modelCount === 0) {
      return h(
        'div',
        { className: 'dpc-model-list' },
        h('p', { className: 'dpc-hint' }, t('settings.model.empty')),
        h(
          'div',
          { className: 'dpc-model-options' },
          h(
            'button',
            { type: 'button', className: 'dpc-action', onClick: refreshModels },
            h(icons.Refresh, { size: 13 }),
            t('settings.model.refresh'),
          ),
        ),
        h(
          'div',
          { className: 'dpc-field' },
          h('label', { className: 'dpc-setting-desc', htmlFor: 'dpc-provider' }, t('settings.model.provider')),
          h('input', {
            id: 'dpc-provider',
            className: 'dpc-input',
            placeholder: 'deepseek-account',
            value: draft.provider,
            spellCheck: false,
            onChange: function onChangeProvider(event) {
              update({ provider: event.target.value });
            },
          }),
          h('label', { className: 'dpc-setting-desc', htmlFor: 'dpc-model-id' }, t('settings.model.model')),
          h('input', {
            id: 'dpc-model-id',
            className: 'dpc-input',
            placeholder: 'deepseek-v4-flash',
            value: draft.model,
            spellCheck: false,
            onChange: function onChangeModel(event) {
              update({ model: event.target.value });
            },
          }),
          h('input', {
            className: 'dpc-input',
            'aria-label': t('settings.model.effortPlaceholder'),
            placeholder: t('settings.model.effortPlaceholder'),
            value: draft.reasoningEffort,
            spellCheck: false,
            onChange: function onChangeEffort(event) {
              update({ reasoningEffort: event.target.value });
            },
          }),
        ),
      );
    }
    return h(
      'div',
      { className: 'dpc-model-list' },
      groups.map(function renderGroup(group) {
        return h(
          'div',
          { key: group.id, className: 'dpc-model-group' },
          h('span', { className: 'dpc-model-group-name' }, h(icons.Dot, { size: 10 }), group.name),
          h(
            'div',
            { className: 'dpc-model-options' },
            group.models.map(function renderModel(model) {
              const selected = draft.provider === group.id && draft.model === model.id;
              return h(
                'button',
                {
                  key: model.id,
                  type: 'button',
                  className: 'dpc-model-option',
                  'data-selected': selected ? 'true' : 'false',
                  'aria-pressed': selected ? 'true' : 'false',
                  title: group.name + ' / ' + model.id,
                  onClick: function onPick() {
                    update({ provider: group.id, model: model.id });
                  },
                },
                selected ? h(icons.Check, { size: 13 }) : null,
                model.name,
              );
            }),
          ),
        );
      }),
      h(
        'div',
        { className: 'dpc-row' },
        h('p', { className: 'dpc-hint' }, t('settings.model.sync', { n: modelCount })),
        h(
          'button',
          { type: 'button', className: 'dpc-action', 'data-variant': 'ghost', onClick: refreshModels },
          h(icons.Refresh, { size: 13 }),
          t('settings.model.refresh'),
        ),
      ),
      h('input', {
        className: 'dpc-input',
        'aria-label': t('settings.model.effortShort'),
        placeholder: t('settings.model.effortShort'),
        value: draft.reasoningEffort,
        spellCheck: false,
        onChange: function onChangeEffort(event) {
          update({ reasoningEffort: event.target.value });
        },
      }),
    );
  };

  const row = function row(key, titleKey, descKey, control) {
    return h(
      'div',
      { key: key, className: 'dpc-setting-row' },
      h(
        'div',
        { className: 'dpc-setting-text' },
        h('p', { className: 'dpc-setting-title' }, t(titleKey)),
        descKey ? h('p', { className: 'dpc-setting-desc' }, t(descKey)) : null,
      ),
      h('div', { className: 'dpc-setting-control' }, control),
    );
  };

  return h(
    'div',
    { className: 'dpc-settings' },
    h(
      'header',
      { className: 'dpc-hero' },
      h('span', { className: 'dpc-hero-mark' }, h(icons.Sparkle, { size: 22, strokeWidth: 1.8 })),
      h(
        'div',
        { className: 'dpc-hero-main' },
        h('h2', { className: 'dpc-hero-title' }, t('settings.title')),
        h('p', { className: 'dpc-hero-desc' }, t('settings.desc')),
      ),
    ),
    h(
      'section',
      { className: 'dpc-card', 'aria-label': t('settings.title') },
      h('div', { className: 'dpc-section-head' }, t('settings.section.defaults')),
      row(
        'language',
        'settings.language',
        'settings.language.desc',
        h(Chips, {
          name: t('settings.language'),
          value: draft.locale,
          options: [
            ['auto', t('settings.language.auto')],
            ['zh', t('settings.language.zh')],
            ['en', t('settings.language.en')],
          ],
          onChange: function onChangeLocale(value) {
            update({ locale: value });
          },
        }),
      ),
      row(
        'mode',
        'settings.defaultMode',
        'settings.defaultMode.desc',
        h(Chips, {
          name: t('settings.defaultMode'),
          value: draft.mode,
          options: modeOptions,
          onChange: function onChangeMode(value) {
            update({ mode: value });
          },
        }),
      ),
      row(
        'scenario',
        'settings.defaultScenario',
        'settings.defaultScenario.desc',
        h(Chips, {
          name: t('settings.defaultScenario'),
          value: draft.scenario,
          options: scenarioOptions,
          onChange: function onChangeScenario(value) {
            update({ scenario: value });
          },
        }),
      ),
      h('div', { className: 'dpc-section-head' }, t('settings.section.model')),
      row(
        'model',
        'settings.model',
        'settings.model.desc',
        h(Chips, {
          name: t('settings.model'),
          value: customModel ? 'custom' : 'session',
          options: [
            ['session', t('settings.model.session')],
            ['custom', t('settings.model.custom')],
          ],
          onChange: function onChangeStrategy(value) {
            if (value === 'session') update({ provider: '', model: '', reasoningEffort: '' });
          },
        }),
      ),
      h('div', { className: 'dpc-model-panel' }, modelPicker()),
      h(
        'div',
        { className: 'dpc-card-foot' },
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-action',
            'data-variant': 'primary',
            onClick: save,
          },
          t('settings.save'),
        ),
        justSaved ? h('span', { className: 'dpc-saved' }, h(icons.Check, { size: 13 }), t('settings.saved')) : null,
        h('span', { className: 'dpc-hint', style: { marginLeft: 'auto' } }, t('settings.footer.note')),
      ),
    ),
  );
}

module.exports = { SettingsSection, Chips };
