// Drawing only: the world state and the current screen in, pixels out. The
// camera follows the player across the 3200 x 2400 city, and the 1280 x 720
// window is scaled to fit the browser. Sunset light, long shadows, neon signs
// and the harbour make Vice Harbor read as one coherent place.

import { CITY, FONT, PALETTE, VIEW, WORLD } from './config.js';
import { drawHud } from './hud.js';
import { MISSIONS, missionTarget } from './missions.js';

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

  function drawCity(state) {
    const cam = state.camera;
    const x0 = Math.max(0, cam.x - 100);
    const y0 = Math.max(0, cam.y - 100);
    const x1 = Math.min(WORLD.width, cam.x + VIEW.width + 100);
    const y1 = Math.min(WORLD.height, cam.y + VIEW.height + 100);
    // Grass base.
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Sea on the east, sand on the south.
    context.fillStyle = PALETTE.water;
    context.fillRect(Math.max(x0, CITY.harbourX), y0, x1 - Math.max(x0, CITY.harbourX), y1 - y0);
    context.fillStyle = PALETTE.sand;
    context.fillRect(x0, Math.max(y0, CITY.beachY), x1 - x0, y1 - Math.max(y0, CITY.beachY));
    // Parks.
    context.fillStyle = PALETTE.park;
    for (const park of state.city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Roads: asphalt, then sidewalks, then centre dashes.
    const half = CITY.roadWidth / 2;
    context.fillStyle = PALETTE.asphalt;
    for (const cx of state.city.roadsV) context.fillRect(cx - half, y0, CITY.roadWidth, y1 - y0);
    for (const cy of state.city.roadsH) context.fillRect(x0, cy - half, x1 - x0, CITY.roadWidth);
    context.fillStyle = PALETTE.sidewalk;
    for (const cx of state.city.roadsV) {
      context.fillRect(cx - half - CITY.sidewalk, y0, CITY.sidewalk, y1 - y0);
      context.fillRect(cx + half, y0, CITY.sidewalk, y1 - y0);
    }
    for (const cy of state.city.roadsH) {
      context.fillRect(x0, cy - half - CITY.sidewalk, x1 - x0, CITY.sidewalk);
      context.fillRect(x0, cy + half, x1 - x0, CITY.sidewalk);
    }
    context.fillStyle = PALETTE.roadLine;
    for (const cx of state.city.roadsV) {
      for (let y = Math.floor(y0 / 48) * 48; y < y1; y += 48) context.fillRect(cx - 2, y, 4, 22);
    }
    for (const cy of state.city.roadsH) {
      for (let x = Math.floor(x0 / 48) * 48; x < x1; x += 48) context.fillRect(x, cy - 2, 22, 4);
    }
    // Buildings, with a long sunset shadow to the east.
    for (const b of state.city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      context.fillStyle = 'rgba(0, 0, 0, 0.25)';
      context.fillRect(b.x + b.height, b.y + b.height, b.w, b.h);
      context.fillStyle = b.colour;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof ? PALETTE.buildingRoof : '#5a4a5a';
      context.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      if (b.landmark) {
        context.fillStyle = PALETTE.gold;
        context.font = `bold 13px ${FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(b.landmark, b.x + b.w / 2, b.y + b.h / 2);
      }
    }
    // Sunset Pier jutting into the sea.
    context.fillStyle = PALETTE.pier;
    context.fillRect(1560, CITY.beachY, 80, 180);
    context.fillStyle = '#8a6a4a';
    context.fillRect(1560, CITY.beachY, 80, 10);
  }

  function drawCarShape(car, isPlayerCar) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    if (car.wrecked) {
      context.fillStyle = '#222';
      context.fillRect(-42, -23, 84, 46);
      context.fillStyle = '#555';
      context.fillRect(-30, -14, 60, 28);
      context.restore();
      return;
    }
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-40, -20, 84, 46);
    context.fillStyle = car.colour;
    context.fillRect(-42, -23, 84, 46);
    context.fillStyle = '#20242c';
    context.fillRect(-10, -19, 26, 38);
    context.fillStyle = '#dfe8f0';
    context.fillRect(30, -19, 6, 8);
    context.fillRect(30, 11, 6, 8);
    context.fillStyle = '#ff3b30';
    context.fillRect(-42, -19, 5, 8);
    context.fillRect(-42, 11, 5, 8);
    if (isPlayerCar) {
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 3;
      context.strokeRect(-46, -27, 92, 54);
    }
    if (car.driver === 'police') {
      const blink = Math.floor(performance.now() / 180) % 2 === 0;
      context.fillStyle = blink ? '#ff3b30' : '#3b82ff';
      context.fillRect(-6, -26, 12, 6);
      context.fillStyle = blink ? '#3b82ff' : '#ff3b30';
      context.fillRect(-6, 20, 12, 6);
    }
    context.restore();
  }

  function drawPerson(x, y, angle, colour, radius, label) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(3, 4, radius, radius * 0.8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = colour;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c9a0';
    context.beginPath();
    context.arc(radius + 2, 0, radius * 0.55, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (label) {
      context.fillStyle = PALETTE.text;
      context.font = `12px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText(label, x, y - radius - 4);
    }
  }

  function drawWorld(state) {
    drawCity(state);
    // Mission target marker: a gold ring and a beam of light.
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
      text(target.label, target.x, target.y - 56, 16, PALETTE.gold, 'center', 'alphabetic');
    }
    for (const car of state.cars) drawCarShape(car, state.playerCar === car);
    for (const car of state.police.cars) drawCarShape(car, false);
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.colour, 9);
    for (const officer of state.police.officers) drawPerson(officer.x, officer.y, officer.angle, '#1f3a6e', 10);
    // The player, on foot or driving.
    const player = state.player;
    if (player.onFoot) {
      const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0;
      if (!blink) drawPerson(player.x, player.y, player.angle, PALETTE.player, 14, 'LENA');
    }
    // Bullets as bright streaks.
    context.strokeStyle = '#ffe08a';
    context.lineWidth = 3;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
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
    drawPanel('Missions — Vice Harbor', lines, 'Press M to close · Next: ' + (MISSIONS[state.missions.index] ? MISSIONS[state.missions.index].title : 'Story complete'));
  }

  /** Paint one frame: the world through the camera, the HUD, then the screen panel. */
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
    if (screen === SCREEN_TITLE) {
      drawPanel('VICE HARBOR', [
        'A sun-soaked open-world crime story.',
        'Steal cars, outrun the police, run six missions',
        'for Otto Reyes — and get Lena Marlowe out of debt.',
        '',
        'WASD drive & walk · E steal a car · Click shoot · F punch',
        'P pause · M missions · Space start',
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
