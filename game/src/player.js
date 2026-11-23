// Vice Harbor v2.3 — Lena on foot: the person, not the car. Driving
// lives in vehicles.js; this file only owns the walker. Movement is
// velocity based now — a target velocity from the input vector, eased
// toward it each step — so Lena speeds up and slows down instead of
// snapping between speeds, and she still slides along walls: each axis
// moves and collides on its own, so a diagonal walk into a building
// corner slides her along the wall instead of wedging her in. She keeps
// a step cycle for the walk animation, a facing direction, and a short
// burst of speed after leaving a car, so stepping out under fire is a
// chance to run, not an instant loss.

import { CAR, PLAYER, WORLD } from './config.js';
import { clamp, distance, wrapAngle } from './util.js';
import { resolveBuildingCollision } from './city.js';

/** Lena, standing at (x, y): health, facing, timers and the walk state. */
export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    /** Current velocity, in world units per second. */
    vx: 0,
    vy: 0,
    speed: 0,
    health: PLAYER.health,
    onFoot: true,
    carId: null,
    invulnerable: 0,
    punchCooldown: 0,
    running: false,
    stepPhase: 0,
    moving: false,
    /** 'idle' | 'walk' | 'run', for the walk animation. */
    state: 'idle',
    exitBoost: 0,
  };
}

/** The speed Lena wants right now, with the post-exit burst on top. */
function targetSpeed(player, running) {
  const base = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  return player.exitBoost > 0 ? base + PLAYER.exitBoostBonus : base;
}

/** Tick the short-lived timers down by `dt`, never below zero. */
function tickTimers(player, dt) {
  if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
  if (player.punchCooldown > 0) player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  if (player.exitBoost > 0) player.exitBoost = Math.max(0, player.exitBoost - dt);
}

/** Move along one axis, clamp to the world, and push out of buildings. */
function slideAxis(player, city, delta, axis) {
  if (axis === 'x') {
    player.x = clamp(player.x + delta, PLAYER.radius, WORLD.width - PLAYER.radius);
  } else {
    player.y = clamp(player.y + delta, PLAYER.radius, WORLD.height - PLAYER.radius);
  }
  resolveBuildingCollision(city, player, PLAYER.radius);
}

/** The direction Lena faces: her movement direction while she walks, her
 *  last direction while she stands, so the renderer never snaps her. */
export function facingAngle(player) {
  return wrapAngle(player.angle);
}

/** Move the player on foot from the input vector; returns true if they moved. */
export function updatePlayerOnFoot(player, city, move, running, dt) {
  const speed = targetSpeed(player, running);
  player.running = running;
  const wantX = move.x * speed;
  const wantY = move.y * speed;
  // Ease the velocity toward the target: Lena accelerates and stops
  // instead of teleporting between speeds, and the easing keeps the
  // walk feel when the input flips.
  const ease = Math.min(1, 14 * dt);
  player.vx += (wantX - player.vx) * ease;
  player.vy += (wantY - player.vy) * ease;
  // One axis at a time, so a diagonal walk into a wall slides along it.
  slideAxis(player, city, player.vx * dt, 'x');
  slideAxis(player, city, player.vy * dt, 'y');
  player.moving = move.x !== 0 || move.y !== 0;
  if (player.moving) {
    player.state = running ? 'run' : 'walk';
    player.angle = Math.atan2(move.y, move.x);
    player.speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    player.stepPhase += dt * (running ? 11 : 7);
  } else {
    player.state = 'idle';
    player.speed = 0;
    if (Math.abs(player.vx) < 1) player.vx = 0;
    if (Math.abs(player.vy) < 1) player.vy = 0;
  }
  tickTimers(player, dt);
  return player.moving;
}

/** The nearest car the player could steal, within steal range, or null. */
export function nearestStealableCar(player, cars) {
  let best = null;
  let bestD = CAR.stealRange;
  for (let i = 0; i < cars.length; i += 1) {
    const car = cars[i];
    if (car.wrecked) continue;
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Every stealable car within range, nearest first, for the HUD hint. */
export function stealableCars(player, cars) {
  const found = [];
  for (let i = 0; i < cars.length; i += 1) {
    const car = cars[i];
    if (car.wrecked) continue;
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < CAR.stealRange) found.push({ car, distance: d });
  }
  found.sort((a, b) => a.distance - b.distance);
  return found;
}

/** Put the player in `car`: the car becomes the player's, its driver leaves. */
export function enterCar(player, car) {
  player.onFoot = false;
  player.carId = car.id;
  car.driver = 'player';
  car.speed = 0;
  player.vx = 0;
  player.vy = 0;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.moving = false;
  player.state = 'idle';
}

/** Step out of the player's car, beside it, on foot. */
export function exitCar(player, car) {
  player.onFoot = true;
  player.carId = null;
  car.driver = null;
  car.speed = 0;
  const side = { x: Math.cos(car.angle + Math.PI / 2), y: Math.sin(car.angle + Math.PI / 2) };
  player.x = clamp(car.x + side.x * (CAR.width / 2 + PLAYER.radius + 6), PLAYER.radius, WORLD.width - PLAYER.radius);
  player.y = clamp(car.y + side.y * (CAR.width / 2 + PLAYER.radius + 6), PLAYER.radius, WORLD.height - PLAYER.radius);
  player.angle = car.angle;
  player.exitBoost = PLAYER.exitBoostSeconds;
}

/** Hurt the player; returns true when the hit killed them. */
export function hurtPlayer(player, damage) {
  if (player.invulnerable > 0) return false;
  player.health = Math.max(0, player.health - damage);
  player.invulnerable = 0.6;
  return player.health <= 0;
}

/** Heal the player, up to full health. */
export function healPlayer(player, amount) {
  player.health = Math.min(PLAYER.health, player.health + amount);
}

/** True when the player is low on health and the HUD should warn them. */
export function isPlayerCritical(player) {
  return player.health <= 30;
}
