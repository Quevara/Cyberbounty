// Vice Harbor v2.3 — the day and night clock. One in-game day lasts
// DAY_LENGTH seconds of play and rolls through four phases — dawn, day,
// dusk, night — each with its own light level and lamp glow. The clock
// is pure state: a fraction of the day and nothing else, so the same
// elapsed time always gives the same sky, and the screenshot scenes can
// set the clock to a fixed phase and stay deterministic. At night the
// street lamps burn, the windows light up and the world darkens under a
// blue overlay; at dawn and dusk the light is warm and low. The HUD
// reads the clock to show the time of day, and the renderer reads it to
// paint the light.

import { DAYNIGHT, DAY_LENGTH } from './config.js';
import { clamp01, lerp } from './util.js';

/** A fresh clock, starting in the late afternoon. */
export function createDayNight() {
  return { t: DAYNIGHT.startPhase, phase: null };
}

/** Advance the clock by `dt` seconds of play; wraps at the end of the day. */
export function updateDayNight(daynight, dt) {
  daynight.t += dt / DAY_LENGTH;
  if (daynight.t >= 1) daynight.t -= 1;
  daynight.phase = null;
}

/** Set the clock to an exact fraction of the day (0..1), for staged scenes. */
export function setDayNight(daynight, fraction) {
  daynight.t = ((fraction % 1) + 1) % 1;
  daynight.phase = null;
}

/** The phase the clock is in right now, from the phase table. */
export function currentPhase(daynight) {
  const phases = DAYNIGHT.phases;
  let found = phases[0];
  for (let i = 0; i < phases.length; i += 1) {
    if (daynight.t >= phases[i].start) found = phases[i];
  }
  return found;
}

/** The phase after the current one, for a smooth blend at the edges. */
function nextPhase(daynight) {
  const phases = DAYNIGHT.phases;
  const now = currentPhase(daynight);
  const index = phases.indexOf(now);
  return phases[(index + 1) % phases.length];
}

/** How far through the current phase the clock is, 0..1. */
function phaseProgress(daynight) {
  const phases = DAYNIGHT.phases;
  const now = currentPhase(daynight);
  const index = phases.indexOf(now);
  const start = now.start;
  const end = index + 1 < phases.length ? phases[index + 1].start : 1;
  if (end <= start) return 0;
  return clamp01((daynight.t - start) / (end - start));
}

/** The light level right now, 0.35 at deep night to 1.0 at midday,
 *  eased across the last quarter of each phase so dawn and dusk melt. */
export function lightLevel(daynight) {
  const now = currentPhase(daynight);
  const next = nextPhase(daynight);
  const progress = phaseProgress(daynight);
  const blend = progress > 0.75 ? (progress - 0.75) / 0.25 : 0;
  return lerp(now.light, next.light, blend);
}

/** How strongly the street lamps glow right now, 0 by day to 1 at night. */
export function lampGlow(daynight) {
  const now = currentPhase(daynight);
  const next = nextPhase(daynight);
  const progress = phaseProgress(daynight);
  const blend = progress > 0.75 ? (progress - 0.75) / 0.25 : 0;
  return lerp(now.lamps, next.lamps, blend);
}

/** True when the city is in its night phase. */
export function isNight(daynight) {
  return currentPhase(daynight).name === 'Night';
}

/** The name of the current phase: Dawn, Day, Dusk or Night. */
export function phaseName(daynight) {
  return currentPhase(daynight).name;
}

/** The clock as a 24-hour time string, for the HUD: the day starts at 06:00. */
export function clockTime(daynight) {
  const hours = 6 + daynight.t * 24;
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  const hh = h < 10 ? `0${h}` : `${h}`;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${hh}:${mm}`;
}
