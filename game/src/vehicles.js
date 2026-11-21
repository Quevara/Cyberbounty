// Cars: player driving physics, traffic that follows the roads, and the
// stealing that starts most chases in Vice Harbor. A car is a plain object;
// `driver` is 'player', 'traffic', 'police' or null (parked).

import { CAR, TRAFFIC, WORLD } from './config.js';
import { clamp, distance, pick, turnToward } from './util.js';
import { nearestRoadPoint, randomRoadPoint } from './city.js';
import { range } from './random.js';

let nextCarId = 1;

export function createCar(x, y, angle, colour, model, driver) {
  return {
    id: nextCarId,
    x, y, angle,
    speed: 0,
    colour, model,
    driver: driver || null,
    health: CAR.health,
    wrecked: false,
    target: null,
    cruise: TRAFFIC.speed,
    honkTimer: 0,
    smoke: 0,
  };
}

export function resetCarIds() {
  nextCarId = 1;
}

/** Spawn a parked or traffic car at a road point. */
export function spawnTrafficCar(city, random, parked) {
  const point = randomRoadPoint(city, random);
  const angle = random() < 0.5 ? 0 : Math.PI / 2;
  const car = createCar(
    point.x, point.y, angle + (random() < 0.5 ? 0 : Math.PI),
    pick(random, TRAFFIC.colours), pick(random, TRAFFIC.models), parked ? null : 'traffic',
  );
  car.cruise = range(random, TRAFFIC.speed * 0.8, TRAFFIC.speed * 1.2);
  return car;
}

/** Drive the player's car from the input vector (up = gas, down = brake/reverse). */
export function drivePlayerCar(car, move, dt) {
  const forward = move.y < 0 ? 1 : move.y > 0 ? -1 : 0;
  if (forward > 0) car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);
  else if (forward < 0) {
    if (car.speed > 0) car.speed = Math.max(0, car.speed - CAR.brake * dt);
    else car.speed = Math.max(-CAR.maxReverse, car.speed - CAR.reverseAccel * dt);
  } else {
    car.speed *= Math.pow(0.4, dt);
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  const steer = move.x;
  const turn = steer * CAR.turnRate * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 160 + 0.25);
  car.angle += turn;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 30, WORLD.width - 30);
  car.y = clamp(car.y, 30, WORLD.height - 30);
  return Math.abs(car.speed);
}

/** Traffic cars drive along their road, slow for the car ahead, and turn at
 *  intersections onto a new road, like the rest of the city's traffic. */
export function updateTrafficCar(car, city, cars, dt) {
  if (car.wrecked) return;
  // Steer toward the road centre the car is travelling along.
  const road = nearestRoadPoint(city, car.x, car.y);
  const onVertical = Math.abs(Math.cos(car.angle)) < 0.5;
  const targetAngle = onVertical
    ? (Math.sin(car.angle) > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (Math.cos(car.angle) > 0 ? 0 : Math.PI);
  car.angle = turnToward(car.angle, targetAngle, 1.4 * dt);
  // Stay near the centre line of the road, drifting back when pushed off it.
  const centre = onVertical ? road.x : road.y;
  const offset = onVertical ? car.x - centre : car.y - centre;
  const correction = clamp(-offset * 0.02, -0.4, 0.4);
  car.angle += correction * dt;
  // Slow down for a car ahead on the same road.
  let ahead = null;
  let aheadD = 120;
  for (const other of cars) {
    if (other === car || other.wrecked) continue;
    const d = distance(car.x, car.y, other.x, other.y);
    if (d < aheadD) {
      const bearing = Math.atan2(other.y - car.y, other.x - car.x);
      if (Math.abs(bearing - car.angle) < 0.7) { ahead = other; aheadD = d; }
    }
  }
  const want = ahead ? Math.max(0, car.cruise * (aheadD / 120)) : car.cruise;
  car.speed += (want - car.speed) * Math.min(1, 2 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // At the edge of the map, turn around and head back into the city.
  if (car.x < 60 || car.x > WORLD.width - 60 || car.y < 60 || car.y > WORLD.height - 60) {
    car.angle += Math.PI;
    car.x = clamp(car.x, 60, WORLD.width - 60);
    car.y = clamp(car.y, 60, WORLD.height - 60);
  }
  if (car.honkTimer > 0) car.honkTimer -= dt;
}

/** Push two overlapping cars apart and damage both, with a spark burst. */
export function collideCars(a, b, state) {
  const d = distance(a.x, a.y, b.x, b.y);
  const min = 62;
  if (d >= min || d === 0) return false;
  const push = (min - d) / 2;
  const nx = (b.x - a.x) / d;
  const ny = (b.y - a.y) / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const impact = Math.abs(a.speed - b.speed);
  if (impact > 120) {
    a.health -= impact * 0.02;
    b.health -= impact * 0.02;
    if (state) spawnSparks(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 6);
    if (a.health <= 0) a.wrecked = true;
    if (b.health <= 0) b.wrecked = true;
    return true;
  }
  return false;
}

export function spawnSparks(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x, y,
      vx: (state.random() - 0.5) * 260,
      vy: (state.random() - 0.5) * 260,
      life: 0.4 + state.random() * 0.3,
      maxLife: 0.7,
      colour: '#ffd34d',
      size: 3 + state.random() * 3,
    });
  }
}

export function spawnSmoke(state, x, y) {
  state.particles.push({
    x, y,
    vx: (state.random() - 0.5) * 40,
    vy: -30 - state.random() * 40,
    life: 0.9,
    maxLife: 0.9,
    colour: 'rgba(120, 120, 120, 0.5)',
    size: 8 + state.random() * 6,
  });
}
