// Vice Harbor v2.3 — drawing only: the world state and the current screen
// in, pixels out. The camera follows the player across the 3200 x 2400
// city, and the 1280 x 720 window is scaled to fit the browser. The city
// is painted rich — speckled grass, edged roads with crosswalks, buildings
// with lit windows and roof styles, shopfront awnings, palm trees, park
// benches, flower beds, street lamps, shimmering water, neon on Neon Row —
// and a warm dusk wash over everything, so Vice Harbor reads as one
// coherent sun-soaked place instead of flat blocks. Skid marks, dust and
// headlights sell the driving; the HUD sits on top, untouched by the world.
// v2.3 paints the world in layers — ground, roads, buildings, vehicles,
// people, effects, then the light — so each layer is one function, and
// the light layer is where the day and night clock lives: the sun fades,
// the lamps burn, the windows light up and the city goes dark blue after
// dusk. The new systems are drawn in their layers too: golden hubcaps
// glinting on the ground, the taxi passenger waving at the kerb, the
// garage door in cyan, and motorbikes and trucks with their own shapes.
// The v2.1 label rule still holds: a floating world label is measured,
// then clamped into the LABEL_SAFE zone — away from the screen edges and
// away from every corner panel — so "Harbor Market" can no longer sit half
// off the right edge and "St. Marina Hospital" can no longer hide behind
// the minimap. Police light bars flash on each car's own beat, and gloss
// cars get a bright roof highlight.

import { CITY, FONT, LABEL_SAFE, PALETTE, VIEW, WORLD } from './config.js';
import { drawHud } from './hud.js';
import { MISSIONS, currentMissionDef, currentStep, missionTarget } from './missions.js';
import { facingAngle } from './player.js';
import { clamp, hash2, hash2Seeded } from './util.js';
import { lampGlow, lightLevel } from './daynight.js';
import { rainIntensity } from './weather.js';
import { garagePosition } from './garage.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_OVER = 'over';
export const SCREEN_STORY = 'story';

const PANEL = { width: 640, top: 150, line: 30, bottom: 70 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const fonts = new Map();
  /** Landmark labels already placed at a clamped top line this frame,
   *  keyed by their x bucket, so two names on the same line stagger. */
  let labelRows = new Map();

  function text(value, x, y, size, color, align, baseline) {
    const key = `${size}|${baseline || 'keep'}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    // Callers that pass a baseline get it; the HUD sets 'top' itself first.
    if (baseline) context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The visible world rectangle, padded by 100 px so objects at the edge
   *  are drawn whole instead of popping in half-drawn. */
  function viewBounds(state) {
    const cam = state.camera;
    return {
      x0: Math.max(0, cam.x - 100),
      y0: Math.max(0, cam.y - 100),
      x1: Math.min(WORLD.width, cam.x + VIEW.width + 100),
      y1: Math.min(WORLD.height, cam.y + VIEW.height + 100),
    };
  }

  function drawGrass(x0, y0, x1, y1) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Deterministic speckles, two per 64 px tile, so the grass has grain.
    const tile = 64;
    for (let tx = Math.floor(x0 / tile); tx * tile < x1; tx += 1) {
      for (let ty = Math.floor(y0 / tile); ty * tile < y1; ty += 1) {
        const h = hash2(tx, ty);
        if (h < 0.5) continue;
        context.fillStyle = h < 0.75 ? PALETTE.grassLight : PALETTE.grassDark;
        const px = tx * tile + 8 + hash2(tx, ty + 31) * (tile - 16);
        const py = ty * tile + 8 + hash2(tx + 17, ty) * (tile - 16);
        context.fillRect(px, py, 5, 3);
      }
    }
  }

  function drawWaterAndSand(x0, y0, x1, y1, elapsed) {
    // Sea on the east, sand on the south.
    context.fillStyle = PALETTE.water;
    context.fillRect(Math.max(x0, CITY.harbourX), y0, x1 - Math.max(x0, CITY.harbourX), y1 - y0);
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(Math.max(x0, CITY.harbourX + 60), y0, x1 - Math.max(x0, CITY.harbourX + 60), y1 - y0);
    // Shimmer lines that drift with time.
    context.strokeStyle = PALETTE.waterShine;
    context.lineWidth = 2;
    context.globalAlpha = 0.5;
    for (let row = 0; row < 6; row += 1) {
      const wy = y0 + row * 130 + ((elapsed * 12) % 130);
      if (wy > y1) continue;
      const wx = Math.max(x0, CITY.harbourX + 10);
      context.beginPath();
      context.moveTo(wx, wy);
      context.lineTo(Math.min(x1, wx + 90), wy);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = PALETTE.sand;
    context.fillRect(x0, Math.max(y0, CITY.beachY), x1 - x0, y1 - Math.max(y0, CITY.beachY));
    // Wave edge where the sand meets the grass.
    context.strokeStyle = PALETTE.sandDark;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x0, CITY.beachY + 6 + Math.sin(elapsed * 1.2) * 2);
    context.lineTo(x1, CITY.beachY + 6 + Math.sin(elapsed * 1.2) * 2);
    context.stroke();
  }

  /** One tree: a round canopy, or a palm with a trunk and fronds. */
  function drawTree(tree) {
    if (tree.kind === 'palm') {
      context.strokeStyle = PALETTE.palmTrunk;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(tree.x, tree.y + tree.r);
      context.lineTo(tree.x + 3, tree.y - tree.r);
      context.stroke();
      context.fillStyle = PALETTE.palmLeaf;
      for (let f = 0; f < 5; f += 1) {
        const a = (f / 5) * Math.PI * 2 - Math.PI / 2;
        context.beginPath();
        context.ellipse(tree.x + 3 + Math.cos(a) * tree.r * 0.7, tree.y - tree.r + Math.sin(a) * tree.r * 0.5, tree.r * 0.7, 4, a, 0, Math.PI * 2);
        context.fill();
      }
      return;
    }
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.arc(tree.x + 5, tree.y + 6, tree.r, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.parkTree;
    context.beginPath();
    context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.grassLight;
    context.beginPath();
    context.arc(tree.x - 3, tree.y - 3, tree.r * 0.55, 0, Math.PI * 2);
    context.fill();
  }

  /** One flower bed: a soft patch of earth with coloured dots. */
  function drawFlowers(bed) {
    context.fillStyle = 'rgba(90, 60, 40, 0.6)';
    context.beginPath();
    context.ellipse(bed.x, bed.y, bed.r, bed.r * 0.7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = bed.colour;
    for (let i = 0; i < bed.count; i += 1) {
      const a = (i / bed.count) * Math.PI * 2;
      const rr = bed.r * (0.3 + hash2Seeded(bed.x | 0, i, 7) * 0.6);
      context.beginPath();
      context.arc(bed.x + Math.cos(a) * rr, bed.y + Math.sin(a) * rr * 0.7, 2.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  /** One street lamp: a post and a warm glow dot, brighter after dark. */
  function drawLamp(lamp, glow) {
    context.fillStyle = PALETTE.lampPost;
    context.fillRect(lamp.x - 1.5, lamp.y - 8, 3, 16);
    context.fillStyle = PALETTE.lampGlow;
    context.beginPath();
    context.arc(lamp.x, lamp.y - 10, 3.5, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.12 + glow * 0.35;
    context.beginPath();
    context.arc(lamp.x, lamp.y - 10, 12 + glow * 22, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  /** LAYER 1 — the ground: grass, water, sand, parks, trees, flower beds
   *  and benches. Nothing here moves; it is the floor the city stands on. */
  function drawGroundLayer(state, bounds) {
    const { x0, y0, x1, y1 } = bounds;
    drawGrass(x0, y0, x1, y1);
    drawWaterAndSand(x0, y0, x1, y1, state.elapsed);
    context.fillStyle = PALETTE.park;
    for (const park of state.city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    for (const tree of state.city.trees) {
      if (tree.x < x0 || tree.x > x1 || tree.y < y0 || tree.y > y1) continue;
      drawTree(tree);
    }
    for (const bed of state.city.flowers) {
      if (bed.x < x0 || bed.x > x1 || bed.y < y0 || bed.y > y1) continue;
      drawFlowers(bed);
    }
    context.fillStyle = '#6a4a2e';
    for (const bench of state.city.benches) {
      if (bench.x < x0 || bench.x > x1 || bench.y < y0 || bench.y > y1) continue;
      context.save();
      context.translate(bench.x, bench.y);
      context.rotate(bench.angle);
      context.fillRect(-12, -3, 24, 6);
      context.restore();
    }
  }

  /** LAYER 2 — the roads: asphalt, edge lines, sidewalks, centre dashes
   *  and the crosswalk stripes at every intersection. */
  function drawRoadLayer(state, bounds) {
    const { x0, y0, x1, y1 } = bounds;
    const half = CITY.roadWidth / 2;
    // Asphalt with a darker centre, then pale edge lines.
    context.fillStyle = PALETTE.asphalt;
    for (const cx of state.city.roadsV) context.fillRect(cx - half, y0, CITY.roadWidth, y1 - y0);
    for (const cy of state.city.roadsH) context.fillRect(x0, cy - half, x1 - x0, CITY.roadWidth);
    context.fillStyle = PALETTE.asphaltDark;
    for (const cx of state.city.roadsV) context.fillRect(cx - 14, y0, 28, y1 - y0);
    for (const cy of state.city.roadsH) context.fillRect(x0, cy - 14, x1 - x0, 28);
    context.fillStyle = PALETTE.roadEdge;
    for (const cx of state.city.roadsV) {
      context.fillRect(cx - half - 1, y0, 2, y1 - y0);
      context.fillRect(cx + half - 1, y0, 2, y1 - y0);
    }
    for (const cy of state.city.roadsH) {
      context.fillRect(x0, cy - half - 1, x1 - x0, 2);
      context.fillRect(x0, cy + half - 1, x1 - x0, 2);
    }
    // Sidewalks.
    context.fillStyle = PALETTE.sidewalk;
    for (const cx of state.city.roadsV) {
      context.fillRect(cx - half - CITY.sidewalk, y0, CITY.sidewalk, y1 - y0);
      context.fillRect(cx + half, y0, CITY.sidewalk, y1 - y0);
    }
    for (const cy of state.city.roadsH) {
      context.fillRect(x0, cy - half - CITY.sidewalk, x1 - x0, CITY.sidewalk);
      context.fillRect(x0, cy + half, x1 - x0, CITY.sidewalk);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const cx of state.city.roadsV) {
      for (let y = Math.floor(y0 / 48) * 48; y < y1; y += 48) context.fillRect(cx - 2, y, 4, 22);
    }
    for (const cy of state.city.roadsH) {
      for (let x = Math.floor(x0 / 48) * 48; x < x1; x += 48) context.fillRect(x, cy - 2, 22, 4);
    }
    // Crosswalk stripes at every intersection.
    context.fillStyle = PALETTE.crosswalk;
    for (const cross of state.city.crosswalks) {
      if (cross.x < x0 - 60 || cross.x > x1 + 60 || cross.y < y0 - 60 || cross.y > y1 + 60) continue;
      for (let s = -3; s <= 3; s += 1) {
        context.fillRect(cross.x + s * 12 - 3, cross.y - half + 6, 6, 14);
        context.fillRect(cross.x + s * 12 - 3, cross.y + half - 20, 6, 14);
      }
    }
  }

  /** The roof for a building, by style: pitched, tower, or flat. */
  function drawRoof(b) {
    if (b.style === 'pitched') {
      context.fillStyle = b.roof;
      context.beginPath();
      context.moveTo(b.x, b.y + b.h / 2);
      context.lineTo(b.x + b.w / 2, b.y + 8);
      context.lineTo(b.x + b.w, b.y + b.h / 2);
      context.closePath();
      context.fill();
      context.fillStyle = b.colour;
      context.fillRect(b.x + 6, b.y + b.h / 2, b.w - 12, b.h / 2 - 6);
    } else if (b.style === 'tower') {
      context.fillStyle = b.roof;
      context.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // An antenna on the tallest buildings, with a blinking tip.
      context.strokeStyle = PALETTE.roofLight;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(b.x + b.w / 2, b.y + 6);
      context.lineTo(b.x + b.w / 2, b.y - 12);
      context.stroke();
      context.fillStyle = '#ff5a4e';
      context.beginPath();
      context.arc(b.x + b.w / 2, b.y - 13, 2.5, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = b.roof;
      context.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      context.strokeStyle = PALETTE.roofLight;
      context.lineWidth = 1;
      context.strokeRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    }
  }

  /** A striped awning and a sign band over a shopfront's door. */
  function drawShopfront(b) {
    const stripeW = 10;
    for (let s = 0; s * stripeW < b.w - 12; s += 1) {
      context.fillStyle = s % 2 === 0 ? PALETTE.awning : PALETTE.awningAlt;
      context.fillRect(b.x + 6 + s * stripeW, b.y + b.h - 16, Math.min(stripeW, b.w - 12 - s * stripeW), 10);
    }
    if (b.sign) {
      context.fillStyle = PALETTE.panel;
      context.fillRect(b.x + b.w / 2 - 22, b.y + b.h - 34, 44, 14);
      context.fillStyle = PALETTE.gold;
      context.font = `bold 10px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(b.sign, b.x + b.w / 2, b.y + b.h - 27);
    }
  }

  /** Lit windows in a grid; which ones are lit is fixed per building, and
   *  more of them light up after dark, so the city glows at night. */
  function drawWindows(b, night) {
    const cellW = b.w / b.windowCols;
    const cellH = b.h / b.windowRows;
    const threshold = night ? 0.25 : 0.55;
    for (let c = 0; c < b.windowCols; c += 1) {
      for (let r = 0; r < b.windowRows; r += 1) {
        const lit = hash2Seeded(b.litSeed, c, r) > threshold;
        context.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDark;
        context.fillRect(b.x + c * cellW + 5, b.y + r * cellH + 5, Math.min(10, cellW - 10), Math.min(8, cellH - 10));
      }
    }
  }

  function drawBuilding(b, cam, night, index, isTarget) {
    // A long sunset shadow to the east, then the body and the roof.
    context.fillStyle = 'rgba(0, 0, 0, 0.25)';
    context.fillRect(b.x + b.height, b.y + b.height, b.w, b.h);
    context.fillStyle = b.colour;
    context.fillRect(b.x, b.y, b.w, b.h);
    drawRoof(b);
    drawWindows(b, night);
    if (b.style === 'shopfront') drawShopfront(b);
    if (b.landmark) {
      const neon = b.landmark === 'Neon Row';
      // The mission-target label already names this place (with its own
      // panel), so the building does not repeat the name next to it —
      // that drew "City Hall" twice in the cover frame.
      if (!isTarget) {
        context.fillStyle = neon ? PALETTE.neonPink : PALETTE.gold;
        context.font = `bold 13px ${FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
      // Clamp the name into the visible frame, so a landmark at the edge
      // of the screen never has its name cut by the edge ("St. Marina
      // Hospital") or hidden behind the bottom HUD band ("Police HQ") —
      // and keep it below the district name and the clock at the top.
      // When the clamp pushes two names onto the same line (City Hall
      // over Police HQ), stagger them down one line each so both read.
      const lx0 = clamp(b.x + b.w / 2, cam.x + 90, cam.x + VIEW.width - 90);
      const rawLy = b.y + b.h / 2;
      const topLy = cam.y + 78;
      let ly = clamp(rawLy, topLy, cam.y + VIEW.height - 210);
      if (ly === topLy && rawLy < topLy) {
        const key = Math.round(lx0 / 50);
        const placed = labelRows.get(key) || 0;
        labelRows.set(key, placed + 1);
        ly += placed * 22;
      }
      // A clamped name near the top-right would end up under the minimap
      // ("City Hall" in the cover): keep it left of the minimap's edge.
      // The label is centre-aligned, so the cap is the edge minus a
      // rough half-width of the text.
      const halfW = b.landmark.length * 4 + 10;
      const lx = ly - cam.y < LABEL_SAFE.minimapBottomY
        ? Math.min(lx0, cam.x + LABEL_SAFE.minimapLeftX - halfW)
        : lx0;
      context.fillText(b.landmark, lx, ly);
      }
      if (neon) {
        context.strokeStyle = PALETTE.neonCyan;
        context.lineWidth = 2;
        context.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      }
    }
  }

  /** LAYER 3 — the buildings, the lamps and the pier: the vertical city,
   *  with the lamp glow turned up after dark. */
  function drawBuildingLayer(state, bounds, glow) {
    const { x0, y0, x1, y1 } = bounds;
    const night = glow > 0.5;
    for (const lamp of state.city.lamps) {
      if (lamp.x < x0 || lamp.x > x1 || lamp.y < y0 || lamp.y > y1) continue;
      drawLamp(lamp, glow);
    }
    // The current mission target, computed once: a building that IS the
    // target skips its own name label (the target label already shows it).
    const target = missionTarget(state);
    for (let i = 0; i < state.city.buildings.length; i += 1) {
      const b = state.city.buildings[i];
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      const isTarget = !!target && b.landmark === target.label
        && Math.abs(b.x + b.w / 2 - target.x) < 200
        && Math.abs(b.y + b.h / 2 - target.y) < 200;
      drawBuilding(b, state.camera, night, i, isTarget);
    }
    // Sunset Pier jutting into the sea.
    context.fillStyle = PALETTE.pier;
    context.fillRect(1560, CITY.beachY, 80, 180);
    context.fillStyle = '#8a6a4a';
    context.fillRect(1560, CITY.beachY, 80, 10);
    context.fillStyle = PALETTE.neonOrange;
    for (let lamp = 0; lamp < 4; lamp += 1) {
      context.fillRect(1564, CITY.beachY + 30 + lamp * 40, 6, 6);
      context.fillRect(1628, CITY.beachY + 30 + lamp * 40, 6, 6);
    }
  }

  /** A motorbike: a slim body, two wheels in line, and a rider leaning in. */
  function drawBikeShape(car) {
    context.fillStyle = car.colour;
    context.fillRect(-30, -8, 60, 16);
    context.fillStyle = '#20242c';
    context.fillRect(-6, -7, 14, 14);
    context.fillStyle = '#14161a';
    context.beginPath();
    context.arc(-26, 0, 9, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(26, 0, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffe9a8';
    context.fillRect(28, -4, 4, 8);
  }

  /** A truck: a long box body with a cab up front and a flat bed behind. */
  function drawTruckShape(car) {
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-50, -24, 104, 52);
    context.fillStyle = car.colour;
    context.fillRect(-52, -26, 104, 52);
    context.fillStyle = '#20242c';
    context.fillRect(28, -22, 20, 44);
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(30, -22, 6, 44);
    context.fillStyle = '#14161a';
    context.fillRect(-40, -30, 16, 7);
    context.fillRect(30, -30, 16, 7);
    context.fillRect(-40, 23, 16, 7);
    context.fillRect(30, 23, 16, 7);
    context.fillStyle = '#ffe9a8';
    context.fillRect(48, -21, 5, 8);
    context.fillRect(48, 13, 5, 8);
    context.fillStyle = '#ff3b30';
    context.fillRect(-53, -21, 5, 8);
    context.fillRect(-53, 13, 5, 8);
  }

  /** The body of a car, by style: van, pickup, coupe, or sedan. */
  function drawCarBody(car) {
    // Shadow, then the body in the car's paint.
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-40, -20, 84, 46);
    context.fillStyle = car.colour;
    if (car.style === 'van') context.fillRect(-46, -24, 92, 48);
    else if (car.style === 'pickup') context.fillRect(-46, -22, 92, 44);
    else context.fillRect(-42, -23, 84, 46);
    // A gloss finish gets a bright roof highlight; matte paint stays flat.
    if (car.finish === 'gloss') {
      context.fillStyle = 'rgba(255,255,255,0.22)';
      if (car.style === 'van') context.fillRect(-38, -19, 76, 10);
      else if (car.style === 'pickup') context.fillRect(2, -18, 22, 10);
      else context.fillRect(-10, -19, 26, 10);
    }
    // Wheels.
    context.fillStyle = '#14161a';
    context.fillRect(-30, -26, 14, 6);
    context.fillRect(16, -26, 14, 6);
    context.fillRect(-30, 20, 14, 6);
    context.fillRect(16, 20, 14, 6);
    // Windshield, roof and rear window, by body style.
    context.fillStyle = '#20242c';
    if (car.style === 'van') context.fillRect(-38, -19, 76, 38);
    else if (car.style === 'pickup') context.fillRect(2, -18, 22, 36);
    else context.fillRect(-10, -19, 26, 38);
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(-8, -19, 6, 38);
    // Headlights and taillights; braking lights burn brighter.
    context.fillStyle = '#ffe9a8';
    context.fillRect(38, -19, 5, 8);
    context.fillRect(38, 11, 5, 8);
    context.fillStyle = car.braking ? '#ff2d20' : '#ff3b30';
    const tailW = car.braking ? 8 : 5;
    context.fillRect(-43, -19, tailW, 8);
    context.fillRect(-43, 11, tailW, 8);
  }

  function drawCarShape(car, isPlayerCar, elapsed) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    if (car.wrecked) {
      context.fillStyle = '#1c1c22';
      context.fillRect(-42, -23, 84, 46);
      context.fillStyle = '#4a4a52';
      context.fillRect(-30, -14, 60, 28);
      context.restore();
      return;
    }
    if (car.kind === 'bike') drawBikeShape(car);
    else if (car.kind === 'truck') drawTruckShape(car);
    else drawCarBody(car);
    if (isPlayerCar) {
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 3;
      context.strokeRect(-46, -27, 92, 54);
    }
    if (car.driver === 'police') {
      // Each car's light bar flashes on its own beat, from its light phase.
      const phase = (car.lightPhase || 0) + elapsed * 2.8;
      const blink = Math.floor(phase) % 2 === 0;
      context.fillStyle = blink ? '#ff3b30' : '#3b82ff';
      context.fillRect(-6, -26, 12, 6);
      context.fillStyle = blink ? '#3b82ff' : '#ff3b30';
      context.fillRect(-6, 20, 12, 6);
      context.fillStyle = '#f5f1e6';
      context.font = `bold 9px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('VHPD', 0, 0);
    }
    context.restore();
  }

  /** LAYER 4 — the vehicles: traffic, police, and the player's car, each
   *  in its own shape, plus the taxi passenger waving at the kerb and the
   *  garage door in cyan. */
  function drawVehicleLayer(state) {
    for (const car of state.cars) drawCarShape(car, state.playerCar === car, state.elapsed);
    for (const car of state.police.cars) drawCarShape(car, false, state.elapsed);
    // The taxi passenger, waving at the kerb while they wait.
    if (state.taxi && state.taxi.status === 'waiting' && state.taxi.passenger) {
      const p = state.taxi.passenger;
      const wave = Math.sin(state.elapsed * 6) * 4;
      context.fillStyle = PALETTE.taxiGold;
      context.beginPath();
      context.arc(p.x, p.y, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2c3e50';
      context.fillRect(p.x - 3, p.y - 22 + wave, 6, 14);
      context.fillStyle = PALETTE.taxiGold;
      context.font = `bold 11px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText('TAXI?', p.x, p.y - 26);
    }
    // The garage door at the Dockside Warehouse, marked in cyan.
    if (state.garage) {
      const door = garagePosition(state);
      context.strokeStyle = PALETTE.neonCyan;
      context.lineWidth = 3;
      context.strokeRect(door.x - 70, door.y - 52, 140, 104);
      context.fillStyle = PALETTE.neonCyan;
      context.font = `bold 12px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText("OTTO'S GARAGE", door.x, door.y - 56);
    }
  }

  function drawPerson(x, y, angle, colour, radius, label, person) {
    const bob = person && person.moving ? Math.sin(person.stepPhase || 0) * 1.5 : 0;
    context.save();
    context.translate(x, y + bob);
    context.rotate(angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(3, 4, radius, radius * 0.8, 0, 0, Math.PI * 2);
    context.fill();
    // Body in the outfit colour, head in skin tone.
    context.fillStyle = person && person.outfit ? person.outfit : colour;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c9a0';
    context.beginPath();
    context.arc(radius + 2, 0, radius * 0.55, 0, Math.PI * 2);
    context.fill();
    if (person && person.hasHat) {
      context.fillStyle = '#2c3e50';
      context.beginPath();
      context.arc(radius + 2, -radius * 0.3, radius * 0.6, 0, Math.PI * 2);
      context.fill();
    }
    if (person && person.hasBag) {
      context.fillStyle = '#8e44ad';
      context.fillRect(-radius - 6, -radius * 0.5, 5, 8);
    }
    context.restore();
    if (label) {
      context.fillStyle = PALETTE.text;
      context.font = `12px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText(label, x, y - radius - 4);
    }
  }

  /** LAYER 5 — the people: pedestrians, officers, and Lena herself. */
  function drawPeopleLayer(state) {
    for (const ped of state.peds) {
      const size = ped.height || 9;
      drawPerson(ped.x, ped.y, ped.angle, ped.colour, size, null, { ...ped, moving: ped.state === 'walk' || ped.state === 'flee' });
    }
    for (const officer of state.police.officers) drawPerson(officer.x, officer.y, officer.angle, '#1f3a6e', 10, null, officer);
    // The player, on foot or driving.
    const player = state.player;
    if (player.onFoot) {
      const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0;
      if (!blink) drawPerson(player.x, player.y, facingAngle(player), PALETTE.player, 14, 'LENA', player);
    }
  }

  /** A world-space label clamped into the LABEL_SAFE zone, so it is never
   *  cut by a screen edge and never hides behind a HUD panel. The clamp
   *  runs in SCREEN coordinates (this function draws under the camera
   *  transform, so it converts to screen space, clamps, and converts back):
   *  the label stays inside the margins, out of the minimap and money
   *  column at the top right, out of the objective panel at the bottom
   *  left, and out of the speed readout at the bottom right. A soft panel
   *  sits behind the text so it reads over any background. */
  function drawClampedWorldLabel(state, worldX, worldY, label) {
    const cam = state.camera;
    const size = 16;
    context.font = `${size}px ${FONT}`;
    const halfW = context.measureText(label).width / 2 + 12;
    let sx = worldX - cam.x;
    let sy = worldY - cam.y;
    // Inside the screen margins, on every side.
    sx = clamp(sx, LABEL_SAFE.marginX + halfW, VIEW.width - LABEL_SAFE.marginX - halfW);
    sy = clamp(sy, LABEL_SAFE.marginTop, VIEW.height - LABEL_SAFE.marginBottom);
    // Out of the minimap and money column: high labels stay left of them.
    if (sy < LABEL_SAFE.minimapBottomY) sx = Math.min(sx, LABEL_SAFE.minimapLeftX - halfW);
    // Out of the bottom-left objective panel: low labels stay right of it.
    if (sy > LABEL_SAFE.panelTopY) sx = Math.max(sx, LABEL_SAFE.panelRightX + halfW);
    // Out of the bottom-right speed readout: low labels stay left of it.
    if (sy > LABEL_SAFE.speedTopY) sx = Math.min(sx, LABEL_SAFE.speedLeftX - halfW);
    // The panel keep-outs can push the label back out of the margins;
    // clamp once more so the edges still win over the panels.
    sx = clamp(sx, LABEL_SAFE.marginX + halfW, VIEW.width - LABEL_SAFE.marginX - halfW);
    const wx = sx + cam.x;
    const wy = sy + cam.y;
    context.fillStyle = PALETTE.labelBack;
    context.fillRect(wx - halfW, wy - 2, halfW * 2, size + 8);
    text(label, wx, wy, size, PALETTE.gold, 'center', 'alphabetic');
  }

  /** LAYER 6 — the ground effects: skid marks, the mission target, cash
   *  pickups and hidden hubcaps. These sit on the road, under the cars. */
  function drawEffectsLayer(state) {
    // Skid marks left by hard driving, fading with time.
    for (const skid of state.skids) {
      context.save();
      context.globalAlpha = Math.max(0, skid.life / skid.maxLife) * 0.55;
      context.translate(skid.x, skid.y);
      context.rotate(skid.angle);
      context.fillStyle = '#1c1c1c';
      context.fillRect(-8, -2, 16, 4);
      context.restore();
    }
    context.globalAlpha = 1;
    // Mission target marker: a gold ring and a beam of light, with its
    // label clamped into the frame.
    const target = missionTarget(state);
    if (target && state.missions.active) {
      const pulse = 1 + Math.sin(state.elapsed * 4) * 0.15;
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(target.x, target.y, 44 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = 'rgba(242, 201, 76, 0.12)';
      context.fillRect(target.x - 6, target.y - 260, 12, 260);
      drawClampedWorldLabel(state, target.x, target.y - 56, target.label);
    }
    // Cash pickups as gold coins.
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(pickup.x, pickup.y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#8a6d1f';
      context.font = `bold 11px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('$', pickup.x, pickup.y);
    }
    // Hidden hubcaps as small gold glints, spinning slowly.
    if (state.collectibles) {
      for (const item of state.collectibles.items) {
        if (item.taken) continue;
        const glint = 0.6 + Math.sin(state.elapsed * 3 + item.spin) * 0.4;
        context.globalAlpha = glint;
        context.fillStyle = PALETTE.hubcap;
        context.beginPath();
        context.arc(item.x, item.y, 7, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#8a6d1f';
        context.beginPath();
        context.arc(item.x, item.y, 3, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }
  }

  /** LAYER 6b — the flying effects: bullets and particles, drawn over
   *  the cars and people so a shot always reads across the street. */
  function drawProjectilesLayer(state) {
    // Bullets as bright streaks, with a tail that shortens as they fly.
    context.strokeStyle = '#ffe08a';
    context.lineWidth = 3;
    for (const b of state.bullets) {
      const tail = b.tracer || 26;
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      context.beginPath();
      context.moveTo(b.x - (b.vx / speed) * tail, b.y - (b.vy / speed) * tail);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    // Particles: sparks, smoke and dust.
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.colour;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  /** The world through the camera, one layer at a time. */
  function drawWorld(state) {
    const bounds = viewBounds(state);
    const glow = state.daynight ? lampGlow(state.daynight) : 0;
    labelRows = new Map();
    drawGroundLayer(state, bounds);
    drawRoadLayer(state, bounds);
    drawBuildingLayer(state, bounds, glow);
    drawEffectsLayer(state);
    drawVehicleLayer(state);
    drawPeopleLayer(state);
    drawProjectilesLayer(state);
  }

  /** LAYER 7 — the light, in screen space: a warm dusk wash and a
   *  vignette, then the night darkening from the day and night clock, so
   *  the world dims as the sun goes down and the lamps take over — and
   *  the rain, falling diagonally across the frame when a shower passes. */
  function drawLight(state) {
    const gradient = context.createRadialGradient(
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.35,
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95,
    );
    gradient.addColorStop(0, 'rgba(255, 140, 66, 0.04)');
    gradient.addColorStop(1, PALETTE.vignette);
    context.fillStyle = gradient;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    if (state.daynight) {
      const light = lightLevel(state.daynight);
      const dark = (1 - light) * 0.55;
      if (dark > 0.01) {
        context.fillStyle = PALETTE.night;
        context.globalAlpha = dark;
        context.fillRect(0, 0, VIEW.width, VIEW.height);
        context.globalAlpha = 1;
      }
    }
    if (state.weather) {
      const rain = rainIntensity(state.weather);
      if (rain > 0.05) {
        // A wet sheen over the world, then the streaks: each one falls
        // from a hashed position, so the rain never needs stored drops.
        context.fillStyle = 'rgba(120, 140, 170, 0.08)';
        context.globalAlpha = rain;
        context.fillRect(0, 0, VIEW.width, VIEW.height);
        context.globalAlpha = 1;
        const drops = Math.floor(90 * rain);
        const fall = (state.elapsed * 900) % 720;
        context.strokeStyle = 'rgba(200, 220, 240, 0.45)';
        context.lineWidth = 1.5;
        for (let i = 0; i < drops; i += 1) {
          const sx = hash2(i, 7) * (VIEW.width + 120) - 60;
          const sy = (hash2(i, 13) * 720 + fall) % 720;
          context.beginPath();
          context.moveTo(sx, sy);
          context.lineTo(sx - 8, sy + 22);
          context.stroke();
        }
      }
    }
  }

  /** A red edge glow that grows with the wanted level, so a hot chase
   *  reads in the frame before the player looks at the stars. */
  function drawHeatGlow(state) {
    const wanted = state.police.wanted;
    if (wanted === 0) return;
    const strength = 0.04 + (wanted / 5) * 0.08;
    const gradient = context.createRadialGradient(
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42,
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.98,
    );
    gradient.addColorStop(0, 'rgba(229, 83, 75, 0)');
    gradient.addColorStop(1, `rgba(229, 83, 75, ${strength})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    text(title, VIEW.width / 2, y + 78, 46, PALETTE.text, 'center', 'alphabetic');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center', 'alphabetic');
    }
    text(prompt, VIEW.width / 2, y + height - 38, 22, PALETTE.gold, 'center', 'alphabetic');
  }

  function drawMissionList(state) {
    const lines = MISSIONS.map((m, i) => {
      const mark = i < state.missions.doneCount ? '✓ ' : i === state.missions.index ? '► ' : '· ';
      return `${mark}${m.title} — $${m.pay}`;
    });
    const def = currentMissionDef(state);
    const step = currentStep(state);
    const progress = def && step
      ? `${def.title}: step ${state.missions.stepIndex + 1} of ${def.steps.length}`
      : 'Story complete';
    drawPanel('Missions — Vice Harbor', lines, `Press M to close · ${progress}`);
  }

  /** Paint one frame: the world through the camera, the light, the HUD,
   *  then the screen panel. */
  function draw(state, screen, info) {
    const infoSafe = info || {};
    resize();
    const scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    const ox = (canvas.width - VIEW.width * scale) / 2;
    const oy = (canvas.height - VIEW.height * scale) / 2;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake : 0;
    const shakeY = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake : 0;
    context.setTransform(scale, 0, 0, scale, ox - state.camera.x * scale + shakeX * scale, oy - state.camera.y * scale + shakeY * scale);
    drawWorld(state);
    context.setTransform(scale, 0, 0, scale, ox, oy);
    drawLight(state);
    drawHeatGlow(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('VICE HARBOR', [
        'A sun-soaked open-world crime story.',
        'Steal cars, outrun the police, run six missions',
        'for Otto Reyes — and get Lena Marlowe out of debt.',
        '',
        'WASD drive & walk · E steal a car · Click shoot · F punch',
        'G garage · Taxi fares · Hubcaps to find · Day & night',
        'P pause · M missions · N mute · Space start',
      ], 'Press Space or click to start');
      if (infoSafe.best) text(`Best score ${infoSafe.best}`, VIEW.width / 2, VIEW.height - 60, 18, PALETTE.muted, 'center', 'alphabetic');
      return;
    }
    drawHud(context, state, text);
    if (infoSafe.showMissions) drawMissionList(state);
    else if (screen === SCREEN_PAUSED) drawPanel('Paused', ['The city waits for you.', 'Your save is kept in this browser.'], 'Press P to resume');
    else if (screen === SCREEN_BUSTED) drawPanel('BUSTED', ['The Vice Harbor police caught Lena.', `Missions done: ${state.missions.doneCount} · Money: $${state.money}`], 'Press Space to try again');
    else if (screen === SCREEN_OVER) drawPanel('Game over', ['Lena is out of the game — for now.', `Score: ${state.score} · Best: ${infoSafe.best || 0}`], 'Press Space to play again');
    else if (screen === SCREEN_STORY) drawPanel('STORY COMPLETE', ['Lena paid her debt. Vice Harbor is hers.', `Missions done: 6 · Money: $${state.money} · Score: ${state.score}`], 'Press Space to keep playing');
  }

  window.addEventListener('resize', resize);
  resize();
  return { draw };
}
