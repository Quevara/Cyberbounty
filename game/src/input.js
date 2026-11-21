// Keyboard and mouse input for Vice Harbor. Held keys give a movement vector;
// one-shot presses (confirm, pause, steal a car, mission list) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost
// and never counted twice. The mouse gives an aim angle in world space.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_MISSIONS = 8;
export const ACTION_PUNCH = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const MISSIONS = new Set(['KeyM']);
const PUNCH = new Set(['KeyF']);

export function createInput(canvas, toWorld) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.run = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER_CAR.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER_CAR;
    } else if (MISSIONS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MISSIONS;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else return;
    if (event.code !== 'F5') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.run = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Normalised movement vector {x, y}, in world axes. */
    moveVector() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.sqrt(x * x + y * y);
      return { x: x / len, y: y / len };
    },
    running() {
      return held.run;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Drop every queued press, for example when the game changes screen. */
    clearActions() {
      actions = 0;
    },
    shooting() {
      return mouseDown;
    },
    /** Aim angle in world space, from the player's position. */
    aimAngle(playerX, playerY) {
      if (!toWorld) return 0;
      const world = toWorld(mouseX, mouseY);
      return Math.atan2(world.y - playerY, world.x - playerX);
    },
  };
}
