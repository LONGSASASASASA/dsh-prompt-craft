'use strict';

/**
 * The ✨ button in the composer toolbar ("conversation.input.right", i.e. the
 * compact control row right before the model selector).
 */

const React = require('react');
const actions = require('./actions.js');
const store = require('./store.js');
const { createTranslator } = require('./i18n.js');

const h = React.createElement;

/**
 * Four-point star with a small companion star; inherits currentColor.
 * @param {{small?: boolean}} props
 * @returns {any}
 */
function SparkleIcon(props) {
  return h(
    'svg',
    {
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('path', { d: 'M6.4 2.2l1.05 2.55L10 5.8 7.45 6.85 6.4 9.4 5.35 6.85 2.8 5.8l2.55-1.05z' }),
    h('path', { d: 'M11.4 9.2l.6 1.45 1.45.6-1.45.6-.6 1.45-.6-1.45-1.45-.6 1.45-.6z' }),
  );
}

/**
 * @param {Record<string, any>} props
 * @returns {any}
 */
function EnhanceButton(props) {
  store.useSettings();
  const sessionId = props.sessionId || (props.session && props.session.sessionId) || '';
  const state = store.useSessionState(sessionId);
  const t = createTranslator(actions.currentLocale());
  const input = typeof props.useInput === 'function' ? props.useInput(function selectInput(value) { return value; }) : null;
  const draft = input && typeof input.draft === 'string' ? input.draft : '';
  const busy = state.status === 'running';
  const canEnhance = draft.trim().length > 0;

  const onClick = function onClick() {
    if (busy) {
      actions.cancelEnhance(sessionId);
      return;
    }
    if (!canEnhance) return;
    actions.enhance(sessionId, draft, { mode: state.mode || undefined, scenario: state.scenario || undefined });
  };

  let title = t('button.tooltip');
  if (busy) title = t('panel.cancel');
  else if (!canEnhance) title = t('button.empty');

  return h(
    'button',
    {
      type: 'button',
      className: 'dpc-btn',
      'data-active': state.open && state.status !== 'idle' ? 'true' : 'false',
      'data-busy': busy ? 'true' : 'false',
      title: title,
      'aria-label': t('button.label'),
      'aria-expanded': state.open ? 'true' : 'false',
      disabled: !busy && !canEnhance,
      onClick: onClick,
    },
    busy ? h('span', { className: 'dpc-spinner' }) : h(SparkleIcon, null),
  );
}

module.exports = { EnhanceButton, SparkleIcon };
