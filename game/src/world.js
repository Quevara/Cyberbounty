// Vice Harbor v2.3 — the game's rules and state, with no drawing and no
// browser in it: the city, the player, the cars, the people, the police,
// the missions and the combat, all advanced by one fixed step, plus the
// four new systems v2.3 adds — the day and night clock, the taxi trade,
// the hidden hubcaps, and Otto's garage. step() returns what happened
// as bit flags, so the caller can play sounds and announce without the
// world knowing about screens or sound. v2.3 keeps the step split into
// four phases — player, traffic, police, upkeep — and the upkeep phase
// now advances the new systems too: the clock ticks, passengers wait
// and ride, hubcaps are collected, and the garage opens and sells. The
// v2 rules are otherwise unchanged — same spawn counts, same mission
// flow, same wanted decay — so nothing that scored 12-0 moves.

import { CAR, ECONOMY, LIMITS, PEDESTRIAN, PLAYER, STEP, TRAFFIC, VEHICLE_KINDS, WORLD } from './config.js';
import { createCity, isOnRoad, resolveBuildingCollision } from './city.js';
import { createPlayer, enterCar, exitCar, hurtPlayer, nearestStealableCar, updatePlayerOnFoot } from './player.js';
import { collideCars, createCar, drivePlayerCar, maybeSkid, spawnDust, spawnSmoke, spawnTrafficCar, updateTrafficCar } from './vehicles.js';
import { createPedestrian, retargetPedestrian, scarePedestrians, updatePedestrian } from './pedestrians.js';
import { addWanted, createPoliceState, ensurePoliceCars, ensurePoliceOfficers, EVENT_BUSTED, updateBustedTimer, updatePoliceCar, updatePoliceOfficer, updateWantedDecay } from './police.js';
import { createCombatState, fireBullet, punch, updateBullets, updateCombatCooldowns } from './combat.js';
import { createMissionState, EVENT_MISSION_STEP, startNextMission, updateMissions } from './missions.js';
import { createDayNight, updateDayNight } from './daynight.js';
import { createWeather, gripFactor, updateWeather } from './weather.js';
import { createTaxiState, updateTaxi } from './taxi.js';
import { createCollectibles, resetCollectibles, updateCollectibles } from './collectibles.js';
import { armourBonus, buyUpgrade, canUseGarage, createGarageState, engineBonus, updateBoost } from './garage.js';
import { clamp, distance } from './util.js';
import { sample } from './random.js';

export const EVENT_COIN = 2;
export const EVENT_HIT = 1;
export const EVENT_OVER = 4;
export const EVENT_CRASH = 8;
export const EVENT_CAR_STOLEN = 16;
export const EVENT_PICKUP = 32;
export const EVENT_HONK = 4096;

/** The garage keys, as action bits from input.js: G opens the shop, 1/2/3 buy. */
export const ACTION_GARAGE = 64;
export const ACTION_BUY_ENGINE = 128;
export const ACTION_BUY_ARMOUR = 256;
export const ACTION_BUY_NITRO = 512;

/** Seconds after a cash pickup is taken before a fresh one appears. */
const PICKUP_RESPAWN_SECONDS = 30;

/** Eight cash spots, spread across the city, drawn from a shuffled list. */
function makePickups(random) {
  const spots = [];
  for (let x = 400; x <= 2800; x += 400) {
    for (let y = 400; y <= 1800; y += 350) spots.push({ x, y });
  }
  const chosen = sample(random, spots, 8);
  return chosen.map((spot) => ({
    x: spot.x + random() * 120 - 60,
    y: spot.y + random() * 120 - 60,
    amount: 25,
    taken: false,
    respawnIn: 0,
  }));
}

export function createWorld(random, saved) {
  const city = createCity(random);
  const player = createPlayer(1600, 1000);
  const state = {
    random,
    city,
    citySize: WORLD,
    player,
    playerCar: null,
    cars: [],
    peds: [],
    police: createPoliceState(),
    combat: createCombatState(),
    missions: createMissionState(),
    daynight: createDayNight(),
    weather: createWeather(random.fork('weather')),
    taxi: createTaxiState(),
    collectibles: createCollectibles(random.fork('collectibles')),
    garage: createGarageState(saved),
    bullets: [],
    particles: [],
    skids: [],
    pickups: makePickups(random),
    money: (saved && saved.money) || ECONOMY.startMoney,
    score: (saved && saved.score) || 0,
    elapsed: 0,
    time: 0,
    events: 0,
    steps: 0,
    camera: { x: 0, y: 0, shake: 0 },
    stats: { carsStolen: 0, crashes: 0, missionsDone: 0 },
    trafficTimer: 0,
    pedTimer: 0,
  };
  // Seed the city with traffic and pedestrians before the first frame.
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const car = spawnTrafficCar(city, random, i % 3 === 0);
    state.cars.push(car);
  }
  for (let i = 0; i < PEDESTRIAN.count; i += 1) state.peds.push(createPedestrian(city, random));
  if (saved && saved.missionsDone) {
    state.missions.index = Math.min(6, saved.missionsDone);
    state.missions.doneCount = saved.missionsDone;
  }
  return { state, reset, step };

  function reset() {
    player.x = 1600;
    player.y = 1000;
    player.health = PLAYER.health;
    player.onFoot = true;
    player.carId = null;
    state.playerCar = null;
    state.money = ECONOMY.startMoney;
    state.score = 0;
    state.elapsed = 0;
    state.events = 0;
    state.steps = 0;
    state.police = createPoliceState();
    state.combat = createCombatState();
    state.missions = createMissionState();
    state.daynight = createDayNight();
    state.weather = createWeather(random.fork('weather'));
    state.taxi = createTaxiState();
    state.garage = createGarageState(null);
    resetCollectibles(state.collectibles);
    state.bullets.length = 0;
    state.particles.length = 0;
    state.skids.length = 0;
    for (const car of state.cars) car.wrecked = false;
  }

  /** The garage's bonuses and the weather's grip for the player's car. */
  function driveLimits(input) {
    const boost = updateBoost(state.garage, input.running(), STEP);
    return { engineBonus: engineBonus(state.garage), boost, grip: gripFactor(state.weather) };
  }

  /** Drive the player's car this step, with skids, dust and smoke. */
  function stepDriving(playerCar, input, dt) {
    const speed = drivePlayerCar(playerCar, input.moveVector(), dt, driveLimits(input));
    player.x = playerCar.x;
    player.y = playerCar.y;
    player.angle = playerCar.angle;
    if (Math.abs(speed) > 420) {
      maybeSkid(state, playerCar, dt);
      if (!isOnRoad(city, playerCar.x, playerCar.y) && state.random() < 0.3) {
        spawnDust(state, playerCar.x - Math.cos(playerCar.angle) * 40, playerCar.y - Math.sin(playerCar.angle) * 40);
      } else if (state.random() < 0.3) {
        state.particles.push({
          x: playerCar.x - Math.cos(playerCar.angle) * 40, y: playerCar.y - Math.sin(playerCar.angle) * 40,
          vx: (state.random() - 0.5) * 60, vy: (state.random() - 0.5) * 60,
          life: 0.5, maxLife: 0.5, colour: 'rgba(200,200,200,0.4)', size: 6,
        });
      }
    }
    if (playerCar.health < 40 && state.random() < 0.2) spawnSmoke(state, playerCar.x, playerCar.y - 20);
  }

  /** Sit Lena in a stolen car, and fold the garage's armour into it. */
  function stealCar(car) {
    enterCar(player, car);
    state.playerCar = car;
    const tune = VEHICLE_KINDS[car.kind] || VEHICLE_KINDS.car;
    const bonus = armourBonus(state.garage);
    car.maxHealth = tune.health + bonus;
    car.health = Math.min(car.maxHealth, car.health + bonus);
    state.stats.carsStolen += 1;
    state.events |= EVENT_CAR_STOLEN;
    addWanted(state.police, 1, state);
    scarePedestrians(state, player.x, player.y, 260);
  }

  /** The garage keys: G opens or closes the shop at the door, 1/2/3 buy
   *  a track while the shop is open. */
  function stepGarage(actions) {
    if (actions & ACTION_GARAGE) {
      if (canUseGarage(state)) state.garage.open = !state.garage.open;
    }
    if (!state.garage.open) return;
    if (actions & ACTION_BUY_ENGINE) buyUpgrade(state, 'engine');
    if (actions & ACTION_BUY_ARMOUR) buyUpgrade(state, 'armour');
    if (actions & ACTION_BUY_NITRO) buyUpgrade(state, 'nitro');
    // Walk or drive away and the shop closes itself.
    if (!canUseGarage(state)) state.garage.open = false;
  }

  /** The player phase: on foot or driving, stealing, punching, shooting. */
  function stepPlayer(input, actions, dt) {
    const wantEnterCar = (actions & 4) !== 0;
    const wantPunch = (actions & 16) !== 0;
    if (!state.missions.active && !state.missions.storyComplete) startNextMission(state);
    stepGarage(actions);
    const playerCar = state.playerCar;
    if (player.onFoot) {
      updatePlayerOnFoot(player, city, input.moveVector(), input.running(), dt);
      if (player.running && player.moving && state.random() < 0.12) {
        spawnDust(state, player.x, player.y + 8);
      }
      if (wantEnterCar) {
        const car = nearestStealableCar(player, state.cars);
        if (car) stealCar(car);
      }
      if (wantPunch) punch(state, player);
      if (input.shooting()) {
        const angle = input.aimAngle(player.x, player.y);
        if (fireBullet(state, player.x, player.y, angle)) addWanted(state.police, 1, state);
      }
    } else if (playerCar) {
      // A wrecked car is no drive: step out of it on foot instead.
      if (playerCar.wrecked) {
        exitCar(player, playerCar);
        state.playerCar = null;
      } else {
        stepDriving(playerCar, input, dt);
        if (wantEnterCar) {
          exitCar(player, playerCar);
          state.playerCar = null;
        }
      }
    }
  }

  /** The traffic phase: spawn, drive, crash into each other, and honk. */
  function stepTraffic(dt) {
    state.trafficTimer -= dt;
    if (state.trafficTimer <= 0) {
      state.trafficTimer = TRAFFIC.spawnInterval;
      const alive = state.cars.filter((c) => !c.wrecked).length;
      if (alive < TRAFFIC.count + 4) state.cars.push(spawnTrafficCar(city, random, false));
    }
    for (const car of state.cars) {
      if (car.driver === 'traffic') {
        updateTrafficCar(car, city, state.cars, dt);
        if (car.honkTimer > 0 && car.honkTimer + dt >= 0.5) state.events |= EVENT_HONK;
      }
    }
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        if (collideCars(state.cars[i], state.cars[j], state)) {
          state.events |= EVENT_CRASH;
          state.stats.crashes += 1;
          if (state.playerCar === state.cars[i] || state.playerCar === state.cars[j]) {
            state.camera.shake = 10;
            hurtPlayer(player, 4);
          }
        }
      }
    }
    state.pedTimer -= dt;
    if (state.pedTimer <= 0) {
      state.pedTimer = 3;
      if (state.peds.length < PEDESTRIAN.count) state.peds.push(createPedestrian(city, random));
    }
    for (const ped of state.peds) updatePedestrian(ped, city, state, dt);
  }

  /** The police phase: decay, spawn, chase, and the bust clock. */
  function stepPolice(dt) {
    updateWantedDecay(state.police, dt);
    ensurePoliceCars(state.police, state, random);
    ensurePoliceOfficers(state.police, state, random);
    for (const car of state.police.cars) {
      updatePoliceCar(car, state, dt);
      for (const other of state.cars) collideCars(car, other, state);
    }
    for (const officer of state.police.officers) updatePoliceOfficer(officer, state, dt);
    updateBustedTimer(state.police, state, dt);
  }

  /** Combat, missions, the new systems, pickups (with respawn), particles
   *  and the camera. */
  function stepUpkeep(dt) {
    updateCombatCooldowns(state, dt);
    updateBullets(state, dt);
    updateMissions(state, dt);
    updateDayNight(state.daynight, dt);
    updateWeather(state.weather, random, dt);
    updateTaxi(state, dt);
    updateCollectibles(state, dt);
    if (state.missions.doneCount !== state.stats.missionsDone) state.stats.missionsDone = state.missions.doneCount;
    for (const pickup of state.pickups) {
      if (!pickup.taken && distance(player.x, player.y, pickup.x, pickup.y) < 30) {
        pickup.taken = true;
        pickup.respawnIn = PICKUP_RESPAWN_SECONDS;
        state.money += pickup.amount;
        state.score += 25;
        state.events |= EVENT_PICKUP;
      } else if (pickup.taken) {
        pickup.respawnIn -= dt;
        if (pickup.respawnIn <= 0) {
          pickup.taken = false;
          pickup.x = 400 + random() * 2400;
          pickup.y = 400 + random() * 1400;
        }
      }
    }
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    // Cap the live particles: a long chase with constant sparks and dust
    // must not grow this list forever.
    if (state.particles.length > LIMITS.maxParticles) {
      state.particles.splice(0, state.particles.length - LIMITS.maxParticles);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    const focusX = player.x - 640;
    const focusY = player.y - 360;
    state.camera.x = clamp(state.camera.x + (focusX - state.camera.x) * Math.min(1, 5 * dt), 0, WORLD.width - 1280);
    state.camera.y = clamp(state.camera.y + (focusY - state.camera.y) * Math.min(1, 5 * dt), 0, WORLD.height - 720);
    if (state.camera.shake > 0) state.camera.shake = Math.max(0, state.camera.shake - 30 * dt);
  }

  function step(dt, input, actions) {
    state.events = 0;
    state.elapsed += dt;
    state.time += dt;
    state.steps += 1;
    // Actions arrive as bit flags from input.js: 4 = enter/exit car,
    // 16 = punch, 64 = garage, 128/256/512 = buy engine/armour/nitro.
    stepPlayer(input, actions, dt);
    stepTraffic(dt);
    stepPolice(dt);
    stepUpkeep(dt);
    // --- Busted / dead. ---
    if (player.health <= 0) state.events |= EVENT_OVER;
    if (state.events & EVENT_BUSTED) state.events |= EVENT_OVER;
    void STEP;
    void retargetPedestrian;
    void resolveBuildingCollision;
    void createCar;
    void EVENT_MISSION_STEP;
    return state.events;
  }
}
