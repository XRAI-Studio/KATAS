import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, samplePose, stepAt, Player, SECONDS_PER_BEAT } from '../kata-viewer/js/player.js';
import { POSES } from '../kata-viewer/js/poses.js';

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

test('samplePose at keyframe time returns exact pose values', () => {
  const tl = buildTimeline(kata, POSES);
  const p0 = samplePose(tl, 0);
  assert.equal(p0.joints.shoulderR.x, POSES.ready.joints.shoulderR.x);
  const pEnd = samplePose(tl, 2 * SECONDS_PER_BEAT);
  // start of step 2 = seisanDachiL + blockMidL; blockMidL sets shoulderL
  assert.equal(pEnd.joints.shoulderL.x, POSES.blockMidL.joints.shoulderL.x);
});

test('midpoint sample lies strictly between keyframe values', () => {
  const tl = buildTimeline(kata, POSES);
  const a = samplePose(tl, 0).joints.hipL.x;               // ready: 0
  const b = samplePose(tl, 2 * SECONDS_PER_BEAT).joints.hipL.x; // seisan: -0.42
  const mid = samplePose(tl, SECONDS_PER_BEAT).joints.hipL.x;
  assert.ok(mid < Math.max(a, b) && mid > Math.min(a, b), `mid ${mid} not between ${a} and ${b}`);
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
