// Vice Harbor v2.3 — the weather. Vice Harbor is a coastal city, so the
// sky changes while Lena drives: long clear spells, then a rain shower
// that rolls in, soaks the roads and rolls out again. Rain is a small
// state machine — clear or raining, with a timer to the next change —
// and an intensity that eases in and out instead of snapping, so the
// first drops and the last drops read as weather arriving and leaving,
// not a switch. While it rains the roads are slippery: the player's car
// turns a little less sharply, so a wet chase feels different from a dry
// one. The schedule comes from the seeded random, so the same seed rains
// on the same minutes, and the screenshot scenes can pin the sky to
// whatever they need.

import { WEATHER } from './config.js';
import { clamp01 } from './util.js';
import { range } from './random.js';

/** A fresh sky: clear, with a while to wait before the first shower. */
export function createWeather(random) {
  return {
    /** 'clear' | 'rain' — see updateWeather. */
    state: 'clear',
    /** How hard it rains right now, 0..1, eased toward its target. */
    intensity: 0,
    /** Seconds left in the current spell of weather. */
    timer: range(random, WEATHER.clearMinSeconds, WEATHER.clearMaxSeconds),
  };
}

/** Pin the sky to a state and intensity, for staged scenes. */
export function setWeather(weather, state, intensity) {
  weather.state = state;
  weather.intensity = clamp01(intensity);
  weather.timer = state === 'rain' ? 60 : 90;
}

/** True when it is raining right now, however lightly. */
export function isRaining(weather) {
  return weather.state === 'rain' && weather.intensity > 0.05;
}

/** How hard it rains right now, 0..1: the renderer and the grip read this. */
export function rainIntensity(weather) {
  return weather.intensity;
}

/** How much grip the roads have right now, 1.0 dry down to 0.75 in a
 *  downpour: the driving step multiplies its turn rate by this. */
export function gripFactor(weather) {
  return 1 - WEATHER.gripLoss * weather.intensity;
}

/** How long the current spell has left, in seconds, for the HUD's hint. */
export function weatherTimer(weather) {
  return Math.max(0, weather.timer);
}

/** Advance the sky one step: ease the intensity toward its target, and
 *  roll a new spell when the timer runs out. */
export function updateWeather(weather, random, dt) {
  weather.timer -= dt;
  const target = weather.state === 'rain' ? 1 : 0;
  // Ease in and out over about two seconds: rain arrives as a shower,
  // not a switch being flipped.
  const step = dt / 2;
  if (weather.intensity < target) weather.intensity = Math.min(target, weather.intensity + step);
  else if (weather.intensity > target) weather.intensity = Math.max(target, weather.intensity - step);
  if (weather.timer > 0) return;
  if (weather.state === 'clear') {
    weather.state = 'rain';
    weather.timer = range(random, WEATHER.rainMinSeconds, WEATHER.rainMaxSeconds);
  } else {
    weather.state = 'clear';
    weather.timer = range(random, WEATHER.clearMinSeconds, WEATHER.clearMaxSeconds);
  }
}
