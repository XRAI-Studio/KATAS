import * as THREE from 'three';

// Smoke test: lit rotating cube proves vendored Three + import map work.
// Replaced with the real app in later tasks.
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x241a10);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(2, 2, 3);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const key = new THREE.DirectionalLight(0xfff2dd, 1.2);
key.position.set(3, 5, 2);
scene.add(key);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xc9503c })
);
scene.add(cube);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.01;
  cube.rotation.x += 0.004;
  renderer.render(scene, camera);
});
