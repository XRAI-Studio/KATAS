// Camera preset endpoints (pure, unit-tested in tests/camera-tween.test.mjs). Presets are
// written for a performer standing at the origin. With Follow on, the follow-cam always aims
// at the performer's chest, so a preset keeps its viewing direction and distance (its
// pos − target offset) but aims at the chest where the performer is now. It is recomputed
// every tween frame, so a glide to "Hands" or "Side" ends on the performer even while they
// move, and the follow-cam's re-acquire at the end moves nothing (Codex KATAS-AVATAR-002).

/**
 * @param {{ pos: number[], target: number[] }} preset
 * @param {boolean} relative true when Follow is on
 * @param {{ x: number, y: number, z: number }} chest the performer's chest (ignored when not relative)
 * @returns {{ pos: number[], target: number[] }}
 */
export function presetEndpoints(preset, relative, chest) {
  if (!relative) return { pos: [...preset.pos], target: [...preset.target] };
  const target = [chest.x, chest.y, chest.z];
  const pos = [0, 1, 2].map((i) => target[i] + (preset.pos[i] - preset.target[i]));
  return { pos, target };
}

/**
 * Follow changed while a preset glide is under way (Codex KATAS-AVATAR-002-R1, -R2): the glide
 * switches to the new mode's endpoints and restarts from where the camera is now, so the view
 * is continuous at the switch (its first interpolated frame starts at the current pose).
 * Mutates `tween` ({ t, preset, relative, fromPos, fromTarget, toPos, toTarget }, vectors with
 * copy/set) and returns it.
 */
export function retargetTween(tween, relative, currentPos, currentTarget, chest) {
  const end = presetEndpoints(tween.preset, relative, chest);
  tween.relative = relative;
  tween.t = 0;
  tween.fromPos.copy(currentPos);
  tween.fromTarget.copy(currentTarget);
  tween.toPos.set(...end.pos);
  tween.toTarget.set(...end.target);
  return tween;
}
