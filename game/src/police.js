// The Vice Harbor Police Department: the wanted level, the patrol cars and
// officers it sends, the chase, and getting busted. Wanted stars rise with
// crimes in front of witnesses and decay when the player stays out of sight.

import { POLICE, WANTED, WORLD } from './config.js';
import { clamp, distance, turnToward } from './util.js';
import { createCar } from './vehicles.js';

export const EVENT_WANTED_UP = 64;
export const EVENT_BUSTED = 128;

export function createPoliceState() {
  return {
    wanted: 0,
    heat: 0,
    decayTimer: 0,
    sirenTimer: 0,
    cars: [],
    officers: [],
  };
}

/** Raise the wanted level by `stars`, up to 5; returns true if it rose. */
export function addWanted(police, stars, state) {
  const before = police.wanted;
  police.wanted = Math.min(5, police.wanted + stars);
  police.heat = 1;
  police.decayTimer = POLICE.wantedDecaySeconds;
  if (police.wanted > before && state) {
    state.events |= EVENT_WANTED_UP;
  }
  return police.wanted > before;
}

/** Let the heat cool off when the player has been quiet for a while. */
export function updateWantedDecay(police, dt) {
  if (police.wanted === 0) return;
  police.decayTimer -= dt;
  if (police.decayTimer <= 0) {
    police.wanted = Math.max(0, police.wanted - 1);
    police.decayTimer = POLICE.wantedDecaySeconds;
    if (police.wanted === 0) police.heat = 0;
  }
}

/** Keep the right number of police cars on the road for the wanted level. */
export function ensurePoliceCars(police, state, random) {
  const want = WANTED[police.wanted].cars;
  while (police.cars.length < want && police.cars.length < POLICE.maxCars) {
    const angle = random() * Math.PI * 2;
    const dist = 700 + random() * 300;
    const car = createCar(
      clamp(state.player.x + Math.cos(angle) * dist, 80, WORLD.width - 80),
      clamp(state.player.y + Math.sin(angle) * dist, 80, WORLD.height - 80),
      angle, '#2f6fd0', 'VHPD Interceptor', 'police',
    );
    car.cruise = POLICE.carSpeed;
    police.cars.push(car);
  }
  while (police.cars.length > want) police.cars.pop();
}

/** A police car chases the player: steer at them, ram them, and slow down
 *  only when it is close enough to box them in. */
export function updatePoliceCar(car, state, dt) {
  const target = state.playerCar || state.player;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const wantAngle = Math.atan2(dy, dx);
  car.angle = turnToward(car.angle, wantAngle, 3.2 * dt);
  const wantSpeed = d > 90 ? POLICE.carSpeed : POLICE.carSpeed * 0.55;
  car.speed += (wantSpeed - car.speed) * Math.min(1, 2.4 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 40, WORLD.width - 40);
  car.y = clamp(car.y, 40, WORLD.height - 40);
  if (d < 70 && state.player.onFoot) {
    // A police car that catches the player on foot ends the run: busted.
    state.events |= EVENT_BUSTED;
  }
  return d;
}

/** An officer on foot runs at the player and tries to arrest them up close. */
export function updatePoliceOfficer(officer, state, dt) {
  const player = state.player;
  const d = distance(officer.x, officer.y, player.x, player.y);
  if (d < POLICE.arrestRange && player.onFoot) {
    state.events |= EVENT_BUSTED;
    return d;
  }
  const angle = Math.atan2(player.y - officer.y, player.x - officer.x);
  officer.angle = angle;
  officer.x += Math.cos(angle) * POLICE.officerSpeed * dt;
  officer.y += Math.sin(angle) * POLICE.officerSpeed * dt;
  return d;
}

export function spawnOfficer(police, state, random) {
  const angle = random() * Math.PI * 2;
  police.officers.push({
    x: clamp(state.player.x + Math.cos(angle) * 500, 40, WORLD.width - 40),
    y: clamp(state.player.y + Math.sin(angle) * 500, 40, WORLD.height - 40),
    angle: 0,
    colour: '#1f3a6e',
  });
}

export function ensurePoliceOfficers(police, state, random) {
  const want = WANTED[police.wanted].officers;
  while (police.officers.length < want) spawnOfficer(police, state, random);
  while (police.officers.length > want) police.officers.pop();
}
