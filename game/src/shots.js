// The screenshot scenes behind ?shot=chase|downtown|mission|start. Each one
// plays the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot that drives, steals a car and runs from the
// police, so the frame is what a short game really looks like and the same
// seed always gives the same frame. The four shots are the cover and the
// three others, in the order shots.json lists them.

import { STEP } from './config.js';
import { addWanted } from './police.js';
import { enterCar, nearestStealableCar } from './player.js';
import { startNextMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const CHASE_SECONDS = 24;
const DOWNTOWN_SECONDS = 14;
const MISSION_SECONDS = 20;

/** A fake input that steers toward a target point, for the autopilot. */
function autopilotInput(world, targetX, targetY) {
  const player = world.state.player;
  const dx = targetX - player.x;
  const dy = targetY - player.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    moveVector: () => ({ x: dx / d, y: dy / d }),
    running: () => false,
    shooting: () => false,
    aimAngle: () => 0,
  };
}

/** Drive the player's car toward a target, in the same fake-input shape. */
function autopilotDrive(world, targetX, targetY) {
  const car = world.state.playerCar;
  if (!car) return autopilotInput(world, targetX, targetY);
  const dx = targetX - car.x;
  const dy = targetY - car.y;
  const want = Math.atan2(dy, dx);
  let turn = want - car.angle;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  return {
    moveVector: () => ({ x: turn > 0.15 ? 1 : turn < -0.15 ? -1 : 0, y: -1 }),
    running: () => false,
    shooting: () => false,
    aimAngle: () => 0,
  };
}

function stepWorld(world, input, actions) {
  world.step(STEP, input, actions || 0);
}

/** Snap the camera onto the player, so the frame is centred on them even
 *  after a teleport or a re-seat in a fresh car. */
function snapCamera(state) {
  const player = state.player;
  state.camera.x = Math.max(0, Math.min(3200 - 1280, player.x - 640));
  state.camera.y = Math.max(0, Math.min(2400 - 720, player.y - 360));
  state.camera.shake = 0;
}

/** Set `world` to the named scene and return the screen to draw over it. */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'start') {
    for (let i = 0; i < 5 / STEP; i += 1) stepWorld(world, autopilotInput(world, 1600, 1000), 0);
    snapCamera(state);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  startNextMission(state);
  if (name === 'downtown') {
    // Lena on foot in Downtown, traffic and pedestrians around her.
    state.player.x = 2200;
    state.player.y = 600;
    for (let i = 0; i < DOWNTOWN_SECONDS / STEP; i += 1) {
      stepWorld(world, autopilotInput(world, 2400, 800), 0);
    }
    snapCamera(state);
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'mission') {
    // Mission 1 in progress: Lena driving to the delivery point.
    const car = nearestStealableCar(state.player, state.cars) || state.cars[0];
    if (car) {
      state.player.x = car.x;
      state.player.y = car.y;
      enterCar(state.player, car);
      state.playerCar = car;
    }
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      stepWorld(world, autopilotDrive(world, 2600, 1400), 0);
    }
    snapCamera(state);
    return { screen: SCREEN_PLAY, best: state.score };
  }
  // Default: chase — Lena in a stolen car, wanted 3 stars, police behind her.
  const car = state.cars[1] || state.cars[0];
  if (car) {
    state.player.x = car.x;
    state.player.y = car.y;
    enterCar(state.player, car);
    state.playerCar = car;
  }
  addWanted(state.police, 3, state);
  for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
    stepWorld(world, autopilotDrive(world, 1800 + (i % 600), 1200), 0);
    // The chase lasts longer than the wanted decay, so top the stars back up.
    if (i === Math.floor(CHASE_SECONDS / STEP / 2)) addWanted(state.police, 1, state);
  }
  // The chase may have wrecked the car: re-seat Lena in a fresh one for the
  // cover frame, with the wanted level back at 3 stars and police behind her.
  if (!state.playerCar || state.playerCar.wrecked) {
    const fresh = state.cars.find((c) => !c.wrecked && c.driver !== 'player');
    if (fresh) {
      state.player.x = fresh.x;
      state.player.y = fresh.y;
      enterCar(state.player, fresh);
      state.playerCar = fresh;
    }
  }
  // Pull the pursuing police cars in close around Lena's car so the cover
  // frame reads as a chase, not an empty road.
  const offsets = [[-260, -60], [300, 80], [-140, 260], [180, -300]];
  state.police.cars.forEach((policeCar, i) => {
    const off = offsets[i % offsets.length];
    policeCar.x = state.player.x + off[0];
    policeCar.y = state.player.y + off[1];
    policeCar.angle = Math.atan2(state.player.y - policeCar.y, state.player.x - policeCar.x);
    policeCar.speed = 130;
    policeCar.wrecked = false;
  });
  if (state.playerCar) state.playerCar.speed = 150;
  state.police.wanted = 3;
  state.police.decayTimer = 14;
  snapCamera(state);
  return { screen: SCREEN_PLAY, best: state.score };
}
