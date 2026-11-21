// Vice Harbor's map: a road grid, the blocks between the roads, the buildings
// in them, and the named landmarks the missions point at. Everything is built
// from the seeded random function, so the same seed gives the same city.

import { CITY, DISTRICTS, WORLD } from './config.js';
import { pick } from './util.js';
import { range } from './random.js';

const ROAD_CENTRES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
const BUILDING_COLOURS = ['#7a6a8a', '#8a6f5c', '#5c7a8a', '#9a7a4a', '#6a5c7a', '#7a8a6a', '#a08a7a'];

const LANDMARKS = [
  { name: 'City Hall', x: 2200, y: 600, kind: 'hall' },
  { name: 'Harbor Market', x: 2600, y: 1400, kind: 'market' },
  { name: 'Sunset Pier', x: 1600, y: 2120, kind: 'pier' },
  { name: 'University Library', x: 1400, y: 200, kind: 'library' },
  { name: 'Dockside Warehouse', x: 600, y: 1400, kind: 'warehouse' },
  { name: 'Beachfront Hotel', x: 1800, y: 2000, kind: 'hotel' },
  { name: 'Police HQ', x: 2200, y: 1000, kind: 'police' },
  { name: 'St. Marina Hospital', x: 1000, y: 1000, kind: 'hospital' },
  { name: 'Neon Row', x: 2600, y: 600, kind: 'neon' },
  { name: 'Ferry Terminal', x: 3000, y: 1800, kind: 'ferry' },
];

export function createCity(random) {
  const buildings = [];
  const parks = [];
  // One block per gap between neighbouring roads, inset by the road and sidewalk.
  for (let ix = 0; ix < ROAD_CENTRES.length - 1; ix += 1) {
    for (let iy = 0; iy < ROAD_CENTRES.length - 1; iy += 1) {
      const bx = ROAD_CENTRES[ix] + CITY.roadWidth / 2 + CITY.sidewalk;
      const by = ROAD_CENTRES[iy] + CITY.roadWidth / 2 + CITY.sidewalk;
      const bw = ROAD_CENTRES[ix + 1] - ROAD_CENTRES[ix] - CITY.roadWidth - CITY.sidewalk * 2;
      const bh = ROAD_CENTRES[iy + 1] - ROAD_CENTRES[iy] - CITY.roadWidth - CITY.sidewalk * 2;
      if (by + bh > CITY.beachY) continue;
      if (random() < 0.18) {
        parks.push({ x: bx, y: by, w: bw, h: bh });
        continue;
      }
      const count = 1 + Math.floor(random() * 3);
      for (let b = 0; b < count; b += 1) {
        const w = range(random, 70, Math.max(80, bw / count - 12));
        const h = range(random, 60, Math.max(70, bh - 16));
        const x = bx + (count === 1 ? (bw - w) / 2 : b * (bw / count) + 6);
        const y = by + (bh - h) / 2 + range(random, -8, 8);
        buildings.push({
          x, y, w, h,
          colour: pick(random, BUILDING_COLOURS),
          roof: random() < 0.5,
          height: 6 + Math.floor(random() * 14),
        });
      }
    }
  }
  // Landmark buildings sit on top of the generic ones, with fixed spots.
  for (const mark of LANDMARKS) {
    buildings.push({ x: mark.x - 55, y: mark.y - 40, w: 110, h: 80, colour: '#8a5a6a', roof: true, height: 18, landmark: mark.name });
  }
  return {
    roadsV: ROAD_CENTRES.slice(),
    roadsH: ROAD_CENTRES.slice(),
    buildings,
    parks,
    landmarks: LANDMARKS,
    beach: { x: 0, y: CITY.beachY, w: WORLD.width, h: WORLD.height - CITY.beachY },
    harbour: { x: CITY.harbourX, y: 0, w: WORLD.width - CITY.harbourX, h: WORLD.height },
  };
}

/** True when the point is on a road, the beach, or the harbour promenade. */
export function isOnRoad(city, x, y) {
  const half = CITY.roadWidth / 2;
  for (const cx of city.roadsV) if (Math.abs(x - cx) <= half) return true;
  for (const cy of city.roadsH) if (Math.abs(y - cy) <= half) return true;
  if (y >= CITY.beachY) return true;
  return false;
}

/** The building whose rectangle contains the point, or null. */
export function buildingAt(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps; returns true if it hit one. */
export function resolveBuildingCollision(city, body, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nx;
    const dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius && d2 > 0.01) {
      const d = Math.sqrt(d2);
      body.x = nx + (dx / d) * radius;
      body.y = ny + (dy / d) * radius;
      hit = true;
    } else if (d2 <= 0.01) {
      body.y = b.y - radius;
      hit = true;
    }
  }
  return hit;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[2];
}

export function landmarkByName(city, name) {
  for (const mark of city.landmarks) if (mark.name === name) return mark;
  return city.landmarks[0];
}

/** The landmark nearest to (x, y), for the HUD's district hints. */
export function nearestLandmark(city, x, y) {
  let best = city.landmarks[0];
  let bestD = Infinity;
  for (const mark of city.landmarks) {
    const d = (mark.x - x) * (mark.x - x) + (mark.y - y) * (mark.y - y);
    if (d < bestD) {
      bestD = d;
      best = mark;
    }
  }
  return best;
}

/** A road centre point near (x, y): the nearest vertical or horizontal road. */
export function nearestRoadPoint(city, x, y) {
  let bestV = city.roadsV[0];
  for (const cx of city.roadsV) if (Math.abs(cx - x) < Math.abs(bestV - x)) bestV = cx;
  let bestH = city.roadsH[0];
  for (const cy of city.roadsH) if (Math.abs(cy - y) < Math.abs(bestH - y)) bestH = cy;
  if (Math.abs(bestV - x) < Math.abs(bestH - y)) return { x: bestV, y };
  return { x, y: bestH };
}

/** A random point on a road, for spawning traffic and pedestrians. */
export function randomRoadPoint(city, random) {
  if (random() < 0.5) {
    return { x: pick(random, city.roadsV), y: range(random, 80, WORLD.height - 80) };
  }
  return { x: range(random, 80, WORLD.width - 80), y: pick(random, city.roadsH) };
}
