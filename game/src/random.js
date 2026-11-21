// A small seeded random number generator: the same seed gives the same city,
// the same traffic and the same screenshot scenes, which is what makes the
// deterministic ?shot= scenes repeatable. Mulberry32, written out here so the
// game has no dependency on any library.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random number in [low, high) from the seeded `random` function. */
export function range(random, low, high) {
  return low + random() * (high - low);
}
