import * as THREE from 'three';
import { initScene } from './scene.js';
import { createKarateka } from './avatar.js';
import { POSES } from './poses.js';
import { buildTimeline, samplePose, stepAt, Player } from './player.js';
import { initUI } from './ui.js';
import { createCoach } from './coach.js';
import { initBunkai } from './bunkai.js';
import { initKit, award as kitAward, furthestStepTracker, homeRoomHandler, isDevHost, kataProgressSync, sameAccount, trackPending } from './kit.js';

const KATAS = [
  { file: 'seisan.json', displayName: 'Seisan (十三)' },
  { file: 'seiunchin.json', displayName: 'Seiunchin (制引戦)' },
  { file: 'naihanchi.json', displayName: 'Naihanchi (ナイハンチ)' },
  { file: 'wansu.json', displayName: 'Wansu (汪楫)' },
  { file: 'chinto.json', displayName: 'Chinto (鎮東)' },
];
const KATA_IDS = KATAS.map((k) => k.file.replace(/\.json$/, ''));

// "Return to Home Room" works on every screen (including the sign-in and error banners),
// so it is wired before the kit starts: it waits up to 2 s for awards in flight, then
// navigates to the portal launcher. Playback stops first so no new awards start.
let pauseForLeave = () => {};
const homeRoom = homeRoomHandler({ beforeLeave: () => pauseForLeave() });
document.getElementById('home-room').addEventListener('click', homeRoom);

// The kit captured one learner's token at init. If the portal signs someone else in (or
// out) under this open tab, stop awarding and saving and reload through the gate so the
// kit and the step tracker start fresh for whoever is signed in now.
let restarting = false;
function restart() {
  if (restarting) return;
  restarting = true;
  const banner = document.getElementById('error-banner');
  banner.textContent = 'The signed-in account changed. Reloading…';
  banner.classList.remove('hidden');
  location.reload();
}

// Portal kit first (class standard rule 3): no user means the kit has already started
// the redirect to the portal login; a missing kit script gets a retry control. Start-up
// is one tracked operation: kit init (which replays awards queued offline), the first
// kit.load() of the tile progress, its merge and the first publish, so a departure waits
// for all of it (bounded), and a learner who is leaving does not get the viewer booted
// under them. The viewer boots as soon as the kit is ready; katas viewed while the first
// load is out are merged in and published once it resolves.
const startup = (async () => {
  const kitStart = await initKit({ ids: KATA_IDS });
  const sync = kitStart.kind === 'ready' ? kataProgressSync(kitStart.kit, { ids: KATA_IDS, onMismatch: restart }) : null;
  return { kitStart, sync };
})();
trackPending(startup.then(({ sync }) => sync?.start()));
const { kitStart, sync } = await startup;
// Cross-device sync (versioned kit only; a no-op otherwise): a page shown again, or restored
// from the back/forward cache, picks up katas viewed or completed on the other device.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync?.refresh(); });
window.addEventListener('pageshow', () => sync?.refresh());
homeRoom.whenStaying(() => start(kitStart, sync));

function start(kitStart, sync) {
if (kitStart.kind !== 'ready') {
  const banner = document.getElementById('error-banner');
  banner.classList.remove('hidden');
  if (kitStart.kind === 'redirecting') {
    banner.textContent = 'Sending you to sign in…';
  } else {
    banner.textContent = 'Could not reach the school portal. ';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.dataset.testid = 'retry-kit';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => location.reload());
    banner.appendChild(retry);
  }
} else {
  boot(kitStart.kit, sync);
}
}

function boot(kit, sync) {
const stepTracker = furthestStepTracker();
let currentKata = null;

// Viewing and completing a kata also update the launcher tile's progress (kit.js
// kataProgressSync), only when the award itself was not refused.
function grant(event, detail) {
  if (restarting) return;
  if (!kitAward(kit, event, detail, { onMismatch: restart })) return;
  if (event === 'kata_view') sync?.record('viewed', detail.kata);
  else if (event === 'kata_complete') sync?.record('completed', detail.kata);
}
function checkAccount() {
  if (!sameAccount(kit, document.cookie)) restart();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAccount(); });
window.addEventListener('focus', checkAccount);

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

// Dev override for the skinned model: ?avatar=missing.glb exercises the
// procedural fallback; ?avatar=off skips the GLB entirely.
const avatarParam = new URLSearchParams(location.search).get('avatar');
const glbOption = avatarParam === 'off' ? { glb: false }
  : avatarParam ? { glb: new URL('assets/' + avatarParam, location.href).href } : {};
const karateka = createKarateka(glbOption);
scene.add(karateka.group);

// Follow-cam bookkeeping: any discontinuity (seek, kata load, preset tween,
// drag end, model swap) requests a rebase, which is applied only after the
// frame's pose has been applied — so it never observes a stale chest position.
let rebasePending = true;
const requestRebase = () => { rebasePending = true; };
ctx.onTweenEnd = requestRebase;
ctx.controls.addEventListener('end', requestRebase);
karateka.onReady(requestRebase);
const chestPos = new THREE.Vector3();

const coach = createCoach();
const bunkai = initBunkai(scene, glbOption);

let timeline = null;
let player = null;
pauseForLeave = () => player?.pause();

let lastPreset = null;
const ui = initUI({
  katas: KATAS,
  onKataChange: loadKata,
  onPreset: (name) => { lastPreset = name; setCameraPreset(name); requestRebase(); },
  getPlayer: () => player,
});

// "Copy link": a URL that reopens this exact moment (kata, time, camera preset,
// bunkai state) — the way to cite a moment in review notes (docs/review-notes.md).
const linkOut = document.getElementById('link-out');
document.getElementById('btn-link').addEventListener('click', async () => {
  if (!player) return;
  const q = new URLSearchParams();
  q.set('kata', document.getElementById('kata-select').value.replace(/\.json$/, ''));
  q.set('t', player.time.toFixed(2));
  if (lastPreset) q.set('cam', lastPreset);
  if (document.getElementById('toggle-bunkai').checked) q.set('bunkai', '1');
  if (document.getElementById('toggle-follow').checked) q.set('follow', '1');
  const url = location.origin + location.pathname + '?' + q.toString();
  linkOut.value = url;
  linkOut.classList.remove('hidden');
  linkOut.select();
  try { await navigator.clipboard.writeText(url); } catch { /* text stays selected for manual copy */ }
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
    const kataId = file.replace(/\.json$/, '');
    currentKata = kataId;
    grant('kata_view', { kata: kataId });
    player = new Player(timeline, {
      onStep: (step) => {
        ui.setStep(step, timeline);
        if (player && player.playing) coach.sayStep(step, player.speed);
        const index = timeline.steps.indexOf(step);
        if (index >= 0 && stepTracker.isNewFurthest(kataId, index)) grant('kata_step', { kata: kataId, step: index });
      },
      onKiai: kiaiEffect,
      onComplete: () => grant('kata_complete', { kata: kataId }),
      onSeek: requestRebase,
    });
    ui.setTimeline(timeline);
    player.seek(0);
    applyTime(0);
    requestRebase();
  } catch (e) {
    ui.showError(`Could not load kata file "${file}": ${e.message}. Other katas remain available.`);
  }
}

if (isDevHost(location.hostname)) {
  // e2e hook (scripts/e2e.ts): reach the player without going through the UI.
  window.__katasDev = {
    player: () => player, seek: (t) => { player.seek(t); applyTime(t); }, kata: () => currentKata,
    // The launcher-tile progress as this page holds it (cross-device sync e2e).
    progress: () => sync?.progress(),
    // Camera state for the follow/preset e2e: orbit target, performer chest, Follow flag.
    view: () => ({ target: ctx.controls.target.toArray(), chest: chestPos.toArray(), following: ctx.following, gliding: ctx.gliding, rebase: ctx.rebaseStats }),
  };
}

// Shareable / testable state via URL params: ?kata=chinto&t=30&play=1&bunkai=1&cam=side&follow=1
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
  // Follow first, so a shared link's preset glide is made relative to the performer.
  if (q.get('follow') === '1') {
    document.getElementById('toggle-follow').checked = true;
    ctx.setFollow(true);
    requestRebase();
  }
  if (q.get('cam')) { lastPreset = q.get('cam'); setCameraPreset(lastPreset); }
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
  karateka.group.updateMatrixWorld(true);
  karateka.getChestWorldPosition(chestPos);
  if (rebasePending) { ctx.rebaseFollow(chestPos); rebasePending = false; }
  else ctx.follow(chestPos);
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
document.getElementById('toggle-follow').addEventListener('change', (e) => {
  ctx.setFollow(e.target.checked);
  requestRebase();
});

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
}
