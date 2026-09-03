import { createKarateka } from './avatar.js';
import { POSES } from './poses.js';
import { buildClip, sampleClip } from './player.js';

// Bunkai attacker: dark-gi karateka who performs the recorded attack for the
// current step, as a pure function of the step's local progress u ∈ [0,1].

// Each attack: keyframes of [u, pose names]; built into clips with the same
// kime/hold/curve semantics as the performer's timeline (times in step-local u).
const ATTACKS = {
  steppingPunchR: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['seisanDachiR', 'punchMidR', 'guardChestL']],
    [0.7, ['seisanDachiR', 'punchMidR', 'guardChestL']],
    [1, ['seisanDachiR', 'chamberR', 'guardChestL']],
  ],
  steppingPunchL: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['seisanDachiL', 'punchMidL', 'guardChestR']],
    [0.7, ['seisanDachiL', 'punchMidL', 'guardChestR']],
    [1, ['seisanDachiL', 'chamberL', 'guardChestR']],
  ],
  punchHighR: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['seisanDachiR', 'punchHighR', 'guardChestL']],
    [0.7, ['seisanDachiR', 'punchHighR', 'guardChestL']],
    [1, ['seisanDachiR', 'chamberR', 'guardChestL']],
  ],
  punchHighL: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['seisanDachiL', 'punchHighL', 'guardChestR']],
    [0.7, ['seisanDachiL', 'punchHighL', 'guardChestR']],
    [1, ['seisanDachiL', 'chamberL', 'guardChestR']],
  ],
  frontKickR: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['ready', 'guardBoth', 'frontKickR']],
    [0.65, ['ready', 'guardBoth', 'frontKickR']],
    [1, ['seisanDachiR', 'guardBoth']],
  ],
  frontKickL: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['ready', 'guardBoth', 'frontKickL']],
    [0.65, ['ready', 'guardBoth', 'frontKickL']],
    [1, ['seisanDachiL', 'guardBoth']],
  ],
  grabWristR: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['seisanDachiR', 'nukiteR', 'guardChestL']],
    [1, ['seisanDachiR', 'grabPullR', 'guardChestL']],
  ],
  grabLapel: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['seisanDachiR', 'doubleCollarbone']],
    [1, ['seisanDachiR', 'doubleCollarbone']],
  ],
  grabRear: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['seisanDachiR', 'doubleCollarbone']],
    [1, ['seisanDachiR', 'doubleCollarbone']],
  ],
  chokeFront: [
    [0, ['ready', 'guardBoth']],
    [0.4, ['seisanDachiR', 'doubleShutoThroat']],
    [1, ['seisanDachiR', 'doubleShutoThroat']],
  ],
  sweepLow: [
    [0, ['ready', 'guardBoth']],
    [0.45, ['ready', 'guardBoth', 'sideKickR']],
    [0.7, ['ready', 'guardBoth', 'sideKickR']],
    [1, ['seisanDachiR', 'guardBoth']],
  ],
  none: [
    [0, ['ready', 'guardBoth']],
    [1, ['ready', 'guardBoth']],
  ],
};

const ATTACK_HOLD = 0.1;   // fraction of the step a landed attack is held
const CLIPS = {};
for (const [name, kfs] of Object.entries(ATTACKS)) {
  CLIPS[name] = buildClip(kfs.map(([time, parts]) => ({ time, parts })), POSES, { hold: ATTACK_HOLD });
}

function sampleAttack(name, u) {
  return sampleClip(CLIPS[name] || CLIPS.none, u);
}

export function initBunkai(scene) {
  const attacker = createKarateka({ gi: 0x3a3a45, belt: 0x7a1f1f, skin: 0xb28a63 });
  attacker.group.visible = false;
  // enable opacity fades
  attacker.group.traverse((o) => {
    if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; }
  });
  scene.add(attacker.group);

  const card = document.getElementById('bunkai-card');
  let enabled = false;
  let lastCardStep = null;

  function setOpacity(v) {
    attacker.group.traverse((o) => { if (o.isMesh) o.material.opacity = v; });
  }

  function update(step, u) {
    if (!enabled) {
      attacker.group.visible = false;
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    if (step !== lastCardStep) {
      lastCardStep = step;
      card.innerHTML = '';
      const h = document.createElement('h4');
      h.textContent = 'Bunkai — application';
      card.appendChild(h);
      const p = document.createElement('div');
      p.textContent = step.bunkai.known ? step.bunkai.text : 'No bunkai recorded for this movement.';
      card.appendChild(p);
    }
    if (!step.bunkai.known) {
      attacker.group.visible = false;
      return;
    }
    attacker.group.visible = true;
    const from = step.bunkai.attackerFrom;
    attacker.group.position.set(from.x, 0, from.z);
    attacker.group.rotation.y = from.facing;
    attacker.setPose(sampleAttack(step.bunkai.attack, u));
    const fade = Math.min(1, Math.min(u, 1 - u) / 0.12);
    setOpacity(Math.max(0, Math.min(1, fade)) * 0.95);
  }

  return {
    setEnabled(b) { enabled = b; if (!b) { attacker.group.visible = false; card.classList.add('hidden'); } },
    update,
  };
}
