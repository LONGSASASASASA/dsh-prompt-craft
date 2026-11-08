'use strict';

/**
 * The ✨ button in the composer toolbar ("conversation.input.right", i.e. the
 * compact control row right before the model selector).
 */

const React = require('react');
const actions = require('./actions.js');
const store = require('./store.js');
const { createTranslator } = require('./i18n.js');
const icons = require('./icons.js');
const { startComposerPoller } = require('./weixin.js');

const h = React.createElement;

/** The sparkle glyph, kept exported for the panel/header reuse. */
const SparkleIcon = icons.Sparkle;

/**
 * @param {Record<string, any>} props
 * @returns {any}
 */
function EnhanceButton(props) {
  store.useSettings();
  const sessionId = props.sessionId || (props.session && props.session.sessionId) || '';
  actions.noteSession(sessionId);
  const state = store.useSessionState(sessionId);
  const t = createTranslator(actions.currentLocale());
  const input = typeof props.useInput === 'function' ? props.useInput(function selectInput(value) { return value; }) : null;
  const draft = input && typeof input.draft === 'string' ? input.draft : '';
  const busy = state.status === 'running';
  const canEnhance = draft.trim().length > 0;

  const draftRef = React.useRef(draft);
  draftRef.current = draft;
  const inputActionsRef = React.useRef(props.inputActions || null);
  inputActionsRef.current = props.inputActions || null;

  // WeChat messages are consumed by whichever composer is mounted: the host
  // queues them, this poller fills the visible draft.
  React.useEffect(function startWeixinPoller() {
    if (!sessionId) return undefined;
    return startComposerPoller(
      sessionId,
      function getActions() {
        return inputActionsRef.current;
      },
      function getDraft() {
        return draftRef.current;
      },
    );
  }, [sessionId]);

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
      'data-filled': canEnhance ? 'true' : 'false',
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
