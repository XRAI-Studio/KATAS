import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimeline, samplePose, stepAt, Player, SECONDS_PER_BEAT,
  buildClip, sampleClip, KIME_HOLD_BEATS, LOOK_YAW,
} from '../kata-viewer/js/player.js';
import { POSES } from '../kata-viewer/js/poses.js';
import { eulerXYZToQuat, quatToEulerXYZ } from '../kata-viewer/js/quat.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function assertQuatNear(q, ref, eps = 1e-9) {
  for (const k of ['x', 'y', 'z', 'w']) assert.ok(near(q[k], ref[k], eps), `${k}: got ${q[k]}, want ${ref[k]}`);
}

const kata = {
  name: 'Test',
  steps: [
    {
      id: 1, label: 'block', coachCall: 'Block.', beats: 2, kiai: false,
      embusen: { x: 0, z: 0, facing: 0 },
      keyframes: [
        { t: 0, stance: 'ready' },
        { t: 1, stance: 'seisanDachiL', arms: ['blockMidL'] },
      ],
      transition: { known: true },
    },
    {
      id: 2, label: 'punch', coachCall: 'Punch.', beats: 4, kiai: true,
      embusen: { x: 0, z: -1, facing: Math.PI },
      keyframes: [
        { t: 0, stance: 'seisanDachiL', arms: ['blockMidL'] },
        { t: 0.5, stance: 'seisanDachiL', arms: ['punchMidR'] },
        { t: 1, stance: 'seisanDachiL', arms: ['chamberR'] },
      ],
      transition: { known: false },
    },
  ],
};

// ---------------------------------------------------------------------------
// Timeline structure
// ---------------------------------------------------------------------------

test('timeline duration comes from beats', () => {
  const tl = buildTimeline(kata, POSES);
  assert.equal(tl.duration, (2 + 4) * SECONDS_PER_BEAT);
  assert.equal(tl.steps.length, 2);
  assert.equal(tl.steps[0].start, 0);
  assert.equal(tl.steps[0].end, 2 * SECONDS_PER_BEAT);
  assert.equal(tl.steps[1].start, 2 * SECONDS_PER_BEAT);
  assert.equal(tl.steps[1].unverified, true);
  assert.equal(tl.steps[0].unverified, false);
});

test('ease is derived: a newly arriving technique is kime, carried-over or retracting poses are soft', () => {
  const tl = buildTimeline(kata, POSES);
  const authored = tl.kfs.filter(k => !k.holdEnd);
  assert.deepEqual(authored.map(k => k.ease), [
    'soft',   // ready
    'kime',   // blockMidL arrives
    'soft',   // step 2 starts with the same block: nothing new
    'kime',   // punchMidR arrives
    'soft',   // chamber (retract)
  ]);
});

test('a technique arriving with a new step is kime (comparison crosses step boundaries)', () => {
  const k = {
    name: 'X', steps: [
      { id: 1, label: 'a', coachCall: 'a', beats: 2, embusen: { x: 0, z: 0, facing: 0 },
        keyframes: [{ t: 0, stance: 'ready' }, { t: 1, stance: 'ready', arms: ['guardBoth'] }], transition: { known: true } },
      { id: 2, label: 'b', coachCall: 'b', beats: 2, embusen: { x: 0, z: 0, facing: 0 },
        keyframes: [{ t: 0, stance: 'naihanchiDachi', arms: ['haitoR', 'guardChestL'] }, { t: 1, stance: 'naihanchiDachi', arms: ['haitoR', 'guardChestL'] }],
        transition: { known: true } },
    ],
  };
  const eases = buildTimeline(k, POSES).kfs.filter(x => !x.holdEnd).map(x => x.ease);
  assert.deepEqual(eases, ['soft', 'soft', 'kime', 'soft']);
});

test('authored ease overrides the derived one; pass-through stances derive pass', () => {
  const k = {
    name: 'X', steps: [
      { id: 1, label: 'a', coachCall: 'a', beats: 3, embusen: { x: 0, z: 0, facing: 0 },
        keyframes: [
          { t: 0, stance: 'ready' },
          { t: 0.3, stance: 'crossoverL', arms: ['guardBoth'] },
          { t: 0.6, stance: 'naihanchiDachi', arms: ['punchMidR'], ease: 'soft' },
          { t: 1, stance: 'naihanchiDachi', arms: ['chamberR'], ease: 'kime' },
        ], transition: { known: true } },
    ],
  };
  const eases = buildTimeline(k, POSES).kfs.filter(x => !x.holdEnd).map(x => x.ease);
  assert.deepEqual(eases, ['soft', 'pass', 'soft', 'kime']);
});

test('kime keyframes get a hold frame; times stay ascending and duration is unchanged', () => {
  const tl = buildTimeline(kata, POSES);
  const hold = KIME_HOLD_BEATS * SECONDS_PER_BEAT;
  // authored times: 0, 2, (step-2 first kf pushed to 2 + 0.25*4 =) 3, 4, 6
  assert.deepEqual(tl.kfs.map(k => +k.time.toFixed(6)), [0, 2, +(2 + hold).toFixed(6), 3, 4, +(4 + hold).toFixed(6), 6]);
  assert.deepEqual(tl.kfs.map(k => !!k.holdEnd), [false, false, true, false, false, true, false]);
  for (let i = 1; i < tl.kfs.length; i++) assert.ok(tl.kfs[i].time > tl.kfs[i - 1].time, 'times ascending');
  assert.equal(tl.duration, 6 * SECONDS_PER_BEAT);
});

test('a hold is capped at half the gap to the next keyframe', () => {
  const k = {
    name: 'X', steps: [
      { id: 1, label: 'a', coachCall: 'a', beats: 1, embusen: { x: 0, z: 0, facing: 0 },
        keyframes: [
          { t: 0, stance: 'ready' },
          { t: 0.8, stance: 'seisanDachiL', arms: ['punchMidR'] },
          { t: 1, stance: 'seisanDachiL', arms: ['chamberR'] },
        ], transition: { known: true } },
    ],
  };
  const tl = buildTimeline(k, POSES);
  const holdEnd = tl.kfs.find(x => x.holdEnd);
  assert.ok(near(holdEnd.time, 0.8 + 0.1 * SECONDS_PER_BEAT), `hold end at ${holdEnd.time}`);
});

test('the final keyframe never gets a hold; an authored hold (in beats) is honoured', () => {
  const k = {
    name: 'X', steps: [
      { id: 1, label: 'a', coachCall: 'a', beats: 4, embusen: { x: 0, z: 0, facing: 0 },
        keyframes: [
          { t: 0, stance: 'ready' },
          { t: 0.5, stance: 'seisanDachiL', arms: ['punchMidR'], hold: 0.6 },
          { t: 1, stance: 'seisanDachiL', arms: ['punchMidL'] },
        ], transition: { known: true } },
    ],
  };
  const tl = buildTimeline(k, POSES);
  assert.equal(tl.kfs.filter(x => x.holdEnd).length, 1);
  assert.ok(near(tl.kfs[2].time, 2 + 0.6 * SECONDS_PER_BEAT));
  assert.equal(tl.kfs[tl.kfs.length - 1].holdEnd, undefined);
});

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

test('samplePose returns joint quaternions equal to the keyframe pose at keyframe times', () => {
  const tl = buildTimeline(kata, POSES);
  const p0 = samplePose(tl, 0);
  assertQuatNear(p0.joints.shoulderR, eulerXYZToQuat(POSES.ready.joints.shoulderR));
  const pEnd = samplePose(tl, 2 * SECONDS_PER_BEAT);
  assertQuatNear(pEnd.joints.shoulderL, eulerXYZToQuat(POSES.blockMidL.joints.shoulderL));
});

test('the pose is constant through a hold', () => {
  const tl = buildTimeline(kata, POSES);
  const hold = KIME_HOLD_BEATS * SECONDS_PER_BEAT;
  // (the hold at t=2 precedes a 180° turn and so carries a look — tested below)
  assert.deepEqual(samplePose(tl, 4 + hold * 0.9), samplePose(tl, 4));
});

test('midpoint sample lies strictly between keyframe values', () => {
  const tl = buildTimeline(kata, POSES);
  const a = quatToEulerXYZ(samplePose(tl, 0).joints.hipL).x;                       // ready: 0
  const b = quatToEulerXYZ(samplePose(tl, 2 * SECONDS_PER_BEAT).joints.hipL).x;   // seisan: -0.42
  const mid = quatToEulerXYZ(samplePose(tl, SECONDS_PER_BEAT).joints.hipL).x;
  assert.ok(mid < Math.max(a, b) && mid > Math.min(a, b), `mid ${mid} not between ${a} and ${b}`);
});

// feetTogether -> frontKickR rotates hipR about a single axis (x: 0 -> -1.45),
// so slerp is linear in the angle and the curve value can be read straight
// off the sampled Euler angle.
const curveSample = (fromEase, toEase, u) => {
  const clip = buildClip([
    { time: 0, parts: ['feetTogether'], ease: 'soft' },
    { time: 1, parts: ['feetTogether'], ease: fromEase },
    { time: 2, parts: ['frontKickR'], ease: toEase },
  ], POSES, { hold: 0 });
  return quatToEulerXYZ(sampleClip(clip, 1 + u).joints.hipR).x / -1.45;
};

test('segment curve follows the (from stop/moving, into kind) table', () => {
  assert.ok(near(curveSample('soft', 'kime', 0.5), 0.375, 1e-6), 'stop -> kime: u^2(2-u)');
  assert.ok(near(curveSample('soft', 'soft', 0.5), 0.5, 1e-6),   'stop -> soft: smoothstep');
  assert.ok(near(curveSample('soft', 'pass', 0.5), 0.25, 1e-6),  'stop -> pass: ease-in');
  assert.ok(near(curveSample('pass', 'kime', 0.5), 0.375, 1e-6), 'moving -> kime: u^2(2-u)');
  assert.ok(near(curveSample('pass', 'soft', 0.5), 0.75, 1e-6),  'moving -> soft: ease-out');
  assert.ok(near(curveSample('pass', 'pass', 0.5), 0.5, 1e-6),   'moving -> pass: linear');
});

test('every segment curve is monotonic and hits its endpoints', () => {
  for (const [from, to] of [['soft', 'kime'], ['soft', 'soft'], ['soft', 'pass'], ['pass', 'kime'], ['pass', 'soft'], ['pass', 'pass']]) {
    let prev = 0;
    for (let i = 0; i <= 20; i++) {
      const v = curveSample(from, to, i / 20);
      assert.ok(v >= prev - 1e-9, `${from}->${to} not monotonic at ${i / 20}`);
      prev = v;
    }
    assert.ok(near(prev, 1, 1e-9), `${from}->${to} does not reach the end pose`);
  }
});

test('hand openness blends across a segment into an open-hand technique', () => {
  const clip = buildClip([
    { time: 0, parts: ['seisanDachiR', 'chamberR'], ease: 'soft' },
    { time: 1, parts: ['seisanDachiR', 'shutoLowR'], ease: 'soft' },
  ], POSES, { hold: 0 });
  assert.deepEqual(sampleClip(clip, 0).hands, { L: 0, R: 0 });
  assert.deepEqual(sampleClip(clip, 1).hands, { L: 0, R: 1 });
  const midR = sampleClip(clip, 0.5).hands.R;
  assert.ok(midR > 0 && midR < 1, `mid hand blend ${midR}`);
});

test('sampling is pure — same t gives identical pose', () => {
  const tl = buildTimeline(kata, POSES);
  const t = 1.234;
  assert.deepEqual(samplePose(tl, t), samplePose(tl, t));
});

test('embusen root interpolates and facing takes shortest path', () => {
  const kata2 = {
    name: 'Turn',
    steps: [
      { id: 1, label: 'a', coachCall: 'a', beats: 2, embusen: { x: 0, z: 0, facing: 6.1 },
        keyframes: [{ t: 0, stance: 'ready' }, { t: 1, stance: 'ready' }], transition: { known: true } },
      { id: 2, label: 'b', coachCall: 'b', beats: 2, embusen: { x: 0, z: 0, facing: 0.2 },
        keyframes: [{ t: 0, stance: 'ready' }, { t: 1, stance: 'ready' }], transition: { known: true } },
    ],
  };
  const tl = buildTimeline(kata2, POSES);
  // Halfway through the transition from step 1 into step 2's first keyframe,
  // facing must pass near 0 (i.e. > 6.1 wrapped, or < 0.2), never ~3.15.
  const p = samplePose(tl, 2 * SECONDS_PER_BEAT + 0.001);
  const facing = ((p.embusen.facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  assert.ok(facing > 6.0 || facing < 0.3, `facing ${facing} took the long way around`);
});

test('buildClip derives ease from pose names and inserts holds in clip units', () => {
  const clip = buildClip([
    { time: 0, parts: ['ready', 'guardBoth'] },
    { time: 0.4, parts: ['seisanDachiR', 'punchMidR', 'guardChestL'] },
    { time: 1, parts: ['seisanDachiR', 'chamberR', 'guardChestL'] },
  ], POSES, { hold: 0.1 });
  assert.deepEqual(clip.map(k => [+k.time.toFixed(6), k.ease, !!k.holdEnd]), [
    [0, 'soft', false], [0.4, 'kime', false], [0.5, 'soft', true], [1, 'soft', false],
  ]);
  assertQuatNear(sampleClip(clip, 0.45).joints.shoulderR, eulerXYZToQuat(POSES.punchMidR.joints.shoulderR));
});

// ---------------------------------------------------------------------------
// Steps and player
// ---------------------------------------------------------------------------

test('stepAt finds the right step, clamped at edges', () => {
  const tl = buildTimeline(kata, POSES);
  assert.equal(stepAt(tl, -5).id, 1);
  assert.equal(stepAt(tl, 0.1).id, 1);
  assert.equal(stepAt(tl, 2 * SECONDS_PER_BEAT + 0.1).id, 2);
  assert.equal(stepAt(tl, 999).id, 2);
});

test('player advances by speed and clamps at end', () => {
  const tl = buildTimeline(kata, POSES);
  const p = new Player(tl, {});
  p.play();
  p.setSpeed(5);
  p.tick(1);                       // 5 kata-seconds
  assert.equal(p.time, 5);
  p.setSpeed(0.1);
  p.tick(1);
  assert.ok(Math.abs(p.time - 5.1) < 1e-9);
  p.tick(1000);                    // clamps at duration, stops
  assert.equal(p.time, tl.duration);
  assert.equal(p.playing, false);
});

test('seek and step navigation land on step starts', () => {
  const tl = buildTimeline(kata, POSES);
  const p = new Player(tl, {});
  p.nextStep();
  assert.equal(p.time, tl.steps[1].start);
  p.nextStep();                     // already last step -> stays
  assert.equal(p.time, tl.steps[1].start);
  p.prevStep();
  assert.equal(p.time, 0);
  p.prevStep();
  assert.equal(p.time, 0);
});

test('onStep fires on step change in both directions', () => {
  const tl = buildTimeline(kata, POSES);
  const seen = [];
  const p = new Player(tl, { onStep: (s) => seen.push(s.id) });
  p.play();
  p.tick(0.01);                    // enters step 1
  p.tick(2 * SECONDS_PER_BEAT);    // crosses into step 2
  assert.deepEqual(seen, [1, 2]);
  p.seek(0.1);                     // scrub back to step 1
  assert.deepEqual(seen, [1, 2, 1]);
});

test('onKiai fires when playback crosses a kiai step start, not when scrubbing', () => {
  const tl = buildTimeline(kata, POSES);
  const kiais = [];
  const p = new Player(tl, { onKiai: (s) => kiais.push(s.id) });
  p.seek(tl.steps[1].start + 0.5); // scrub into kiai step: no kiai
  assert.deepEqual(kiais, []);
  p.seek(0);
  p.play();
  p.tick(2 * SECONDS_PER_BEAT + 0.01);
  assert.deepEqual(kiais, [2]);
});

// ---------------------------------------------------------------------------
// Look-ahead before turns
// ---------------------------------------------------------------------------

const turnKata = (facing2, opts = {}) => ({
  name: 'Turn', steps: [
    { id: 1, label: 'a', coachCall: 'a', beats: 2, embusen: { x: 0, z: 0, facing: 0 },
      keyframes: [
        { t: 0, stance: 'ready' },
        { t: 1, stance: 'seisanDachiL', arms: ['punchMidR'], ...(opts.lastKf || {}) },
      ], transition: { known: true } },
    { id: 2, label: 'b', coachCall: 'b', beats: 2, embusen: { x: 0, z: 0, facing: facing2 }, ...(opts.step2 || {}),
      keyframes: [
        { t: 0, stance: 'seisanDachiR', arms: ['blockMidR'] },
        { t: 1, stance: 'seisanDachiR', arms: ['punchMidL'] },
      ], transition: { known: true } },
  ],
});
const headYawAtHoldEnd = (tl) => quatToEulerXYZ(tl.kfs.find(k => k.holdEnd).pose.joints.head).y;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

test('before a left turn the head looks left on the hold-end frame of the previous step', () => {
  const tl = buildTimeline(turnKata(Math.PI / 2), POSES);
  assert.ok(near(headYawAtHoldEnd(tl), LOOK_YAW), `yaw ${headYawAtHoldEnd(tl)}`);
  // body is unchanged on that frame and the next step starts with the head straight
  const kime = tl.kfs[1], hold = tl.kfs[2];
  assertQuatNear(hold.pose.joints.shoulderR, kime.pose.joints.shoulderR);
  assertQuatNear(tl.kfs[3].pose.joints.head, IDENTITY);
});

test('before a right turn (shortest path clockwise) the head looks right', () => {
  const tl = buildTimeline(turnKata(3 * Math.PI / 2), POSES);
  assert.ok(near(headYawAtHoldEnd(tl), -LOOK_YAW), `yaw ${headYawAtHoldEnd(tl)}`);
});

test('a 180° turn authored as 3.1416 (slightly more than π) still defaults to looking left', () => {
  // The kata files round facings to 4 decimals; 3.1416 > Math.PI, so a naive
  // shortest-path sign would send the head right.
  assert.ok(near(headYawAtHoldEnd(buildTimeline(turnKata(3.1416), POSES)), LOOK_YAW));
  assert.ok(near(headYawAtHoldEnd(buildTimeline(turnKata(-3.1416), POSES)), LOOK_YAW));
});

test('no facing change: no look is injected', () => {
  const tl = buildTimeline(turnKata(0), POSES);
  assertQuatNear(tl.kfs.find(k => k.holdEnd).pose.joints.head, IDENTITY);
});

test('an authored head override on the last keyframe is respected', () => {
  const tl = buildTimeline(turnKata(Math.PI / 2, { lastKf: { overrides: { head: { y: -0.5 } } } }), POSES);
  assert.ok(near(headYawAtHoldEnd(tl), -0.5), `yaw ${headYawAtHoldEnd(tl)}`);
});

test('the entered step\'s look attribute overrides the direction and can disable the look', () => {
  assert.ok(near(headYawAtHoldEnd(buildTimeline(turnKata(Math.PI, { step2: { look: 'right' } }), POSES)), -LOOK_YAW));
  assert.ok(near(headYawAtHoldEnd(buildTimeline(turnKata(Math.PI), POSES)), LOOK_YAW), '180 defaults to left');
  assertQuatNear(buildTimeline(turnKata(Math.PI / 2, { step2: { look: 'none' } }), POSES).kfs.find(k => k.holdEnd).pose.joints.head, IDENTITY);
});

test('the look attribute forces a look even when facing does not change (Seisan 12/15/18)', () => {
  assert.ok(near(headYawAtHoldEnd(buildTimeline(turnKata(0, { step2: { look: 'right' } }), POSES)), -LOOK_YAW));
  assert.ok(near(headYawAtHoldEnd(buildTimeline(turnKata(0, { step2: { look: 'left' } }), POSES)), LOOK_YAW));
});

test('a soft last keyframe still gets a look frame before the turn', () => {
  const tl = buildTimeline(turnKata(Math.PI / 2, { lastKf: { ease: 'soft' } }), POSES);
  const look = tl.kfs.find(k => k.holdEnd);
  assert.ok(look, 'a look frame was inserted');
  assert.ok(near(quatToEulerXYZ(look.pose.joints.head).y, LOOK_YAW));
  assert.ok(look.time > tl.kfs[1].time && look.time < tl.kfs[3].time, 'between the last kf and the next step');
});

test('the head turns during the hold while the body stays put', () => {
  const tl = buildTimeline(turnKata(Math.PI / 2), POSES);
  const t0 = tl.kfs[1].time, t1 = tl.kfs[2].time;
  const mid = samplePose(tl, (t0 + t1) / 2);
  const yaw = quatToEulerXYZ(mid.joints.head).y;
  assert.ok(yaw > 0 && yaw < LOOK_YAW, `mid yaw ${yaw}`);
  assertQuatNear(mid.joints.shoulderR, tl.kfs[1].pose.joints.shoulderR);
});
