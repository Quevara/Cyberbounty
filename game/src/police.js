// Vice Harbor v2.3 — the Vice Harbor Police Department: the wanted
// level, the patrol cars and officers it sends, and getting busted.
// Wanted stars rise with crimes in front of witnesses and decay when the
// player stays out of sight. Each police car has a role, so the chase
// converges instead of trailing in a line: a pursuer stays on the
// player's tail, an interceptor cuts across to where the player is
// heading, and a blocker stations itself ahead on the player's road to
// cut them off. A car far behind gets a small catch-up boost, so the
// chase never dies on a straight. v2.3 keeps the 610 cap — below the
// player's 620 top speed — so the chase wins by cutting the player off,
// never by outrunning them; the speed choice is one helper, each car
// carries its own light phase so the red-blue flash is staggered across
// the pack, and the steering, the speed and the bust clock are three
// separate helpers now, so a role change touches one place.

import { POLICE, WANTED, WORLD } from './config.js';
import { clamp, distance, turnToward, wrapAngle } from './util.js';
import { createCar } from './vehicles.js';

export const EVENT_WANTED_UP = 64;
export const EVENT_BUSTED = 128;

/** Roles a police car can hold; reassigned whenever the wanted level changes. */
export const ROLE_PURSUER = 'pursuer';
export const ROLE_INTERCEPTOR = 'interceptor';
export const ROLE_BLOCKER = 'blocker';

/** The three roles, in the order they are handed out: the first car
 *  pursues, the second intercepts, the third blocks, then it repeats. */
const ROLE_ORDER = [ROLE_PURSUER, ROLE_INTERCEPTOR, ROLE_BLOCKER];

export function createPoliceState() {
  return {
    wanted: 0,
    heat: 0,
    decayTimer: 0,
    sirenTimer: 0,
    /** Seconds a police car or officer has been close enough to arrest the
     *  player on foot; the bust lands at POLICE.bustSeconds, so stepping
     *  out of a wreck next to a patrol car is a chance to run, not an
     *  instant loss. */
    bustTimer: 0,
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
    assignPoliceRoles(police);
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
    assignPoliceRoles(police);
  }
}

/** Hand the cars their roles in the repeating pursuer/interceptor/blocker
 *  order, so a three-car chase surrounds the player. */
export function assignPoliceRoles(police) {
  for (let i = 0; i < police.cars.length; i += 1) {
    police.cars[i].role = ROLE_ORDER[i % ROLE_ORDER.length];
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
    car.role = ROLE_PURSUER;
    /** Each car's light bar flashes on its own beat, staggered by index. */
    car.lightPhase = police.cars.length * 0.35;
    police.cars.push(car);
  }
  while (police.cars.length > want) police.cars.pop();
  assignPoliceRoles(police);
}

/** Where this car is aiming, from its role: the player, the player's future
 *  position, or a point ahead on the player's heading to block. */
export function policeTargetPoint(car, state) {
  const target = state.playerCar || state.player;
  const px = target.x;
  const py = target.y;
  const heading = target.angle || 0;
  const speed = Math.abs(target.speed || 0);
  if (car.role === ROLE_INTERCEPTOR) {
    const lead = Math.min(POLICE.interceptLead, speed * 0.6);
    return { x: px + Math.cos(heading) * lead, y: py + Math.sin(heading) * lead };
  }
  if (car.role === ROLE_BLOCKER) {
    const ahead = POLICE.blockAhead;
    return { x: px + Math.cos(heading) * ahead, y: py + Math.sin(heading) * ahead };
  }
  return { x: px, y: py };
}

/** The speed this car wants right now, from its role and its distance to
 *  the player — capped at POLICE.maxTopSpeed, boost included, so a police
 *  car can never outrun the player's car on a straight. */
export function policeSpeedFor(car, direct, aimDistance) {
  let wantSpeed = POLICE.carSpeed;
  if (car.role === ROLE_BLOCKER) {
    // A blocker parks on its mark and waits for the player to arrive.
    wantSpeed = aimDistance < 120 ? POLICE.carSpeed * 0.25 : POLICE.carSpeed * 0.9;
  } else if (direct < 90) {
    wantSpeed = POLICE.carSpeed * 0.55;
  } else if (direct > 500) {
    wantSpeed = POLICE.carSpeed + POLICE.catchUpBoost;
  }
  return Math.min(wantSpeed, POLICE.maxTopSpeed);
}

/** Steer one step toward the car's aim point: interceptors and blockers
 *  turn harder, because they have to cut across. Returns the distance
 *  straight to the player, for the speed helper. */
function steerPoliceCar(car, state, dt) {
  const target = state.playerCar || state.player;
  const aim = policeTargetPoint(car, state);
  const dx = aim.x - car.x;
  const dy = aim.y - car.y;
  const wantAngle = Math.atan2(dy, dx);
  const turnRate = car.role === ROLE_PURSUER ? 3.2 : 4.1;
  car.angle = turnToward(car.angle, wantAngle, turnRate * dt);
  return { direct: distance(car.x, car.y, target.x, target.y), aimDistance: Math.sqrt(dx * dx + dy * dy), aligned: Math.abs(wrapAngle(wantAngle - car.angle)) < 0.5 };
}

/** A police car chases the player by its role: steer at its target point,
 *  cut the corner when the player turns, and close in only when it can box
 *  them in. A car far behind gets a catch-up boost so the chase stays hot. */
export function updatePoliceCar(car, state, dt) {
  const steer = steerPoliceCar(car, state, dt);
  // Ease off when the car is pointing at its mark, so it does not overshoot.
  let wantSpeed = policeSpeedFor(car, steer.direct, steer.aimDistance);
  if (!steer.aligned) wantSpeed *= 0.8;
  car.speed += (wantSpeed - car.speed) * Math.min(1, 2.4 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 40, WORLD.width - 40);
  car.y = clamp(car.y, 40, WORLD.height - 40);
  return steer.direct;
}

/** Where an officer on foot is running: the player's position, cut across
 *  by a short lead on the player's heading, instead of trailing behind. */
function officerTarget(officer, state) {
  const player = state.player;
  const speed = Math.abs(player.speed || 0);
  const lead = Math.min(120, speed * 0.35);
  return {
    x: player.x + Math.cos(player.angle) * lead,
    y: player.y + Math.sin(player.angle) * lead,
  };
}

/** An officer on foot runs at the player and tries to arrest them up close. */
export function updatePoliceOfficer(officer, state, dt) {
  const player = state.player;
  const d = distance(officer.x, officer.y, player.x, player.y);
  const target = officerTarget(officer, state);
  const angle = Math.atan2(target.y - officer.y, target.x - officer.x);
  officer.angle = angle;
  officer.x += Math.cos(angle) * POLICE.officerSpeed * dt;
  officer.y += Math.sin(angle) * POLICE.officerSpeed * dt;
  return d;
}

/** True when a police car or officer is close enough to arrest the player
 *  on foot right now: within bust range of a car, or arrest range of an
 *  officer. */
function arrestThreat(police, state) {
  const player = state.player;
  for (const car of police.cars) {
    if (distance(car.x, car.y, player.x, player.y) < POLICE.bustRange) return true;
  }
  for (const officer of police.officers) {
    if (distance(officer.x, officer.y, player.x, player.y) < POLICE.arrestRange) return true;
  }
  return false;
}

/** The arrest clock: when a police car is within bust range of the player on
 *  foot, or an officer within arrest range, the bust timer runs; it lands
 *  at POLICE.bustSeconds of continuous proximity and resets the moment the
 *  player breaks away. */
export function updateBustedTimer(police, state, dt) {
  const player = state.player;
  if (!player.onFoot) {
    police.bustTimer = 0;
    return;
  }
  if (!arrestThreat(police, state)) {
    police.bustTimer = 0;
    return;
  }
  police.bustTimer += dt;
  if (police.bustTimer >= POLICE.bustSeconds) state.events |= EVENT_BUSTED;
}

/** One officer on foot, spawned in a ring around the player. */
export function spawnOfficer(police, state, random) {
  const angle = random() * Math.PI * 2;
  police.officers.push({
    x: clamp(state.player.x + Math.cos(angle) * 500, 40, WORLD.width - 40),
    y: clamp(state.player.y + Math.sin(angle) * 500, 40, WORLD.height - 40),
    angle: 0,
    colour: '#1f3a6e',
  });
}

/** Keep the right number of officers on foot for the wanted level. */
export function ensurePoliceOfficers(police, state, random) {
  const want = WANTED[police.wanted].officers;
  while (police.officers.length < want) spawnOfficer(police, state, random);
  while (police.officers.length > want) police.officers.pop();
}
