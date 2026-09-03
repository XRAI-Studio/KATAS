// Stage A hand-shape contract + additive `adjust` + complete RIG schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { POSES, HAND_SHAPES, composePose, emptyPose } from '../kata-viewer/js/poses.js';
import { buildClip, sampleClip, buildTimeline, samplePose } from '../kata-viewer/js/player.js';
import { RIG, footSoleY } from '../kata-viewer/js/rig.js';
import { eulerXYZToQuat, quatToEulerXYZ } from '../kata-viewer/js/quat.js';
import { loadKata, KATA_FILES } from '../tools/validate-data.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// Hand vocabulary
// ---------------------------------------------------------------------------
test('HAND_SHAPES is the four-value vocabulary, fist is the default', () => {
  assert.deepEqual(HAND_SHAPES, ['fist', 'open', 'spear', 'palm']);
  assert.deepEqual(emptyPose().hands, { L: 'fist', R: 'fist' });
});

test('open-hand techniques carry their shape: nukite = spear, shote = palm, shuto = open', () => {
  assert.deepEqual(POSES.nukiteR.hands, { R: 'spear' });
  assert.deepEqual(POSES.nukiteL.hands, { L: 'spear' });
  assert.deepEqual(POSES.shoteR.hands, { R: 'palm' });
  assert.deepEqual(POSES.shutoMidR.hands, { R: 'open' });
  assert.deepEqual(POSES.punchMidR.hands, { R: 'fist' });
  for (const p of Object.values(POSES)) {
    if (!p.hands) continue;
    for (const s of ['L', 'R']) if (p.hands[s]) assert.ok(HAND_SHAPES.includes(p.hands[s]), p.hands[s]);
  }
});

// ---------------------------------------------------------------------------
// Sampler contract: hands are per-side weight maps on every path
// ---------------------------------------------------------------------------
const isWeights = (w) => {
  assert.deepEqual(Object.keys(w).sort(), [...HAND_SHAPES].sort());
  let sum = 0;
  for (const k of HAND_SHAPES) { assert.ok(w[k] >= 0 && w[k] <= 1, `${k}=${w[k]}`); sum += w[k]; }
  assert.ok(near(sum, 1, 1e-9), `sum=${sum}`);
};

test('endpoints, holds and mid-segment samples all return weight maps summing to 1', () => {
  const clip = buildClip([
    { time: 0, parts: ['seisanDachiR', 'chamberR'] },
    { time: 1, parts: ['seisanDachiR', 'nukiteR'] },        // kime -> hold inserted
    { time: 3, parts: ['seisanDachiR', 'shoteR'] },
  ], POSES, { hold: 0.5 });
  for (const t of [-1, 0, 0.5, 1, 1.25, 1.5, 2, 3, 4]) {
    const s = sampleClip(clip, t);
    isWeights(s.hands.L); isWeights(s.hands.R);
  }
  assert.equal(sampleClip(clip, 0).hands.R.fist, 1);
  assert.equal(sampleClip(clip, 1.25).hands.R.spear, 1);       // inside the hold
  assert.equal(sampleClip(clip, 3).hands.R.palm, 1);
  const mid = sampleClip(clip, 0.5).hands.R;
  assert.ok(mid.fist > 0 && mid.fist < 1 && mid.spear > 0 && mid.spear < 1, JSON.stringify(mid));
  assert.equal(mid.open, 0); assert.equal(mid.palm, 0);
  assert.equal(sampleClip(clip, 0.5).hands.L.fist, 1);         // same shape both ends: no cross-fade
});

test('an unknown hand shape in the pose library is rejected when a clip is built', () => {
  const lib = { ...POSES, badHand: { joints: {}, hands: { R: 'claw' } } };
  assert.throws(() => buildClip([{ time: 0, parts: ['badHand'] }, { time: 1, parts: ['ready'] }], lib), /claw/);
});

// ---------------------------------------------------------------------------
// `adjust`: per-axis merge after `overrides` (whole-joint) -- fist orientation knob
// ---------------------------------------------------------------------------
test('adjust merges per axis and keeps the authored wrist flexion of shote', () => {
  const base = composePose(POSES.shoteR);
  assert.ok(base.joints.wristR.x !== 0, 'shote authors wrist.x');
  const clip = buildClip([
    { time: 0, parts: ['shoteR'], adjust: { wristR: { y: 1.2 } } },
    { time: 1, parts: ['shoteR'] },
  ], POSES);
  const e = quatToEulerXYZ(sampleClip(clip, 0).joints.wristR);
  assert.ok(near(e.x, base.joints.wristR.x, 1e-9), `x kept: ${e.x} vs ${base.joints.wristR.x}`);
  assert.ok(near(e.y, 1.2, 1e-9), `y set: ${e.y}`);
  assert.throws(() => buildClip([{ time: 0, parts: ['ready'], adjust: { nope: { y: 1 } } }, { time: 1, parts: ['ready'] }], POSES), /nope/);
});

test('adjust is honoured from kata JSON through buildTimeline (not only buildClip)', () => {
  const kata = { name: 'X', steps: [{
    id: 0, label: 'a', coachCall: 'a', beats: 2, embusen: { x: 0, z: 0, facing: 0 }, transition: { known: true },
    keyframes: [{ t: 0, stance: 'seisanDachiL', arms: ['shoteR'], adjust: { wristR: { y: 1.2 } } }, { t: 1, stance: 'seisanDachiL', arms: ['shoteR'] }],
  }] };
  const e = quatToEulerXYZ(samplePose(buildTimeline(kata, POSES), 0).joints.wristR);
  assert.ok(near(e.x, composePose(POSES.shoteR).joints.wristR.x, 1e-9), 'wrist.x kept');
  assert.ok(near(e.y, 1.2, 1e-9), `wrist.y ${e.y}`);
});

test('overrides still replace the whole joint (unchanged semantics)', () => {
  const clip = buildClip([
    { time: 0, parts: ['shoteR'], overrides: { wristR: { y: 0.3 } } },
    { time: 1, parts: ['shoteR'] },
  ], POSES);
  const e = quatToEulerXYZ(sampleClip(clip, 0).joints.wristR);
  assert.ok(near(e.x, 0, 1e-9)); assert.ok(near(e.y, 0.3, 1e-9));
});

test('all five kata timelines sample byte-identically to the pre-Stage-A engine (joints/root/embusen/air)', () => {
  const h = createHash('sha256');
  for (const f of KATA_FILES) {
    const tl = buildTimeline(loadKata(f), POSES);
    for (let t = 0; t <= tl.duration; t += 0.1) {
      const p = samplePose(tl, t);
      h.update(JSON.stringify([p.root, p.joints, p.embusen, p.air].map(v => JSON.parse(JSON.stringify(v, (k, x) => typeof x === 'number' ? +x.toFixed(9) : x)))));
      for (const s of ['L', 'R']) isWeights(p.hands[s]);
    }
  }
  assert.equal(h.digest('hex'), '3b89e6f1fc62572110711a30213f31cacfc356e7fe87e7ca0697dca2b7103c91');
});

// ---------------------------------------------------------------------------
// RIG is the complete skeleton schema
// ---------------------------------------------------------------------------
test('RIG.JOINTS lists all 17 joints with parents and the offsets avatar.js used to hard-code', () => {
  const J = RIG.JOINTS;
  assert.equal(Object.keys(J).length, 17);
  assert.deepEqual(J.hips, { parent: null, offset: { x: 0, y: 0, z: 0 } });
  assert.deepEqual(J.spine, { parent: 'hips', offset: { x: 0, y: 0.12, z: 0 } });
  assert.deepEqual(J.chest, { parent: 'spine', offset: { x: 0, y: 0.14, z: 0 } });
  assert.deepEqual(J.neck, { parent: 'chest', offset: { x: 0, y: 0.30, z: 0 } });
  assert.deepEqual(J.head, { parent: 'neck', offset: { x: 0, y: 0.05, z: 0 } });
  assert.deepEqual(J.shoulderL, { parent: 'chest', offset: { x: 0.24, y: 0.24, z: 0 } });
  assert.deepEqual(J.shoulderR, { parent: 'chest', offset: { x: -0.24, y: 0.24, z: 0 } });
  assert.deepEqual(J.elbowR, { parent: 'shoulderR', offset: { x: 0, y: -RIG.UPPER_ARM, z: 0 } });
  assert.deepEqual(J.wristR, { parent: 'elbowR', offset: { x: 0, y: -RIG.FOREARM, z: 0 } });
  assert.deepEqual(J.hipL, { parent: 'hips', offset: { x: RIG.HIP.x, y: RIG.HIP.y, z: RIG.HIP.z } });
  assert.deepEqual(J.kneeL, { parent: 'hipL', offset: { x: 0, y: -RIG.THIGH, z: 0 } });
  assert.deepEqual(J.ankleL, { parent: 'kneeL', offset: { x: 0, y: -RIG.SHIN, z: 0 } });
  for (const [n, j] of Object.entries(J)) if (j.parent) assert.ok(J[j.parent], `${n} parent ${j.parent}`);
});

test('standing sole height is unchanged by the schema refactor', () => {
  const joints = {};
  for (const n of Object.keys(RIG.JOINTS)) joints[n] = eulerXYZToQuat({});
  const y = footSoleY({ root: {}, joints });
  // HIPS_Y + HIP.y - THIGH - SHIN - SOLE_BELOW_ANKLE = 0.95 - 0.05 - 0.42 - 0.40 - 0.1075
  assert.ok(near(y, -0.0275, 1e-9), `sole ${y}`);
  assert.ok(RIG.HAND && RIG.HAND.len > 0.15 && RIG.HAND.len < 0.22);
  assert.ok(RIG.FOOT_SEG && near(RIG.FOOT_SEG.heel + RIG.FOOT_SEG.ball + RIG.FOOT_SEG.toe, RIG.FOOT.l, 1e-9));
});
