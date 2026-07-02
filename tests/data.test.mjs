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
