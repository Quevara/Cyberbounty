// The people of Vice Harbor: walkers on the sidewalks, shoppers near the
// market, beachgoers on the sand. They stroll, pause, and run away from
// gunfire, sirens and speeding cars — the city feels alive because they do.

import { PEDESTRIAN, WORLD } from './config.js';
import { clamp, distance, pick } from './util.js';
import { randomRoadPoint } from './city.js';
import { range } from './random.js';

const NAMES = ['Mara', 'Theo', 'Lena', 'Ravi', 'Sofia', 'Dario', 'Ines', 'Kofi', 'Nina', 'Omar', 'Petra', 'Yusuf'];

export function createPedestrian(city, random) {
  const point = randomRoadPoint(city, random);
  return {
    x: point.x + range(random, -50, 50),
    y: point.y + range(random, -50, 50),
    angle: random() * Math.PI * 2,
    speed: range(random, PEDESTRIAN.speedMin, PEDESTRIAN.speedMax),
    colour: pick(random, PEDESTRIAN.colours),
    name: pick(random, NAMES),
    state: 'walk',
    waitTimer: range(random, 0, 4),
    fleeTimer: 0,
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

export function updatePedestrian(ped, city, state, dt) {
  if (ped.fleeTimer > 0) {
    ped.fleeTimer -= dt;
    ped.state = 'flee';
  } else if (ped.waitTimer > 0) {
    ped.waitTimer -= dt;
    ped.state = 'wait';
    return;
  }
  const dx = ped.targetX - ped.x;
  const dy = ped.targetY - ped.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 12) {
    ped.waitTimer = range(state.random, 1, 5);
    retargetPedestrian(ped, city, state.random);
    return;
  }
  const speed = ped.state === 'flee' ? ped.speed * 2.4 : ped.speed;
  ped.angle = Math.atan2(dy, dx);
  ped.x = clamp(ped.x + (dx / d) * speed * dt, 10, WORLD.width - 10);
  ped.y = clamp(ped.y + (dy / d) * speed * dt, 10, WORLD.height - 10);
}

/** Make every pedestrian near (x, y) run away from it. */
export function scarePedestrians(state, x, y, radius) {
  for (const ped of state.peds) {
    if (distance(ped.x, ped.y, x, y) < radius) {
      ped.fleeTimer = 2.5;
      const away = Math.atan2(ped.y - y, ped.x - x);
      ped.targetX = ped.x + Math.cos(away) * 300;
      ped.targetY = ped.y + Math.sin(away) * 300;
    }
  }
}
