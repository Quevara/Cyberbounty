// The player on foot: movement, facing, punching, and getting in and out of
// cars. Driving itself lives in vehicles.js; this file only owns the person.

import { CAR, PLAYER, WORLD } from './config.js';
import { clamp, distance } from './util.js';
import { resolveBuildingCollision } from './city.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    speed: 0,
    health: PLAYER.health,
    onFoot: true,
    carId: null,
    invulnerable: 0,
    punchCooldown: 0,
    running: false,
  };
}

/** Move the player on foot from the input vector; returns true if they moved. */
export function updatePlayerOnFoot(player, city, move, running, dt) {
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  player.running = running;
  const vx = move.x * speed;
  const vy = move.y * speed;
  player.x = clamp(player.x + vx * dt, PLAYER.radius, WORLD.width - PLAYER.radius);
  player.y = clamp(player.y + vy * dt, PLAYER.radius, WORLD.height - PLAYER.radius);
  if (move.x !== 0 || move.y !== 0) {
    player.angle = Math.atan2(move.y, move.x);
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  resolveBuildingCollision(city, player, PLAYER.radius);
  if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
  if (player.punchCooldown > 0) player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  return player.speed > 0;
}

/** The nearest car the player could steal, within steal range, or null. */
export function nearestStealableCar(player, cars) {
  let best = null;
  let bestD = CAR.stealRange;
  for (const car of cars) {
    if (car.wrecked) continue;
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Put the player in `car`: the car becomes the player's, its driver leaves. */
export function enterCar(player, car) {
  player.onFoot = false;
  player.carId = car.id;
  car.driver = 'player';
  car.speed = 0;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
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
}

/** Hurt the player; returns true when the hit killed them. */
export function hurtPlayer(player, damage) {
  if (player.invulnerable > 0) return false;
  player.health = Math.max(0, player.health - damage);
  player.invulnerable = 0.6;
  return player.health <= 0;
}

export function healPlayer(player, amount) {
  player.health = Math.min(PLAYER.health, player.health + amount);
}
