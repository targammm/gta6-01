// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, police siren, gunshots, pickup blips and a small bass loop.
export function createAudio() {
  const audio = {
    ctx: null, master: null, muted: false, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, sirenLfo: null, musicTimer: 0, musicStep: 0,
    started: false,
  };
  return audio;
}

export function ensureAudio(audio) {
  if (audio.started) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(ctx.destination);
    // Engine: sawtooth through a lowpass, pitch follows speed.
    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    // Siren: triangle wave wobbling between two tones.
    audio.sirenOsc = ctx.createOscillator();
    audio.sirenOsc.type = 'triangle';
    audio.sirenOsc.frequency.value = 750;
    audio.sirenLfo = ctx.createOscillator();
    audio.sirenLfo.type = 'square';
    audio.sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    audio.sirenLfo.connect(lfoGain);
    lfoGain.connect(audio.sirenOsc.frequency);
    audio.sirenGain = ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();
    audio.sirenLfo.start();
    audio.started = true;
    if (ctx.state === 'suspended') ctx.resume();
  } catch (err) { /* audio is best-effort; the game must never fail without it */ }
}

export function updateEngineSound(audio, speedKmh, inCar) {
  if (!audio.started || !audio.ctx) return;
  const target = inCar ? 0.05 + Math.min(0.09, speedKmh / 1400) : 0.0;
  audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.08);
  audio.engineOsc.frequency.setTargetAtTime(52 + speedKmh * 1.6, audio.ctx.currentTime, 0.08);
}

export function updateSirenSound(audio, wanted) {
  if (!audio.started || !audio.ctx) return;
  const target = wanted > 0 ? 0.045 : 0;
  audio.sirenGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.3);
}

function noiseBurst(audio, duration, filterFreq, volume) {
  if (!audio.started || !audio.ctx) return;
  const ctx = audio.ctx;
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(filter); filter.connect(gain); gain.connect(audio.master);
  src.start();
}

export function playGunshot(audio) { noiseBurst(audio, 0.14, 2600, 0.5); }
export function playCrash(audio, hard) { noiseBurst(audio, hard ? 0.3 : 0.12, 700, hard ? 0.5 : 0.25); }
export function playPickup(audio) {
  if (!audio.started || !audio.ctx) return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, ctx.currentTime);
  osc.frequency.setValueAtTime(990, ctx.currentTime + 0.09);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
  osc.connect(gain); gain.connect(audio.master);
  osc.start(); osc.stop(ctx.currentTime + 0.26);
}
export function playMissionComplete(audio) {
  if (!audio.started || !audio.ctx) return;
  const ctx = audio.ctx;
  [523, 659, 784].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, ctx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.4);
    osc.connect(gain); gain.connect(audio.master);
    osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.42);
  });
}

// Tiny bass loop: two-note groove, scheduled on the step clock.
export function updateMusic(audio, dt) {
  if (!audio.started || !audio.ctx || audio.muted) return;
  audio.musicTimer += dt;
  const beat = 0.42;
  if (audio.musicTimer >= beat) {
    audio.musicTimer -= beat;
    audio.musicStep = (audio.musicStep + 1) % 8;
    const ctx = audio.ctx;
    const notes = [55, 55, 65.4, 55, 49, 55, 73.4, 65.4];
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[audio.musicStep];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.11, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + beat * 0.9);
    osc.connect(gain); gain.connect(audio.master);
    osc.start(); osc.stop(ctx.currentTime + beat);
  }
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master && audio.ctx) {
    audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
  }
}
