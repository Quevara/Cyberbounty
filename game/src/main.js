// Vice Harbor boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between the
// title, play, paused, mission-list, busted, game-over and story-complete
// screens. Save and best score live in localStorage.
//
// ?seed=N fixes the city and the traffic. ?shot=chase|downtown|mission|start
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAR_STOLEN, EVENT_CRASH, EVENT_OVER, EVENT_PICKUP } from './world.js';
import { EVENT_MISSION_DONE } from './missions.js';
import { EVENT_BUSTED } from './police.js';
import { EVENT_SHOT_FIRED } from './combat.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_MISSIONS, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { createAudio, ensureAudio, playCash, playCrash, playGunshot, playMissionComplete, playPickup, playSirenBlip, setEngineSpeed, startEngine, stopEngine } from './audio.js';
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
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    writeSave();
    announce(busted ? 'Busted. The police caught Lena.' : 'Game over.');
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) playPickup(audio);
    if (events & EVENT_CRASH) playCrash(audio);
    if (events & EVENT_CAR_STOLEN) playCash(audio);
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
    if (events & EVENT_SHOT_FIRED) playGunshot(audio);
    if (events & EVENT_BUSTED) endRun(true);
    else if (events & EVENT_OVER) endRun(false);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      ensureAudio(audio);
      if (screen === SCREEN_TITLE || screen === SCREEN_BUSTED || screen === SCREEN_OVER || screen === SCREEN_STORY) startGame();
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_MISSIONS) {
      if (screen === SCREEN_PLAY) showMissions = !showMissions;
    }
    return actions;
  }

  function step() {
    const actions = handleActions();
    if (screen !== SCREEN_PLAY) return;
    // Auto-start the first mission the first time the game runs.
    if (!world.state.missions.active && !world.state.missions.storyComplete && world.state.missions.index === 0) {
      startNextMission(world.state);
    }
    const move = input.moveVector();
    const worldActions = (actions & ACTION_ENTER_CAR ? 4 : 0) | (actions & ACTION_PUNCH ? 16 : 0);
    const events = world.step(STEP, input, worldActions);
    void move;
    if (world.state.playerCar) {
      startEngine(audio);
      setEngineSpeed(audio, Math.abs(world.state.playerCar.speed) / 620);
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
      announce('Paused.');
    }
  });

  announce('Vice Harbor. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
