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
      for (const s of ['L', 'R']) assert.ok(p.hands[s] >= 0 && p.hands[s] <= 1, `${file} t=${t.toFixed(2)} hands.${s}=${p.hands[s]}`);
      assert.ok(p.air >= 0 && p.air <= 1, `${file} t=${t.toFixed(2)} air=${p.air}`);
      if (p.air === 0) assert.ok(Math.abs(footSoleY(p)) < 1e-6, `${file} t=${t.toFixed(2)} sole=${footSoleY(p)}`);
    }
  });
}
