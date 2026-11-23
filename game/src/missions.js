// Vice Harbor v2.3 — the story of Vice Harbor: Lena Marlowe, a courier
// who owes the wrong people money, and Otto Reyes, the Dockside garage
// owner who gives her work. Six missions, each a chain of steps — go
// somewhere, drive somewhere, steal a car, survive a chase, hold a
// spot — with a briefing, a live objective, a tip, and a pay day. The
// engine is a small state machine now: each step kind owns one handler
// in a table, and the runner asks the handler whether its step is done.
// A new step kind is one table row, not a branch in the middle of the
// runner. The story itself — titles, briefings, tips, steps, pay — is
// exactly the one that played in v1 and v2, read from one data table so
// the whole story sits in a single place.

import { ECONOMY } from './config.js';
import { distance } from './util.js';
import { landmarkByName } from './city.js';

export const EVENT_MISSION_DONE = 1024;
export const EVENT_MISSION_STEP = 2048;

/** Step kinds: go somewhere, drive somewhere in a car, steal a car, survive
 *  the police for N seconds, or wait in place for N seconds. */
export const STEP_GO = 'go';
export const STEP_DRIVE_TO = 'driveTo';
export const STEP_STEAL_CAR = 'stealCar';
export const STEP_SURVIVE = 'survive';
export const STEP_WAIT = 'wait';

/** The whole story as data: [title, briefing, tip, payIndex, steps]. */
const MISSION_TABLE = [
  [
    'First Fare',
    'Otto: Lena, a package is waiting at Harbor Market. Take it to City Hall, no questions, no detours.',
    'Follow the gold marker — the package is at Harbor Market.',
    0,
    [
      { type: STEP_GO, place: 'Harbor Market', text: 'Pick up the package at Harbor Market' },
      { type: STEP_GO, place: 'City Hall', text: 'Deliver the package to City Hall' },
    ],
  ],
  [
    'Hot Wheels',
    'Otto: The garage needs a clean Harbor Sedan. Any car will do — borrow one and bring it to Dockside Warehouse.',
    'Walk up to a parked car and press E to steal it.',
    1,
    [
      { type: STEP_STEAL_CAR, text: 'Steal a car (walk up to one and press E)' },
      { type: STEP_DRIVE_TO, place: 'Dockside Warehouse', text: 'Drive the car to Dockside Warehouse' },
    ],
  ],
  [
    'The Getaway',
    'Otto: That sedan belonged to the Gulls. The police are coming. Lose them, then meet me at Sunset Pier.',
    'Keep moving and cut corners — the police cannot outrun your car.',
    2,
    [
      { type: STEP_SURVIVE, seconds: 18, text: 'Survive the police chase for 18 seconds' },
      { type: STEP_GO, place: 'Sunset Pier', text: 'Meet Otto at Sunset Pier' },
    ],
  ],
  [
    'Beachfront Drop',
    'Lena: A client at the Beachfront Hotel is waiting for a parcel. On foot, quiet, and do not get spotted.',
    'On foot is quieter — stay off the roads and the heat stays low.',
    3,
    [
      { type: STEP_GO, place: 'Beachfront Hotel', text: 'Walk the parcel to the Beachfront Hotel' },
      { type: STEP_WAIT, seconds: 6, text: 'Wait for the client to collect the parcel' },
    ],
  ],
  [
    'Dockside Heist',
    'Otto: The Gulls keep their cash in the Dockside Warehouse. Get inside, hold the room, then run for Neon Row.',
    'Hold the room for 10 seconds, then drive — do not fight it out.',
    4,
    [
      { type: STEP_GO, place: 'Dockside Warehouse', text: 'Get into the Dockside Warehouse' },
      { type: STEP_WAIT, seconds: 10, text: 'Hold the warehouse for 10 seconds' },
      { type: STEP_GO, place: 'Neon Row', text: 'Escape to Neon Row' },
    ],
  ],
  [
    'The Big Score',
    'Otto: One last job, Lena. Take a fast car, run the checkpoints, and get the score to the Ferry Terminal. Then we are square.',
    'A fast car helps, but the checkpoints are what count.',
    5,
    [
      { type: STEP_STEAL_CAR, text: 'Steal a fast car (press E near any car)' },
      { type: STEP_DRIVE_TO, place: 'Neon Row', text: 'Checkpoint 1: Neon Row' },
      { type: STEP_DRIVE_TO, place: 'University Library', text: 'Checkpoint 2: University Library' },
      { type: STEP_DRIVE_TO, place: 'Ferry Terminal', text: 'Final delivery: Ferry Terminal' },
    ],
  ],
];

/** One mission definition from one row of the table. */
function missionFromRow(row) {
  return {
    title: row[0],
    briefing: row[1],
    tip: row[2],
    pay: ECONOMY.missionPay[row[3]],
    steps: row[4].map((step) => ({ ...step })),
  };
}

/** Mission definitions: title, briefing, tip, pay, and the steps in order. */
export const MISSIONS = MISSION_TABLE.map(missionFromRow);

/** The total pay for finishing the whole story. */
export function totalMissionPay() {
  let total = 0;
  for (let i = 0; i < MISSIONS.length; i += 1) total += MISSIONS[i].pay;
  return total;
}

/** How close the player must be to a place for a go/drive step to land. */
const PLACE_RADIUS = 90;

/** One handler per step kind: `done` answers whether the step is finished.
 *  Handlers read the world and, for timed steps, advance the mission clock. */
const STEP_HANDLERS = {
  [STEP_GO]: {
    done(state, step) {
      return nearPlace(state, step.place, false);
    },
  },
  [STEP_DRIVE_TO]: {
    done(state, step) {
      return nearPlace(state, step.place, true);
    },
  },
  [STEP_STEAL_CAR]: {
    done(state) {
      return !state.player.onFoot;
    },
  },
  [STEP_SURVIVE]: {
    done(state, step, dt) {
      return tickTimedStep(state, step, dt);
    },
  },
  [STEP_WAIT]: {
    done(state, step, dt) {
      return tickTimedStep(state, step, dt);
    },
  },
};

/** True when the player is within PLACE_RADIUS of the named landmark.
 *  A drive-to step only counts while Lena is in a car. */
function nearPlace(state, placeName, needsCar) {
  const place = landmarkByName(state.city, placeName);
  const d = distance(state.player.x, state.player.y, place.x, place.y);
  if (d >= PLACE_RADIUS) return false;
  if (needsCar && state.player.onFoot) return false;
  return true;
}

/** Advance a timed step's clock and answer whether it has run long enough. */
function tickTimedStep(state, step, dt) {
  state.missions.stepTimer += dt;
  return state.missions.stepTimer >= step.seconds;
}

/** A fresh mission book: nothing started, nothing done. */
export function createMissionState() {
  return {
    index: 0,
    stepIndex: 0,
    stepTimer: 0,
    active: false,
    doneCount: 0,
    storyComplete: false,
    message: '',
    messageTimer: 0,
  };
}

/** Show a banner message for a few seconds. */
export function showMissionMessage(state, text) {
  state.missions.message = text;
  state.missions.messageTimer = 6;
}

/** Start the next mission, or mark the story complete when none is left. */
export function startNextMission(state) {
  const missions = state.missions;
  if (missions.index >= MISSIONS.length) {
    missions.storyComplete = true;
    return null;
  }
  const def = MISSIONS[missions.index];
  missions.active = true;
  missions.stepIndex = 0;
  missions.stepTimer = 0;
  showMissionMessage(state, `${def.title}: ${def.briefing} Tip: ${def.tip}`);
  return def;
}

/** The mission definition the player is on, or null past the last one. */
export function currentMissionDef(state) {
  if (state.missions.index >= MISSIONS.length) return null;
  return MISSIONS[state.missions.index];
}

/** The step the player is on, or null when the mission is finished. */
export function currentStep(state) {
  const def = currentMissionDef(state);
  if (!def) return null;
  return def.steps[state.missions.stepIndex] || null;
}

/** The objective line the HUD shows right now. */
export function currentObjectiveText(state) {
  const step = currentStep(state);
  if (!step) {
    return state.missions.storyComplete
      ? 'Story complete — Vice Harbor is yours.'
      : 'Press M for the mission list.';
  }
  return `${currentMissionDef(state).title}: ${step.text}`;
}

/** How far through the current timed step the player is, 0..1, or null. */
export function currentStepProgress(state) {
  const step = currentStep(state);
  if (!step || !step.seconds) return null;
  return Math.min(1, state.missions.stepTimer / step.seconds);
}

/** Pay the mission out, count it, and move the book to the next one. */
function finishMission(state, def) {
  const missions = state.missions;
  state.money += def.pay;
  missions.doneCount += 1;
  missions.active = false;
  missions.index += 1;
  state.events |= EVENT_MISSION_DONE;
  showMissionMessage(state, `Mission complete: ${def.title} — paid $${def.pay}.`);
  if (missions.index >= MISSIONS.length) {
    missions.storyComplete = true;
    state.score += 1000;
  } else {
    state.score += 250;
  }
}

/** Advance the active mission one step when its handler says it is done. */
export function updateMissions(state, dt) {
  const missions = state.missions;
  if (missions.messageTimer > 0) missions.messageTimer -= dt;
  if (!missions.active) return;
  const step = currentStep(state);
  if (!step) return;
  const handler = STEP_HANDLERS[step.type];
  if (!handler) return;
  if (!handler.done(state, step, dt)) return;
  missions.stepIndex += 1;
  missions.stepTimer = 0;
  state.events |= EVENT_MISSION_STEP;
  if (missions.stepIndex >= currentMissionDef(state).steps.length) {
    finishMission(state, currentMissionDef(state));
  }
}

/** The target marker for the current step, or null when it has no place. */
export function missionTarget(state) {
  const step = currentStep(state);
  if (!step || !step.place) return null;
  const place = landmarkByName(state.city, step.place);
  return { x: place.x, y: place.y, label: place.name };
}

/** How far through the current mission the player is, as {step, steps}. */
export function missionProgress(state) {
  const def = currentMissionDef(state);
  if (!def) return { step: 0, steps: 0 };
  return { step: state.missions.stepIndex + 1, steps: def.steps.length };
}

/** One line per mission for the mission-list screen: done, current, or next. */
export function missionJournalLines() {
  return MISSIONS.map((def, i) => ({ title: def.title, pay: def.pay, index: i }));
}
