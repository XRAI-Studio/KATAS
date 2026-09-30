import test from 'node:test';
import assert from 'node:assert/strict';
import { presetEndpoints } from '../public/js/camera-tween.js';

const HANDS = { pos: [0.6, 1.5, 2.0], target: [0, 1.15, 0.6] };

test('Follow off: a preset is its fixed world pose', () => {
  assert.deepEqual(presetEndpoints(HANDS, false, { x: 3, y: 1.2, z: 2.5 }), { pos: [0.6, 1.5, 2.0], target: [0, 1.15, 0.6] });
});

test('Follow on: the preset aims at the chest where the performer is, keeping its direction and distance (KATAS-AVATAR-002)', () => {
  const chest = { x: 0.4, y: 1.2, z: 2.5 };
  const { pos, target } = presetEndpoints(HANDS, true, chest);
  assert.deepEqual(target, [0.4, 1.2, 2.5]);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const off = pos.map((v, i) => v - target[i]);
  const want = HANDS.pos.map((v, i) => v - HANDS.target[i]);
  assert.ok(off.every((v, i) => near(v, want[i])), `offset ${off} = ${want}`);
});

test('Follow on: endpoints move with the performer (recomputed each tween frame)', () => {
  const a = presetEndpoints(HANDS, true, { x: 0, y: 1.2, z: 0 });
  const b = presetEndpoints(HANDS, true, { x: 0, y: 1.2, z: 1 });
  assert.equal(b.target[2] - a.target[2], 1);
  assert.equal(b.pos[2] - a.pos[2], 1);
});
