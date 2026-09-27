import test from 'node:test';
import assert from 'node:assert/strict';
import { spaceTogglesPlayback } from '../public/js/ui.js';

const el = (tagName, extra = {}) => ({ tagName, ...extra });

test('Space is the play/pause shortcut on the page and on the sliders', () => {
  assert.equal(spaceTogglesPlayback(el('BODY')), true);
  assert.equal(spaceTogglesPlayback(el('CANVAS')), true);
  assert.equal(spaceTogglesPlayback(el('INPUT', { type: 'range' })), true);
  assert.equal(spaceTogglesPlayback(null), true);
});

test('Space keeps its native action on focused buttons (Return to Home Room), selects, links and fields', () => {
  assert.equal(spaceTogglesPlayback(el('BUTTON', { id: 'home-room' })), false);
  assert.equal(spaceTogglesPlayback(el('SELECT')), false);
  assert.equal(spaceTogglesPlayback(el('A')), false);
  assert.equal(spaceTogglesPlayback(el('TEXTAREA')), false);
  assert.equal(spaceTogglesPlayback(el('INPUT', { type: 'checkbox' })), false);
  assert.equal(spaceTogglesPlayback(el('INPUT', { type: 'text' })), false);
  assert.equal(spaceTogglesPlayback(el('DIV', { isContentEditable: true })), false);
});
