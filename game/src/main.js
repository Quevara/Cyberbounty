// Vice Harbor v2.3 — boot and the one loop: input is read every frame,
// the world advances in fixed 1/60 s steps (several in a slow frame, none
// in a fast one), and the renderer paints what is there. The game moves
// between the title, play, paused, mission-list, busted, game-over and
// story-complete screens. Save and best score live in localStorage. v2.3
// wires the new systems through the loop: a taxi ding when a passenger
// flags Lena down, a chime for a found hubcap, a clank for a bought
// garage upgrade, and the garage keys (G to open, 1/2/3 to buy) pass
// straight from the input to the world. The loop is split into named
// pieces — handleActions, step, frame — so each screen change is one
// branch, not a tangle.
//
// ?seed=N fixes the city and the traffic. ?shot=chase|downtown|mission|start
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, SAVE_KEY, STEP, VEHICLE_KINDS } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAR_STOLEN, EVENT_CRASH, EVENT_HONK, EVENT_OVER, EVENT_PICKUP } from './world.js';
import { EVENT_MISSION_DONE, EVENT_MISSION_STEP } from './missions.js';
import { EVENT_BUSTED } from './police.js';
import { EVENT_SHOT_FIRED } from './combat.js';
import { EVENT_TAXI_DONE, EVENT_TAXI_PICKUP } from './taxi.js';
import { EVENT_COLLECTIBLE } from './collectibles.js';
import { EVENT_UPGRADE, engineBonus } from './garage.js';
import { ACTION_CONFIRM, ACTION_MISSIONS, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { createAudio, ensureAudio, playBusted, playCash, playCheckpoint, playClick, playCollectible, playCrash, playDoor, playGunshot, playHorn, playMissionComplete, playPickup, playSirenBlip, playSkid, playTaxiDing, playUpgrade, setEngineSpeed, setMuted, startEngine, stopEngine } from './audio.js';
import { startNextMission } from './missions.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261122;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const saved = readSave();
const world = createWorld(createRandom(seed), saved);
const renderer = createRenderer(canvas);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: world.state.money,
      score: world.state.score,
      missionsDone: world.state.missions.doneCount,
    }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Ignore storage errors.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (sx, sy) => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / 1280, rect.height / 720);
    const ox = (rect.width - 1280 * scale) / 2;
    const oy = (rect.height - 720 * scale) / 2;
    return {
      x: world.state.camera.x + (sx - rect.left - ox) / scale,
      y: world.state.camera.y + (sy - rect.top - oy) / scale,
    };
  });
  let screen = SCREEN_TITLE;
  let best = readBest();
  let showMissions = false;
  let accumulator = 0;
  let last = performance.now();
  let sirenTimer = 0;
  let skidTimer = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    startNextMission(world.state);
    accumulator = 0;
    screen = SCREEN_PLAY;
    showMissions = false;
    announce('Vice Harbor. Lena Marlowe is on the streets. Follow the gold marker.');
  }

  function endRun(busted) {
    screen = busted ? SCREEN_BUSTED : SCREEN_OVER;
    stopEngine(audio);
    if (busted) playBusted(audio);
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    writeSave();
    announce(busted ? 'Busted. The police caught Lena.' : 'Game over.');
  }

  /** Turn the world's event flags into sounds and screen changes. */
  function handleEvents(events) {
    if (events & EVENT_PICKUP) playPickup(audio);
    if (events & EVENT_CRASH) playCrash(audio);
    if (events & EVENT_HONK) playHorn(audio);
    if (events & EVENT_CAR_STOLEN) {
      playDoor(audio);
      playCash(audio);
    }
    if (events & EVENT_MISSION_STEP) playCheckpoint(audio);
    if (events & EVENT_MISSION_DONE) {
      playCash(audio);
      playMissionComplete(audio);
      writeSave();
      if (world.state.missions.storyComplete) {
        screen = SCREEN_STORY;
        stopEngine(audio);
        return;
      }
      startNextMission(world.state);
    }
    if (events & EVENT_TAXI_PICKUP) playTaxiDing(audio);
    if (events & EVENT_TAXI_DONE) {
      playCash(audio);
      announce('Taxi fare paid. Nice driving, Lena.');
    }
    if (events & EVENT_COLLECTIBLE) playCollectible(audio);
    if (events & EVENT_UPGRADE) playUpgrade(audio);
    if (events & EVENT_SHOT_FIRED) playGunshot(audio);
    if (events & EVENT_BUSTED) endRun(true);
    else if (events & EVENT_OVER) endRun(false);
  }

  /** Pause and resume, with an announcement for screen readers. */
  function togglePause() {
    if (screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** Mute and unmute every sound, with an announcement. */
  function toggleMute() {
    const muted = !audio.muted;
    setMuted(audio, muted);
    announce(muted ? 'Sound muted. Press N to unmute.' : 'Sound on.');
    if (!muted) playClick(audio);
  }

  /** Take the one-shot presses and act on the screen-level ones; the
   *  world-level ones (steal, punch, garage, buy) pass through to the step. */
  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      ensureAudio(audio);
      if (screen === SCREEN_TITLE || screen === SCREEN_BUSTED || screen === SCREEN_OVER || screen === SCREEN_STORY) startGame();
    }
    if (actions & ACTION_PAUSE) togglePause();
    if (actions & ACTION_MUTE) toggleMute();
    if (actions & ACTION_MISSIONS) {
      if (screen === SCREEN_PLAY) showMissions = !showMissions;
    }
    return actions;
  }

  /** Engine hum, skids and sirens, from the world state after each step. */
  function updateAudio() {
    const car = world.state.playerCar;
    if (car) {
      startEngine(audio);
      const tune = VEHICLE_KINDS[car.kind] || VEHICLE_KINDS.car;
      const top = tune.topSpeed + engineBonus(world.state.garage);
      setEngineSpeed(audio, Math.min(1, Math.abs(car.speed) / top));
      skidTimer -= STEP;
      if (Math.abs(car.speed) > 480 && skidTimer <= 0) {
        skidTimer = 0.7;
        playSkid(audio);
      }
    } else {
      stopEngine(audio);
    }
    if (world.state.police.wanted > 0) {
      sirenTimer -= STEP;
      if (sirenTimer <= 0) {
        sirenTimer = 0.9;
        playSirenBlip(audio, Math.floor(world.state.time) % 2 === 0);
      }
    }
  }

  function step() {
    const actions = handleActions();
    if (screen !== SCREEN_PLAY) return;
    // Auto-start the first mission the first time the game runs.
    if (!world.state.missions.active && !world.state.missions.storyComplete && world.state.missions.index === 0) {
      startNextMission(world.state);
    }
    const events = world.step(STEP, input, actions);
    updateAudio();
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      handleActions();
    }
    renderer.draw(world.state, screen, { best, showMissions });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      // Let go of every key: a key held while the tab hides never sends
      // keyup, and Lena must not keep walking when the player comes back.
      input.releaseAll();
      announce('Paused.');
    }
  });

  announce('Vice Harbor. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
