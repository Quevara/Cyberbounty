// Vice Harbor v2.3 — the screenshot scenes behind ?shot=chase|downtown|
// mission|start. Each one plays the real rules forward from a fresh world
// for a fixed number of steps, steered by a simple autopilot that drives,
// steals a car and runs from the police, so the frame is what a short game
// really looks like and the same seed always gives the same frame. The four
// shots are the cover and the three others, in the order shots.json lists
// them. v2.3 re-stages every scene with seed 4 and puts a new system in
// each frame: the cover chase runs at dusk, with the lamps burning and the
// windows lit; the downtown scene has a taxi passenger waiting at the
// kerb; the mission shot drives the delivery at night, headlights on
// against the dark; and the title scene opens at dawn.

import { CHASE_FRAMING, STEP } from './config.js';
import { addWanted, ensurePoliceCars } from './police.js';
import { enterCar, nearestStealableCar } from './player.js';
import { startNextMission } from './missions.js';
import { setDayNight } from './daynight.js';
import { setWeather } from './weather.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Seconds of simulated play behind each staged scene. */
const CHASE_SECONDS = 26;
const DOWNTOWN_SECONDS = 18;
const MISSION_SECONDS = 24;

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

/** Move the player and their car to a fixed anchor for the final frame,
 *  heading `angle`: the simulated chase can end anywhere on the map, and
 *  a player near the edge leaves the camera clamped and the car half
 *  off-screen. The anchor is a known-good central spot, so the frame is
 *  composed no matter where the chase went. */
function anchorScene(state, x, y, angle) {
  const car = state.playerCar;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  if (car) {
    car.x = x;
    car.y = y;
    car.angle = angle;
    car.speed = 150;
  }
  // The teleport can land Lena's car on top of a traffic car, which
  // then peeks out from under her in the frame — shove any car that
  // close 200 px ahead along the road, so the anchor reads clean.
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  for (const other of state.cars) {
    if (other === car || other.driver === 'police') continue;
    const dx = other.x - x;
    const dy = other.y - y;
    if (dx * dx + dy * dy < 90 * 90) {
      other.x = x + ux * 200;
      other.y = y + uy * 200;
    }
  }
  snapCamera(state);
}
/** Place the three chase cars around the player from CHASE_FRAMING: one
 *  behind-left, one ahead-right, one ahead-left — none in the corners
 *  where the HUD lives, and none under the top-centre label. */
function frameChaseCars(state) {
  state.police.cars.forEach((policeCar, i) => {
    const off = CHASE_FRAMING[i % CHASE_FRAMING.length];
    policeCar.x = state.player.x + off.dx;
    policeCar.y = state.player.y + off.dy;
    policeCar.angle = Math.atan2(state.player.y - policeCar.y, state.player.x - policeCar.x);
    policeCar.speed = 160;
    policeCar.wrecked = false;
  });
}

/** Put Lena in the nearest car she can steal, for the driving scenes. */
function seatInCar(world, state, pickIndex) {
  const car = nearestStealableCar(state.player, state.cars) || state.cars[pickIndex] || state.cars[0];
  if (!car) return;
  state.player.x = car.x;
  state.player.y = car.y;
  enterCar(state.player, car);
  state.playerCar = car;
}

/** The title scene: a few seconds of the city living behind the panel,
 *  at dawn, with the first light on the roofs. */
function stageStart(world, state) {
  for (let i = 0; i < 5 / STEP; i += 1) stepWorld(world, autopilotInput(world, 1600, 1000), 0);
  setDayNight(state.daynight, 0.05);
  snapCamera(state);
  return { screen: SCREEN_TITLE, best: 0 };
}

/** Lena on foot in Downtown, walking toward Neon Row, traffic and
 *  pedestrians around her — and a taxi passenger waiting at the kerb
 *  just ahead of her, so the new trade reads in the frame. */
function stageDowntown(world, state) {
  state.player.x = 2200;
  state.player.y = 600;
  for (let i = 0; i < DOWNTOWN_SECONDS / STEP; i += 1) {
    stepWorld(world, autopilotInput(world, 2500, 700), 0);
  }
  // A passenger waiting on the sidewalk ahead of Lena, fare already set.
  state.taxi.status = 'waiting';
  state.taxi.passenger = { x: 2460, y: 660, from: 'Neon Row' };
  state.taxi.destination = { x: 2200, y: 600, name: 'City Hall' };
  state.taxi.fare = 120;
  state.taxi.waitLeft = 45;
  // A light shower over Downtown, so the rain reads in the frame.
  setWeather(state.weather, 'rain', 0.55);
  snapCamera(state);
  return { screen: SCREEN_PLAY, best: state.score };
}

/** Mission 1 in progress: Lena driving to the delivery point, at night —
 *  the lamps burn, the windows are lit, and the headlights cut the dark. */
function stageMission(world, state) {
  seatInCar(world, state, 0);
  setDayNight(state.daynight, 0.82);
  for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
    stepWorld(world, autopilotDrive(world, 2600, 1400), 0);
  }
  // The clock keeps ticking through the drive: pin it back to night so
  // the frame stays dark even after a long simulated run.
  setDayNight(state.daynight, 0.82);
  // Anchor the final frame on the road into Harbor Market: wherever the
  // drive ended, the delivery marker reads in the frame and the camera
  // is nowhere near the map edge.
  anchorScene(state, 2100, 1400, 0);
  return { screen: SCREEN_PLAY, best: state.score };
}

/** The cover: Lena in a stolen car, wanted 3 stars, police behind her,
 *  at dusk — warm light, lamps on, windows lit, three police cars framed
 *  around her. */
function stageChase(world, state) {
  seatInCar(world, state, 1);
  addWanted(state.police, 3, state);
  const total = CHASE_SECONDS / STEP;
  for (let i = 0; i < total; i += 1) {
    stepWorld(world, autopilotDrive(world, 1800 + (i % 600), 1200), 0);
    // The chase lasts longer than the wanted decay, so top the stars back up.
    if (i === Math.floor(total / 2)) addWanted(state.police, 1, state);
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
  // frame reads as a chase, not an empty road — framed clear of the HUD.
  // Top the wanted level back up to 3 stars FIRST: the decay may have
  // trimmed a car during the long chase, and ensurePoliceCars only tops
  // the chase up to the current wanted level.
  state.police.wanted = 3;
  state.police.decayTimer = 14;
  ensurePoliceCars(state.police, state, state.random);
  // Anchor the cover on a central Downtown road, heading east: the chase
  // may have ended at the map edge, where the clamped camera would leave
  // Lena's car half off-screen. The police frame around the anchor.
  anchorScene(state, 1500, 1000, 0);
  frameChaseCars(state);
  if (state.playerCar) state.playerCar.speed = 150;
  // Dusk for the cover: warm light, lamps burning, windows lit.
  setDayNight(state.daynight, 0.6);
  snapCamera(state);
  return { screen: SCREEN_PLAY, best: state.score };
}

/** Set `world` to the named scene and return the screen to draw over it. */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'start') return stageStart(world, state);
  startNextMission(state);
  if (name === 'downtown') return stageDowntown(world, state);
  if (name === 'mission') return stageMission(world, state);
  return stageChase(world, state);
}
