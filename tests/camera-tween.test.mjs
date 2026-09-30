import test from 'node:test';
import assert from 'node:assert/strict';
import { presetEndpoints, retargetTween } from '../public/js/camera-tween.js';

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

class V {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  arr() { return [this.x, this.y, this.z]; }
}
const lerp = (a, b, u) => a.arr().map((v, i) => v + (b.arr()[i] - v) * u);
const SIDE = { pos: [5.2, 1.6, 0.8], target: [0, 0.9, 0.8] };

test('retargetTween: a glide switched mid-way restarts from the current pose, so the view is continuous (KATAS-AVATAR-002-R2)', () => {
  // A world-space glide to Side, 80% through, when Follow is turned on.
  const tween = { t: 0.8, preset: SIDE, relative: false, fromPos: new V(0, 1.6, 5.2), fromTarget: new V(0, 0.9, 0.8), toPos: new V(5.2, 1.6, 0.8), toTarget: new V(0, 0.9, 0.8) };
  const camPos = new V(4.1, 1.6, 1.7), camTarget = new V(0, 0.9, 0.8);
  const chest = { x: 1.5, y: 1.1, z: 2.5 };
  retargetTween(tween, true, camPos, camTarget, chest);
  assert.equal(tween.t, 0);
  assert.equal(tween.relative, true);
  assert.deepEqual(lerp(tween.fromPos, tween.toPos, 0), camPos.arr(), 'starts where the camera is');
  assert.deepEqual(lerp(tween.fromTarget, tween.toTarget, 0), camTarget.arr(), 'starts where the target is');
  assert.deepEqual(tween.toTarget.arr(), [1.5, 1.1, 2.5], 'ends on the performer');
  // Turning Follow off again sends it to the preset's world pose, again from the current pose.
  retargetTween(tween, false, camPos, camTarget, chest);
  assert.deepEqual(tween.toPos.arr(), SIDE.pos);
  assert.deepEqual(lerp(tween.fromPos, tween.toPos, 0), camPos.arr());
});
