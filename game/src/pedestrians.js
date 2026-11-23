// Vice Harbor v2.3 — the people of the city: walkers on the sidewalks,
// shoppers near the market, beachgoers on the sand. They stroll, pause,
// browse a landmark, chat with a neighbour, and run away from gunfire,
// sirens and speeding cars — the city feels alive because they do. Each
// one has a height, an outfit colour and sometimes a hat or a bag, so a
// crowd stops looking like coloured dots. v2.3 keeps the browse and the
// walk/wait/flee state machine, keeps the crowd sense (a walker hemmed
// in by other walkers slows down, the way a real crowd does), and adds
// the chat mood: two walkers who meet on a sidewalk stop and talk, face
// to face, for a while, so a corner can have a conversation on it.

import { CITY, PEDESTRIAN, WORLD } from './config.js';
import { clamp, distance, pick } from './util.js';
import { nearestLandmark, randomRoadPoint, randomSidewalkPoint } from './city.js';
import { range } from './random.js';

const NAMES = [
  'Mara', 'Theo', 'Lena', 'Ravi', 'Sofia', 'Dario', 'Ines', 'Kofi',
  'Nina', 'Omar', 'Petra', 'Yusuf', 'Aisha', 'Marco', 'Luz', 'Felix',
];

/** A fresh pedestrian at a sidewalk point: a name, an outfit, a mood. */
export function createPedestrian(city, random) {
  const point = randomSidewalkPoint(city, random);
  const onBeach = point.y > CITY.beachY - 40;
  return {
    x: point.x + range(random, -50, 50),
    y: point.y + range(random, -50, 50),
    angle: random() * Math.PI * 2,
    speed: range(random, PEDESTRIAN.speedMin, PEDESTRIAN.speedMax),
    colour: pick(random, PEDESTRIAN.colours),
    outfit: pick(random, PEDESTRIAN.outfits),
    name: pick(random, NAMES),
    height: range(random, 7, 11),
    hasHat: random() < 0.25,
    hasBag: random() < 0.3,
    beachgoer: onBeach,
    /** 'walk' | 'wait' | 'flee' | 'browse' | 'chat' — see updatePedestrian. */
    state: 'walk',
    waitTimer: range(random, 0, 4),
    fleeTimer: 0,
    browseTimer: 0,
    /** Seconds left in a chat, when the state is 'chat'. */
    chatTimer: 0,
    stepPhase: random() * Math.PI * 2,
    targetX: point.x,
    targetY: point.y,
  };
}

/** Pick a new strolling destination on a nearby sidewalk. */
export function retargetPedestrian(ped, city, random) {
  const point = randomRoadPoint(city, random);
  ped.targetX = point.x;
  ped.targetY = point.y;
  ped.state = 'walk';
}

/** A walker near a landmark may stop and look at it for a while. */
function maybeBrowse(ped, city, state) {
  if (ped.state !== 'walk') return;
  const mark = nearestLandmark(city, ped.x, ped.y);
  if (distance(ped.x, ped.y, mark.x, mark.y) > 130) return;
  if (state.random() > PEDESTRIAN.browseChance) return;
  ped.state = 'browse';
  ped.browseTimer = PEDESTRIAN.browseSeconds;
  ped.angle = Math.atan2(mark.y - ped.y, mark.x - ped.x);
}

/** Two walkers who meet on a sidewalk may stop and chat face to face. */
function maybeChat(ped, state) {
  if (ped.state !== 'walk' || ped.fleeTimer > 0) return;
  let partner = null;
  let bestD = 70;
  for (const other of state.peds) {
    if (other === ped || other.state !== 'walk' || other.fleeTimer > 0) continue;
    const d = distance(ped.x, ped.y, other.x, other.y);
    if (d < bestD) {
      bestD = d;
      partner = other;
    }
  }
  if (!partner) return;
  if (state.random() > 0.3) return;
  ped.state = 'chat';
  ped.chatTimer = range(state.random, 3, 7);
  partner.state = 'chat';
  partner.chatTimer = ped.chatTimer;
  ped.angle = Math.atan2(partner.y - ped.y, partner.x - ped.x);
  partner.angle = Math.atan2(ped.y - partner.y, ped.x - partner.x);
}

/** How crowded this walker is: the nearest other walker within the crowd
 *  radius slows them down, so a busy sidewalk feels like a crowd. */
function crowdFactor(ped, state) {
  for (const other of state.peds) {
    if (other === ped) continue;
    if (distance(ped.x, ped.y, other.x, other.y) < PEDESTRIAN.crowdRadius) {
      return PEDESTRIAN.crowdSlowdown;
    }
  }
  return 1;
}

/** Walk toward the target; returns true when the walker arrives. */
function walkToward(ped, state, dt) {
  const dx = ped.targetX - ped.x;
  const dy = ped.targetY - ped.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 12) return true;
  const base = ped.state === 'flee' ? ped.speed * 2.4 : ped.speed;
  const speed = base * (ped.state === 'flee' ? 1 : crowdFactor(ped, state));
  ped.angle = Math.atan2(dy, dx);
  ped.stepPhase += dt * (ped.state === 'flee' ? 12 : 7);
  ped.x = clamp(ped.x + (dx / d) * speed * dt, 10, WORLD.width - 10);
  ped.y = clamp(ped.y + (dy / d) * speed * dt, 10, WORLD.height - 10);
  return false;
}

/** Advance one pedestrian one step: flee first, then browse, chat, wait,
 *  and finally walk toward its target. */
export function updatePedestrian(ped, city, state, dt) {
  if (ped.fleeTimer > 0) {
    ped.fleeTimer -= dt;
    ped.state = 'flee';
  } else if (ped.browseTimer > 0) {
    ped.browseTimer -= dt;
    ped.state = 'browse';
    return;
  } else if (ped.chatTimer > 0) {
    ped.chatTimer -= dt;
    ped.state = 'chat';
    return;
  } else if (ped.waitTimer > 0) {
    ped.waitTimer -= dt;
    ped.state = 'wait';
    return;
  }
  ped.state = ped.fleeTimer > 0 ? 'flee' : 'walk';
  if (walkToward(ped, state, dt)) {
    maybeBrowse(ped, city, state);
    if (ped.state === 'walk') maybeChat(ped, state);
    if (ped.state === 'walk') {
      ped.waitTimer = range(state.random, 1, 5);
      retargetPedestrian(ped, city, state.random);
    }
  }
}

/** Make every pedestrian near (x, y) run away from it. */
export function scarePedestrians(state, x, y, radius) {
  for (const ped of state.peds) {
    if (distance(ped.x, ped.y, x, y) < radius) {
      ped.fleeTimer = 2.5;
      ped.browseTimer = 0;
      ped.chatTimer = 0;
      const away = Math.atan2(ped.y - y, ped.x - x);
      ped.targetX = ped.x + Math.cos(away) * 300;
      ped.targetY = ped.y + Math.sin(away) * 300;
    }
  }
}

/** How many pedestrians are currently fleeing, for the HUD's city mood. */
export function fleeingCount(state) {
  let count = 0;
  for (const ped of state.peds) if (ped.fleeTimer > 0) count += 1;
  return count;
}

/** How many pedestrians are currently browsing a landmark or shopfront. */
export function browsingCount(state) {
  let count = 0;
  for (const ped of state.peds) if (ped.state === 'browse') count += 1;
  return count;
}

/** How many pedestrians are currently chatting with a neighbour. */
export function chattingCount(state) {
  let count = 0;
  for (const ped of state.peds) if (ped.state === 'chat') count += 1;
  return count;
}
