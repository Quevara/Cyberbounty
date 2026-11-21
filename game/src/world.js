// The game's rules and state, with no drawing and no browser in it: the city,
// the player, the cars, the people, the police, the missions and the combat,
// all advanced by one fixed step. step() returns what happened as bit flags,
// so the caller can play sounds and announce without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns, except
// the small pools the systems refill.

import { CAR, ECONOMY, PEDESTRIAN, PLAYER, STEP, TRAFFIC, WORLD } from './config.js';
import { createCity, resolveBuildingCollision } from './city.js';
import { createPlayer, enterCar, exitCar, hurtPlayer, nearestStealableCar, updatePlayerOnFoot } from './player.js';
import { collideCars, createCar, drivePlayerCar, spawnSmoke, spawnTrafficCar, updateTrafficCar } from './vehicles.js';
import { createPedestrian, retargetPedestrian, scarePedestrians, updatePedestrian } from './pedestrians.js';
import { addWanted, createPoliceState, ensurePoliceCars, ensurePoliceOfficers, EVENT_BUSTED, updatePoliceCar, updatePoliceOfficer, updateWantedDecay } from './police.js';
import { createCombatState, fireBullet, punch, updateBullets, updateCombatCooldowns } from './combat.js';
import { createMissionState, startNextMission, updateMissions } from './missions.js';
import { clamp, distance } from './util.js';

export const EVENT_COIN = 2;
export const EVENT_HIT = 1;
export const EVENT_OVER = 4;
export const EVENT_CRASH = 8;
export const EVENT_CAR_STOLEN = 16;
export const EVENT_PICKUP = 32;

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
    bullets: [],
    particles: [],
    pickups: [],
    money: (saved && saved.money) || ECONOMY.startMoney,
    score: (saved && saved.score) || 0,
    elapsed: 0,
    time: 0,
    events: 0,
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
  // A few cash pickups on the sidewalks, for the player to grab on foot.
  for (let i = 0; i < 8; i += 1) {
    state.pickups.push({ x: 400 + random() * 2400, y: 400 + random() * 1400, amount: 25, taken: false });
  }
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
    state.police = createPoliceState();
    state.combat = createCombatState();
    state.missions = createMissionState();
    state.bullets.length = 0;
    state.particles.length = 0;
    for (const car of state.cars) car.wrecked = false;
  }

  function step(dt, input, actions) {
    state.events = 0;
    state.elapsed += dt;
    state.time += dt;
    // Actions arrive as bit flags from input.js: 4 = enter/exit car, 16 = punch.
    const wantEnterCar = (actions & 4) !== 0;
    const wantPunch = (actions & 16) !== 0;
    if (!state.missions.active && !state.missions.storyComplete) startNextMission(state);
    const playerCar = state.playerCar;
    // --- Player: on foot or driving. ---
    if (player.onFoot) {
      updatePlayerOnFoot(player, city, input.moveVector(), input.running(), dt);
      if (wantEnterCar) {
        const car = nearestStealableCar(player, state.cars);
        if (car) {
          enterCar(player, car);
          state.playerCar = car;
          state.stats.carsStolen += 1;
          state.events |= EVENT_CAR_STOLEN;
          addWanted(state.police, 1, state);
          scarePedestrians(state, player.x, player.y, 260);
        }
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
      }
      const speed = playerCar.wrecked ? 0 : drivePlayerCar(playerCar, input.moveVector(), dt);
      player.x = playerCar.x;
      player.y = playerCar.y;
      player.angle = playerCar.angle;
      if (wantEnterCar) {
        exitCar(player, playerCar);
        state.playerCar = null;
      }
      if (Math.abs(speed) > 420 && state.random() < 0.3) {
        state.particles.push({
          x: playerCar.x - Math.cos(playerCar.angle) * 40, y: playerCar.y - Math.sin(playerCar.angle) * 40,
          vx: (state.random() - 0.5) * 60, vy: (state.random() - 0.5) * 60,
          life: 0.5, maxLife: 0.5, colour: 'rgba(200,200,200,0.4)', size: 6,
        });
      }
      if (playerCar.health < 40 && state.random() < 0.2) spawnSmoke(state, playerCar.x, playerCar.y - 20);
    }
    // --- Traffic, pedestrians, police. ---
    state.trafficTimer -= dt;
    if (state.trafficTimer <= 0) {
      state.trafficTimer = TRAFFIC.spawnInterval;
      const alive = state.cars.filter((c) => !c.wrecked).length;
      if (alive < TRAFFIC.count + 4) state.cars.push(spawnTrafficCar(city, random, false));
    }
    for (const car of state.cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, city, state.cars, dt);
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
    // --- Police. ---
    updateWantedDecay(state.police, dt);
    ensurePoliceCars(state.police, state, random);
    ensurePoliceOfficers(state.police, state, random);
    for (const car of state.police.cars) {
      updatePoliceCar(car, state, dt);
      for (const other of state.cars) collideCars(car, other, state);
    }
    for (const officer of state.police.officers) updatePoliceOfficer(officer, state, dt);
    // --- Combat, missions, pickups. ---
    updateCombatCooldowns(state, dt);
    updateBullets(state, dt);
    updateMissions(state, dt);
    if (state.missions.doneCount !== state.stats.missionsDone) state.stats.missionsDone = state.missions.doneCount;
    for (const pickup of state.pickups) {
      if (!pickup.taken && distance(player.x, player.y, pickup.x, pickup.y) < 30) {
        pickup.taken = true;
        state.money += pickup.amount;
        state.score += 25;
        state.events |= EVENT_PICKUP;
      }
    }
    // --- Particles and camera. ---
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    const focusX = player.x - 640;
    const focusY = player.y - 360;
    state.camera.x = clamp(state.camera.x + (focusX - state.camera.x) * Math.min(1, 5 * dt), 0, WORLD.width - 1280);
    state.camera.y = clamp(state.camera.y + (focusY - state.camera.y) * Math.min(1, 5 * dt), 0, WORLD.height - 720);
    if (state.camera.shake > 0) state.camera.shake = Math.max(0, state.camera.shake - 30 * dt);
    // --- Busted / dead. ---
    if (player.health <= 0) state.events |= EVENT_OVER;
    if (state.events & EVENT_BUSTED) state.events |= EVENT_OVER;
    void STEP;
    void retargetPedestrian;
    void resolveBuildingCollision;
    void createCar;
    return state.events;
  }
}
