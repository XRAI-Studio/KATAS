import test from 'node:test';
import assert from 'node:assert/strict';
import { POSES, composePose, mirrorPose } from '../kata-viewer/js/poses.js';

test('techniques carry kime metadata; chambers and guards do not', () => {
  for (const n of ['punchMidR', 'blockMidL', 'backfistR', 'frontKickL', 'blockDoubleHigh', 'reinforcedBlockL', 'legLiftR']) {
    assert.equal(POSES[n].kime, true, `${n} should be kime`);
  }
  for (const n of ['chamberR', 'guardChestL', 'guardBoth', 'grabPullR', 'armsDown', 'dumpLoad', 'seisanDachiL', 'ready']) {
    assert.ok(!POSES[n].kime, `${n} should not be kime`);
  }
});

test('open-hand techniques mark the striking hand open, mirrored per side', () => {
  assert.deepEqual(POSES.shutoLowR.hands, { R: 'open' });
  assert.deepEqual(POSES.shutoLowL.hands, { L: 'open' });
  assert.deepEqual(POSES.nukiteR.hands, { R: 'open' });
  assert.deepEqual(POSES.doubleShutoThroat.hands, { L: 'open', R: 'open' });
  assert.deepEqual(POSES.archerBlockL.hands, { L: 'open', R: 'open' });
  assert.deepEqual(POSES.punchMidR.hands, { R: 'fist' });   // a punch explicitly makes a fist
  assert.deepEqual(POSES.blockMidL.hands, { L: 'fist' });    // Isshin Ryu blocks are closed-fist
  assert.equal(POSES.seisanDachiL.hands, undefined);         // stances say nothing about hands
});

test('jump kick is airborne; crossover stances are pass-through', () => {
  assert.equal(POSES.jumpKickR.airborne, true);
  assert.equal(POSES.jumpKickL.airborne, true);
  assert.equal(POSES.crossoverL.pass, true);
  assert.equal(POSES.crossoverR.pass, true);
  assert.ok(!POSES.frontKickR.airborne);
  assert.ok(!POSES.seisanDachiL.pass);
});

test('composePose merges hands per side with fist as the default', () => {
  assert.deepEqual(composePose(POSES.ready).hands, { L: 'fist', R: 'fist' });
  assert.deepEqual(composePose(POSES.seisanDachiR, POSES.shutoLowR, POSES.chamberL).hands, { L: 'fist', R: 'open' });
  // later partials override earlier ones
  assert.deepEqual(composePose(POSES.doubleShutoThroat, POSES.punchMidR).hands, { L: 'open', R: 'fist' });
});

test('composePose is airborne if any partial is airborne', () => {
  assert.equal(composePose(POSES.ready, POSES.jumpKickR).airborne, true);
  assert.equal(composePose(POSES.ready, POSES.frontKickR).airborne, false);
});

test('mirrorPose swaps hands and keeps kime/airborne/pass flags', () => {
  const m = mirrorPose({ joints: {}, hands: { R: 'open' }, kime: true, airborne: true, pass: true });
  assert.deepEqual(m.hands, { L: 'open' });
  assert.equal(m.kime, true);
  assert.equal(m.airborne, true);
  assert.equal(m.pass, true);
});
