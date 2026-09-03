// Coach voice via Web Speech API. Feature-detected; app works without it.

export function createCoach() {
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let enabled = true;
  let voiceName = null;

  function voices() {
    if (!available) return [];
    return speechSynthesis.getVoices().filter(v => v.lang.startsWith('en') || v.lang.startsWith('ja'));
  }

  function pickVoice() {
    const all = voices();
    return all.find(v => v.name === voiceName) || all[0] || null;
  }

  function speak(text, { rate = 1, pitch = 1, volume = 1 } = {}) {
    if (!available || !enabled) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;
    speechSynthesis.speak(u);
  }

  return {
    available,
    get enabled() { return enabled; },
    setEnabled(b) {
      enabled = b;
      if (!b && available) speechSynthesis.cancel();
    },
    voices,
    setVoice(name) { voiceName = name; },
    sayStep(step, speed) {
      if (speed > 3) return; // speech can't keep up beyond ~3x
      speak(step.coachCall, { rate: Math.min(2, Math.max(0.7, speed)) });
    },
    kiai() {
      speak('Eeei!', { rate: 2, pitch: 1.6, volume: 1 });
    },
  };
}
