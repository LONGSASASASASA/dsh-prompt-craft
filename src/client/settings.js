'use strict';

/**
 * Settings section registered as "Prompt enhancement" in the app settings.
 * Everything is stored in the browser (localStorage) — no credentials, no
 * telemetry, no host-side config namespace to migrate.
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
 * @param {{label: string, children: any, hint?: string}} props
 * @returns {any}
 */
function Field(props) {
  return h(
    'div',
    { className: 'dpc-field' },
    h('span', { className: 'dpc-field-label' }, props.label),
    props.children,
    props.hint ? h('p', { className: 'dpc-hint' }, props.hint) : null,
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

  return h(
    'div',
    { className: 'dpc-settings' },
    h('div', null, h('h3', { className: 'dpc-settings-title' }, t('settings.title')), h('p', { className: 'dpc-settings-desc' }, t('settings.desc'))),
    h(
      Field,
      { label: t('settings.language') },
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
    h(
      Field,
      { label: t('settings.defaultMode'), hint: t('mode.' + (draft.mode || 'standard') + '.hint') },
      h(Chips, {
        name: t('settings.defaultMode'),
        value: draft.mode,
        options: modeOptions,
        onChange: function onChangeMode(value) {
          update({ mode: value });
        },
      }),
    ),
    h(
      Field,
      { label: t('settings.defaultScenario') },
      h(Chips, {
        name: t('settings.defaultScenario'),
        value: draft.scenario,
        options: scenarioOptions,
        onChange: function onChangeScenario(value) {
          update({ scenario: value });
        },
      }),
    ),
    h(
      Field,
      { label: t('settings.model'), hint: t('settings.model.hint') },
      h(Chips, {
        name: t('settings.model'),
        value: customModel ? 'custom' : 'session',
        options: [
          ['session', t('settings.model.session')],
          ['custom', t('settings.model.custom')],
        ],
        onChange: function onChangeStrategy(value) {
          if (value === 'session') update({ provider: '', model: '', reasoningEffort: '' });
          else update({ provider: draft.provider || 'deepseek-account', model: draft.model });
        },
      }),
    ),
    customModel
      ? h(
          'div',
          { className: 'dpc-field' },
          h(
            'div',
            { className: 'dpc-settings-footer' },
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
          ),
          h('input', {
            className: 'dpc-input',
            placeholder: t('settings.model.effortPlaceholder'),
            value: draft.reasoningEffort,
            spellCheck: false,
            onChange: function onChangeEffort(event) {
              update({ reasoningEffort: event.target.value });
            },
          }),
        )
      : null,
    h(
      'div',
      { className: 'dpc-settings-footer' },
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
  );
}

module.exports = { SettingsSection, Chips };
