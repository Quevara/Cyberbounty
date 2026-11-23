// Vice Harbor v2.3 — sound, synthesised with WebAudio only — no audio
// files, no network. Engine hum, sirens, gunshots, pickups, cash, skids,
// doors and the mission fanfare. Every call is safe to make before the
// audio context exists or after it is suspended, and none of them can
// break the game. v2.3 funnels every tone through one `tone` helper (an
// oscillator, a gain envelope and an optional pitch slide), keeps the
// one-note jingles in a small table so a new sound is one row, and adds
// the new systems' sounds: a taxi ding when a passenger flags Lena
// down, a bright chime for a found hubcap, and a metal clank for a
// bought garage upgrade, plus the checkpoint chime, the door slam and
// the horn from before.

/** One-note jingles, as [frequencies, type, volume, step delay]. */
const JINGLES = {
  cash: { notes: [880, 1320], type: 'sine', volume: 0.2, gap: 0.09, length: 0.12 },
  fanfare: { notes: [523, 659, 784], type: 'sine', volume: 0.2, gap: 0.11, length: 0.14 },
  checkpoint: { notes: [784, 988], type: 'sine', volume: 0.16, gap: 0.08, length: 0.1 },
  horn: { notes: [370, 466], type: 'square', volume: 0.11, gap: 0, length: 0.16 },
  /** A taxi passenger hailing a cab: two bright pings, a fifth apart. */
  taxi: { notes: [1175, 1568], type: 'sine', volume: 0.18, gap: 0.12, length: 0.14 },
  /** A found hubcap: three notes climbing, then one high sparkle. */
  hubcap: { notes: [1047, 1319, 1568, 2093], type: 'sine', volume: 0.16, gap: 0.07, length: 0.1 },
  /** A bought upgrade: a low clank and a rising confirmation. */
  upgrade: { notes: [220, 330, 440], type: 'triangle', volume: 0.2, gap: 0.09, length: 0.13 },
};

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

/** One tone: an oscillator that slides in pitch while its gain fades out. */
function tone(audio, { frequency, duration, type, volume, slideTo, delay }) {
  if (!audio.context || audio.muted) return;
  try {
    const startAt = audio.context.currentTime + (delay || 0);
    const osc = audio.context.createOscillator();
    const gain = audio.context.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(frequency, startAt);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), startAt + duration);
    gain.gain.setValueAtTime(volume || 0.15, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  } catch {
    // Audio is decoration: never let it break the game.
  }
}

/** Play a jingle from the table: its notes in order, `gap` apart. */
function jingle(audio, name) {
  const tune = JINGLES[name];
  if (!tune) return;
  tune.notes.forEach((frequency, i) => {
    tone(audio, {
      frequency,
      duration: tune.length,
      type: tune.type,
      volume: tune.volume,
      delay: i * tune.gap,
    });
  });
}

/** A short noise burst, for skids and impacts, from a filtered buffer. */
function noiseBurst(audio, duration, volume, filterFreq) {
  if (!audio.context || audio.muted) return;
  try {
    const now = audio.context.currentTime;
    const length = Math.max(1, Math.floor(audio.context.sampleRate * duration));
    const buffer = audio.context.createBuffer(1, length, audio.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.context.createBufferSource();
    source.buffer = buffer;
    const filter = audio.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = audio.context.createGain();
    gain.gain.setValueAtTime(volume || 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    source.start(now);
  } catch {
    // Audio is decoration: never let it break the game.
  }
}

export function playPickup(audio) {
  tone(audio, { frequency: 660, duration: 0.12, type: 'sine', volume: 0.2, slideTo: 990 });
}

export function playCash(audio) {
  jingle(audio, 'cash');
}

export function playGunshot(audio) {
  tone(audio, { frequency: 220, duration: 0.12, type: 'sawtooth', volume: 0.25, slideTo: 60 });
  noiseBurst(audio, 0.08, 0.2, 2500);
}

export function playCrash(audio) {
  tone(audio, { frequency: 90, duration: 0.25, type: 'sawtooth', volume: 0.3, slideTo: 40 });
  noiseBurst(audio, 0.2, 0.25, 900);
}

export function playPunch(audio) {
  tone(audio, { frequency: 140, duration: 0.08, type: 'triangle', volume: 0.2, slideTo: 70 });
  noiseBurst(audio, 0.06, 0.12, 800);
}

export function playSkid(audio) {
  noiseBurst(audio, 0.25, 0.1, 1800);
}

/** A door slam, for stealing a car or getting out of one. */
export function playDoor(audio) {
  tone(audio, { frequency: 120, duration: 0.1, type: 'square', volume: 0.25, slideTo: 50 });
  noiseBurst(audio, 0.08, 0.18, 700);
}

/** A short car horn, for a traffic car stuck behind the player. */
export function playHorn(audio) {
  jingle(audio, 'horn');
}

/** A soft click for menus and confirmations. */
export function playClick(audio) {
  tone(audio, { frequency: 1200, duration: 0.05, type: 'sine', volume: 0.12 });
}

/** A low two-note sting for getting busted. */
export function playBusted(audio) {
  tone(audio, { frequency: 220, duration: 0.3, type: 'sawtooth', volume: 0.2, slideTo: 110 });
  tone(audio, { frequency: 165, duration: 0.45, type: 'sawtooth', volume: 0.2, slideTo: 82, delay: 0.26 });
}

/** A short rising arpeggio for a finished mission. */
export function playMissionComplete(audio) {
  jingle(audio, 'fanfare');
}

/** A bright two-note chime for finishing one step of a mission. */
export function playCheckpoint(audio) {
  jingle(audio, 'checkpoint');
}

/** Two bright pings when a taxi passenger flags Lena down. */
export function playTaxiDing(audio) {
  jingle(audio, 'taxi');
}

/** A climbing chime for a found golden hubcap. */
export function playCollectible(audio) {
  jingle(audio, 'hubcap');
}

/** A metal clank and a rising note for a bought garage upgrade. */
export function playUpgrade(audio) {
  jingle(audio, 'upgrade');
  noiseBurst(audio, 0.1, 0.12, 500);
}

/** A two-tone siren blip, called on a timer while the police chase. */
export function playSirenBlip(audio, high) {
  tone(audio, { frequency: high ? 950 : 700, duration: 0.28, type: 'sine', volume: 0.12 });
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

/** Mute or unmute every sound, and stop the engine loop while muted. */
export function setMuted(audio, muted) {
  audio.muted = muted;
  if (muted) stopEngine(audio);
}

/** Turn the master volume up or down, 0..1, for a settings screen. */
export function setMasterVolume(audio, volume) {
  if (!audio.master) return;
  try {
    audio.master.gain.value = Math.max(0, Math.min(1, volume)) * 0.35;
  } catch {
    // Ignore audio errors.
  }
}
