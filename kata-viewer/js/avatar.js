import * as THREE from 'three';

// Procedural karateka. Joint pivots are Groups; meshes hang off them.
// Outer `group` carries embusen placement (set by the app);
// inner `body` carries pose root offsets (set by setPose).

const HIPS_Y = 0.95;          // standing hip height
const THIGH = 0.42, SHIN = 0.40;
const UPPER_ARM = 0.28, FOREARM = 0.26;

function limbMesh(mat, radius, length) {
  const geo = new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 8);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  return mesh;
}

export function createKarateka({ gi = 0xf5f0e6, belt = 0x222222, skin = 0xc9a179 } = {}) {
  const giMat = new THREE.MeshStandardMaterial({ color: gi, roughness: 0.9 });
  const beltMat = new THREE.MeshStandardMaterial({ color: belt, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });

  const group = new THREE.Group();       // embusen transform (app-owned)
  const body = new THREE.Group();        // pose root transform
  body.position.y = HIPS_Y;
  group.add(body);

  const joints = {};
  const j = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    joints[name] = g;
    return g;
  };

  // Torso chain
  const hips = j('hips', body, 0, 0, 0);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.20), giMat);
  pelvis.position.y = 0.02; pelvis.castShadow = true;
  hips.add(pelvis);

  const spine = j('spine', hips, 0, 0.12, 0);
  const chest = j('chest', spine, 0, 0.14, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.22), giMat);
  torso.position.y = 0.12; torso.castShadow = true;
  chest.add(torso);
  const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.23), beltMat);
  beltMesh.position.y = -0.06;
  chest.add(beltMesh);
  // belt knot
  const knot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.05), beltMat);
  knot.position.set(0, -0.06, 0.13);
  chest.add(knot);

  const neck = j('neck', chest, 0, 0.30, 0);
  const head = j('head', neck, 0, 0.05, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skinMat);
  skull.position.y = 0.10; skull.castShadow = true;
  head.add(skull);
  // face indicators: nose on the +z (facing) side, dark hair cap toward the back
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.9 });
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.set(0, 0.105, -0.012);
  head.add(hair);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 8), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.09, 0.115);
  head.add(nose);

  // Arms — gi sleeves on upper arm, skin forearm, fist sphere
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const shoulder = j('shoulder' + side, chest, sx * 0.24, 0.24, 0);
    shoulder.add(limbMesh(giMat, 0.055, UPPER_ARM));
    const elbow = j('elbow' + side, shoulder, 0, -UPPER_ARM, 0);
    elbow.add(limbMesh(skinMat, 0.045, FOREARM));
    const wrist = j('wrist' + side, elbow, 0, -FOREARM, 0);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat);
    fist.position.y = -0.03; fist.castShadow = true;
    wrist.add(fist);
  }

  // Legs — gi pants, bare feet boxes
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const hip = j('hip' + side, hips, sx * 0.11, -0.05, 0);
    hip.add(limbMesh(giMat, 0.075, THIGH));
    const knee = j('knee' + side, hip, 0, -THIGH, 0);
    knee.add(limbMesh(giMat, 0.06, SHIN));
    const ankle = j('ankle' + side, knee, 0, -SHIN, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.055, 0.22), skinMat);
    foot.position.set(0, -0.08, 0.05); foot.castShadow = true;
    ankle.add(foot);
  }

  function setPose(pose) {
    if (!pose) return;
    if (pose.joints) {
      for (const [name, rot] of Object.entries(pose.joints)) {
        const g = joints[name];
        if (g) g.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
      }
    }
    if (pose.root) {
      body.position.set(pose.root.x || 0, HIPS_Y + (pose.root.y || 0), pose.root.z || 0);
      body.rotation.y = pose.root.ry || 0;
    }
  }

  return { group, joints, setPose };
}
