// The rig schema the skinned GLB is generated from, and its fingerprint.
// Pure (no Node, no Three, no DOM): shared by tools/dump-rig.mjs (writes the
// hash into the GLB) and avatar.js (refuses a GLB built from a different rig).
import { RIG } from './rig.js';
import { JOINT_NAMES, HAND_SHAPES } from './poses.js';

export function rigSchema() {
  const joints = {};
  for (const n of JOINT_NAMES) joints[n] = RIG.JOINTS[n];
  return {
    hipsY: RIG.HIPS_Y,
    joints,
    foot: RIG.FOOT,
    footSeg: RIG.FOOT_SEG,
    soleBelowAnkle: RIG.SOLE_BELOW_ANKLE,
    hand: RIG.HAND,
    handShapes: HAND_SHAPES,
  };
}

// Canonical JSON (sorted keys) so the hash does not depend on insertion order.
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

// 64-bit FNV-1a as 16 hex chars. Not cryptographic — a change detector.
export function rigSchemaHash(schema = rigSchema()) {
  const s = canonical(schema);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
