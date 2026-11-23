// Vice Harbor v2.3 — vehicles: the cars, motorbikes and trucks of the
// city, the driving physics, the traffic that follows the roads, and the
// stealing that starts most chases. A vehicle is a plain object with a
// `kind` — car, bike or truck — and each kind drives differently: a bike
// is fast and twitchy and folds in one hard crash, a truck is slow and
// turns like a boat but takes a beating, a car sits between them. The
// player's car is driven from an input vector (up is gas, down is brake
// and reverse, left and right steer), with the garage's engine and nitro
// bonuses folded in through the optional `limits` argument. Traffic
// keeps to a lane, slows for the car ahead, and honks when it is stuck
// behind one for too long. A car is a plain object; `driver` is
// 'player', 'traffic', 'police' or null (parked).

import { CAR, LIMITS, TRAFFIC, VEHICLE_KINDS, WORLD } from './config.js';
import { clamp, distance, pick, turnToward } from './util.js';
import { nearestRoadPoint, randomRoadPoint } from './city.js';
import { range } from './random.js';

let nextCarId = 1;

/** Body style from a model name: van, pickup, coupe, bike, truck, sedan. */
function styleFor(model, kind) {
  if (kind === 'bike') return 'bike';
  if (kind === 'truck') return 'truck';
  if (!model) return 'sedan';
  if (model.indexOf('Van') !== -1) return 'van';
  if (model.indexOf('Pickup') !== -1) return 'pickup';
  if (model.indexOf('Coupe') !== -1) return 'coupe';
  return 'sedan';
}

const BIKE_MODELS = ['Vice Bike', 'Neon Runner', 'Sunset Scooter'];
const TRUCK_MODELS = ['Dock Truck', 'Harbor Hauler', 'Pier Flatbed'];

/** A fresh vehicle of `kind` at (x, y), facing `angle`. */
export function createCar(x, y, angle, colour, model, driver, kind) {
  const useKind = kind || 'car';
  const tune = VEHICLE_KINDS[useKind] || VEHICLE_KINDS.car;
  return {
    id: nextCarId,
    kind: useKind,
    x, y, angle,
    speed: 0,
    colour, model,
    style: styleFor(model, useKind),
    finish: 'gloss',
    driver: driver || null,
    /** Current health and its cap: armour upgrades raise both. */
    health: tune.health,
    maxHealth: tune.health,
    wrecked: false,
    braking: false,
    /** Sideways offset from the road centre line, for traffic lanes. */
    laneOffset: 0,
    lastCrashAt: -99,
    target: null,
    cruise: TRAFFIC.speed,
    honkTimer: 0,
    /** Seconds stuck behind a slower car; a honk fires at 2. */
    stuckTimer: 0,
    smoke: 0,
    skidTimer: 0,
    /** Bikes drift sideways a little at speed; trucks barely drift at all. */
    drift: useKind === 'bike' ? 0.35 : useKind === 'truck' ? 0.08 : 0.18,
  };
}

export function resetCarIds() {
  nextCarId = 1;
}

/** Roll a traffic kind: mostly cars, sometimes a bike or a truck. */
function rollTrafficKind(random) {
  const roll = random();
  if (roll < TRAFFIC.bikeChance) return 'bike';
  if (roll < TRAFFIC.bikeChance + TRAFFIC.truckChance) return 'truck';
  return 'car';
}

/** Spawn a parked or traffic vehicle at a road point. */
export function spawnTrafficCar(city, random, parked) {
  const point = randomRoadPoint(city, random);
  const angle = random() < 0.5 ? 0 : Math.PI / 2;
  const kind = parked ? 'car' : rollTrafficKind(random);
  const model = kind === 'bike'
    ? pick(random, BIKE_MODELS)
    : kind === 'truck'
      ? pick(random, TRUCK_MODELS)
      : pick(random, TRAFFIC.models);
  const car = createCar(
    point.x, point.y, angle + (random() < 0.5 ? 0 : Math.PI),
    pick(random, TRAFFIC.colours), model, parked ? null : 'traffic', kind,
  );
  car.cruise = range(random, TRAFFIC.speed * 0.8, TRAFFIC.speed * 1.2);
  if (kind === 'bike') car.cruise *= 1.25;
  if (kind === 'truck') car.cruise *= 0.75;
  car.finish = pick(random, TRAFFIC.finishes);
  // Traffic keeps to a lane: left or right of the centre line, not on it.
  car.laneOffset = parked ? 0 : pick(random, TRAFFIC.laneOffsets);
  return car;
}

/** The tuning this vehicle drives with: its kind's numbers, with the
 *  garage's engine bonus and nitro boost folded in when given, and the
 *  weather's grip — rain makes the car turn less sharply. */
function driveTuning(car, limits) {
  const tune = VEHICLE_KINDS[car.kind] || VEHICLE_KINDS.car;
  const grip = (limits && limits.grip) || 1;
  return {
    topSpeed: tune.topSpeed + ((limits && limits.engineBonus) || 0),
    accel: tune.accel * (1 + ((limits && limits.boost) || 0)),
    turnRate: tune.turnRate * grip,
    reverseSpeed: tune.reverseSpeed,
  };
}

/** Gas, brake and reverse from the input vector; returns the new speed. */
function accelerate(car, move, dt, tune) {
  const forward = move.y < 0 ? 1 : move.y > 0 ? -1 : 0;
  car.braking = false;
  if (forward > 0) {
    car.speed = Math.min(tune.topSpeed, car.speed + tune.accel * dt);
  } else if (forward < 0) {
    if (car.speed > 0) {
      car.speed = Math.max(0, car.speed - CAR.brake * dt);
      car.braking = true;
    } else {
      car.speed = Math.max(-tune.reverseSpeed, car.speed - CAR.reverseAccel * dt);
    }
  } else {
    car.speed *= Math.pow(0.4, dt);
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  return car.speed;
}

/** Steer with the input vector, with less grip at low speed. */
function steer(car, move, dt, tune) {
  const steerInput = move.x;
  const grip = Math.min(1, Math.abs(car.speed) / 160 + 0.25);
  const turn = steerInput * tune.turnRate * dt * (car.speed >= 0 ? 1 : -1) * grip;
  car.angle += turn;
}

/** Drive the player's vehicle from the input vector (up = gas, down =
 *  brake/reverse). `limits` may carry the garage's top speed and boost. */
export function drivePlayerCar(car, move, dt, limits) {
  const tune = driveTuning(car, limits);
  accelerate(car, move, dt, tune);
  steer(car, move, dt, tune);
  // A little sideways drift at speed: bikes slide, trucks track straight.
  const driftAngle = car.angle + (Math.PI / 2) * Math.sign(move.x || 0);
  const driftAmount = Math.abs(car.speed) * car.drift * 0.02 * (move.x !== 0 ? 1 : 0);
  car.x += Math.cos(car.angle) * car.speed * dt + Math.cos(driftAngle) * driftAmount * dt;
  car.y += Math.sin(car.angle) * car.speed * dt + Math.sin(driftAngle) * driftAmount * dt;
  car.x = clamp(car.x, 30, WORLD.width - 30);
  car.y = clamp(car.y, 30, WORLD.height - 30);
  return Math.abs(car.speed);
}

/** Leave skid marks behind a vehicle that is turning hard at speed. */
export function maybeSkid(state, car, dt) {
  car.skidTimer -= dt;
  const hardTurn = Math.abs(car.speed) > 380;
  if (!hardTurn || car.skidTimer > 0) return;
  car.skidTimer = 0.12;
  const backX = car.x - Math.cos(car.angle) * 34;
  const backY = car.y - Math.sin(car.angle) * 34;
  const sideX = Math.cos(car.angle + Math.PI / 2) * 18;
  const sideY = Math.sin(car.angle + Math.PI / 2) * 18;
  for (const sign of [-1, 1]) {
    state.skids.push({
      x: backX + sideX * sign,
      y: backY + sideY * sign,
      angle: car.angle,
      life: 2.2,
      maxLife: 2.2,
    });
  }
  if (state.skids.length > LIMITS.maxSkids) state.skids.splice(0, state.skids.length - LIMITS.maxSkids);
}

/** The vehicle ahead of `car` on the same road, within 120 px, or null. */
function carAhead(car, cars) {
  let ahead = null;
  let aheadD = 120;
  for (let i = 0; i < cars.length; i += 1) {
    const other = cars[i];
    if (other === car || other.wrecked) continue;
    const d = distance(car.x, car.y, other.x, other.y);
    if (d >= aheadD) continue;
    const bearing = Math.atan2(other.y - car.y, other.x - car.x);
    if (Math.abs(bearing - car.angle) < 0.7) {
      ahead = other;
      aheadD = d;
    }
  }
  return { ahead, aheadD };
}

/** The angle a traffic vehicle wants on its road: straight along the
 *  road it is travelling, from its current heading. */
function roadAngle(car) {
  const vertical = Math.abs(Math.cos(car.angle)) < 0.5;
  if (vertical) return Math.sin(car.angle) > 0 ? Math.PI / 2 : -Math.PI / 2;
  return Math.cos(car.angle) > 0 ? 0 : Math.PI;
}

/** Traffic vehicles drive along their road, slow for the vehicle ahead,
 *  and turn at intersections onto a new road, like the rest of the
 *  city's traffic. A vehicle held up behind a slower one honks after
 *  two seconds, then waits again. */
export function updateTrafficCar(car, city, cars, dt) {
  if (car.wrecked) return;
  const road = nearestRoadPoint(city, car.x, car.y);
  const vertical = Math.abs(Math.cos(car.angle)) < 0.5;
  car.angle = turnToward(car.angle, roadAngle(car), 1.4 * dt);
  // Stay near its lane, drifting back when pushed off it.
  const centre = vertical ? road.x : road.y;
  const offset = (vertical ? car.x - centre : car.y - centre) - car.laneOffset;
  car.angle += clamp(-offset * 0.02, -0.4, 0.4) * dt;
  // Slow down for a vehicle ahead on the same road.
  const found = carAhead(car, cars);
  const want = found.ahead ? Math.max(0, car.cruise * (found.aheadD / 120)) : car.cruise;
  if (found.ahead && found.aheadD < 80 && car.cruise > 60) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 2) {
      car.stuckTimer = -4;
      car.honkTimer = 0.5;
    }
  } else if (car.stuckTimer > 0) {
    car.stuckTimer = 0;
  }
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

/** Push two overlapping vehicles apart and damage both, with sparks. */
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
  if (impact <= 120) return false;
  // One damaging hit per vehicle per half second: two vehicles grinding
  // along each other must not drain a whole health bar in a few frames.
  const now = state ? state.elapsed : 0;
  let damaged = false;
  if (now - (a.lastCrashAt ?? -99) > 0.5) {
    a.health -= impact * 0.02;
    a.lastCrashAt = now;
    damaged = true;
  }
  if (now - (b.lastCrashAt ?? -99) > 0.5) {
    b.health -= impact * 0.02;
    b.lastCrashAt = now;
    damaged = true;
  }
  if (damaged && state) spawnSparks(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 6);
  if (a.health <= 0) a.wrecked = true;
  if (b.health <= 0) b.wrecked = true;
  return damaged;
}

/** A burst of sparks at (x, y). */
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

/** A puff of smoke at (x, y), rising as it fades. */
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

/** A dust puff kicked up behind a speeding vehicle on the beach or a dirt lot. */
export function spawnDust(state, x, y) {
  state.particles.push({
    x, y,
    vx: (state.random() - 0.5) * 50,
    vy: (state.random() - 0.5) * 50,
    life: 0.5,
    maxLife: 0.5,
    colour: 'rgba(210, 190, 150, 0.45)',
    size: 7 + state.random() * 5,
  });
}
