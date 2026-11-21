// Combat in Vice Harbor: punching up close, shooting with the mouse, bullets
// that fly straight and fade, and the health and ammo they cost. Shooting in
// public raises the wanted level; a quiet punch does not.

import { COMBAT, PLAYER } from './config.js';
import { distance } from './util.js';
import { addWanted } from './police.js';

export const EVENT_SHOT_FIRED = 256;
export const EVENT_ENEMY_DOWN = 512;

export function createCombatState() {
  return { ammo: COMBAT.ammoStart, shootCooldown: 0, punchCooldown: 0 };
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
  };
  state.bullets.push(bullet);
  state.events |= EVENT_SHOT_FIRED;
  return bullet;
}

export function updateBullets(state, dt) {
  const bullets = state.bullets;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += COMBAT.bulletSpeed * dt;
    let spent = b.travelled > COMBAT.bulletRange;
    // A bullet that reaches a police officer or a pedestrian hurts them.
    for (const officer of state.police.officers) {
      if (distance(b.x, b.y, officer.x, officer.y) < 16) {
        state.police.officers.splice(state.police.officers.indexOf(officer), 1);
        state.events |= EVENT_ENEMY_DOWN;
        addWanted(state.police, 1, state);
        spent = true;
        break;
      }
    }
    if (!spent) {
      for (const car of state.cars) {
        if (!car.wrecked && distance(b.x, b.y, car.x, car.y) < 34) {
          car.health -= COMBAT.bulletDamage;
          if (car.health <= 0) car.wrecked = true;
          spent = true;
          break;
        }
      }
    }
    if (spent) bullets.splice(i, 1);
  }
}

/** A punch at the nearest officer or pedestrian in front of the player. */
export function punch(state, player) {
  const combat = state.combat;
  if (combat.punchCooldown > 0) return false;
  combat.punchCooldown = PLAYER.punchCooldown;
  const reach = PLAYER.punchRange + 14;
  for (const officer of state.police.officers) {
    if (distance(player.x, player.y, officer.x, officer.y) < reach) {
      state.police.officers.splice(state.police.officers.indexOf(officer), 1);
      state.events |= EVENT_ENEMY_DOWN;
      return true;
    }
  }
  for (const ped of state.peds) {
    if (distance(player.x, player.y, ped.x, ped.y) < reach) {
      ped.fleeTimer = 3;
      return true;
    }
  }
  return false;
}

export function updateCombatCooldowns(state, dt) {
  if (state.combat.shootCooldown > 0) state.combat.shootCooldown -= dt;
  if (state.combat.punchCooldown > 0) state.combat.punchCooldown -= dt;
}

/** Give the player ammo, up to the combat cap. */
export function addAmmo(state, amount) {
  state.combat.ammo = Math.min(COMBAT.maxAmmo, state.combat.ammo + amount);
}
