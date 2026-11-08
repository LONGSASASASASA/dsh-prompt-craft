'use strict';

/**
 * Inline SVG icon set for the client half.
 *
 * Rules the design skill enforces, and we follow: icons are SVG (never emoji as
 * UI icons), they inherit `currentColor`, carry no external asset request, and
 * are decorative unless a button supplies its own accessible name.
 */

const React = require('react');

const h = React.createElement;

/**
 * @param {{size?: number, strokeWidth?: number, children: any}} props
 * @returns {any}
 */
function Svg(props) {
  const size = props.size === undefined ? 16 : props.size;
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: props.strokeWidth === undefined ? 1.7 : props.strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    props.children,
  );
}

/** Four-point sparkle with a small companion star. */
function Sparkle(props) {
  return h(
    Svg,
    { size: props.size, strokeWidth: props.strokeWidth },
    h('path', { d: 'M11 3.2l1.7 4.1 4.1 1.7-4.1 1.7L11 14.8 9.3 10.7 5.2 9l4.1-1.7z' }),
    h('path', { d: 'M17.6 14.4l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z' }),
  );
}

/** Check mark. */
function Check(props) {
  return h(Svg, { size: props.size, strokeWidth: 2 }, h('path', { d: 'M4.5 12.5l4.6 4.6L19.5 6.8' }));
}

/** Small filled dot, used as a bullet for lists. */
function Dot(props) {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: props.size === undefined ? 14 : props.size,
      height: props.size === undefined ? 14 : props.size,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('circle', { cx: 12, cy: 12, r: 3.2, fill: 'currentColor' }),
  );
}

/** Close (x). */
function Close(props) {
  return h(Svg, { size: props.size, strokeWidth: 2 }, h('path', { d: 'M6 6l12 12M18 6L6 18' }));
}

/** Downward chevron. */
function Chevron(props) {
  return h(Svg, { size: props.size }, h('path', { d: 'M6 9.5l6 6 6-6' }));
}

/** Circular arrows: refresh / sync. */
function Refresh(props) {
  return h(
    Svg,
    { size: props.size },
    h('path', { d: 'M20 11a8 8 0 0 0-13.7-5.2L4 8' }),
    h('path', { d: 'M4 4v4h4' }),
    h('path', { d: 'M4 13a8 8 0 0 0 13.7 5.2L20 16' }),
    h('path', { d: 'M20 20v-4h-4' }),
  );
}

/** Countersink arrow: undo. */
function Undo(props) {
  return h(
    Svg,
    { size: props.size },
    h('path', { d: 'M9 14L4 9l5-5' }),
    h('path', { d: 'M4 9h9.5a6.5 6.5 0 0 1 0 13H9' }),
  );
}

/** Target ring: the goal block. */
function Target(props) {
  return h(
    Svg,
    { size: props.size },
    h('circle', { cx: 12, cy: 12, r: 8 }),
    h('circle', { cx: 12, cy: 12, r: 3.4 }),
  );
}

/** Rising bars: how the aim was raised. */
function Elevate(props) {
  return h(
    Svg,
    { size: props.size },
    h('path', { d: 'M4 19h4v-6H4z' }),
    h('path', { d: 'M10 19h4V8h-4z' }),
    h('path', { d: 'M16 19h4V4h-4z' }),
  );
}

/** Pencil: edits. */
function Edit(props) {
  return h(
    Svg,
    { size: props.size },
    h('path', { d: 'M4 20h4l10-10-4-4L4 16z' }),
    h('path', { d: 'M13.5 5.5l4 4' }),
  );
}

/** Split diff panes. */
function Compare(props) {
  return h(
    Svg,
    { size: props.size },
    h('rect', { x: 3.5, y: 4.5, width: 7, height: 15, rx: 2 }),
    h('rect', { x: 13.5, y: 4.5, width: 7, height: 15, rx: 2 }),
  );
}

/** Paragraph lines: the before pane. */
function TextLines(props) {
  return h(
    Svg,
    { size: props.size },
    h('path', { d: 'M4 6h16M4 11h16M4 16h10' }),
  );
}

/** Wand-ish prompt lines: the after pane. */
function SparkleLines(props) {
  return h(
    Svg,
    { size: props.size },
    h('path', { d: 'M4 6h11M4 11h7M4 16h9' }),
    h('path', { d: 'M17.5 11.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z' }),
  );
}

/** Alert triangle for failures. */
function Alert(props) {
  return h(
    Svg,
    { size: props.size },
    h('path', { d: 'M12 4.2l8.4 15.2H3.6z' }),
    h('path', { d: 'M12 9.4v4.4M12 16.9h.01' }),
  );
}

module.exports = {
  Sparkle,
  Check,
  Dot,
  Close,
  Chevron,
  Refresh,
  Undo,
  Target,
  Elevate,
  Edit,
  Compare,
  TextLines,
  SparkleLines,
  Alert,
};
