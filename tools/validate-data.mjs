// Shared kata-data validation. Run as CLI: node tools/validate-data.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { POSES } from '../kata-viewer/js/poses.js';
import { buildTimeline } from '../kata-viewer/js/player.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const KATA_FILES = ['seisan.json', 'seiunchin.json', 'naihanchi.json', 'wansu.json', 'chinto.json'];

export const ALLOWED_ATTACKS = [
  'steppingPunchR', 'steppingPunchL', 'punchHighR', 'punchHighL', 'frontKickR', 'frontKickL',
  'grabWristR', 'grabLapel', 'grabRear', 'chokeFront', 'sweepLow', 'none',
];

export function loadKata(file) {
  return JSON.parse(readFileSync(join(ROOT, 'kata-viewer', 'data', file), 'utf8'));
}

export function validateKata(kata, file) {
  const errors = [];
  const err = (m) => errors.push(`${file}: ${m}`);
  if (!kata.name) err('missing name');
  if (!Array.isArray(kata.steps) || kata.steps.length === 0) {
    err('no steps');
    return errors;
  }
  let kiaiCount = 0;
  for (const s of kata.steps) {
    const at = `step ${s.id ?? '?'}`;
    if (s.id === undefined) err(`${at}: missing id`);
    if (!s.label) err(`${at}: missing label`);
    if (!s.coachCall) err(`${at}: missing coachCall`);
    if (!s.embusen || typeof s.embusen.x !== 'number' || typeof s.embusen.z !== 'number'
      || typeof s.embusen.facing !== 'number') err(`${at}: bad embusen`);
    if (!s.transition || typeof s.transition.known !== 'boolean') err(`${at}: missing transition.known`);
    if (s.kiai) kiaiCount++;
    if (!Array.isArray(s.keyframes) || s.keyframes.length < 2) {
      err(`${at}: needs >= 2 keyframes`);
      continue;
    }
    let prevT = -1;
    for (const kf of s.keyframes) {
      if (typeof kf.t !== 'number' || kf.t < 0 || kf.t > 1) err(`${at}: keyframe t out of [0,1]`);
      if (kf.t <= prevT) err(`${at}: keyframe t not ascending`);
      prevT = kf.t;
      for (const name of [kf.stance, ...(kf.arms || []), ...(kf.legs || [])]) {
        if (name && !POSES[name]) err(`${at}: unknown pose "${name}"`);
      }
    }
    if (s.bunkai && s.bunkai.known) {
      if (!ALLOWED_ATTACKS.includes(s.bunkai.attack)) err(`${at}: unknown attack "${s.bunkai.attack}"`);
      if (!s.bunkai.text) err(`${at}: bunkai.known but no text`);
      if (!s.bunkai.attackerFrom) err(`${at}: bunkai.known but no attackerFrom`);
    }
  }
  if (kiaiCount < 1) err('no kiai step');
  try {
    buildTimeline(kata, POSES);
  } catch (e) {
    err(`buildTimeline threw: ${e.message}`);
  }
  return errors;
}

// CLI entry
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/')
  || process.argv[1]?.endsWith('validate-data.mjs')) {
  let failed = false;
  for (const file of KATA_FILES) {
    let kata;
    try {
      kata = loadKata(file);
    } catch (e) {
      console.error(`✖ ${file}: ${e.message}`);
      failed = true;
      continue;
    }
    const errors = validateKata(kata, file);
    if (errors.length) {
      failed = true;
      for (const e of errors) console.error(`✖ ${e}`);
    } else {
      const tl = buildTimeline(kata, POSES);
      const unverified = tl.steps.filter(s => s.unverified).length;
      const kiai = tl.steps.filter(s => s.kiai).map(s => s.id).join(', ');
      const bunkai = tl.steps.filter(s => s.bunkai.known).length;
      console.log(`✔ ${kata.name}: ${tl.steps.length} steps, ${tl.duration.toFixed(0)}s, kiai at [${kiai}], ${bunkai} bunkai, ${unverified} unverified`);
    }
  }
  process.exit(failed ? 1 : 0);
}
