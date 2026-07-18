// UI control bar. Owns the DOM; talks to the Player and app callbacks.

const $ = (id) => document.getElementById(id);

export function initUI({ katas, onKataChange, onPreset, getPlayer }) {
  const kataSelect = $('kata-select');
  const btnPlay = $('btn-play');
  const scrub = $('scrub');
  const markers = $('markers');
  const speed = $('speed');
  const speedValue = $('speed-value');
  const stepLabel = $('step-label');
  const errorBanner = $('error-banner');

  for (const k of katas) {
    const opt = document.createElement('option');
    opt.value = k.file;
    opt.textContent = k.displayName;
    kataSelect.appendChild(opt);
  }
  kataSelect.addEventListener('change', () => onKataChange(kataSelect.value));

  btnPlay.addEventListener('click', () => { getPlayer()?.toggle(); });
  $('btn-prev').addEventListener('click', () => getPlayer()?.prevStep());
  $('btn-next').addEventListener('click', () => getPlayer()?.nextStep());

  let scrubbing = false;
  scrub.addEventListener('input', () => {
    scrubbing = true;
    const p = getPlayer();
    if (p) p.seek(parseFloat(scrub.value));
    scrubbing = false;
  });

  speed.addEventListener('input', () => {
    const s = parseFloat(speed.value);
    getPlayer()?.setSpeed(s);
    speedValue.textContent = s.toFixed(2) + 'x';
  });

  document.querySelectorAll('#camera-presets button').forEach((b) =>
    b.addEventListener('click', () => onPreset(b.dataset.preset)));

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); getPlayer()?.toggle(); }
    else if (e.key === 'ArrowLeft') getPlayer()?.prevStep();
    else if (e.key === 'ArrowRight') getPlayer()?.nextStep();
  });

  function setTimeline(timeline) {
    scrub.min = 0;
    scrub.max = timeline.duration;
    scrub.step = 0.01;
    scrub.value = 0;
    markers.innerHTML = '';
    for (const s of timeline.steps) {
      const tick = document.createElement('div');
      tick.className = s.kiai ? 'kiai' : 'tick';
      tick.style.left = (s.start / timeline.duration * 100) + '%';
      if (s.kiai) tick.title = 'KIAI — step ' + s.id;
      markers.appendChild(tick);
    }
  }

  function setStep(step, timeline) {
    const idx = timeline.steps.indexOf(step) + 1;
    stepLabel.innerHTML = '';
    stepLabel.append(`${idx} / ${timeline.steps.length} — ${step.label}`);
    if (step.unverified) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'unverified';
      b.title = 'This transition could not be fully confirmed by research — see docs/transition-report.md';
      stepLabel.appendChild(b);
    }
  }

  function refresh(t) {
    if (!scrubbing) scrub.value = t;
    const p = getPlayer();
    btnPlay.textContent = p && p.playing ? '⏸' : '▶';
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
    setTimeout(() => errorBanner.classList.add('hidden'), 6000);
  }

  return { setTimeline, setStep, refresh, showError };
}
