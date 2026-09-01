import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../kata-viewer/lib/three/three.module.js';
import { RIG, footSoleY } from '../kata-viewer/js/rig.js';
import { POSES, composePose } from '../kata-viewer/js/poses.js';
import { eulerXYZToQuat, mulQuat, rotateVec } from '../kata-viewer/js/quat.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// quat.js vector helpers (reference: vendored three.js)
// ---------------------------------------------------------------------------

test('rotateVec matches THREE.Vector3.applyQuaternion', () => {
  const q = eulerXYZToQuat({ x: -1.3, y: 0.35, z: 0.55 });
  const v = rotateVec(q, { x: 0.2, y: -0.42, z: 0.1 });
  const ref = new THREE.Vector3(0.2, -0.42, 0.1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  for (const k of ['x', 'y', 'z']) assert.ok(near(v[k], ref[k]), `${k}: ${v[k]} vs ${ref[k]}`);
});

test('mulQuat matches THREE.Quaternion.multiply (parent * child)', () => {
  const a = eulerXYZToQuat({ x: 0.3, y: -0.2, z: 0.9 });
  const b = eulerXYZToQuat({ x: -1.1, y: 0.4, z: 0.05 });
  const m = mulQuat(a, b);
  const ref = new THREE.Quaternion(a.x, a.y, a.z, a.w).multiply(new THREE.Quaternion(b.x, b.y, b.z, b.w));
  for (const k of ['x', 'y', 'z', 'w']) assert.ok(near(m[k], ref[k]), `${k}: ${m[k]} vs ${ref[k]}`);
});

// ---------------------------------------------------------------------------
// Leg forward kinematics
// ---------------------------------------------------------------------------

const quatPose = (pose) => {
  const joints = {};
  for (const [n, e] of Object.entries(pose.joints)) joints[n] = eulerXYZToQuat(e);
  return { root: pose.root, joints };
};

test('standing straight, the sole sits at the geometric height implied by the rig constants', () => {
  const p = quatPose(composePose(POSES.feetTogether));
  const expected = RIG.HIPS_Y + RIG.HIP.y - RIG.THIGH - RIG.SHIN - RIG.SOLE_BELOW_ANKLE;
  assert.ok(near(footSoleY(p), expected), `${footSoleY(p)} vs ${expected}`);
});

test('root.y shifts the sole by the same amount', () => {
  const a = quatPose(composePose(POSES.feetTogether));
  const b = quatPose(composePose(POSES.feetTogether, { root: { y: -0.1 } }));
  assert.ok(near(footSoleY(b), footSoleY(a) - 0.1));
});

test('bending the knees (feet kept flat) raises the sole; the lower of the two feet is reported', () => {
  const standing = footSoleY(quatPose(composePose(POSES.feetTogether)));
  const flatBend = { kneeL: { x: 0.6 }, ankleL: { x: -0.6 }, kneeR: { x: 0.6 }, ankleR: { x: -0.6 } };
  const bent = footSoleY(quatPose(composePose(POSES.feetTogether, { joints: flatBend })));
  const expectedRise = RIG.SHIN * (1 - Math.cos(0.6));
  assert.ok(near(bent, standing + expectedRise, 1e-9), `bent ${bent} vs ${standing + expectedRise}`);
  // one bent knee only: the straight leg is the lower foot
  const oneBent = footSoleY(quatPose(composePose(POSES.feetTogether, { joints: { kneeL: { x: 0.6 }, ankleL: { x: -0.6 } } })));
  assert.ok(near(oneBent, standing), `one-leg bend ${oneBent} vs standing ${standing}`);
});

test('a plantar-flexed ankle drops the toe below the flat sole', () => {
  const flat = footSoleY(quatPose(composePose(POSES.feetTogether)));
  const pointed = footSoleY(quatPose(composePose(POSES.feetTogether, { joints: { ankleR: { x: 0.5 } } })));
  assert.ok(pointed < flat, `pointed toe ${pointed} should be below flat ${flat}`);
});

test('the rig exports the joint offsets avatar.js builds from', () => {
  assert.equal(RIG.HIPS_Y, 0.95);
  assert.equal(RIG.THIGH, 0.42);
  assert.equal(RIG.SHIN, 0.40);
  assert.deepEqual(RIG.HIP, { x: 0.11, y: -0.05, z: 0 });
  assert.ok(RIG.SOLE_BELOW_ANKLE > 0);
});
