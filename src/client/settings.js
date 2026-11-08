'use strict';

/**
 * Settings section registered as "提示词增强" / "Prompt enhancement" in the app
 * settings. Everything lives in one card: each row pairs a sentence of copy with
 * its control, and the model row lists the models this machine already has
 * (synced from the conversation's model directory) instead of asking for a
 * provider/model pair from memory.
 *
 * Settings stay in the browser (localStorage) — no credentials, no telemetry.
 */

const React = require('react');
const actions = require('./actions.js');
const store = require('./store.js');
const { createTranslator } = require('./i18n.js');
const { MODES, SCENARIOS } = require('../protocol.cjs');

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
            { type: 'button', className: 'dpc-model-option', onClick: refreshModels },
            t('settings.model.refresh'),
          ),
        ),
        h(
          'div',
          { className: 'dpc-field' },
          h('input', {
            className: 'dpc-input',
            placeholder: t('settings.model.provider'),
            value: draft.provider,
            spellCheck: false,
            onChange: function onChangeProvider(event) {
              update({ provider: event.target.value });
            },
          }),
          h('input', {
            className: 'dpc-input',
            placeholder: t('settings.model.model'),
            value: draft.model,
            spellCheck: false,
            onChange: function onChangeModel(event) {
              update({ model: event.target.value });
            },
          }),
          h('input', {
            className: 'dpc-input',
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
          h('span', { className: 'dpc-model-group-name' }, group.name),
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
                  onClick: function onPick() {
                    update({ provider: group.id, model: model.id });
                  },
                },
                model.name,
              );
            }),
          ),
        );
      }),
      h('p', { className: 'dpc-hint' }, t('settings.model.sync', { n: modelCount })),
      h('input', {
        className: 'dpc-input',
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
      'section',
      { className: 'dpc-card' },
      h(
        'div',
        { className: 'dpc-card-head' },
        h('h3', { className: 'dpc-card-title' }, t('settings.title')),
        h('p', { className: 'dpc-card-desc' }, t('settings.desc')),
      ),
      h(
        'div',
        { className: 'dpc-card-body' },
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
      ),
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
            disabled: false,
          },
          t('settings.save'),
        ),
        justSaved ? h('span', { className: 'dpc-saved' }, t('settings.saved')) : null,
      ),
    ),
  );
}

module.exports = { SettingsSection, Chips };
