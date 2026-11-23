// Vice Harbor v2.3 — the HUD: the wanted stars, health, money, ammo,
// speed, the mission objective, and the minimap in the corner. Drawing
// only — it reads the state and paints in screen space, after the world
// has been drawn. The layout keeps the top-left corner clear: the wanted
// stars and the health bar live in a compact strip at the bottom-left,
// above the mission objective, so a chase frame never hides a police car
// behind them. The minimap stays top-right, money and ammo above it,
// speed bottom-right. v2.3 adds the new systems to the frame: the day
// and night clock under the district name, the taxi fare and destination
// while a passenger rides, the hubcap count, the garage hint at the
// door and the shop panel with its prices, and the nitro boost meter
// while driving. Every centred label is still measured, clamped into
// the screen margins, and painted over a soft backing panel.

import { HUD, PALETTE, VIEW } from './config.js';
import { districtAt } from './city.js';
import { currentObjectiveText, currentStepProgress, missionTarget } from './missions.js';
import { isLowOnAmmo } from './combat.js';
import { nearestStealableCar } from './player.js';
import { isPlayerCritical } from './player.js';
import { clamp, clampLabelX, formatMoney, formatSpeed } from './util.js';
import { clockTime, isNight, phaseName } from './daynight.js';
import { isRaining } from './weather.js';
import { collectiblesTaken, collectiblesTotal } from './collectibles.js';
import { taxiFare, taxiRiding, taxiWaiting } from './taxi.js';
import { canUseGarage, garagePosition, garageTracks } from './garage.js';

const MINIMAP = { x: 0, y: 0, w: HUD.minimapWidth, h: HUD.minimapHeight };

/** Wrap the objective text into at most two lines of about 58 characters. */
function wrapObjective(objective) {
  if (objective.length <= 58) return [objective];
  const cut = objective.lastIndexOf(' ', 58);
  if (cut < 0) return [objective];
  return [objective.slice(0, cut), objective.slice(cut + 1)];
}

/** Draw centred text that can never be clipped by a screen edge: the
 *  centre is clamped to the label margins, and a soft panel sits behind it. */
function clampedLabel(context, textFn, value, y, size, colour) {
  context.font = `${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const width = context.measureText(value).width;
  const x = clampLabelX(VIEW.width / 2, width / 2 + 12, HUD.labelMarginX, VIEW.width - HUD.labelMarginX);
  const cy = Math.max(y, HUD.labelMarginTop);
  context.fillStyle = PALETTE.labelBack;
  context.fillRect(x - width / 2 - 12, cy - 2, width + 24, size + 8);
  textFn(value, x, cy, size, colour, 'center');
}

/** The wanted stars and the health bar, as a compact strip at bottom-left. */
function drawStatusStrip(context, state, text, panelTop) {
  const x = HUD.statusX;
  const y = panelTop - 52;
  // Wanted stars.
  for (let i = 0; i < 5; i += 1) {
    const lit = i < state.police.wanted;
    text(lit ? '★' : '☆', x + 4 + i * 26, y, 26, lit ? PALETTE.red : PALETTE.muted, 'left');
  }
  // Health bar under the stars.
  const barY = y + 30;
  context.fillStyle = 'rgba(0,0,0,0.5)';
  context.fillRect(x, barY, HUD.statusWidth, 14);
  const critical = isPlayerCritical(state.player);
  const blink = critical && Math.floor(state.elapsed * 4) % 2 === 0;
  context.fillStyle = blink ? PALETTE.red : (state.player.health > 40 ? PALETTE.green : PALETTE.red);
  context.fillRect(x, barY, HUD.statusWidth * (state.player.health / 100), 14);
  text('HP', x + HUD.statusWidth + 8, barY - 2, 16, PALETTE.text, 'left');
}

/** The mission objective panel, bottom left, with the status strip above. */
function drawObjectivePanel(context, state, text) {
  const objective = currentObjectiveText(state);
  const lines = wrapObjective(objective);
  const panelHeight = 12 + lines.length * 22 + 12;
  const panelTop = VIEW.height - 16 - panelHeight;
  drawStatusStrip(context, state, text, panelTop);
  context.fillStyle = PALETTE.panel;
  context.fillRect(16, panelTop, HUD.objectiveWidth, panelHeight);
  context.fillStyle = PALETTE.gold;
  context.fillRect(16, panelTop, 4, panelHeight);
  for (let i = 0; i < lines.length; i += 1) {
    text(lines[i], 30, panelTop + 12 + i * 22, 17, PALETTE.text, 'left');
  }
  // Timed-step progress bar under the objective, when one is running.
  const progress = currentStepProgress(state);
  if (progress !== null) {
    const barY = panelTop + panelHeight + 8;
    context.fillStyle = 'rgba(0,0,0,0.5)';
    context.fillRect(16, barY, HUD.objectiveWidth, 8);
    context.fillStyle = PALETTE.gold;
    context.fillRect(16, barY, HUD.objectiveWidth * progress, 8);
  }
}

/** Money and ammo, top right, above the minimap. A low ammo count blinks
 *  in red so the player knows to find a pickup before the next fight. */
function drawTopRight(context, state, text) {
  text(formatMoney(state.money), VIEW.width - 22, 14, 28, PALETTE.gold, 'right');
  const low = isLowOnAmmo(state);
  const blink = low && Math.floor(state.elapsed * 3) % 2 === 0;
  const ammoColour = state.combat.ammo <= 0 ? PALETTE.red : blink ? PALETTE.red : PALETTE.text;
  text(`Ammo ${state.combat.ammo}`, VIEW.width - 22, 48, 18, ammoColour, 'right');
  if (low) text('LOW AMMO', VIEW.width - 22, 70, 12, PALETTE.red, 'right');
}

/** Speed and car model, bottom right, only when driving — with the nitro
 *  boost meter under it when Lena owns any nitro. */
function drawSpeed(context, state, text) {
  const player = state.player;
  if (player.onFoot || !state.playerCar) return;
  text(formatSpeed(state.playerCar.speed), VIEW.width - 22, VIEW.height - 44, 26, PALETTE.text, 'right');
  const kind = state.playerCar.kind === 'bike' ? 'Motorbike' : state.playerCar.kind === 'truck' ? 'Truck' : 'Car';
  text(`${state.playerCar.model} · ${kind}`, VIEW.width - 22, VIEW.height - 72, 16, PALETTE.muted, 'right');
  if (state.garage && state.garage.levels.nitro > 0) {
    const meterW = 150;
    const meterX = VIEW.width - 22 - meterW;
    const meterY = VIEW.height - 96;
    context.fillStyle = 'rgba(0,0,0,0.5)';
    context.fillRect(meterX, meterY, meterW, 8);
    context.fillStyle = PALETTE.neonCyan;
    context.fillRect(meterX, meterY, meterW * clamp(state.garage.boostMeter, 0, 1), 8);
    text('NITRO (hold Shift)', VIEW.width - 22, meterY - 20, 12, PALETTE.neonCyan, 'right');
  }
}

/** "Press E" hint when a car can be stolen, centred and clamped. */
function drawStealHint(context, state, text) {
  const player = state.player;
  if (!player.onFoot) return;
  const car = nearestStealableCar(player, state.cars);
  if (!car) return;
  clampedLabel(context, text, `Press E to steal the ${car.model}`, VIEW.height - 132, 18, PALETTE.gold);
}

/** The clock and the phase, under the district name: sun by day, moon at night. */
function drawClock(context, state, text) {
  if (!state.daynight) return;
  const night = isNight(state.daynight);
  const icon = night ? '☾' : '☀';
  const label = `${icon} ${clockTime(state.daynight)} · ${phaseName(state.daynight)}`;
  clampedLabel(context, text, label, HUD.districtY + 26, 16, night ? PALETTE.neonCyan : PALETTE.muted);
}

/** The taxi line, top-left under the hubcap count: a waiting passenger,
 *  or the fare and destination while one rides. It used to sit centred
 *  under the clock, where it collided with the clamped mission-target
 *  label at the top of the frame; the top-left column is free. */
function drawTaxiLine(context, state, text) {
  if (!state.taxi) return;
  if (taxiWaiting(state)) {
    text(`Taxi: passenger waiting — drive close to pick up ($${taxiFare(state)})`, 16, 40, 16, PALETTE.taxiGold, 'left');
  } else if (taxiRiding(state)) {
    const dest = state.taxi.destination;
    text(`Taxi: take them to ${dest.name} — $${taxiFare(state)}`, 16, 40, 16, PALETTE.taxiGold, 'left');
  }
}

/** The rain warning, under the taxi line: the roads are slippery while
 *  it falls, so a chase needs more room to turn. */
function drawRainLine(context, state, text) {
  if (!state.weather || !isRaining(state.weather)) return;
  text('Rain — roads slippery', 16, 66, 16, PALETTE.neonCyan, 'left');
}

/** The hubcap count, small and top-left, so it never covers the chase. */
function drawHubcaps(context, state, text) {
  if (!state.collectibles) return;
  const found = collectiblesTaken(state.collectibles);
  const total = collectiblesTotal();
  text(`◉ Hubcaps ${found}/${total}`, 16, 14, 16, PALETTE.hubcap, 'left');
}

/** The garage hint at the door, and the shop panel with its prices. */
function drawGarage(context, state, text) {
  if (!state.garage) return;
  if (state.garage.open) {
    const tracks = garageTracks(state.garage);
    const panelW = 460;
    const panelH = 60 + tracks.length * 26;
    const x = (VIEW.width - panelW) / 2;
    const y = 150;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, panelW, panelH);
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(x, y, panelW, panelH);
    text("Otto's Garage — upgrades for your car", VIEW.width / 2, y + 16, 20, PALETTE.gold, 'center');
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      const price = track.price === null ? 'MAX' : `$${track.price}`;
      const line = `${i + 1}. ${track.name} Lv${track.level}/${track.maxLevel} — ${track.blurb} — ${price}`;
      text(line, VIEW.width / 2, y + 46 + i * 26, 16, track.price === null || state.money < track.price ? PALETTE.muted : PALETTE.text, 'center');
    }
    text('Press G to close', VIEW.width / 2, y + panelH - 12, 14, PALETTE.muted, 'center');
  } else if (canUseGarage(state)) {
    clampedLabel(context, text, "Press G — Otto's Garage", VIEW.height - 132, 18, PALETTE.gold);
  }
}

/** Draw the wanted stars, health bar, money and ammo at the top of the screen. */
export function drawHud(context, state, text) {
  const player = state.player;
  context.textBaseline = 'top';
  drawObjectivePanel(context, state, text);
  drawTopRight(context, state, text);
  drawSpeed(context, state, text);
  drawStealHint(context, state, text);
  drawGarage(context, state, text);
  // District name, centre top, clamped so it can never be cut by an edge.
  const district = districtAt(player.x, player.y);
  clampedLabel(context, text, district.name, HUD.districtY, 20, PALETTE.muted);
  drawClock(context, state, text);
  drawTaxiLine(context, state, text);
  drawRainLine(context, state, text);
  drawHubcaps(context, state, text);
  // Mission message banner, under the district name, clamped the same
  // way — wrapped first, so a long briefing can never run off an edge.
  if (state.missions.messageTimer > 0 && state.missions.message) {
    const bannerLines = wrapObjective(state.missions.message);
    for (let i = 0; i < bannerLines.length; i += 1) {
      clampedLabel(context, text, bannerLines[i], HUD.bannerY + i * 24, 17, PALETTE.gold);
    }
  }
  drawMinimap(context, state);
}

/** The minimap: the whole city shrunk into the top-right corner, with the
 *  player, the mission target, police and cars as coloured dots — plus the
 *  taxi passenger in gold and the garage in cyan. */
export function drawMinimap(context, state) {
  const mx = VIEW.width - MINIMAP.w - 16;
  const my = 84;
  const sx = MINIMAP.w / state.citySize.width;
  const sy = MINIMAP.h / state.citySize.height;
  context.fillStyle = 'rgba(10, 14, 24, 0.85)';
  context.fillRect(mx - 4, my - 4, MINIMAP.w + 8, MINIMAP.h + 8);
  context.fillStyle = '#2c4a2e';
  context.fillRect(mx, my, MINIMAP.w, MINIMAP.h);
  // Roads as pale lines.
  context.strokeStyle = '#5a6068';
  context.lineWidth = 2;
  for (const cx of state.city.roadsV) {
    context.beginPath();
    context.moveTo(mx + cx * sx, my);
    context.lineTo(mx + cx * sx, my + MINIMAP.h);
    context.stroke();
  }
  for (const cy of state.city.roadsH) {
    context.beginPath();
    context.moveTo(mx, my + cy * sy);
    context.lineTo(mx + MINIMAP.w, my + cy * sy);
    context.stroke();
  }
  // Water on the east and the beach on the south.
  context.fillStyle = '#2e7f9e';
  context.fillRect(mx + MINIMAP.w - 14, my, 14, MINIMAP.h);
  context.fillStyle = '#e8c98a';
  context.fillRect(mx, my + MINIMAP.h - 10, MINIMAP.w, 10);
  const dot = (x, y, colour, size) => {
    context.fillStyle = colour;
    context.beginPath();
    context.arc(mx + x * sx, my + y * sy, size, 0, Math.PI * 2);
    context.fill();
  };
  const target = missionTarget(state);
  if (target) {
    const pulse = 4 + Math.sin(state.elapsed * 5) * 1.5;
    dot(target.x, target.y, PALETTE.gold, pulse);
  }
  if (state.taxi && state.taxi.status !== 'none') {
    const point = state.taxi.status === 'waiting' ? state.taxi.passenger : state.taxi.destination;
    if (point) dot(point.x, point.y, PALETTE.taxiGold, 4);
  }
  if (state.garage) {
    const door = garagePosition(state);
    dot(door.x, door.y, PALETTE.neonCyan, 3);
  }
  for (const car of state.cars) {
    if (!car.wrecked) dot(car.x, car.y, '#cfd6dd', 2);
  }
  for (const car of state.police.cars) dot(car.x, car.y, '#4f8cff', 3);
  const player = state.player;
  dot(player.x, player.y, PALETTE.player, 4);
  // The camera view as a faint rectangle.
  context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  context.lineWidth = 1;
  context.strokeRect(
    mx + state.camera.x * sx, my + state.camera.y * sy,
    VIEW.width * sx, VIEW.height * sy,
  );
}
