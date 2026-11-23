// Vice Harbor v2.3 — combat: punching up close, shooting with the mouse,
// bullets that fly straight and fade, and the health and ammo they cost.
// Shooting in public raises the wanted level; a quiet punch does not.
// Bullets chip building walls with a puff of dust, so a miss still reads,
// and a hit on a car throws sparks and smoke. v2.3 resolves a bullet's
// hit through one table of target checkers — officer, car, wall, in that
// order — so a new kind of target is one row, not a new branch; every
// shot still leaves a muzzle flash so the player sees the gun fire even
// when the bullet misses into the dark, and a bullet that travels far
// leaves a fading tracer, so a long shot reads across the whole street.

import { COMBAT, PLAYER } from './config.js';
import { distance } from './util.js';
import { addWanted } from './police.js';
import { buildingAt } from './city.js';
import { spawnSparks } from './vehicles.js';

export const EVENT_SHOT_FIRED = 256;
export const EVENT_ENEMY_DOWN = 512;

/** The combat book: ammo and the two cooldowns. */
export function createCombatState() {
  return { ammo: COMBAT.ammoStart, shootCooldown: 0, punchCooldown: 0 };
}

/** A bright muzzle flash at (x, y) along `angle`, fading fast. */
function spawnMuzzleFlash(state, x, y, angle) {
  state.particles.push({
    x: x + Math.cos(angle) * 24,
    y: y + Math.sin(angle) * 24,
    vx: Math.cos(angle) * 60,
    vy: Math.sin(angle) * 60,
    life: 0.08, maxLife: 0.08,
    colour: '#ffe08a',
    size: 7,
  });
}

/** Fire one bullet from (x, y) along `angle`; returns the bullet or null. */
export function fireBullet(state, x, y, angle) {
  const combat = state.combat;
  if (combat.ammo <= 0 || combat.shootCooldown > 0) return null;
  combat.ammo -= 1;
  combat.shootCooldown = COMBAT.shootCooldown;
  const bullet = {
    x: x + Math.cos(angle) * 22,
    y: y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * COMBAT.bulletSpeed,
    vy: Math.sin(angle) * COMBAT.bulletSpeed,
    travelled: 0,
    /** The tracer's tail length, in pixels: longer while the shot is fresh. */
    tracer: 26,
  };
  state.bullets.push(bullet);
  spawnMuzzleFlash(state, x, y, angle);
  state.events |= EVENT_SHOT_FIRED;
  return bullet;
}

/** A bullet that hits an officer takes them down and raises the heat. */
function hitOfficer(state, bullet) {
  for (const officer of state.police.officers) {
    if (distance(bullet.x, bullet.y, officer.x, officer.y) < 16) {
      state.police.officers.splice(state.police.officers.indexOf(officer), 1);
      state.events |= EVENT_ENEMY_DOWN;
      addWanted(state.police, 1, state);
      return true;
    }
  }
  return false;
}

/** A bullet that hits a car damages it and throws sparks. */
function hitCar(state, bullet) {
  for (const car of state.cars) {
    if (car.wrecked) continue;
    if (distance(bullet.x, bullet.y, car.x, car.y) < 34) {
      car.health -= COMBAT.bulletDamage;
      spawnSparks(state, bullet.x, bullet.y, 4);
      if (car.health <= 0) car.wrecked = true;
      return true;
    }
  }
  return false;
}

/** A bullet that hits a wall chips it with a puff of dust. */
function hitWall(state, bullet) {
  if (!buildingAt(state.city, bullet.x, bullet.y)) return false;
  state.particles.push({
    x: bullet.x, y: bullet.y,
    vx: 0, vy: -20,
    life: 0.35, maxLife: 0.35,
    colour: 'rgba(200, 190, 170, 0.7)',
    size: 4,
  });
  return true;
}

/** The target checkers, in the order a bullet meets them: an officer
 *  first, then a car, then a wall. The first one that matches ends it. */
const BULLET_TARGETS = [hitOfficer, hitCar, hitWall];

/** Resolve one bullet's hit: the first target checker that matches wins. */
function resolveBulletHit(state, bullet) {
  for (const check of BULLET_TARGETS) {
    if (check(state, bullet)) return true;
  }
  return false;
}

/** Advance every bullet one step: fly, shorten the tracer, and resolve
 *  the hit or the end of its range. */
export function updateBullets(state, dt) {
  const bullets = state.bullets;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += COMBAT.bulletSpeed * dt;
    b.tracer = Math.max(10, 26 - b.travelled * 0.02);
    const spent = b.travelled > COMBAT.bulletRange || resolveBulletHit(state, b);
    if (spent) bullets.splice(i, 1);
  }
}

/** The nearest officer within `reach` of the player, or null. */
function nearestOfficerInReach(state, player, reach) {
  let best = null;
  let bestD = reach;
  for (const officer of state.police.officers) {
    const d = distance(player.x, player.y, officer.x, officer.y);
    if (d < bestD) {
      bestD = d;
      best = officer;
    }
  }
  return best;
}

/** A punch at the nearest officer or pedestrian in front of the player. */
export function punch(state, player) {
  const combat = state.combat;
  if (combat.punchCooldown > 0) return false;
  combat.punchCooldown = PLAYER.punchCooldown;
  const reach = PLAYER.punchRange + 14;
  const officer = nearestOfficerInReach(state, player, reach);
  if (officer) {
    state.police.officers.splice(state.police.officers.indexOf(officer), 1);
    state.events |= EVENT_ENEMY_DOWN;
    return true;
  }
  for (const ped of state.peds) {
    if (distance(player.x, player.y, ped.x, ped.y) < reach) {
      ped.fleeTimer = 3;
      return true;
    }
  }
  return false;
}

/** Tick both cooldowns down by `dt`, never below zero. */
export function updateCombatCooldowns(state, dt) {
  if (state.combat.shootCooldown > 0) state.combat.shootCooldown -= dt;
  if (state.combat.punchCooldown > 0) state.combat.punchCooldown -= dt;
}

/** Give the player ammo, up to the combat cap. */
export function addAmmo(state, amount) {
  state.combat.ammo = Math.min(COMBAT.maxAmmo, state.combat.ammo + amount);
}

/** True when the player is out of ammo and should find a pickup. */
export function isOutOfAmmo(state) {
  return state.combat.ammo <= 0;
}

/** True when the player is running low and the HUD should warn them. */
export function isLowOnAmmo(state) {
  return state.combat.ammo > 0 && state.combat.ammo <= COMBAT.lowAmmoAt;
}
