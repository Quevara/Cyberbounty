// Sound for Vice Harbor, synthesised with WebAudio only — no audio files,
// no network. Engine hum, sirens, gunshots, pickups and cash. Every call is
// safe to make before the audio context exists or after it is suspended.

export function createAudio() {
  return {
    context: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenTimer: 0,
    muted: false,
  };
}

/** Create the context on the first user gesture; browsers require that. */
export function ensureAudio(audio) {
  if (audio.context || typeof window === 'undefined' || !window.AudioContext) return;
  try {
    audio.context = new window.AudioContext();
    audio.master = audio.context.createGain();
    audio.master.gain.value = 0.35;
    audio.master.connect(audio.context.destination);
  } catch {
    audio.context = null;
  }
}

function beep(audio, frequency, duration, type, volume, slideTo) {
  if (!audio.context || audio.muted) return;
  try {
    const now = audio.context.currentTime;
    const osc = audio.context.createOscillator();
    const gain = audio.context.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(frequency, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    gain.gain.setValueAtTime(volume || 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch {
    // Audio is decoration: never let it break the game.
  }
}

export function playPickup(audio) {
  beep(audio, 660, 0.12, 'sine', 0.2, 990);
}

export function playCash(audio) {
  beep(audio, 880, 0.1, 'sine', 0.2);
  setTimeout(() => beep(audio, 1320, 0.14, 'sine', 0.2), 90);
}

export function playGunshot(audio) {
  beep(audio, 220, 0.12, 'sawtooth', 0.25, 60);
}

export function playCrash(audio) {
  beep(audio, 90, 0.25, 'sawtooth', 0.3, 40);
}

export function playPunch(audio) {
  beep(audio, 140, 0.08, 'triangle', 0.2, 70);
}

/** A short rising arpeggio for a finished mission. */
export function playMissionComplete(audio) {
  beep(audio, 523, 0.12, 'sine', 0.2);
  setTimeout(() => beep(audio, 659, 0.12, 'sine', 0.2), 110);
  setTimeout(() => beep(audio, 784, 0.2, 'sine', 0.2), 220);
}

/** A two-tone siren blip, called on a timer while the police chase. */
export function playSirenBlip(audio, high) {
  beep(audio, high ? 950 : 700, 0.28, 'sine', 0.12);
}

/** Start the looping engine hum for the player's car. */
export function startEngine(audio) {
  if (!audio.context || audio.engineOsc) return;
  try {
    audio.engineOsc = audio.context.createOscillator();
    audio.engineGain = audio.context.createGain();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 70;
    audio.engineGain.gain.value = 0.05;
    audio.engineOsc.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
  } catch {
    audio.engineOsc = null;
  }
}

export function setEngineSpeed(audio, speed01) {
  if (!audio.engineOsc || !audio.context) return;
  try {
    audio.engineOsc.frequency.setTargetAtTime(60 + speed01 * 140, audio.context.currentTime, 0.1);
    audio.engineGain.gain.setTargetAtTime(0.03 + speed01 * 0.06, audio.context.currentTime, 0.1);
  } catch {
    // Ignore audio errors.
  }
}

export function stopEngine(audio) {
  if (!audio.engineOsc) return;
  try {
    audio.engineOsc.stop();
  } catch {
    // Already stopped.
  }
  audio.engineOsc = null;
  audio.engineGain = null;
}
