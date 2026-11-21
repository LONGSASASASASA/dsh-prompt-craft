'use strict';

/**
 * Follow-up suggestions strip.
 *
 * After a turn finishes, the strip asks the host for 3-4 messages the user
 * might want to send next and renders them as radio rows above the composer.
 * Choosing a row lights it up, then writes its text into the composer draft
 * through `inputActions.setDraft` - the plugin never submits the draft on its
 * own and hides the strip when the host could not produce usable options.
 */

const React = require('react');
const { translate, normalizeLocale } = require('./i18n.js');
const store = require('./store.js');
const actions = require('./actions.js');
const icons = require('./icons.js');
const { useComposerAlign } = require('./align.js');

const h = React.createElement;
const useEffect = React.useEffect;
const useState = React.useState;
const useRef = React.useRef || function useRefFallback(initial) {
  return { current: initial === undefined ? null : initial };
};

/**
 * The session record can receive the final assistant message a beat after
 * `running` flips to false, so wait briefly before asking the host to read it.
 */
const TURN_SETTLE_MS = 300;

/**
 * How long a row stays lit before its text lands in the composer. Long enough
 * to read the selection feedback, short enough not to feel laggy.
 */
const SELECT_FILL_MS = 240;

/**
 * @param {unknown} value
 * @returns {string}
 */
function readId(value) {
  return typeof value === 'string' && value ? value : '';
}

/**
 * Session snapshot selector for the turn lifecycle (`running`).
 * @param {{ running?: boolean } | null | undefined} snapshot
 * @returns {boolean}
 */
function selectRunning(snapshot) {
  return !!(snapshot && snapshot.running);
}

/**
 * Strip above the composer listing the suggested next messages.
 * @param {any} props session-scope slot props
 * @returns {any}
 */
function FollowupBar(props) {
  const sessionId = readId(props.sessionId) || readId(props.session && props.session.sessionId);
  const inputActions = props.inputActions || (props.session && props.session.inputActions) || null;
  const state = store.useSessionState(sessionId);
  const options = Array.isArray(state.followups) ? state.followups : [];
  const useSession = typeof props.useSession === 'function' ? props.useSession : null;
  const running = useSession ? !!useSession(selectRunning) : null;
  const barRef = useRef(null);
  useComposerAlign(barRef, [options.length, sessionId]);

  const [selected, setSelected] = useState(-1);
  const selectTimer = useRef(null);
  const previousRunning = useRef(null);
  const previousSession = useRef(sessionId);

  useEffect(
    function watchTurnCompletion() {
      // The dock component can be reused for another session; re-baseline
      // instead of comparing against the previous session's run state.
      if (previousSession.current !== sessionId) {
        previousSession.current = sessionId;
        previousRunning.current = running;
        return undefined;
      }
      const previous = previousRunning.current;
      previousRunning.current = running;
      if (previous === true && running === false) {
        const timer = setTimeout(function generate() {
          actions.generateFollowups(sessionId);
        }, TURN_SETTLE_MS);
        return function cancel() {
          clearTimeout(timer);
        };
      }
      if (previous === false && running === true) {
        // A new turn makes the previous suggestions stale.
        actions.clearFollowups(sessionId);
      }
      return undefined;
    },
    [running, sessionId],
  );

  // If the options disappear while a selection is pending (a new turn started,
  // the strip was dismissed, ...) drop the highlight and the fill timer.
  useEffect(
    function dropStaleSelection() {
      if (selected < 0) return undefined;
      if (options.length === 0) {
        if (selectTimer.current) {
          clearTimeout(selectTimer.current);
          selectTimer.current = null;
        }
        setSelected(-1);
      }
      return undefined;
    },
    [selected, options.length],
  );

  useEffect(function cancelFillOnUnmount() {
    return function cleanup() {
      if (selectTimer.current) {
        clearTimeout(selectTimer.current);
        selectTimer.current = null;
      }
    };
  }, []);

  if (options.length === 0) return null;
  const locale = props.locale ? normalizeLocale(props.locale) : actions.currentLocale();
  const t = (key, vars) => translate(locale, key, vars);

  /**
   * Light the row up first, then hand its text to the composer draft.
   * @param {number} index
   * @param {string} text
   * @returns {void}
   */
  function choose(index, text) {
    if (selected >= 0) return;
    setSelected(index);
    if (selectTimer.current) clearTimeout(selectTimer.current);
    selectTimer.current = setTimeout(function commit() {
      selectTimer.current = null;
      actions.applyFollowup(sessionId, inputActions, text);
      setSelected(-1);
    }, SELECT_FILL_MS);
  }

  const rows = options.map(function row(text, index) {
    const lit = selected === index;
    return h(
      'button',
      {
        key: 'followup-' + index,
        type: 'button',
        role: 'radio',
        'aria-checked': lit ? 'true' : 'false',
        'data-selected': lit ? 'true' : 'false',
        className: 'dpc-followups-option',
        title: text,
        onClick: function select() {
          choose(index, text);
        },
      },
      h('span', { className: 'dpc-followups-text' }, text),
      h('span', { className: 'dpc-followups-radio', 'aria-hidden': 'true' }),
    );
  });

  return h(
    'div',
    {
      className: 'dpc-followups',
      role: 'group',
      'aria-label': t('followups.title'),
      ref: barRef,
    },
    h(
      'div',
      { className: 'dpc-followups-head' },
      h(
        'span',
        { className: 'dpc-followups-mark', 'aria-hidden': 'true' },
        h(icons.SparkleLines, { size: 14 }),
        h('span', { className: 'dpc-followups-spark' }),
        h('span', { className: 'dpc-followups-spark' }),
      ),
      h('span', { className: 'dpc-followups-label' }, t('followups.title')),
      h(
        'button',
        {
          type: 'button',
          className: 'dpc-btn dpc-close',
          title: t('followups.close'),
          'aria-label': t('followups.close'),
          onClick: function dismiss() {
            actions.clearFollowups(sessionId);
          },
        },
        h('span', { 'aria-hidden': 'true' }, '\u00d7'),
      ),
    ),
    h('div', { className: 'dpc-followups-list', role: 'radiogroup', 'aria-label': t('followups.title') }, rows),
  );
}

module.exports = {
  FollowupBar,
  TURN_SETTLE_MS,
  SELECT_FILL_MS,
  selectRunning,
};
