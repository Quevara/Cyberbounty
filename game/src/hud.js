// The HUD: wanted stars, health, money, ammo, speed, the mission objective,
// and the minimap in the corner. Drawing only — it reads the state and paints
// in screen space, after the world has been drawn.

import { PALETTE, VIEW } from './config.js';
import { districtAt } from './city.js';
import { currentObjectiveText, missionTarget } from './missions.js';

const MINIMAP = { x: 0, y: 0, w: 220, h: 165 };

/** Draw the wanted stars, health bar, money and ammo at the top of the screen. */
export function drawHud(context, state, text) {
  const player = state.player;
  context.textBaseline = 'top';
  // Wanted stars, top left.
  for (let i = 0; i < 5; i += 1) {
    text(i < state.police.wanted ? '★' : '☆', 22 + i * 26, 14, 26, i < state.police.wanted ? PALETTE.red : PALETTE.muted, 'left');
  }
  // Health bar under the stars.
  context.fillStyle = 'rgba(0,0,0,0.5)';
  context.fillRect(22, 48, 150, 14);
  context.fillStyle = player.health > 40 ? PALETTE.green : PALETTE.red;
  context.fillRect(22, 48, 150 * (player.health / 100), 14);
  text('HP', 178, 46, 16, PALETTE.text, 'left');
  // Money and ammo, top right.
  text(`$${state.money}`, VIEW.width - 22, 14, 28, PALETTE.gold, 'right');
  text(`Ammo ${state.combat.ammo}`, VIEW.width - 22, 48, 18, PALETTE.text, 'right');
  // Speed, bottom right, only when driving.
  if (!player.onFoot && state.playerCar) {
    const kmh = Math.round(Math.abs(state.playerCar.speed) * 0.24);
    text(`${kmh} km/h`, VIEW.width - 22, VIEW.height - 44, 26, PALETTE.text, 'right');
    text(state.playerCar.model, VIEW.width - 22, VIEW.height - 72, 16, PALETTE.muted, 'right');
  }
  // Mission objective, bottom left.
  const objective = currentObjectiveText(state);
  context.fillStyle = PALETTE.panel;
  const lines = wrapObjective(objective);
  const height = 12 + lines.length * 22 + 12;
  context.fillRect(16, VIEW.height - 16 - height, 430, height);
  context.fillStyle = PALETTE.gold;
  context.fillRect(16, VIEW.height - 16 - height, 4, height);
  for (let i = 0; i < lines.length; i += 1) {
    text(lines[i], 30, VIEW.height - 16 - height + 12 + i * 22, 17, PALETTE.text, 'left');
  }
  // District name, centre top.
  const district = districtAt(player.x, player.y);
  text(district.name, VIEW.width / 2, 16, 20, PALETTE.muted, 'center');
  // Mission message banner, under the district name.
  if (state.missions.messageTimer > 0 && state.missions.message) {
    text(state.missions.message, VIEW.width / 2, 44, 17, PALETTE.gold, 'center');
  }
  drawMinimap(context, state);
}

function wrapObjective(objective) {
  if (objective.length <= 58) return [objective];
  const cut = objective.lastIndexOf(' ', 58);
  return [objective.slice(0, cut), objective.slice(cut + 1)];
}

/** The minimap: the whole city shrunk into the top-right corner, with the
 *  player, the mission target, police and cars as coloured dots. */
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
  if (target) dot(target.x, target.y, PALETTE.gold, 5);
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
