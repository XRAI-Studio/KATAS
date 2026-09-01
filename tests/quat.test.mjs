import test from 'node:test';
import assert from 'node:assert/strict';
// The vendored three.js is the reference implementation. Tests may import it
// directly; the pure modules under test must not.
import * as THREE from '../kata-viewer/lib/three/three.module.js';
import { eulerXYZToQuat, slerp, quatToEulerXYZ } from '../kata-viewer/js/quat.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function assertQuatNear(q, ref, eps = 1e-9) {
  for (const k of ['x', 'y', 'z', 'w']) assert.ok(near(q[k], ref[k], eps), `${k}: got ${q[k]}, want ${ref[k]}`);
}
// q and -q are the same rotation; compare up to sign.
function assertSameRotation(q, ref, eps = 1e-9) {
  const dot = q.x * ref.x + q.y * ref.y + q.z * ref.z + q.w * ref.w;
  assert.ok(near(Math.abs(dot), 1, eps), `rotations differ: |dot| = ${Math.abs(dot)}`);
}

const CASES = [
  [0, 0, 0], [0.5, 0, 0], [0, 0.7, 0], [0, 0, -1.2],
  [-1.3, 0.35, 0.55], [1.85, -0.4, 0.25], [3.0, 2.5, -2.9], [-1.9, 0.0, 0.0],
];

test('eulerXYZToQuat matches THREE.Quaternion.setFromEuler with order XYZ', () => {
  for (const [x, y, z] of CASES) {
    const ref = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
    assertQuatNear(eulerXYZToQuat({ x, y, z }), ref);
  }
});

test('eulerXYZToQuat treats missing components as zero', () => {
  const ref = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0, 'XYZ'));
  assertQuatNear(eulerXYZToQuat({ x: 0.4 }), ref);
});

test('slerp endpoints return the inputs', () => {
  const a = eulerXYZToQuat({ x: 0.2, y: -0.4, z: 0.1 });
  const b = eulerXYZToQuat({ x: -1.3, y: 0.35, z: 0.55 });
  assertQuatNear(slerp(a, b, 0), a);
  assertQuatNear(slerp(a, b, 1), b);
});

test('slerp matches THREE.Quaternion.slerp at interior parameters', () => {
  const a = eulerXYZToQuat({ x: 0.2, y: -0.4, z: 0.1 });
  const b = eulerXYZToQuat({ x: -1.3, y: 0.35, z: 0.55 });
  const ta = new THREE.Quaternion(a.x, a.y, a.z, a.w);
  const tb = new THREE.Quaternion(b.x, b.y, b.z, b.w);
  for (const u of [0.1, 0.375, 0.5, 0.9]) {
    assertSameRotation(slerp(a, b, u), ta.clone().slerp(tb, u));
  }
});

test('slerp midpoint of a single-axis rotation is half the angle', () => {
  const a = eulerXYZToQuat({ x: 0, y: 0, z: 0 });
  const b = eulerXYZToQuat({ x: 1.0, y: 0, z: 0 });
  assertSameRotation(slerp(a, b, 0.5), eulerXYZToQuat({ x: 0.5, y: 0, z: 0 }));
});

test('slerp takes the shortest path when the target is the negated quaternion', () => {
  const a = eulerXYZToQuat({ x: 0, y: 0, z: 0 });
  const b = eulerXYZToQuat({ x: 1.0, y: 0, z: 0 });
  const negB = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  assertSameRotation(slerp(a, negB, 0.5), eulerXYZToQuat({ x: 0.5, y: 0, z: 0 }));
});

test('slerp of identical quaternions is stable', () => {
  const a = eulerXYZToQuat({ x: 0.3, y: 0.2, z: -0.1 });
  assertQuatNear(slerp(a, { ...a }, 0.5), a);
});

test('quatToEulerXYZ round-trips eulerXYZToQuat within the principal range', () => {
  for (const [x, y, z] of CASES) {
    if (Math.abs(y) >= Math.PI / 2 - 1e-6) continue; // outside the principal range for the middle axis
    if (Math.abs(x) > Math.PI / 2 || Math.abs(z) > Math.PI / 2) continue;
    const e = quatToEulerXYZ(eulerXYZToQuat({ x, y, z }));
    assert.ok(near(e.x, x, 1e-9) && near(e.y, y, 1e-9) && near(e.z, z, 1e-9), `got ${JSON.stringify(e)} want ${[x, y, z]}`);
  }
});
