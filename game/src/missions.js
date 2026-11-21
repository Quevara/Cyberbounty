// The story of Vice Harbor: Lena Marlowe, a courier who owes the wrong
// people money, and Otto Reyes, the Dockside garage owner who gives her work.
// Six missions, each a chain of steps — go somewhere, steal a car, survive a
// chase, hold a spot — with a briefing, a live objective and a pay day.

import { ECONOMY } from './config.js';
import { distance } from './util.js';
import { landmarkByName } from './city.js';

export const EVENT_MISSION_DONE = 1024;
export const EVENT_MISSION_STEP = 2048;

/** Mission definitions: title, briefing, pay, and the steps in order. */
export const MISSIONS = [
  {
    title: 'First Fare',
    briefing: 'Otto: Lena, a package is waiting at Harbor Market. Take it to City Hall, no questions, no detours.',
    pay: ECONOMY.missionPay[0],
    steps: [
      { type: 'go', place: 'Harbor Market', text: 'Pick up the package at Harbor Market' },
      { type: 'go', place: 'City Hall', text: 'Deliver the package to City Hall' },
    ],
  },
  {
    title: 'Hot Wheels',
    briefing: 'Otto: The garage needs a clean Harbor Sedan. Any car will do — borrow one and bring it to Dockside Warehouse.',
    pay: ECONOMY.missionPay[1],
    steps: [
      { type: 'stealCar', text: 'Steal a car (walk up to one and press E)' },
      { type: 'driveTo', place: 'Dockside Warehouse', text: 'Drive the car to Dockside Warehouse' },
    ],
  },
  {
    title: 'The Getaway',
    briefing: 'Otto: That sedan belonged to the Gulls. The police are coming. Lose them, then meet me at Sunset Pier.',
    pay: ECONOMY.missionPay[2],
    steps: [
      { type: 'survive', seconds: 18, text: 'Survive the police chase for 18 seconds' },
      { type: 'go', place: 'Sunset Pier', text: 'Meet Otto at Sunset Pier' },
    ],
  },
  {
    title: 'Beachfront Drop',
    briefing: 'Lena: A client at the Beachfront Hotel is waiting for a parcel. On foot, quiet, and do not get spotted.',
    pay: ECONOMY.missionPay[3],
    steps: [
      { type: 'go', place: 'Beachfront Hotel', text: 'Walk the parcel to the Beachfront Hotel' },
      { type: 'wait', seconds: 6, text: 'Wait for the client to collect the parcel' },
    ],
  },
  {
    title: 'Dockside Heist',
    briefing: 'Otto: The Gulls keep their cash in the Dockside Warehouse. Get inside, hold the room, then run for Neon Row.',
    pay: ECONOMY.missionPay[4],
    steps: [
      { type: 'go', place: 'Dockside Warehouse', text: 'Get into the Dockside Warehouse' },
      { type: 'wait', seconds: 10, text: 'Hold the warehouse for 10 seconds' },
      { type: 'go', place: 'Neon Row', text: 'Escape to Neon Row' },
    ],
  },
  {
    title: 'The Big Score',
    briefing: 'Otto: One last job, Lena. Take a fast car, run the checkpoints, and get the score to the Ferry Terminal. Then we are square.',
    pay: ECONOMY.missionPay[5],
    steps: [
      { type: 'stealCar', text: 'Steal a fast car (press E near any car)' },
      { type: 'driveTo', place: 'Neon Row', text: 'Checkpoint 1: Neon Row' },
      { type: 'driveTo', place: 'University Library', text: 'Checkpoint 2: University Library' },
      { type: 'driveTo', place: 'Ferry Terminal', text: 'Final delivery: Ferry Terminal' },
    ],
  },
];

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
  showMissionMessage(state, `${def.title}: ${def.briefing}`);
  return def;
}

export function showMissionMessage(state, text) {
  state.missions.message = text;
  state.missions.messageTimer = 6;
}

export function currentMissionDef(state) {
  return MISSIONS[state.missions.index] || null;
}

export function currentStep(state) {
  const def = currentMissionDef(state);
  if (!def) return null;
  return def.steps[state.missions.stepIndex] || null;
}

export function currentObjectiveText(state) {
  const step = currentStep(state);
  if (!step) return state.missions.storyComplete ? 'Story complete — Vice Harbor is yours.' : 'Press M for the mission list.';
  return `${currentMissionDef(state).title}: ${step.text}`;
}

/** Advance the active mission one step when its condition is met. */
export function updateMissions(state, dt) {
  const missions = state.missions;
  if (missions.messageTimer > 0) missions.messageTimer -= dt;
  if (!missions.active) return;
  const step = currentStep(state);
  if (!step) return;
  const player = state.player;
  let done = false;
  if (step.type === 'go' || step.type === 'driveTo') {
    const place = landmarkByName(state.city, step.place);
    const d = distance(player.x, player.y, place.x, place.y);
    // A drive-to step only counts in a car; a go step counts on foot or in one.
    if (d < 90 && (step.type === 'go' || !player.onFoot)) done = true;
  } else if (step.type === 'stealCar') {
    if (!player.onFoot) done = true;
  } else if (step.type === 'survive') {
    missions.stepTimer += dt;
    if (missions.stepTimer >= step.seconds) done = true;
  } else if (step.type === 'wait') {
    missions.stepTimer += dt;
    if (missions.stepTimer >= step.seconds) done = true;
  }
  if (!done) return;
  missions.stepIndex += 1;
  missions.stepTimer = 0;
  state.events |= EVENT_MISSION_STEP;
  if (missions.stepIndex >= currentMissionDef(state).steps.length) {
    const def = currentMissionDef(state);
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
}

/** The target marker for the current step, or null. */
export function missionTarget(state) {
  const step = currentStep(state);
  if (!step || !step.place) return null;
  const place = landmarkByName(state.city, step.place);
  return { x: place.x, y: place.y, label: place.name };
}
