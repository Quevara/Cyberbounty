// Vice Harbor v2.3 — the hidden golden hubcaps. Twelve of them are
// scattered across the city by the seeded random, tucked beside
// landmarks, in parks and along the beach, and Lena collects them by
// walking over them. Each one pays cash and score, and the HUD keeps a
// running count, so a player who explores is paid for it. The spots are
// fixed for a seed, so a guide can name them; a collected hubcap stays
// collected for the run, and the set resets when the world resets. The
// renderer draws the uncollected ones as a small gold glint, and the
// minimap never shows them — finding them is the point.

import { COLLECTIBLES } from './config.js';
import { distance } from './util.js';
import { sample } from './random.js';

export const EVENT_COLLECTIBLE = 8192;

/** Candidate hiding spots: beside every landmark, in the parks and on the beach. */
const HIDING_SPOTS = [
  { x: 2140, y: 540 }, { x: 2660, y: 1460 }, { x: 1520, y: 2080 },
  { x: 1340, y: 260 }, { x: 540, y: 1340 }, { x: 1860, y: 2060 },
  { x: 2260, y: 1060 }, { x: 940, y: 940 }, { x: 2540, y: 660 },
  { x: 2940, y: 1740 }, { x: 420, y: 420 }, { x: 1180, y: 1620 },
  { x: 1740, y: 420 }, { x: 2420, y: 1180 }, { x: 780, y: 1980 },
  { x: 2060, y: 340 }, { x: 1620, y: 1240 }, { x: 2820, y: 980 },
  { x: 660, y: 760 }, { x: 2980, y: 420 },
];

/** Twelve hubcaps, picked from the hiding spots by the seeded random. */
export function createCollectibles(random) {
  const chosen = sample(random, HIDING_SPOTS, COLLECTIBLES.count);
  return {
    items: chosen.map((spot, i) => ({
      id: i,
      x: spot.x,
      y: spot.y,
      taken: false,
      /** A slow spin for the glint the renderer draws. */
      spin: random() * Math.PI * 2,
    })),
    takenCount: 0,
  };
}

/** How many hubcaps Lena has found so far. */
export function collectiblesTaken(collectibles) {
  return collectibles.takenCount;
}

/** How many hubcaps exist in total. */
export function collectiblesTotal() {
  return COLLECTIBLES.count;
}

/** True when every hubcap has been found. */
export function collectiblesComplete(collectibles) {
  return collectibles.takenCount >= COLLECTIBLES.count;
}

/** Walk over a hubcap to take it: cash, score and an event for the loop. */
export function updateCollectibles(state, dt) {
  void dt;
  const player = state.player;
  const list = state.collectibles;
  for (const item of list.items) {
    if (item.taken) continue;
    if (distance(player.x, player.y, item.x, item.y) > COLLECTIBLES.pickupRange) continue;
    item.taken = true;
    list.takenCount += 1;
    state.money += COLLECTIBLES.value;
    state.score += COLLECTIBLES.score;
    state.events |= EVENT_COLLECTIBLE;
  }
}

/** Reset the set for a new run: every hubcap is hidden again. */
export function resetCollectibles(collectibles) {
  for (const item of collectibles.items) item.taken = false;
  collectibles.takenCount = 0;
}
