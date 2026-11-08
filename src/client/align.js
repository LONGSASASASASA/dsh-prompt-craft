/**
 * Keep docked widgets (the enhancement panel, the WeChat notice) on the composer
 * card's edges.
 *
 * The host renders the composer as a rounded card inside a wider column, and the
 * dock slots (conversation.input.dock) render above that card. Measuring the
 * card itself keeps every docked widget exactly as wide as the input box in any
 * layout - sidebars open or closed, any window width - instead of guessing a
 * padding that only matches one of them.
 *
 * @module
 */

'use strict';

let React = null;
try {
  React = require('react');
} catch (error) {
  React = null;
}

const useLayoutEffect =
  (React && (React.useLayoutEffect || React.useEffect)) ||
  function useLayoutEffectFallback() {};

const useRef =
  (React && React.useRef) ||
  function useRefFallback(initial) {
    return { current: initial === undefined ? null : initial };
  };

/** Every docked widget falls back to this inset when the card cannot be found. */
const FALLBACK_INSET_PX = 16;
/** The host input card uses a large radius (28px); anything >= 16 counts. */
const CARD_RADIUS_PX = 16;

/**
 * The nearest ancestor of the widget that actually occupies space: a dock slot
 * wraps its children in a `display: contents` element whose own rect is empty,
 * so walk up to the composer box that holds both the widget and the input card.
 * @param {any} node
 * @returns {any} the anchor element or null
 */
function findAnchor(node) {
  if (!node) return null;
  let anchor = node.parentElement;
  while (anchor && anchor.parentElement && anchor.getBoundingClientRect().width <= 0) {
    anchor = anchor.parentElement;
  }
  return anchor;
}

/**
 * Resolve the host's rounded input card: the nearest rounded ancestor of the
 * composer editor inside the anchor column.
 * @param {any} anchor
 * @returns {any} the card element or null
 */
function findComposerCard(anchor) {
  if (!anchor || typeof anchor.querySelector !== 'function') return null;
  let card = anchor.querySelector('[data-composer-input]');
  while (card && card !== anchor) {
    const radius =
      typeof getComputedStyle === 'function'
        ? parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0
        : 0;
    if (radius >= CARD_RADIUS_PX) return card;
    card = card.parentElement;
  }
  return null;
}

/**
 * Set the widget's left/right margins so its box matches the composer card.
 * @param {any} node the docked widget
 * @returns {void}
 */
function alignToComposer(node) {
  if (!node || !node.style) return;
  const anchor = findAnchor(node);
  if (!anchor) return;
  const parentRect = anchor.getBoundingClientRect();
  const card = findComposerCard(anchor);
  let cardRect = null;
  if (card && card !== anchor && typeof card.getBoundingClientRect === 'function') {
    cardRect = card.getBoundingClientRect();
  }
  if (!cardRect || !(cardRect.width > 0)) {
    node.style.marginLeft = FALLBACK_INSET_PX + 'px';
    node.style.marginRight = FALLBACK_INSET_PX + 'px';
    return;
  }
  const left = Math.max(0, Math.round(cardRect.left - parentRect.left));
  const right = Math.max(0, Math.round(parentRect.right - cardRect.right));
  node.style.marginLeft = left + 'px';
  node.style.marginRight = right + 'px';
}

/**
 * Keep the widget aligned while it is mounted: once on layout, again whenever
 * the column resizes, and on window resizes.
 * @param {{current: any}} ref
 * @param {readonly any[]} [deps]
 * @returns {void}
 */
function useComposerAlign(ref, deps) {
  useLayoutEffect(function syncComposerWidth() {
    const node = ref.current;
    if (!node) return undefined;
    alignToComposer(node);
    const relayout = function relayout() {
      alignToComposer(ref.current);
    };
    const anchor = findAnchor(node);
    let observer = null;
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
  }, deps || []);
}

module.exports = {
  CARD_RADIUS_PX,
  FALLBACK_INSET_PX,
  alignToComposer,
  findAnchor,
  findComposerCard,
  useComposerAlign,
  useRef,
};
