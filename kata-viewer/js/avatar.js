import * as THREE from 'three';
import { RIG } from './rig.js';
import { HAND_SHAPES } from './poses.js';

// Procedural karateka. Joint pivots are Groups built from RIG.JOINTS (one per
// rig joint, same names, same rest offsets); meshes hang off them.
// Outer `group` carries embusen placement (set by the app);
// inner `body` carries pose root offsets (set by setPose).
//
// Hands: one mesh group per HAND_SHAPES entry under each wrist, cross-scaled by
// the per-shape weights the sampler produces. Hand frames: fingers along the
// limb axis (-y), thumb toward +z, palm toward the body (-sx·x), back of the
// hand outward (+sx·x). With the arm raised forward and no wrist twist this is
// a vertical fist, thumb up; adjust.wrist*.y = ±π/2 turns it horizontal.

const { HIPS_Y, UPPER_ARM, FOREARM, THIGH, SHIN, HAND, FOOT, FOOT_SEG } = RIG;
const MIN_SCALE = 0.01;   // never scale a hand shape to exactly 0 (degenerate matrices)

function box(mat, w, h, d, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Tapered limb segment hanging from its joint along -y: r0 at the joint, r1 at the far end.
function limbMesh(mat, r0, r1, length) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, length, 12), mat);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  return mesh;
}

function jointCap(mat, r) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Hand shapes (built in the hand frame described above; sx = +1 left, -1 right)
// ---------------------------------------------------------------------------
function fistShape(mat, sx) {
  const g = new THREE.Group();
  const len = 0.085, thick = HAND.thick + 0.03, w = HAND.w;
  g.add(box(mat, thick, len, w, 0, -len / 2, 0));
  // knuckle ridge: four bumps at the far, dorsal corner — they face the target
  // and line up vertically in a vertical fist, horizontally in a twist punch
  for (let i = 0; i < 4; i++) {
    const z = -w / 2 + w / 8 + i * (w / 4);
    g.add(box(mat, 0.024, 0.024, w / 4 - 0.005, sx * (thick / 2 - 0.006), -len - 0.004, z));
  }
  // thumb folded across the front of the fingers, on the palm side
  g.add(box(mat, 0.022, 0.045, 0.024, -sx * 0.012, -len + 0.03, w / 2 + 0.006));
  return g;
}

function fingers(mat, sx, { gap, tiltZ = 0 }) {
  const g = new THREE.Group();
  const n = 4, w = HAND.w, len = 0.075;
  const fw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const z = -w / 2 + fw / 2 + i * (fw + gap);
    const f = box(mat, HAND.thick * 0.85, len, fw, 0, -len / 2, z);
    g.add(f);
  }
  g.rotation.z = sx * tiltZ;   // >0 bends the fingers back toward the dorsal side (palm heel forward)
  return g;
}

function openHandBase(mat, sx, opts, thumbOut) {
  const g = new THREE.Group();
  const palmLen = HAND.len - 0.075;
  g.add(box(mat, HAND.thick, palmLen, HAND.w, 0, -palmLen / 2, 0));
  const f = fingers(mat, sx, opts);
  f.position.y = -palmLen;
  g.add(f);
  const thumb = box(mat, 0.02, 0.05, 0.02, -sx * (thumbOut ? 0 : 0.008), -0.045, HAND.w / 2 + (thumbOut ? 0.012 : 0.004));
  if (thumbOut) thumb.rotation.x = -0.5;
  g.add(thumb);
  return g;
}

// Shote presents the palm heel to the target: the hand is turned a quarter
// turn about the forearm so the palm faces along the strike, then the fingers
// are drawn back. Mesh-side (the shape owns its presentation); the pose's
// wrist flexion still cocks the hand.
function palmShape(mat, sx) {
  // Hand frame: fingers -y (along the strike), palm normal medial (-sx·x).
  // 1) quarter turn about the forearm: palm normal -> -z;  2) quarter bend
  // about x: palm normal -> -y (facing the target), fingers -> +z (up when
  // the arm is out). The pose's own wrist.x then cocks it into a rising heel.
  const g = new THREE.Group();
  g.rotation.x = -Math.PI / 2;
  const hand = openHandBase(mat, sx, { gap: 0.003 }, false);
  hand.rotation.y = -sx * Math.PI / 2;
  hand.children[1].rotation.x = -0.35;      // fingers eased slightly further back
  g.add(hand);
  return g;
}

const HAND_BUILDERS = {
  fist: fistShape,
  open: (mat, sx) => openHandBase(mat, sx, { gap: 0.004 }, true),     // knife hand: fingers slightly apart, thumb out
  spear: (mat, sx) => openHandBase(mat, sx, { gap: 0 }, false),        // nukite: fingers together, thumb tucked
  palm: palmShape,                                                      // shote: palm heel forward, fingers drawn back
};

// ---------------------------------------------------------------------------
export function createKarateka({ gi = 0xf5f0e6, belt = 0x222222, skin = 0xc9a179 } = {}) {
  const options = { gi, belt, skin };
  const giMat = new THREE.MeshStandardMaterial({ color: gi, roughness: 0.9 });
  const beltMat = new THREE.MeshStandardMaterial({ color: belt, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.9 });

  const group = new THREE.Group();       // embusen transform (app-owned)
  const body = new THREE.Group();        // pose root transform
  body.position.y = HIPS_Y;
  group.add(body);

  // Joint pivots straight from the rig schema.
  const joints = {};
  for (const [name, { parent, offset }] of Object.entries(RIG.JOINTS)) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(offset.x, offset.y, offset.z);
    (parent ? joints[parent] : body).add(g);
    joints[name] = g;
  }

  // Torso chain
  joints.hips.add(box(giMat, 0.32, 0.18, 0.20, 0, 0.02, 0));
  joints.chest.add(box(giMat, 0.36, 0.34, 0.22, 0, 0.12, 0));
  joints.chest.add(box(beltMat, 0.34, 0.07, 0.23, 0, -0.06, 0));
  joints.chest.add(box(beltMat, 0.09, 0.06, 0.05, 0, -0.06, 0.13));      // belt knot
  for (const s of [-1, 1]) {                                              // gi lapels: a V on the chest
    const lapel = box(darkMat, 0.025, 0.30, 0.01, s * 0.06, 0.14, 0.113);
    lapel.rotation.z = -s * 0.32;
    lapel.material = new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.95 });
    joints.chest.add(lapel);
  }

  // Head with a readable face (nose, eyes, brows) and hair cap toward the back
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skinMat);
  skull.position.y = 0.10; skull.castShadow = true;
  joints.head.add(skull);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  hair.position.set(0, 0.105, -0.012);
  joints.head.add(hair);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 8), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.085, 0.115);
  joints.head.add(nose);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), darkMat);
    eye.position.set(s * 0.04, 0.12, 0.103);
    joints.head.add(eye);
    joints.head.add(box(darkMat, 0.04, 0.008, 0.008, s * 0.042, 0.145, 0.1));   // brow
  }
  joints.neck.add(limbMesh(skinMat, 0.045, 0.045, 0.07).translateY(0.05));    // neck column, torso top to skull

  // Arms — gi sleeve on the upper arm, skin forearm tapering to a visible wrist,
  // then one group per hand shape.
  const hands = { L: {}, R: {} };
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const shoulder = joints['shoulder' + side];
    shoulder.add(jointCap(giMat, 0.07));
    shoulder.add(limbMesh(giMat, 0.062, 0.052, UPPER_ARM));
    const elbow = joints['elbow' + side];
    elbow.add(jointCap(skinMat, 0.048));
    elbow.add(limbMesh(skinMat, 0.046, 0.032, FOREARM));
    const wrist = joints['wrist' + side];
    wrist.add(jointCap(skinMat, 0.03));
    for (const shape of HAND_SHAPES) {
      const g = HAND_BUILDERS[shape](skinMat, sx);
      g.scale.setScalar(shape === 'fist' ? 1 : MIN_SCALE);
      wrist.add(g);
      hands[side][shape] = g;
    }
  }

  // Legs — gi trousers, bare feet in three segments (heel / ball / toes)
  for (const side of ['L', 'R']) {
    const hip = joints['hip' + side];
    hip.add(limbMesh(giMat, 0.082, 0.066, THIGH));
    const knee = joints['knee' + side];
    knee.add(jointCap(giMat, 0.066));
    knee.add(limbMesh(giMat, 0.064, 0.05, SHIN));
    const ankle = joints['ankle' + side];
    ankle.add(jointCap(skinMat, 0.035));
    let z = FOOT.z - FOOT.l / 2;
    for (const [seg, len] of Object.entries(FOOT_SEG)) {
      const h = seg === 'toe' ? FOOT.h * 0.7 : FOOT.h;
      const w = seg === 'heel' ? FOOT.w * 0.85 : FOOT.w;
      const y = FOOT.y - FOOT.h / 2 + h / 2;              // every segment shares the sole plane
      ankle.add(box(skinMat, w, h, len - 0.004, 0, y, z + len / 2));
      z += len;
    }
  }

  // Hands: accept the sampler's weight maps; a bare shape name means weight 1.
  function applyHand(side, state) {
    const weights = typeof state === 'string' ? { [state]: 1 } : state;
    for (const shape of HAND_SHAPES) {
      const w = Math.min(1, Math.max(0, weights[shape] ?? 0));
      hands[side][shape].scale.setScalar(Math.max(MIN_SCALE, w));
    }
  }

  function setPose(pose) {
    if (!pose) return;
    if (pose.joints) {
      for (const [name, rot] of Object.entries(pose.joints)) {
        const g = joints[name];
        if (!g) continue;
        if (rot.w !== undefined) g.quaternion.set(rot.x, rot.y, rot.z, rot.w);   // sampled (quaternion)
        else g.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);               // authored (Euler XYZ)
      }
    }
    if (pose.root) {
      body.position.set(pose.root.x || 0, HIPS_Y + (pose.root.y || 0), pose.root.z || 0);
      body.rotation.y = pose.root.ry || 0;
    }
    if (pose.hands) for (const side of ['L', 'R']) if (pose.hands[side]) applyHand(side, pose.hands[side]);
  }

  // Stage B hook: fires once when a skinned character has replaced the
  // procedural one (never for the procedural avatar alone).
  const readyCbs = [];
  let ready = false;
  function onReady(cb) { if (ready) cb(); else readyCbs.push(cb); }

  const chestOffset = new THREE.Vector3(0, 0.12, 0);
  return {
    group,
    options,
    setPose,
    onReady,
    getJoint: (name) => joints[name] || null,
    // World position of the chest centre (camera follow target).
    getChestWorldPosition: (out = new THREE.Vector3()) => joints.chest.localToWorld(out.copy(chestOffset)),
  };
}
