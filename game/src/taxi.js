// Vice Harbor v2.3 — the taxi trade. When Lena is driving any car, a
// passenger may flag her down at the kerb: drive up, pick them up, and
// carry them to the landmark they name. The fare is a base amount plus
// a rate for the ride, capped so a cross-town trip never pays silly
// money, and the meter ticks while they sit in the car. A passenger who
// waits too long gives up and walks away. The job is a small state
// machine — none, waiting, riding, done — so the HUD can show the fare
// and the minimap can show the gold dot, and the renderer can draw the
// passenger waving at the kerb. Taxi work never touches the story
// missions; it is money on the side for a driver who keeps moving.

import { TAXI } from './config.js';
import { distance } from './util.js';
import { landmarkByName, randomSidewalkPoint } from './city.js';
import { pick } from './util.js';

export const EVENT_TAXI_PICKUP = 16384;
export const EVENT_TAXI_DONE = 32768;

/** A fresh taxi book: no job, nothing earned yet. */
export function createTaxiState() {
  return {
    /** 'none' | 'waiting' | 'riding' — see updateTaxi. */
    status: 'none',
    passenger: null,
    destination: null,
    fare: 0,
    waitLeft: 0,
    earned: 0,
    doneCount: 0,
    /** Seconds until the next passenger may appear. */
    nextIn: 6,
  };
}

/** The fare for a ride from (fx, fy) to (tx, ty), base plus distance. */
export function fareFor(fromX, fromY, toX, toY) {
  const d = distance(fromX, fromY, toX, toY);
  return Math.min(TAXI.maxFare, Math.round(TAXI.baseFare + d * TAXI.perPixel));
}

/** Pick a destination landmark that is not the one the passenger stands at. */
function pickDestination(city, random, fromName) {
  const names = city.landmarks.map((mark) => mark.name).filter((name) => name !== fromName);
  const name = pick(random, names);
  return landmarkByName(city, name);
}

/** Offer a new passenger at a kerbside point near a random landmark. */
function offerJob(state, random) {
  const point = randomSidewalkPoint(state.city, random);
  const near = state.city.landmarks[0];
  let best = near;
  let bestD = Infinity;
  for (const mark of state.city.landmarks) {
    const d = distance(point.x, point.y, mark.x, mark.y);
    if (d < bestD) {
      bestD = d;
      best = mark;
    }
  }
  const destination = pickDestination(state.city, random, best.name);
  state.taxi.passenger = { x: point.x, y: point.y, from: best.name };
  state.taxi.destination = { x: destination.x, y: destination.y, name: destination.name };
  state.taxi.fare = fareFor(point.x, point.y, destination.x, destination.y);
  state.taxi.waitLeft = TAXI.waitSeconds;
  state.taxi.status = 'waiting';
}

/** True when a passenger is waiting to be picked up. */
export function taxiWaiting(state) {
  return state.taxi.status === 'waiting';
}

/** True when a passenger is riding in Lena's car. */
export function taxiRiding(state) {
  return state.taxi.status === 'riding';
}

/** The current job's fare, or 0 when there is no job. */
export function taxiFare(state) {
  return state.taxi.status === 'none' ? 0 : state.taxi.fare;
}

/** Advance the taxi book one step: offer jobs, pick passengers up, drop them off. */
export function updateTaxi(state, dt) {
  const taxi = state.taxi;
  const player = state.player;
  if (taxi.status === 'none') {
    // Jobs only come while Lena is driving: a fare needs a car.
    if (player.onFoot) return;
    taxi.nextIn -= dt;
    if (taxi.nextIn <= 0) offerJob(state, state.random);
    return;
  }
  if (taxi.status === 'waiting') {
    taxi.waitLeft -= dt;
    if (taxi.waitLeft <= 0) {
      taxi.status = 'none';
      taxi.passenger = null;
      taxi.destination = null;
      taxi.nextIn = 8;
      return;
    }
    if (player.onFoot) return;
    const near = distance(player.x, player.y, taxi.passenger.x, taxi.passenger.y);
    if (near < TAXI.pickupRange) {
      taxi.status = 'riding';
      state.events |= EVENT_TAXI_PICKUP;
    }
    return;
  }
  // Riding: the fare is paid when the car reaches the destination.
  if (!state.playerCar || player.onFoot) {
    // The passenger leaves when Lena gets out mid-ride.
    taxi.status = 'none';
    taxi.passenger = null;
    taxi.destination = null;
    taxi.nextIn = 8;
    return;
  }
  const arrived = distance(player.x, player.y, taxi.destination.x, taxi.destination.y);
  if (arrived < TAXI.dropoffRange) {
    state.money += taxi.fare;
    state.score += Math.round(taxi.fare / 2);
    taxi.earned += taxi.fare;
    taxi.doneCount += 1;
    state.events |= EVENT_TAXI_DONE;
    taxi.status = 'none';
    taxi.passenger = null;
    taxi.destination = null;
    taxi.nextIn = 10;
  }
}
