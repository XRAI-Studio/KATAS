// Rig geometry shared by avatar.js (mesh construction) and player.js (ground
// clamp), so the two cannot drift apart. Pure: no Three.js, no DOM.
// Distances in metres, pose-root space: y up, character faces +Z, left = +X.
import { eulerXYZToQuat, mulQuat, rotateVec } from './quat.js';

export const RIG = Object.freeze({
  HIPS_Y: 0.95,                       // standing hip height
  THIGH: 0.42, SHIN: 0.40,
  UPPER_ARM: 0.28, FOREARM: 0.26,
  HIP: Object.freeze({ x: 0.11, y: -0.05, z: 0 }),   // hip joint from the hips pivot (x mirrored for R)
  // Foot box: w across, h tall, l long; centred FOOT.y below and FOOT.z ahead of the ankle.
  FOOT: Object.freeze({ w: 0.10, h: 0.055, l: 0.22, y: -0.08, z: 0.05 }),
  SOLE_BELOW_ANKLE: 0.08 + 0.055 / 2,
});

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

// Lowest point of one foot's sole (the four bottom corners of the foot box)
// after forward kinematics through hips -> hip -> knee -> ankle.
function legSoleY(pose, side) {
  const sx = side === 'L' ? 1 : -1;
  const j = pose.joints;
  const root = pose.root || {};
  let q = mulQuat(eulerXYZToQuat({ y: root.ry || 0 }), j.hips);
  let pos = { x: root.x || 0, y: RIG.HIPS_Y + (root.y || 0), z: root.z || 0 };
  pos = add(pos, rotateVec(q, { x: sx * RIG.HIP.x, y: RIG.HIP.y, z: RIG.HIP.z }));
  q = mulQuat(q, j['hip' + side]);
  pos = add(pos, rotateVec(q, { x: 0, y: -RIG.THIGH, z: 0 }));
  q = mulQuat(q, j['knee' + side]);
  pos = add(pos, rotateVec(q, { x: 0, y: -RIG.SHIN, z: 0 }));
  q = mulQuat(q, j['ankle' + side]);
  const F = RIG.FOOT;
  let min = Infinity;
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      const c = rotateVec(q, { x: cx * F.w / 2, y: F.y - F.h / 2, z: F.z + cz * F.l / 2 });
      if (pos.y + c.y < min) min = pos.y + c.y;
    }
  }
  return min;
}

// Height of the lower sole for a pose with quaternion joints (as produced by
// the sampler). 0 means the lower foot rests exactly on the floor.
export function footSoleY(pose) {
  return Math.min(legSoleY(pose, 'L'), legSoleY(pose, 'R'));
}
