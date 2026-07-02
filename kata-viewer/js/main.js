import * as THREE from 'three';
import { createKarateka } from './avatar.js';
import { POSES, composePose } from './poses.js';

// Task 3 visual harness: shows the karateka; click canvas (or press N) to
// cycle through every pose in the library. Replaced by the real app in Task 6+.
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  const banner = document.getElementById('error-banner');
  banner.textContent = 'WebGL is not available in this browser. Please use a recent Chrome, Edge, Firefox, or Safari with hardware acceleration enabled.';
  banner.classList.remove('hidden');
  throw e;
}
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x241a10);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(1.6, 1.5, 3.2);
camera.lookAt(0, 0.9, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const key = new THREE.DirectionalLight(0xfff2dd, 1.4);
key.position.set(3, 6, 4);
key.castShadow = true;
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const karateka = createKarateka();
scene.add(karateka.group);

const poseNames = Object.keys(POSES);
let idx = -1;
const label = document.getElementById('step-label');

function nextPose() {
  idx = (idx + 1) % poseNames.length;
  const name = poseNames[idx];
  // stance-ish poses stand alone; arm/leg partials compose onto ready
  karateka.setPose(composePose(POSES.ready, POSES[name]));
  label.textContent = `${idx + 1}/${poseNames.length} — ${name}`;
}
nextPose();
canvas.addEventListener('click', nextPose);
window.addEventListener('keydown', (e) => { if (e.key === 'n') nextPose(); });

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => renderer.render(scene, camera));
