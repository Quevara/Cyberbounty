// Vice Harbor v2.3 — the map, built one district at a time. The city is
// a road grid — eight vertical and eight horizontal roads, 400 px apart —
// and the blocks between them are filled district by district, so Old
// Town builds low and brick, Downtown builds tall, Marina builds pale
// and open, and the Beachfront builds low and sandy. A block is either a
// park (grass, trees, benches, flower beds) or a row of buildings with a
// walkable gap between neighbours, and every landmark sits on a fixed
// spot the missions point at, so the story never moves even when the
// blocks shuffle. Everything comes from the seeded random, so the same
// seed grows the same city. The shape the rest of the game reads is the
// same as ever: roads, buildings, parks, trees, benches, flower beds,
// lamps, crosswalks, landmarks, beach and harbour.

import { CITY, DISTRICTS, WORLD } from './config.js';
import { pick } from './util.js';
import { chance, gaussian, range, rangeInt } from './random.js';

/** The road centre lines, vertical and horizontal, across the whole map. */
const ROAD_CENTRES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];

/** Paint per district: which building colours and roof colours it draws from. */
const DISTRICT_PAINT = {
  'Old Town': { walls: ['#8a6f5c', '#9a7a4a', '#7a6a5c', '#a08a6a'], roofs: ['#52403f', '#3f4a52'] },
  'University': { walls: ['#5c7a8a', '#6a8a7a', '#7a8a6a'], roofs: ['#3f5245', '#4a3f52'] },
  'Downtown': { walls: ['#7a6a8a', '#5e6e9e', '#6b5b73', '#8a7a9e'], roofs: ['#4a3f52', '#3f4a52'] },
  'Marina': { walls: ['#5c7a8a', '#8a9a9a', '#a08a7a'], roofs: ['#3f5245', '#524a3f'] },
  'Dockside': { walls: ['#8a6f5c', '#6e6a62', '#9e6e6e'], roofs: ['#52403f', '#3f4a52'] },
  'Beachfront': { walls: ['#b08a5a', '#9a7a4a', '#c09a6a'], roofs: ['#524a3f', '#3f5245'] },
};

const ROOF_STYLES = ['flat', 'flat', 'pitched', 'tower', 'shopfront'];
const SHOP_SIGNS = ['CAFE', 'TACOS', 'SURF', 'PIZZA', 'BOOKS', 'FISH', 'GYM', 'BAR'];
const FLOWER_COLOURS = ['#ff5fa2', '#ffd34d', '#ff9f43', '#c56cf0'];

/** The named places the story points at: name, fixed spot, kind. */
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

/** The district a block's centre falls in, for its paint and its height. */
function districtFor(cx, cy) {
  for (const d of DISTRICTS) {
    if (cx >= d.x && cx < d.x + d.w && cy >= d.y && cy < d.y + d.h) return d;
  }
  return DISTRICTS[2];
}

/** One building: position, size, paint from its district, roof style, and
 *  the window grid the renderer lights at dusk. Landmarks are tall and red. */
function buildOne(random, x, y, w, h, district, landmark) {
  const paint = DISTRICT_PAINT[district.name] || DISTRICT_PAINT['Downtown'];
  const style = landmark ? 'landmark' : pick(random, ROOF_STYLES);
  const tall = district.name === 'Downtown' || style === 'tower';
  return {
    x, y, w, h,
    colour: landmark ? '#8a5a6a' : pick(random, paint.walls),
    roof: pick(random, paint.roofs),
    style,
    height: tall ? 16 + Math.floor(random() * 14) : 6 + Math.floor(random() * 10),
    windowCols: Math.max(2, Math.floor(w / 26)),
    windowRows: Math.max(2, Math.floor(h / 26)),
    litSeed: Math.floor(random() * 100000),
    landmark: landmark || null,
    /** A short shop sign for shopfronts, drawn as a band over the door. */
    sign: style === 'shopfront' ? pick(random, SHOP_SIGNS) : null,
  };
}

/** Fill one block with a park: grass, trees, benches, and maybe flowers. */
function fillPark(random, bx, by, bw, bh, out) {
  out.parks.push({ x: bx, y: by, w: bw, h: bh });
  const trees = 3 + Math.floor(random() * 4);
  for (let t = 0; t < trees; t += 1) {
    const beachSide = by + bh > CITY.beachY - 400;
    out.trees.push({
      x: bx + range(random, 24, bw - 24),
      y: by + range(random, 24, bh - 24),
      r: gaussian(random, 12, 3, 9, 15),
      /** Palms line the beachfront parks; round trees grow inland. */
      kind: beachSide && random() < 0.5 ? 'palm' : 'round',
    });
  }
  const benches = 1 + Math.floor(random() * 2);
  for (let b = 0; b < benches; b += 1) {
    out.benches.push({
      x: bx + range(random, 30, bw - 30),
      y: by + range(random, 30, bh - 30),
      angle: random() < 0.5 ? 0 : Math.PI / 2,
    });
  }
  if (chance(random, 0.45)) {
    out.flowers.push({
      x: bx + range(random, 40, bw - 40),
      y: by + range(random, 40, bh - 40),
      r: range(random, 16, 30),
      colour: pick(random, FLOWER_COLOURS),
      count: rangeInt(random, 6, 12),
    });
  }
}

/** Fill one block with a row of buildings, keeping a walkable gap between
 *  neighbours: the player is 28 px wide, and a narrower slot wedges them
 *  into a corner they cannot steer out of. */
function fillBuildings(random, bx, by, bw, bh, district, out) {
  const count = 1 + Math.floor(random() * 3);
  const slot = bw / count;
  for (let b = 0; b < count; b += 1) {
    const w = count === 1
      ? range(random, 70, Math.max(80, bw - 44))
      : range(random, 60, Math.max(64, slot - 44));
    const h = range(random, 60, Math.max(70, bh - 16));
    const x = count === 1 ? bx + (bw - w) / 2 : bx + b * slot + 22;
    const y = by + (bh - h) / 2 + range(random, -8, 8);
    out.buildings.push(buildOne(random, x, y, w, h, district, null));
  }
}

/** Street lamps along every road, on both sidewalks, for the dusk light. */
function buildLamps() {
  const lamps = [];
  const off = CITY.roadWidth / 2 + CITY.sidewalk + 6;
  for (const cx of ROAD_CENTRES) {
    for (let y = 120; y < WORLD.height - 80; y += CITY.lampSpacing) {
      lamps.push({ x: cx - off, y, side: -1 });
      lamps.push({ x: cx + off, y: y + CITY.lampSpacing / 2, side: 1 });
    }
  }
  for (const cy of ROAD_CENTRES) {
    for (let x = 120; x < WORLD.width - 80; x += CITY.lampSpacing) {
      lamps.push({ x, y: cy - off, side: -1 });
      lamps.push({ x: x + CITY.lampSpacing / 2, y: cy + off, side: 1 });
    }
  }
  return lamps;
}

/** Grow the whole city from the seeded random: blocks, then landmarks. */
export function createCity(random) {
  const out = { buildings: [], parks: [], trees: [], benches: [], flowers: [] };
  for (let ix = 0; ix < ROAD_CENTRES.length - 1; ix += 1) {
    for (let iy = 0; iy < ROAD_CENTRES.length - 1; iy += 1) {
      const bx = ROAD_CENTRES[ix] + CITY.roadWidth / 2 + CITY.sidewalk;
      const by = ROAD_CENTRES[iy] + CITY.roadWidth / 2 + CITY.sidewalk;
      const bw = ROAD_CENTRES[ix + 1] - ROAD_CENTRES[ix] - CITY.roadWidth - CITY.sidewalk * 2;
      const bh = ROAD_CENTRES[iy + 1] - ROAD_CENTRES[iy] - CITY.roadWidth - CITY.sidewalk * 2;
      if (by + bh > CITY.beachY) continue;
      const district = districtFor(bx + bw / 2, by + bh / 2);
      if (random() < CITY.parkChance) fillPark(random, bx, by, bw, bh, out);
      else fillBuildings(random, bx, by, bw, bh, district, out);
    }
  }
  // Landmark buildings sit on top of the generic ones, on fixed spots.
  for (const mark of LANDMARKS) {
    const district = districtFor(mark.x, mark.y);
    out.buildings.push(buildOne(random, mark.x - 55, mark.y - 40, 110, 80, district, mark.name));
  }
  const crosswalks = [];
  for (const cx of ROAD_CENTRES) {
    for (const cy of ROAD_CENTRES) crosswalks.push({ x: cx, y: cy });
  }
  return {
    roadsV: ROAD_CENTRES.slice(),
    roadsH: ROAD_CENTRES.slice(),
    buildings: out.buildings,
    parks: out.parks,
    trees: out.trees,
    benches: out.benches,
    flowers: out.flowers,
    lamps: buildLamps(),
    crosswalks,
    landmarks: LANDMARKS,
    beach: { x: 0, y: CITY.beachY, w: WORLD.width, h: WORLD.height - CITY.beachY },
    harbour: { x: CITY.harbourX, y: 0, w: WORLD.width - CITY.harbourX, h: WORLD.height },
  };
}

/** True when the point is on a road, the beach, or the harbour promenade. */
export function isOnRoad(city, x, y) {
  const half = CITY.roadWidth / 2;
  for (let i = 0; i < city.roadsV.length; i += 1) {
    if (Math.abs(x - city.roadsV[i]) <= half) return true;
  }
  for (let i = 0; i < city.roadsH.length; i += 1) {
    if (Math.abs(y - city.roadsH[i]) <= half) return true;
  }
  return y >= CITY.beachY;
}

/** The building whose rectangle contains the point, or null. */
export function buildingAt(city, x, y) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps; returns true on a hit.
 *  The sweep runs in passes: one building's push-out can shove the circle
 *  into its neighbour, and a single pass leaves it wedged in the corner
 *  between the two. Repeating the sweep settles it outside both. */
export function resolveBuildingCollision(city, body, radius) {
  let hit = false;
  for (let pass = 0; pass < 4; pass += 1) {
    let pushed = false;
    for (let i = 0; i < city.buildings.length; i += 1) {
      const b = city.buildings[i];
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
        pushed = true;
      } else if (d2 <= 0.01) {
        body.y = b.y - radius;
        hit = true;
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return hit;
}

/** The district the point (x, y) falls in; Downtown when it falls nowhere. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[2];
}

/** The landmark with this name, or the first one when it is missing. */
export function landmarkByName(city, name) {
  for (const mark of city.landmarks) {
    if (mark.name === name) return mark;
  }
  return city.landmarks[0];
}

/** The landmark nearest to (x, y), for the HUD's district hints. */
export function nearestLandmark(city, x, y) {
  let best = city.landmarks[0];
  let bestD = Infinity;
  for (const mark of city.landmarks) {
    const dx = mark.x - x;
    const dy = mark.y - y;
    const d = dx * dx + dy * dy;
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
  for (const cx of city.roadsV) {
    if (Math.abs(cx - x) < Math.abs(bestV - x)) bestV = cx;
  }
  let bestH = city.roadsH[0];
  for (const cy of city.roadsH) {
    if (Math.abs(cy - y) < Math.abs(bestH - y)) bestH = cy;
  }
  if (Math.abs(bestV - x) < Math.abs(bestH - y)) return { x: bestV, y };
  return { x, y: bestH };
}

/** The nearest road centre, plus whether it runs vertically. */
export function nearestRoadAxis(city, x, y) {
  const point = nearestRoadPoint(city, x, y);
  return { x: point.x, y: point.y, vertical: point.x !== x };
}

/** A random point on a road, for spawning traffic and pedestrians. */
export function randomRoadPoint(city, random) {
  if (random() < 0.5) {
    return { x: pick(random, city.roadsV), y: range(random, 80, WORLD.height - 80) };
  }
  return { x: range(random, 80, WORLD.width - 80), y: pick(random, city.roadsH) };
}

/** A random point on a sidewalk beside a road, for pedestrians. */
export function randomSidewalkPoint(city, random) {
  const point = randomRoadPoint(city, random);
  const side = random() < 0.5 ? -1 : 1;
  const half = CITY.roadWidth / 2 + CITY.sidewalk / 2;
  if (random() < 0.5) point.x += side * half;
  else point.y += side * half;
  return point;
}

export { rangeInt };
