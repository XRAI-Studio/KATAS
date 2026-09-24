import * as THREE from 'three';
import { OrbitControls } from '../lib/three/OrbitControls.js';

// Okinawan dojo: 12m wide (x), 9m deep (z). Kamiza on the back wall (-z),
// performer starts at the origin facing +z (toward the default camera).
const ROOM_W = 12, ROOM_D = 12, ROOM_H = 3.4;

const CAMERA_PRESETS = {
  front:    { pos: [0, 1.6, 5.2],   target: [0, 0.9, 0.8] },
  side:     { pos: [5.2, 1.6, 0.8], target: [0, 0.9, 0.8] },
  rear:     { pos: [0, 1.7, -3.6],  target: [0, 0.9, 0.8] },
  overhead: { pos: [0, 6.8, 1.2],   target: [0, 0, 0.8] },
};

const woodDark = () => new THREE.MeshStandardMaterial({ color: 0x3d2b1a, roughness: 0.75 });

function buildFloor(scene) {
  const tones = [0x8a6a44, 0x81633f, 0x93724b];
  const plankW = 0.5;
  for (let i = 0; i < ROOM_W / plankW; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: tones[i % 3], roughness: 0.85 });
    const plank = new THREE.Mesh(new THREE.BoxGeometry(plankW - 0.02, 0.04, ROOM_D), mat);
    plank.position.set(-ROOM_W / 2 + plankW / 2 + i * plankW, -0.02, 0);
    plank.receiveShadow = true;
    scene.add(plank);
  }
}

function shojiPanel(w, h) {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 1, side: THREE.DoubleSide,
      emissive: 0x8a7a5c, emissiveIntensity: 0.15 })
  );
  g.add(paper);
  const barMat = woodDark();
  const cols = Math.max(2, Math.round(w / 0.45));
  for (let i = 0; i <= cols; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), barMat);
    bar.position.set(-w / 2 + (w / cols) * i, 0, 0.02);
    g.add(bar);
  }
  const rows = Math.max(2, Math.round(h / 0.45));
  for (let i = 0; i <= rows; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.03), barMat);
    bar.position.set(0, -h / 2 + (h / rows) * i, 0.02);
    g.add(bar);
  }
  return g;
}

function buildWalls(scene) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfc0a5, roughness: 1 });

  // Back (kamiza) wall: solid plaster
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat);
  back.position.set(0, ROOM_H / 2, -ROOM_D / 2);
  scene.add(back);

  // Front wall behind the default camera (keeps the room enclosed when orbiting)
  const front = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat);
  front.position.set(0, ROOM_H / 2, ROOM_D / 2);
  front.rotation.y = Math.PI;
  scene.add(front);

  // Side walls: shoji screens between posts
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const panel = shojiPanel(ROOM_D / 4 - 0.12, ROOM_H - 0.7);
      panel.position.set(side * ROOM_W / 2, (ROOM_H - 0.7) / 2 + 0.35, -ROOM_D / 2 + ROOM_D / 8 + i * ROOM_D / 4);
      panel.rotation.y = side * -Math.PI / 2;
      scene.add(panel);
    }
  }

  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ color: 0x2a1d10, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM_H;
  scene.add(ceil);

  // Posts and beams
  const postMat = woodDark();
  // Full post row on the kamiza wall; corner posts only at the front so the
  // default camera view stays clear.
  for (const x of [-ROOM_W / 2, -ROOM_W / 4, 0, ROOM_W / 4, ROOM_W / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, ROOM_H, 0.16), postMat);
    post.position.set(x, ROOM_H / 2, -ROOM_D / 2);
    post.castShadow = true;
    scene.add(post);
  }
  for (const x of [-ROOM_W / 2, ROOM_W / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, ROOM_H, 0.16), postMat);
    post.position.set(x, ROOM_H / 2, ROOM_D / 2);
    post.castShadow = true;
    scene.add(post);
  }
  for (const z of [-ROOM_D / 2, 0, ROOM_D / 2]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.18, 0.14), postMat);
    beam.position.set(0, ROOM_H - 0.09, z);
    scene.add(beam);
  }
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, ROOM_D), postMat);
    beam.position.set(side * ROOM_W / 2, ROOM_H - 0.09, 0);
    scene.add(beam);
  }
}

function buildKamiza(scene) {
  const z = -ROOM_D / 2 + 0.02;

  // Hanging scroll (kakejiku) with red sun circle
  const scroll = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xf5eedd, roughness: 1 }));
  scroll.add(paper);
  for (const y of [0.78, -0.78]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), woodDark());
    rod.rotation.z = Math.PI / 2;
    rod.position.y = y;
    scroll.add(rod);
  }
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24),
    new THREE.MeshStandardMaterial({ color: 0xb32020, roughness: 0.9 }));
  sun.position.set(0, 0.25, 0.01);
  scroll.add(sun);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x24303f, roughness: 1 }));
  stripe.position.set(0, -0.35, 0.01);
  scroll.add(stripe);
  scroll.position.set(0, 1.9, z);
  scene.add(scroll);

  // Shelf (kamidana) with small vases
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.3), woodDark());
  shelf.position.set(0, 0.95, z + 0.16);
  shelf.castShadow = true;
  scene.add(shelf);
  for (const x of [-0.6, 0.6]) {
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0x88463a, roughness: 0.8 }));
    vase.position.set(x, 1.07, z + 0.16);
    scene.add(vase);
  }

  // Isshin Ryu banner (vertical, deep red with gold border) each side of the scroll
  for (const x of [-2.2, 2.2]) {
    const banner = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x6e1414, roughness: 1 }));
    banner.add(cloth);
    const border = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.95),
      new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.9 }));
    border.position.z = -0.005;
    banner.add(border);
    banner.position.set(x, 1.85, z);
    scene.add(banner);
  }

  // Rope with paper zigzags across the top of the kamiza wall (shimenawa style)
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 5.2, 8),
    new THREE.MeshStandardMaterial({ color: 0xc9b88a, roughness: 1 }));
  rope.rotation.z = Math.PI / 2;
  rope.position.set(0, 2.85, z + 0.08);
  scene.add(rope);
  for (let i = -2; i <= 2; i++) {
    const shide = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xf7f2e6, roughness: 1, side: THREE.DoubleSide }));
    shide.position.set(i * 1.1, 2.66, z + 0.08);
    scene.add(shide);
  }
}

function buildLanterns(scene) {
  for (const x of [-2.6, 2.6]) {
    const lantern = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.45, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf0dfb2, roughness: 1, side: THREE.DoubleSide,
        emissive: 0xffc873, emissiveIntensity: 0.7 }));
    lantern.add(shade);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 10), woodDark());
    cap.position.y = 0.24;
    lantern.add(cap);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 6), woodDark());
    cord.position.y = 0.65;
    lantern.add(cord);
    const light = new THREE.PointLight(0xffc873, 8, 7, 1.6);
    light.position.y = 0;
    lantern.add(light);
    lantern.position.set(x, 2.3, 0.6);
    scene.add(lantern);
  }
}

function buildLights(scene) {
  scene.add(new THREE.AmbientLight(0xfff1dc, 0.55));
  const key = new THREE.DirectionalLight(0xfff2dd, 1.6);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8e2ff, 0.35);
  fill.position.set(-5, 4, -3);
  scene.add(fill);
}

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c140c);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
  camera.position.set(...CAMERA_PRESETS.front.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(...CAMERA_PRESETS.front.target);
  controls.minDistance = 1.5;
  controls.maxDistance = 12;
  controls.maxPolarAngle = 1.52;

  buildFloor(scene);
  buildWalls(scene);
  buildKamiza(scene);
  buildLanterns(scene);
  buildLights(scene);

  let tween = null;
  function setCameraPreset(name) {
    const p = CAMERA_PRESETS[name];
    if (!p) return;
    tween = {
      t: 0,
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(...p.pos),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...p.target),
    };
  }

  function tick(dt) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt * 2.2);
      const u = tween.t * tween.t * (3 - 2 * tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, u);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, u);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { scene, camera, renderer, controls, setCameraPreset, tick };
}
