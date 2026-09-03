// Rig geometry shared by avatar.js (mesh construction) and player.js (ground
// clamp), so the two cannot drift apart. Pure: no Three.js, no DOM.
// Distances in metres, pose-root space: y up, character faces +Z, left = +X.
import { eulerXYZToQuat, mulQuat, rotateVec } from './quat.js';

const HIPS_Y = 0.95, THIGH = 0.42, SHIN = 0.40, UPPER_ARM = 0.28, FOREARM = 0.26;
const HIP = Object.freeze({ x: 0.11, y: -0.05, z: 0 });
const SHOULDER = Object.freeze({ x: 0.24, y: 0.24, z: 0 });

// Complete skeleton: every joint's parent and rest offset (parent space, rest
// frames world-aligned). Mesh builders (avatar.js, tools/build-avatar.py) and
// the FK below all read this table, so a joint cannot exist in one and not the other.
const v = (x, y, z) => Object.freeze({ x, y, z });
const JOINTS = {
  hips: { parent: null, offset: v(0, 0, 0) },
  spine: { parent: 'hips', offset: v(0, 0.12, 0) },
  chest: { parent: 'spine', offset: v(0, 0.14, 0) },
  neck: { parent: 'chest', offset: v(0, 0.30, 0) },
  head: { parent: 'neck', offset: v(0, 0.05, 0) },
};
for (const side of ['L', 'R']) {
  const sx = side === 'L' ? 1 : -1;
  JOINTS['shoulder' + side] = { parent: 'chest', offset: v(sx * SHOULDER.x, SHOULDER.y, SHOULDER.z) };
  JOINTS['elbow' + side] = { parent: 'shoulder' + side, offset: v(0, -UPPER_ARM, 0) };
  JOINTS['wrist' + side] = { parent: 'elbow' + side, offset: v(0, -FOREARM, 0) };
  JOINTS['hip' + side] = { parent: 'hips', offset: v(sx * HIP.x, HIP.y, HIP.z) };
  JOINTS['knee' + side] = { parent: 'hip' + side, offset: v(0, -THIGH, 0) };
  JOINTS['ankle' + side] = { parent: 'knee' + side, offset: v(0, -SHIN, 0) };
}
for (const j of Object.values(JOINTS)) Object.freeze(j);

export const RIG = Object.freeze({
  HIPS_Y,                             // standing hip height
  THIGH, SHIN, UPPER_ARM, FOREARM,
  HIP,                                // hip joint from the hips pivot (x mirrored for R)
  SHOULDER,                           // shoulder joint from the chest pivot (x mirrored for R)
  JOINTS: Object.freeze(JOINTS),
  // Foot box: w across, h tall, l long; centred FOOT.y below and FOOT.z ahead of the ankle.
  FOOT: Object.freeze({ w: 0.10, h: 0.055, l: 0.22, y: -0.08, z: 0.05 }),
  // Foot split along its length (heel at the back) so heel-down / ball-pivot can be shown.
  FOOT_SEG: Object.freeze({ heel: 0.07, ball: 0.10, toe: 0.05 }),
  SOLE_BELOW_ANKLE: 0.08 + 0.055 / 2,
  // Hand from the wrist pivot: len along the forearm axis, w across the palm, thick palm-to-back.
  HAND: Object.freeze({ len: 0.19, w: 0.09, thick: 0.035 }),
});

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

// Lowest point of one foot's sole (the four bottom corners of the foot box)
// after forward kinematics through hips -> hip -> knee -> ankle.
function legSoleY(pose, side) {
  const j = pose.joints;
  const root = pose.root || {};
  let q = mulQuat(eulerXYZToQuat({ y: root.ry || 0 }), j.hips);
  let pos = { x: root.x || 0, y: RIG.HIPS_Y + (root.y || 0), z: root.z || 0 };
  for (const name of ['hip' + side, 'knee' + side, 'ankle' + side]) {
    pos = add(pos, rotateVec(q, RIG.JOINTS[name].offset));
    q = mulQuat(q, j[name]);
  }
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
