import test from 'node:test';
import assert from 'node:assert/strict';
import { KATA_FILES, loadKata, validateKata } from '../tools/validate-data.mjs';
import { POSES } from '../kata-viewer/js/poses.js';
import { buildTimeline } from '../kata-viewer/js/player.js';

for (const file of KATA_FILES) {
  test(`${file} parses, validates, and builds a timeline`, () => {
    const kata = loadKata(file);
    const errors = validateKata(kata, file);
    assert.deepEqual(errors, []);
    const tl = buildTimeline(kata, POSES);
    assert.ok(tl.duration > 10, 'kata should run longer than 10s at 1x');
    assert.ok(tl.steps.some(s => s.kiai), 'kata should have a kiai');
  });
}

test('validateKata rejects bad ease, hold and look values and accepts good ones', () => {
  const base = () => ({
    name: 'X', steps: [{
      id: 1, label: 'a', coachCall: 'a', beats: 2, kiai: true,
      embusen: { x: 0, z: 0, facing: 0 }, transition: { known: true },
      keyframes: [{ t: 0, stance: 'ready' }, { t: 1, stance: 'ready', arms: ['punchMidR'] }],
    }],
  });
  assert.deepEqual(validateKata(base(), 'x.json'), []);
  let k = base(); k.steps[0].keyframes[1].ease = 'snap';
  assert.ok(validateKata(k, 'x.json').some(e => /ease/.test(e)), 'bad ease should be reported');
  k = base(); k.steps[0].keyframes[1].hold = -1;
  assert.ok(validateKata(k, 'x.json').some(e => /hold/.test(e)), 'negative hold should be reported');
  k = base(); k.steps[0].look = 'up';
  assert.ok(validateKata(k, 'x.json').some(e => /look/.test(e)), 'bad look should be reported');
  k = base();
  k.steps[0].keyframes[1].ease = 'kime'; k.steps[0].keyframes[1].hold = 0.5; k.steps[0].look = 'right';
  assert.deepEqual(validateKata(k, 'x.json'), []);
});

test('validateKata checks overrides and adjust the same way: known joint, x/y/z axes, finite numbers', () => {
  const base = () => ({
    name: 'X', steps: [{
      id: 1, label: 'a', coachCall: 'a', beats: 2, kiai: true,
      embusen: { x: 0, z: 0, facing: 0 }, transition: { known: true },
      keyframes: [{ t: 0, stance: 'ready' }, { t: 1, stance: 'ready', arms: ['punchMidR'] }],
    }],
  });
  for (const field of ['overrides', 'adjust']) {
    let k = base(); k.steps[0].keyframes[1][field] = { wristR: { y: 1.57 } };
    assert.deepEqual(validateKata(k, 'x.json'), [], `${field} good`);
    k = base(); k.steps[0].keyframes[1][field] = { wristQ: { y: 1 } };
    assert.ok(validateKata(k, 'x.json').some(e => e.includes(`${field} unknown joint`)), `${field} joint`);
    k = base(); k.steps[0].keyframes[1][field] = { wristR: { w: 1 } };
    assert.ok(validateKata(k, 'x.json').some(e => e.includes('unknown axis')), `${field} axis`);
    k = base(); k.steps[0].keyframes[1][field] = { wristR: { y: 'lots' } };
    assert.ok(validateKata(k, 'x.json').some(e => e.includes('finite number')), `${field} number`);
    k = base(); k.steps[0].keyframes[1][field] = [1];
    assert.ok(validateKata(k, 'x.json').some(e => e.includes('must be an object')), `${field} shape`);
  }
});

import { samplePose } from '../kata-viewer/js/player.js';
import { footSoleY } from '../kata-viewer/js/rig.js';

for (const file of KATA_FILES) {
  test(`${file} samples cleanly at 20 Hz over its whole duration`, () => {
    const tl = buildTimeline(loadKata(file), POSES);
    for (let t = 0; t <= tl.duration + 0.05; t += 0.05) {
      const p = samplePose(tl, t);
      for (const [name, q] of Object.entries(p.joints)) {
        const n = Math.hypot(q.x, q.y, q.z, q.w);
        assert.ok(Number.isFinite(n) && Math.abs(n - 1) < 1e-6, `${file} t=${t.toFixed(2)} ${name}: |q|=${n}`);
      }
      for (const k of ['x', 'y', 'z', 'ry']) assert.ok(Number.isFinite(p.root[k]), `${file} t=${t.toFixed(2)} root.${k}`);
      for (const k of ['x', 'z', 'facing']) assert.ok(Number.isFinite(p.embusen[k]), `${file} t=${t.toFixed(2)} embusen.${k}`);
      for (const s of ['L', 'R']) {
        const sum = Object.values(p.hands[s]).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1) < 1e-9, `${file} t=${t.toFixed(2)} hands.${s} weights sum ${sum}`);
      }
      assert.ok(p.air >= 0 && p.air <= 1, `${file} t=${t.toFixed(2)} air=${p.air}`);
      if (p.air === 0) assert.ok(Math.abs(footSoleY(p)) < 1e-6, `${file} t=${t.toFixed(2)} sole=${footSoleY(p)}`);
    }
  });
}
