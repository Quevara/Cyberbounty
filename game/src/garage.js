// Vice Harbor v2.3 — Otto's garage. The Dockside Warehouse is Otto's
// shop as well as a mission stop: drive or walk up to the door and the
// garage opens, offering three upgrade tracks for Lena's cars. An engine
// level adds top speed, an armour level adds car health, a nitro level
// charges a boost meter the driver spends by holding Shift while driving.
// Each track has three levels and the price rises per level; a level can
// only be bought with money Lena actually has, and a bought level stays
// bought for the run. The garage is a state machine of its own — closed,
// open, bought — and the world asks it for the current bonuses whenever
// Lena drives, so an upgrade is felt the moment it is paid for.

import { GARAGE } from './config.js';
import { distance } from './util.js';
import { landmarkByName } from './city.js';

export const EVENT_UPGRADE = 65536;

/** A fresh garage: no levels bought, boost meter full. */
export function createGarageState(saved) {
  const levels = { engine: 0, armour: 0, nitro: 0 };
  if (saved && saved.garage) {
    for (const track of GARAGE.tracks) {
      const value = saved.garage[track.id];
      if (typeof value === 'number' && value >= 0 && value <= 3) levels[track.id] = value;
    }
  }
  return { levels, boostMeter: 1, open: false };
}

/** The garage door's position: the Dockside Warehouse landmark. */
export function garagePosition(state) {
  const place = landmarkByName(state.city, GARAGE.place);
  return { x: place.x, y: place.y };
}

/** True when Lena is close enough to the garage door to open the shop. */
export function canUseGarage(state) {
  const door = garagePosition(state);
  return distance(state.player.x, state.player.y, door.x, door.y) < GARAGE.useRange;
}

/** The price of the next level of `trackId`, or null when it is maxed out. */
export function upgradePrice(garage, trackId) {
  const track = GARAGE.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const level = garage.levels[trackId] || 0;
  if (level >= track.prices.length) return null;
  return track.prices[level];
}

/** Every track with its current level, next price and blurb, for the shop panel. */
export function garageTracks(garage) {
  return GARAGE.tracks.map((track) => ({
    id: track.id,
    name: track.name,
    blurb: track.blurb,
    level: garage.levels[track.id] || 0,
    maxLevel: track.prices.length,
    price: upgradePrice(garage, track.id),
  }));
}

/** Buy the next level of `trackId`: returns {ok, reason}. */
export function buyUpgrade(state, trackId) {
  const garage = state.garage;
  const track = GARAGE.tracks.find((t) => t.id === trackId);
  if (!track) return { ok: false, reason: 'no such upgrade' };
  const level = garage.levels[trackId] || 0;
  if (level >= track.prices.length) return { ok: false, reason: 'already maxed out' };
  const price = track.prices[level];
  if (state.money < price) return { ok: false, reason: 'not enough money' };
  state.money -= price;
  garage.levels[trackId] = level + 1;
  state.events |= EVENT_UPGRADE;
  // Armour applies to the car Lena is sitting in right now as well.
  if (trackId === 'armour' && state.playerCar) {
    const bonus = GARAGE.tracks[1].bonusPerLevel;
    state.playerCar.maxHealth = (state.playerCar.maxHealth || 100) + bonus;
    state.playerCar.health = Math.min(state.playerCar.maxHealth, state.playerCar.health + bonus);
  }
  return { ok: true, reason: '' };
}

/** Extra top speed from the engine track, in game units. */
export function engineBonus(garage) {
  return (garage.levels.engine || 0) * GARAGE.tracks[0].bonusPerLevel;
}

/** Extra car health from the armour track. */
export function armourBonus(garage) {
  return (garage.levels.armour || 0) * GARAGE.tracks[1].bonusPerLevel;
}

/** The nitro level, 0..3: how hard the boost pushes. */
export function nitroLevel(garage) {
  return garage.levels.nitro || 0;
}

/** Spend boost meter while the driver holds the boost, refill otherwise.
 *  Returns the boost strength 0..1 for this step. */
export function updateBoost(garage, boosting, dt) {
  if (boosting && nitroLevel(garage) > 0 && garage.boostMeter > 0) {
    garage.boostMeter = Math.max(0, garage.boostMeter - dt * 0.5);
    return 0.35 + 0.25 * nitroLevel(garage);
  }
  garage.boostMeter = Math.min(1, garage.boostMeter + dt * 0.12);
  return 0;
}
