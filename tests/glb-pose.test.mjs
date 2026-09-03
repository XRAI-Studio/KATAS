// Rest-relative bone posing for the skinned GLB (PLAN.md step 13), proven
// against three.js's own Bone hierarchy before any GLB exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../kata-viewer/lib/three/three.module.js';
import { RIG } from '../kata-viewer/js/rig.js';
import { POSES, composePose, JOINT_NAMES } from '../kata-viewer/js/poses.js';
import {
  eulerXYZToQuat, mulQuat, rotateVec, conjQuat, quatFromAxisAngle, poseToBoneLocal, twistAboutY,
} from '../kata-viewer/js/quat.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const toT = (q) => new THREE.Quaternion(q.x, q.y, q.z, q.w);

// Rig forward kinematics in armature space (hips at origin): world position of every joint.
function rigFK(joints) {
  const pos = {}, Q = {};
  for (const name of JOINT_NAMES) {
    const { parent, offset } = RIG.JOINTS[name];
    const Qp = parent ? Q[parent] : { x: 0, y: 0, z: 0, w: 1 };
    const pp = parent ? pos[parent] : { x: 0, y: 0, z: 0 };
    const o = rotateVec(Qp, offset);
    pos[name] = { x: pp.x + o.x, y: pp.y + o.y, z: pp.z + o.z };
    Q[name] = mulQuat(Qp, joints[name]);
  }
  return { pos, Q };
}

// A synthetic armature with deliberately non-identity rest orientations
// (bones point along their offsets, with a pseudo-random roll), like Blender exports.
function syntheticArmature(seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const bones = {}, A = {};
  for (const name of JOINT_NAMES) {
    const { parent, offset } = RIG.JOINTS[name];
    const local = eulerXYZToQuat({ x: rnd() * 2, y: rnd() * 2, z: rnd() * 2 });
    const Ap = parent ? A[parent] : { x: 0, y: 0, z: 0, w: 1 };
    A[name] = mulQuat(Ap, local);
    const b = new THREE.Bone();
    b.name = name;
    b.quaternion.copy(toT(local));
    const t = rotateVec(conjQuat(Ap), offset);           // rest offset expressed in the parent bone frame
    b.position.set(t.x, t.y, t.z);
    (parent ? bones[parent] : null)?.add(b);
    bones[name] = b;
  }
  return { bones, A, root: bones.hips };
}

test('synthetic armature reproduces rig joint positions at rest', () => {
  const { bones, root } = syntheticArmature();
  root.updateMatrixWorld(true);
  const zero = {}; for (const n of JOINT_NAMES) zero[n] = { x: 0, y: 0, z: 0, w: 1 };
  const { pos } = rigFK(zero);
  const v = new THREE.Vector3();
  for (const n of JOINT_NAMES) {
    bones[n].getWorldPosition(v);
    for (const k of ['x', 'y', 'z']) assert.ok(near(v[k], pos[n][k], 1e-9), `${n}.${k} ${v[k]} vs ${pos[n][k]}`);
  }
});

for (const [label, parts] of [
  ['seisanDachiL + punchMidR', ['seisanDachiL', 'punchMidR', 'chamberL']],
  ['naihanchi haito', ['naihanchiDachi', 'haitoR', 'guardChestL']],
  ['front kick', ['ready', 'frontKickR', 'guardBoth']],
  ['kneel', ['kneelL', 'blockLowR']],
]) {
  test(`poseToBoneLocal reproduces rig FK on bones with non-identity rest frames: ${label}`, () => {
    const { bones, A, root } = syntheticArmature(3);
    const pose = composePose(...parts.map(p => POSES[p]));
    const q = {}; for (const n of JOINT_NAMES) q[n] = eulerXYZToQuat(pose.joints[n]);
    for (const n of JOINT_NAMES) {
      const parent = RIG.JOINTS[n].parent;
      const Ap = parent ? A[parent] : { x: 0, y: 0, z: 0, w: 1 };
      bones[n].quaternion.copy(toT(poseToBoneLocal(q[n], Ap, A[n])));
    }
    root.updateMatrixWorld(true);
    const { pos, Q } = rigFK(q);
    const v = new THREE.Vector3(), wq = new THREE.Quaternion();
    for (const n of JOINT_NAMES) {
      bones[n].getWorldPosition(v);
      for (const k of ['x', 'y', 'z']) assert.ok(near(v[k], pos[n][k], 1e-8), `${n}.${k} ${v[k]} vs ${pos[n][k]}`);
      // world orientation = Q · A
      bones[n].getWorldQuaternion(wq);
      const want = toT(mulQuat(Q[n], A[n]));
      assert.ok(Math.abs(wq.dot(want)) > 1 - 1e-9, `${n} orientation`);
    }
  });
}

test('twistAboutY recovers the y (roll) component of an XYZ Euler wrist', () => {
  for (const [x, y] of [[0, 0], [-1.3, 0.7], [-1.3, -1.2], [0.4, Math.PI / 2], [-2.0, -Math.PI / 2], [-0.5, 3.0]]) {
    const t = twistAboutY(eulerXYZToQuat({ x, y }));
    assert.ok(near(t, y, 1e-9), `x=${x} y=${y}: ${t}`);
  }
  // a pure swing has no twist
  assert.ok(near(twistAboutY(eulerXYZToQuat({ x: 1.1 })), 0));
  assert.ok(near(twistAboutY(eulerXYZToQuat({ z: -0.8 })), 0));
});

for (const side of ['L', 'R']) {
  for (const theta of [Math.PI / 2, -Math.PI / 2]) {
    test(`half-twist helper (${side}, θ=${theta > 0 ? '+' : '-'}π/2): poseToBoneLocal gives a world twist of θ/2 about the forearm`, () => {
      const { bones, A, root } = syntheticArmature(11);
      const qh = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, theta / 2);
      // the wrist bone stands in for the helper hanging off the elbow (same parent, same equation)
      const w = 'wrist' + side, e = 'elbow' + side;
      bones[w].quaternion.copy(toT(poseToBoneLocal(qh, A[e], A[w])));
      root.updateMatrixWorld(true);
      const wq = new THREE.Quaternion();
      bones[w].getWorldQuaternion(wq);
      const want = toT(mulQuat(qh, A[w]));
      assert.ok(Math.abs(wq.dot(want)) > 1 - 1e-9);
      const rigRot = mulQuat({ x: wq.x, y: wq.y, z: wq.z, w: wq.w }, conjQuat(A[w]));
      assert.ok(near(twistAboutY(rigRot), theta / 2, 1e-9), `twist ${twistAboutY(rigRot)}`);
    });
  }
}
