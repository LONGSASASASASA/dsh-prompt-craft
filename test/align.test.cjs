'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const align = require('../src/client/align.js');

function fakeElement(props) {
  return Object.assign({ style: {}, parentElement: null }, props);
}

function fixedRect(left, right) {
  return function getBoundingClientRect() {
    return { left: left, right: right, width: right - left, top: 0, bottom: 0, height: 0 };
  };
}

function withComputedStyle(radiusOf, run) {
  const original = global.getComputedStyle;
  global.getComputedStyle = function getComputedStyle(element) {
    return { borderTopLeftRadius: element === radiusOf ? '28px' : '0px' };
  };
  try {
    run();
  } finally {
    if (original === undefined) delete global.getComputedStyle;
    else global.getComputedStyle = original;
  }
}

test('findAnchor skips display:contents wrappers with an empty rect', function () {
  const column = fakeElement({ getBoundingClientRect: fixedRect(0, 1000) });
  const emptyWrapper = fakeElement({ parentElement: column, getBoundingClientRect: fixedRect(0, 0) });
  const node = fakeElement({ parentElement: emptyWrapper });

  assert.equal(align.findAnchor(node), column);
  assert.equal(align.findAnchor(null), null);
});

test('findComposerCard walks up to the rounded input card', function () {
  const column = fakeElement({
    getBoundingClientRect: fixedRect(100, 1100),
    querySelector: function querySelector(selector) {
      return selector === '[data-composer-input]' ? editor : null;
    },
  });
  const card = fakeElement({ parentElement: column, getBoundingClientRect: fixedRect(400, 900) });
  const field = fakeElement({ parentElement: card, getBoundingClientRect: fixedRect(400, 900) });
  const editor = fakeElement({ parentElement: field, getBoundingClientRect: fixedRect(400, 900) });

  withComputedStyle(card, function check() {
    assert.equal(align.findComposerCard(column), card);
  });
  assert.equal(align.findComposerCard(fakeElement({})), null);
});

test('alignToComposer sets the margins that make the box match the card', function () {
  const column = fakeElement({
    getBoundingClientRect: fixedRect(100, 1100),
    querySelector: function querySelector() {
      return editor;
    },
  });
  const card = fakeElement({ parentElement: column, getBoundingClientRect: fixedRect(400, 900) });
  const field = fakeElement({ parentElement: card, getBoundingClientRect: fixedRect(400, 900) });
  const editor = fakeElement({ parentElement: field, getBoundingClientRect: fixedRect(400, 900) });
  const node = fakeElement({ parentElement: column });

  withComputedStyle(card, function check() {
    align.alignToComposer(node);
  });

  assert.equal(node.style.marginLeft, '300px');
  assert.equal(node.style.marginRight, '200px');
});

test('alignToComposer falls back to the default inset when no card is found', function () {
  const column = fakeElement({
    getBoundingClientRect: fixedRect(0, 1000),
    querySelector: function querySelector() {
      return null;
    },
  });
  const node = fakeElement({ parentElement: column });

  align.alignToComposer(node);

  assert.equal(node.style.marginLeft, align.FALLBACK_INSET_PX + 'px');
  assert.equal(node.style.marginRight, align.FALLBACK_INSET_PX + 'px');
});

test('alignToComposer tolerates detached nodes with an empty wrapper chain', function () {
  const detached = fakeElement({ parentElement: null });
  align.alignToComposer(detached);
  assert.equal(detached.style.marginLeft, undefined);

  const column = fakeElement({
    getBoundingClientRect: fixedRect(0, 1000),
    querySelector: function querySelector() {
      return null;
    },
  });
  const node = fakeElement({ parentElement: column });
  align.alignToComposer(node);
  assert.equal(node.style.marginLeft, '16px');
  assert.equal(align.findComposerCard(column), null);
});
