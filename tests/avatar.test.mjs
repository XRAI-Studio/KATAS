// Avatar structure: the procedural karateka is built from RIG.JOINTS and
// honours the rig's conventions (faces +Z, left = +X, sole per RIG.FOOT).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../kata-viewer/lib/three/three.module.js';
import { RIG } from '../kata-viewer/js/rig.js';
import { JOINT_NAMES, POSES, HAND_SHAPES } from '../kata-viewer/js/poses.js';
import { buildClip, sampleClip } from '../kata-viewer/js/player.js';
import { createKarateka } from '../kata-viewer/js/avatar.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('createKarateka builds one Group per rig joint with the schema parent and offset', () => {
  const k = createKarateka({ glb: false });
  for (const name of JOINT_NAMES) {
    const g = k.getJoint(name);
    assert.ok(g, name);
    const { parent, offset } = RIG.JOINTS[name];
    if (parent) assert.equal(g.parent, k.getJoint(parent), `${name} parent`);
    for (const a of ['x', 'y', 'z']) assert.ok(near(g.position[a], offset[a]), `${name}.${a}`);
  }
  assert.equal(k.getJoint('nope'), null);
});

test('standing: feet rest on the floor and the face (nose) points +Z, left hand at +X', () => {
  const k = createKarateka({ glb: false });
  k.setPose({ joints: {}, root: { x: 0, y: -RIG.HIPS_Y - (RIG.HIP.y - RIG.THIGH - RIG.SHIN - RIG.SOLE_BELOW_ANKLE) + 0, ry: 0 } });
  // root.y chosen so the rig FK sole sits exactly at y = 0 (same arithmetic as footSoleY)
  k.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let minY = Infinity, noseZ = -Infinity;
  k.group.traverse((o) => {
    if (!o.isMesh) return;
    box.setFromObject(o);
    if (o.parent === k.getJoint('ankleL') || o.parent === k.getJoint('ankleR')) minY = Math.min(minY, box.min.y);
    if (o.geometry.type === 'ConeGeometry') noseZ = Math.max(noseZ, box.max.z);
  });
  assert.ok(near(minY, 0, 1e-6), `sole at ${minY}`);
  assert.ok(noseZ > 0.1, `nose ahead of the face: ${noseZ}`);
  const l = k.getJoint('wristL').getWorldPosition(new THREE.Vector3());
  const r = k.getJoint('wristR').getWorldPosition(new THREE.Vector3());
  assert.ok(l.x > 0.2 && r.x < -0.2, 'left wrist at +X, right at -X');
});

test('hand shapes are cross-scaled from the sampler weights, one shape group per HAND_SHAPES entry', () => {
  const k = createKarateka({ glb: false });
  const clip = buildClip([{ time: 0, parts: ['nukiteR'] }, { time: 1, parts: ['shutoLowR'] }], POSES, { hold: 0 });
  k.setPose(sampleClip(clip, 0.5));
  const wrist = k.getJoint('wristR');
  const groups = wrist.children.filter(c => c.isGroup);
  assert.equal(groups.length, HAND_SHAPES.length);
  const scales = groups.map(g => g.scale.x).sort((a, b) => b - a);
  assert.ok(scales[0] < 1 && scales[1] > 0.01 && near(scales[0] + scales[1], 1, 1e-9), `mid blend ${scales}`);
  assert.ok(scales[2] === 0.01 && scales[3] === 0.01);
});

test('getChestWorldPosition follows embusen placement', () => {
  const k = createKarateka({ glb: false });
  k.group.position.set(2, 0, -1);
  k.group.updateMatrixWorld(true);
  const p = k.getChestWorldPosition();
  assert.ok(near(p.x, 2) && near(p.z, -1) && p.y > 1.1 && p.y < 1.4, JSON.stringify(p));
});
