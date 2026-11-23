// Vice Harbor v2.3 — the seeded dice. The same seed gives the same city,
// the same traffic and the same screenshot scenes, which is what makes the
// deterministic ?shot= scenes repeatable. The generator is a xorshift32
// stream, written out here so the game has no dependency on any library.
// A fork is a child stream for one named subsystem: it starts from the
// parent's current state mixed with the label, so two subsystems never
// draw the same sequence and one system's draws never shift another's.
// Every helper below takes the stream as its first argument, so a test
// can hand in its own seed and replay any draw exactly.

/** A seeded 0..1 stream, with a `.fork(label)` child-stream maker. */
export function createRandom(seed) {
  let state = (seed | 0) || 0x9e3779b9;
  const random = function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return (state >>> 0) / 4294967296;
  };
  random.fork = function fork(label) {
    let h = state;
    const text = String(label);
    for (let i = 0; i < text.length; i += 1) {
      h = (Math.imul(h, 33) ^ text.charCodeAt(i)) | 0;
    }
    return createRandom(h);
  };
  return random;
}

/** A number in [low, high) from the seeded `random` stream. */
export function range(random, low, high) {
  return low + random() * (high - low);
}

/** An integer in [low, high], inclusive, from the seeded stream. */
export function rangeInt(random, low, high) {
  const span = high - low + 1;
  return low + Math.floor(random() * span);
}

/** True with probability `probability` (0..1) from the seeded stream. */
export function chance(random, probability) {
  return random() < probability;
}

/** `value` plus or minus up to `amount`, from the seeded stream. */
export function jitter(random, value, amount) {
  return value + (random() * 2 - 1) * amount;
}

/** -1 or 1, from the seeded stream. */
export function randomSign(random) {
  return random() < 0.5 ? -1 : 1;
}

/** One entry of `list`, weighted by `weights` (same length as `list`). */
export function weightedPick(random, list, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) total += weights[i];
  let roll = random() * total;
  for (let i = 0; i < list.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** Shuffle `list` in place (Fisher-Yates) with the seeded stream. */
export function shuffle(random, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/** `count` distinct entries drawn from `list`, in draw order. */
export function sample(random, list, count) {
  const copy = list.slice();
  shuffle(random, copy);
  return copy.slice(0, Math.min(count, copy.length));
}

/** A bell-shaped draw around `mean` with spread `spread`, clamped to
 *  [low, high]: the middle of three uniform draws, so sizes cluster in
 *  the middle instead of spreading evenly. */
export function gaussian(random, mean, spread, low, high) {
  const a = random();
  const b = random();
  const c = random();
  const centred = (a + b + c) / 3 - 0.5;
  const value = mean + centred * 2 * spread;
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
