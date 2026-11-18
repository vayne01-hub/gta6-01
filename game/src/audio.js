// audio.js — all sound is synthesized with WebAudio. No audio files,
// no network: oscillators and filtered noise, started on first input.
export function createAudio() {
  const A = {
    ctx: null, muted: false, engineOsc: null, engineGain: null, sirenOsc: null,
    ensure() {
      if (A.ctx) return true;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        A.ctx = new Ctx();
        // Engine: a low sawtooth whose pitch follows speed.
        A.engineOsc = A.ctx.createOscillator();
        A.engineOsc.type = 'sawtooth';
        A.engineOsc.frequency.value = 55;
        A.engineGain = A.ctx.createGain();
        A.engineGain.gain.value = 0;
        const filter = A.ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 480;
        A.engineOsc.connect(filter);
        filter.connect(A.engineGain);
        A.engineGain.connect(A.ctx.destination);
        A.engineOsc.start();
        // Siren: two-tone triangle that wails while police are near.
        A.sirenOsc = A.ctx.createOscillator();
        A.sirenOsc.type = 'triangle';
        A.sirenOsc.frequency.value = 700;
        A.sirenGain = A.ctx.createGain();
        A.sirenGain.gain.value = 0;
        A.sirenOsc.connect(A.sirenGain);
        A.sirenGain.connect(A.ctx.destination);
        A.sirenOsc.start();
        return true;
      } catch (e) { return false; }
    },
    resume() { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); },
    engine(ratio, active, wanted) {
      if (!A.ctx || A.muted) return;
      A.engineGain.gain.value = active ? 0.03 + ratio * 0.05 : 0;
      A.engineOsc.frequency.value = 55 + ratio * 140;
      const hot = (wanted || 0) > 0;
      A.sirenGain.gain.value = hot ? 0.012 : 0;
      if (hot) A.sirenOsc.frequency.value = 650 + Math.sin(performance.now() / 380) * 180;
    },
    blip(freq, dur, type, vol, slideTo) {
      if (!A.ctx || A.muted) return;
      try {
        const o = A.ctx.createOscillator();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, A.ctx.currentTime);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, A.ctx.currentTime + dur);
        const g = A.ctx.createGain();
        g.gain.setValueAtTime(vol || 0.12, A.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + dur);
        o.connect(g); g.connect(A.ctx.destination);
        o.start(); o.stop(A.ctx.currentTime + dur);
      } catch (e) { /* audio is best-effort */ }
    },
    noise(dur, vol, filterFreq) {
      if (!A.ctx || A.muted) return;
      try {
        const len = Math.floor(A.ctx.sampleRate * dur);
        const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = A.ctx.createBufferSource();
        src.buffer = buf;
        const f = A.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
        const g = A.ctx.createGain();
        g.gain.value = vol || 0.2;
        src.connect(f); f.connect(g); g.connect(A.ctx.destination);
        src.start();
      } catch (e) { /* audio is best-effort */ }
    },
    play(name) {
      if (!A.ensure()) return;
      A.resume();
      switch (name) {
        case 'shot': A.noise(0.14, 0.5, 2600); A.blip(160, 0.1, 'square', 0.15, 60); break;
        case 'punch': A.noise(0.09, 0.3, 500); A.blip(110, 0.09, 'sine', 0.2, 60); break;
        case 'hit': A.blip(220, 0.08, 'square', 0.1, 140); break;
        case 'hurt': A.blip(180, 0.25, 'sawtooth', 0.12, 70); break;
        case 'pickup': A.blip(660, 0.09, 'sine', 0.14); setTimeout(() => A.blip(990, 0.12, 'sine', 0.14), 90); break;
        case 'complete': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => A.blip(f, 0.16, 'triangle', 0.14), i * 110)); break;
        case 'mission': A.blip(440, 0.12, 'triangle', 0.14); setTimeout(() => A.blip(587, 0.16, 'triangle', 0.14), 120); break;
        case 'crash': A.noise(0.3, 0.4, 700); break;
        case 'skid': A.noise(0.35, 0.08, 2400); break;
        case 'jump': A.blip(300, 0.12, 'sine', 0.08, 520); break;
        case 'door': A.noise(0.08, 0.18, 900); break;
        case 'alarm': A.blip(880, 0.1, 'square', 0.1, 880); setTimeout(() => A.blip(880, 0.1, 'square', 0.1), 140); break;
        case 'siren': break; // siren is a continuous tone, driven by engine()
        case 'reload': A.blip(500, 0.06, 'square', 0.1); setTimeout(() => A.blip(700, 0.06, 'square', 0.1), 90); break;
        case 'dryfire': A.blip(1200, 0.04, 'square', 0.08); break;
        case 'wasted': [392, 311, 233, 175].forEach((f, i) => setTimeout(() => A.blip(f, 0.3, 'sawtooth', 0.1), i * 220)); break;
        default: break;
      }
    },
    toggleMute() {
      A.muted = !A.muted;
      if (A.ctx) {
        if (A.engineGain) A.engineGain.gain.value = 0;
        if (A.sirenGain) A.sirenGain.gain.value = 0;
      }
      return A.muted;
    },
  };
  return A;
}
