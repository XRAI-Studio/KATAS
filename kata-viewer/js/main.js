import { initScene } from './scene.js';
import { createKarateka } from './avatar.js';
import { POSES } from './poses.js';
import { buildTimeline, samplePose, stepAt, Player } from './player.js';
import { initUI } from './ui.js';
import { createCoach } from './coach.js';
import { initBunkai } from './bunkai.js';

const KATAS = [
  { file: 'seisan.json', displayName: 'Seisan (十三)' },
  { file: 'seiunchin.json', displayName: 'Seiunchin (制引戦)' },
  { file: 'naihanchi.json', displayName: 'Naihanchi (ナイハンチ)' },
  { file: 'wansu.json', displayName: 'Wansu (汪楫)' },
  { file: 'chinto.json', displayName: 'Chinto (鎮東)' },
];

const canvas = document.getElementById('scene');
let ctx;
try {
  ctx = initScene(canvas);
} catch (e) {
  const banner = document.getElementById('error-banner');
  banner.textContent = 'WebGL is not available in this browser. Please use a recent Chrome, Edge, Firefox, or Safari with hardware acceleration enabled.';
  banner.classList.remove('hidden');
  throw e;
}
const { scene, camera, renderer, setCameraPreset, tick: sceneTick } = ctx;

const karateka = createKarateka();
scene.add(karateka.group);

const coach = createCoach();
const bunkai = initBunkai(scene);

let timeline = null;
let player = null;

const ui = initUI({
  katas: KATAS,
  onKataChange: loadKata,
  onPreset: setCameraPreset,
  getPlayer: () => player,
});

// Kiai visual effects
const kiaiFlash = document.getElementById('kiai-flash');
const kiaiText = document.getElementById('kiai-text');
function kiaiEffect() {
  kiaiFlash.classList.add('on');
  kiaiText.classList.add('on');
  setTimeout(() => kiaiFlash.classList.remove('on'), 300);
  setTimeout(() => kiaiText.classList.remove('on'), 750);
  coach.kiai();
}

async function loadKata(file) {
  try {
    const res = await fetch('data/' + file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const kata = await res.json();
    timeline = buildTimeline(kata, POSES);
    player = new Player(timeline, {
      onStep: (step) => {
        ui.setStep(step, timeline);
        if (player && player.playing) coach.sayStep(step, player.speed);
      },
      onKiai: kiaiEffect,
    });
    ui.setTimeline(timeline);
    player.seek(0);
    applyTime(0);
  } catch (e) {
    ui.showError(`Could not load kata file "${file}": ${e.message}. Other katas remain available.`);
  }
}

// Shareable / testable state via URL params: ?kata=chinto&t=30&play=1&bunkai=1&cam=side
async function applyUrlParams() {
  const q = new URLSearchParams(location.search);
  const kataParam = q.get('kata');
  const file = kataParam && KATAS.find(k => k.file === kataParam + '.json')?.file;
  await loadKata(file || KATAS[0].file);
  if (file) document.getElementById('kata-select').value = file;
  if (q.get('bunkai') === '1') {
    document.getElementById('toggle-bunkai').checked = true;
    bunkai.setEnabled(true);
  }
  if (q.get('cam')) setCameraPreset(q.get('cam'));
  const t = parseFloat(q.get('t'));
  if (player && !Number.isNaN(t)) { player.seek(t); applyTime(t); }
  if (player && q.get('play') === '1') player.play();
}

function applyTime(t) {
  if (!timeline) return;
  const sampled = samplePose(timeline, t);
  karateka.setPose(sampled);
  karateka.group.position.set(sampled.embusen.x, 0, sampled.embusen.z);
  karateka.group.rotation.y = sampled.embusen.facing;
  const step = stepAt(timeline, t);
  const u = Math.min(1, Math.max(0, (t - step.start) / Math.max(1e-9, step.end - step.start)));
  bunkai.update(step, u);
}

// Voice + bunkai toggles
const toggleVoice = document.getElementById('toggle-voice');
const voiceSelect = document.getElementById('voice-select');
if (coach.available) {
  toggleVoice.addEventListener('change', () => coach.setEnabled(toggleVoice.checked));
  function fillVoices() {
    voiceSelect.innerHTML = '';
    for (const v of coach.voices()) {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name.replace(/^Microsoft /, '');
      voiceSelect.appendChild(opt);
    }
  }
  fillVoices();
  if ('onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged = fillVoices;
  voiceSelect.addEventListener('change', () => coach.setVoice(voiceSelect.value));
} else {
  toggleVoice.checked = false;
  toggleVoice.disabled = true;
  toggleVoice.parentElement.title = 'Speech synthesis is not available in this browser';
  voiceSelect.disabled = true;
}

document.getElementById('toggle-bunkai').addEventListener('change', (e) =>
  bunkai.setEnabled(e.target.checked));

// Render loop
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sceneTick(dt);
  if (player) {
    const t = player.tick(dt);
    applyTime(t);
    ui.refresh(t);
  }
  renderer.render(scene, camera);
});

applyUrlParams();
