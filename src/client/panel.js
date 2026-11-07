'use strict';

/**
 * Inline panel rendered above the composer ("conversation.input.dock"): shows
 * progress, clarifying questions, the diff review with per-section accept, the
 * before/after comparison and the refine loop.
 */

const React = require('react');
const actions = require('./actions.js');
const store = require('./store.js');
const { createTranslator } = require('./i18n.js');
const { MODES, SCENARIOS } = require('../protocol.cjs');

const h = React.createElement;
const useLayoutEffect = React.useLayoutEffect || React.useEffect || function useLayoutEffectFallback() {};
const useRef = React.useRef || function useRefFallback(initial) {
  return { current: initial === undefined ? null : initial };
};

/**
 * Keep the panel's left and right edges on the composer card's edges. The card
 * is the nearest rounded ancestor of the composer editor; the panel is docked
 * in the same stack, so the card insets decide the panel width in every layout
 * (sidebars open or closed, any window width) instead of a guessed padding.
 * @param {any} panel
 */
/**
 * The nearest ancestor of the panel that actually occupies space: the dock slot
 * renders the panel through a `display: contents` wrapper, whose own rect is
 * empty, so walk up to the composer box that holds both the panel and the input
 * card.
 * @param {any} panel
 * @returns {any} the anchor element or null
 */
function panelAnchor(panel) {
  if (!panel) return null;
  let anchor = panel.parentElement;
  while (anchor && anchor.parentElement && anchor.getBoundingClientRect().width <= 0) {
    anchor = anchor.parentElement;
  }
  return anchor;
}

/**
 * Keep the panel's left and right edges on the composer card's edges. The card
 * is the nearest rounded ancestor of the composer editor; the panel is docked
 * in the same box, so the card insets decide the panel width in every layout
 * (sidebars open or closed, any window width) instead of a guessed padding.
 * @param {any} panel
 */
function alignToComposer(panel) {
  const anchor = panelAnchor(panel);
  if (!panel || !anchor) return;
  const parentRect = anchor.getBoundingClientRect();
  let card = typeof anchor.querySelector === 'function' ? anchor.querySelector('[data-composer-input]') : null;
  while (card && card !== anchor) {
    const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
    if (radius >= 16) break;
    card = card.parentElement;
  }
  if (!card || card === anchor || typeof card.getBoundingClientRect !== 'function') {
    panel.style.marginLeft = '16px';
    panel.style.marginRight = '16px';
    return;
  }
  const cardRect = card.getBoundingClientRect();
  if (!(cardRect.width > 0)) return;
  const left = Math.max(0, Math.round(cardRect.left - parentRect.left));
  const right = Math.max(0, Math.round(parentRect.right - cardRect.right));
  panel.style.marginLeft = left + 'px';
  panel.style.marginRight = right + 'px';
}

/**
 * @param {any} meta response meta from the host
 * @returns {string}
 */
function metaLabel(meta) {
  if (!meta) return '';
  const model = typeof meta.model === 'string' ? meta.model : '';
  const provider = typeof meta.provider === 'string' ? meta.provider : '';
  const elapsed = typeof meta.elapsedMs === 'number' ? Math.max(1, Math.round(meta.elapsedMs / 100) / 10) + 's' : '';
  const head = [provider, model].filter(Boolean).join('/');
  return [head, elapsed].filter(Boolean).join(' · ');
}

/**
 * @param {(key: string, vars?: Record<string, string|number>) => string} t
 * @param {any} error
 * @returns {string}
 */
function errorText(t, error) {
  if (!error) return '';
  if (error.code === 'BAD_MODEL_OUTPUT') return t('error.badOutput');
  if (error.code === 'MODEL_UNRESOLVED') return t('error.model');
  if (error.code === 'TIMEOUT') return t('error.timeout');
  if (error.code === 'NETWORK') return t('error.network');
  return t('error.generic', { message: error.message || error.code || 'unknown' });
}

/**
 * @param {{options: Array<[string, string]>, value: string, onChange: (value: string) => void, name: string, disabled?: boolean}} props
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
          disabled: props.disabled === true,
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
 * @param {any} props
 * @returns {any}
 */
function EnhancePanel(props) {
  const settings = store.useSettings();
  const sessionId = props.sessionId || (props.session && props.session.sessionId) || '';
  const state = store.useSessionState(sessionId);
  const t = createTranslator(actions.currentLocale());
  const inputActions = props.inputActions || (props.session && props.session.inputActions) || null;
  const input = props.input || (typeof props.useInput === 'function' ? props.useInput(function selectInput(value) { return value; }) : null);
  void input;
  const panelRef = useRef(null);

  useLayoutEffect(function syncPanelWidth() {
    const panel = panelRef.current;
    if (!panel) return undefined;
    alignToComposer(panel);
    const relayout = function relayout() {
      alignToComposer(panelRef.current);
    };
    let observer = null;
    const anchor = panelAnchor(panel);
    if (typeof ResizeObserver === 'function' && anchor) {
      observer = new ResizeObserver(relayout);
      observer.observe(anchor);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', relayout);
    }
    return function cleanup() {
      if (observer) observer.disconnect();
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', relayout);
      }
    };
  }, [state.open, sessionId]);

  if (!state.open) return null;

  const busy = state.status === 'running';
  const mode = state.mode || settings.mode;
  const scenario = state.scenario || settings.scenario;
  const changeHunks = state.hunks.filter(function isChange(hunk) {
    return hunk.kind !== 'same';
  });
  const acceptedCount = changeHunks.filter(function isAccepted(hunk) {
    return state.accepted[hunk.id] === true;
  }).length;
  const hasResult = state.result !== null && state.result.kind === 'enhanced' && changeHunks.length > 0;
  const questions = state.result !== null && state.result.kind === 'questions' && Array.isArray(state.result.questions) ? state.result.questions : [];

  const onClose = function onClose() {
    actions.closePanel(sessionId);
  };
  const onCancel = function onCancel() {
    actions.cancelEnhance(sessionId);
  };
  const onModeChange = function onModeChange(value) {
    store.setSessionState(sessionId, { mode: value });
  };
  const onScenarioChange = function onScenarioChange(value) {
    store.setSessionState(sessionId, { scenario: value });
  };
  const onToggleHunk = function onToggleHunk(hunkId, checked) {
    actions.toggleHunk(sessionId, hunkId, checked);
  };
  const onApplyAll = function onApplyAll() {
    actions.toggleAllHunks(sessionId, true);
    actions.applyResult(sessionId, inputActions);
  };
  const onApplySelected = function onApplySelected() {
    actions.applyResult(sessionId, inputActions);
  };
  const onDiscard = function onDiscard() {
    actions.discard(sessionId);
  };
  const onUndo = function onUndo() {
    actions.undoApplied(sessionId, inputActions);
  };
  const onRetry = function onRetry() {
    actions.retry(sessionId);
  };
  const onAnswersChange = function onAnswersChange(event) {
    store.setSessionState(sessionId, { answers: event.target.value });
  };
  const onSubmitAnswers = function onSubmitAnswers() {
    actions.enhanceWithAnswers(sessionId);
  };
  const onAssumeDefaults = function onAssumeDefaults() {
    actions.enhanceAssumingDefaults(sessionId);
  };
  const onToggleRefine = function onToggleRefine() {
    store.setSessionState(sessionId, { showRefine: !state.showRefine });
  };
  const onRefineChange = function onRefineChange(event) {
    store.setSessionState(sessionId, { refineText: event.target.value });
  };
  const onRefineSubmit = function onRefineSubmit() {
    actions.refine(sessionId, state.refineText);
  };
  const onViewChange = function onViewChange(value) {
    store.setSessionState(sessionId, { view: value });
  };

  const header = h(
    'div',
    { className: 'dpc-head' },
    h(
      'div',
      { className: 'dpc-head-main' },
      h('span', { className: 'dpc-title' }, t('panel.title')),
      metaLabel(state.meta) ? h('span', { className: 'dpc-meta' }, metaLabel(state.meta)) : null,
    ),
    h(
      'div',
      { className: 'dpc-head-actions' },
      busy
        ? h(
            'button',
            { type: 'button', className: 'dpc-action', 'data-variant': 'ghost', onClick: onCancel },
            t('panel.cancel'),
          )
        : h(
            'button',
            {
              type: 'button',
              className: 'dpc-btn dpc-close',
              title: t('panel.close'),
              'aria-label': t('panel.close'),
              onClick: onClose,
            },
            '×',
          ),
    ),
  );

  const controls = busy
    ? null
    : h(
        'div',
        { className: 'dpc-row' },
        h('span', { className: 'dpc-row-label' }, t('mode.label')),
        h(Chips, {
          name: t('mode.label'),
          value: mode,
          options: MODES.map(function renderMode(value) {
            return [value, t('mode.' + value)];
          }),
          onChange: onModeChange,
        }),
        h('span', { className: 'dpc-row-label' }, t('scenario.label')),
        h(Chips, {
          name: t('scenario.label'),
          value: scenario,
          options: SCENARIOS.map(function renderScenario(value) {
            return [value, t('scenario.' + value)];
          }),
          onChange: onScenarioChange,
        }),
      );

  const running = busy
    ? h(
        'div',
        { className: 'dpc-row' },
        h('span', { className: 'dpc-spinner' }),
        h('span', null, t('panel.running')),
      )
    : null;

  const errorBlock = state.status === 'error' && state.error
    ? h(
        'div',
        { className: 'dpc-field' },
        h('p', { className: 'dpc-error' }, t('error.title') + '：' + errorText(t, state.error)),
        h(
          'div',
          { className: 'dpc-settings-footer' },
          h('button', { type: 'button', className: 'dpc-action', onClick: onRetry }, t('result.retry')),
          h('button', { type: 'button', className: 'dpc-action', 'data-variant': 'ghost', onClick: onDiscard }, t('result.discard')),
        ),
      )
    : null;

  const questionsBlock = questions.length > 0
    ? h(
        'div',
        { className: 'dpc-field' },
        h('p', { className: 'dpc-field-label' }, t('question.title')),
        h('p', { className: 'dpc-hint' }, t('question.hint')),
        h(
          'ol',
          { className: 'dpc-notes' },
          questions.map(function renderQuestion(question, index) {
            return h('li', { key: 'q' + index }, typeof question === 'string' ? question : String(question));
          }),
        ),
        h('textarea', {
          className: 'dpc-textarea',
          placeholder: t('question.placeholder'),
          value: state.answers,
          onChange: onAnswersChange,
        }),
        h(
          'div',
          { className: 'dpc-footer' },
          h('button', { type: 'button', className: 'dpc-action', 'data-variant': 'ghost', onClick: onAssumeDefaults }, t('question.assume')),
          h(
            'div',
            { className: 'dpc-footer-end' },
            h(
              'button',
              {
                type: 'button',
                className: 'dpc-action',
                'data-variant': 'primary',
                disabled: !state.answers.trim(),
                onClick: onSubmitAnswers,
              },
              t('question.submit'),
            ),
          ),
        ),
      )
    : null;

  const enhanced = state.result !== null && state.result.kind === 'enhanced' ? state.result : null;

  const goalBlock = enhanced && enhanced.goal
    ? h(
        'div',
        { className: 'dpc-goal' },
        h('span', { className: 'dpc-goal-label' }, t('result.goal')),
        h('p', { className: 'dpc-goal-text' }, enhanced.goal),
      )
    : null;

  const summaryBlock = enhanced && (enhanced.summary || (enhanced.notes && enhanced.notes.length > 0) || (enhanced.elevation && enhanced.elevation.length > 0))
    ? h(
        'div',
        null,
        enhanced.summary ? h('p', { className: 'dpc-summary' }, enhanced.summary) : null,
        enhanced.elevation && enhanced.elevation.length > 0
          ? h(
              'div',
              { className: 'dpc-block' },
              h('span', { className: 'dpc-goal-label' }, t('result.elevation')),
              h(
                'ul',
                { className: 'dpc-notes' },
                enhanced.elevation.map(function renderElevation(item, index) {
                  return h('li', { key: 'e' + index }, item);
                }),
              ),
            )
          : null,
        enhanced.notes && enhanced.notes.length > 0
          ? h(
              'div',
              { className: 'dpc-block' },
              h('span', { className: 'dpc-goal-label' }, t('result.notes')),
              h(
                'ul',
                { className: 'dpc-notes' },
                enhanced.notes.map(function renderNote(note, index) {
                  return h('li', { key: 'n' + index }, note);
                }),
              ),
            )
          : null,
      )
    : null;

  const hunkList = hasResult && state.view === 'sections'
    ? h(
        'div',
        { className: 'dpc-hunks' },
        changeHunks.map(function renderHunk(hunk) {
          const label = t('result.hunkLabel', { old: hunk.oldStart || '-', next: hunk.newStart || '-' });
          return h(
            'div',
            { className: 'dpc-hunk', key: hunk.id },
            h(
              'label',
              { className: 'dpc-hunk-head' },
              h('input', {
                type: 'checkbox',
                checked: state.accepted[hunk.id] === true,
                onChange: function onToggle(event) {
                  onToggleHunk(hunk.id, event.target.checked);
                },
              }),
              h('span', null, label),
              h(
                'span',
                { className: 'dpc-badge', style: { marginLeft: 'auto' } },
                t('result.kind.' + hunk.kind),
              ),
            ),
            h(
              'div',
              { className: 'dpc-hunk-lines' },
              hunk.oldLines.map(function renderOld(line, index) {
                return h('div', { className: 'dpc-line', 'data-kind': 'remove', key: 'o' + index }, '- ' + line);
              }),
              hunk.newLines.map(function renderNew(line, index) {
                return h('div', { className: 'dpc-line', 'data-kind': 'add', key: 'a' + index }, '+ ' + line);
              }),
            ),
          );
        }),
      )
    : null;

  const compareView = hasResult && state.view === 'compare'
    ? h(
        'div',
        { className: 'dpc-split' },
        h(
          'div',
          { className: 'dpc-pane' },
          h('div', { className: 'dpc-pane-title' }, t('result.before')),
          h('pre', { className: 'dpc-pane-body' }, state.base),
        ),
        h(
          'div',
          { className: 'dpc-pane' },
          h('div', { className: 'dpc-pane-title' }, t('result.after')),
          h('pre', { className: 'dpc-pane-body' }, state.result !== null ? state.result.prompt : ''),
        ),
      )
    : null;

  const emptyResult = state.result !== null && state.result.kind === 'enhanced' && changeHunks.length === 0
    ? h('p', { className: 'dpc-hint' }, t('result.noChanges'))
    : null;

  const viewToggle = hasResult
    ? h(
        'div',
        { className: 'dpc-row' },
        h(Chips, {
          name: 'view',
          value: state.view,
          options: [
            ['sections', t('result.view.sections')],
            ['compare', t('result.view.compare')],
          ],
          onChange: onViewChange,
        }),
      )
    : null;

  const refineBlock = state.status === 'result' || state.status === 'applied'
    ? h(
        'div',
        { className: 'dpc-field' },
        state.showRefine
          ? h(
              'div',
              { className: 'dpc-row', style: { alignItems: 'stretch' } },
              h('textarea', {
                className: 'dpc-textarea',
                placeholder: t('result.refinePlaceholder'),
                value: state.refineText,
                onChange: onRefineChange,
                style: { flex: '1 1 280px' },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dpc-action',
                  'data-variant': 'primary',
                  disabled: !state.refineText.trim(),
                  onClick: onRefineSubmit,
                },
                t('result.refineSubmit'),
              ),
            )
          : null,
      )
    : null;

  const resultFooter = hasResult && state.status !== 'applied'
    ? h(
        'div',
        { className: 'dpc-footer' },
        h('button', { type: 'button', className: 'dpc-action', 'data-variant': 'ghost', onClick: onDiscard }, t('result.discard')),
        h(
          'div',
          { className: 'dpc-footer-end' },
          h('button', { type: 'button', className: 'dpc-action', onClick: onToggleRefine }, t('result.refine')),
          h(
            'button',
            { type: 'button', className: 'dpc-action', onClick: onApplySelected, disabled: acceptedCount === 0 },
            t('result.acceptSelected', { n: acceptedCount, total: changeHunks.length }),
          ),
          h('button', { type: 'button', className: 'dpc-action', 'data-variant': 'primary', onClick: onApplyAll }, t('result.acceptAll')),
        ),
      )
    : null;

  const appliedFooter = state.status === 'applied'
    ? h(
        'div',
        { className: 'dpc-footer' },
        h('span', { className: 'dpc-saved' }, t('result.applied')),
        h(
          'div',
          { className: 'dpc-footer-end' },
          h('button', { type: 'button', className: 'dpc-action', onClick: onUndo }, t('result.undo')),
          h('button', { type: 'button', className: 'dpc-action', onClick: onToggleRefine }, t('result.refine')),
          h('button', { type: 'button', className: 'dpc-action', 'data-variant': 'primary', onClick: onClose }, t('applied.done')),
        ),
      )
    : null;

  return h(
    'div',
    { className: 'dpc-panel', ref: panelRef, role: 'region', 'aria-label': t('panel.title') },
    h(
      'div',
      { className: 'dpc-panel-inner' },
      header,
      controls,
      running,
      errorBlock,
      questionsBlock,
      emptyResult,
      goalBlock,
      summaryBlock,
      viewToggle,
      hunkList,
      compareView,
      refineBlock,
      resultFooter,
      appliedFooter,
    ),
  );
}

module.exports = { EnhancePanel };
