// Vice Harbor v2.3 — keyboard and mouse input. Held keys give a movement
// vector; one-shot presses (confirm, pause, steal a car, mission list,
// punch, mute, garage, buy a track) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and
// never counted twice. The mouse gives an aim angle in world space. The
// same shape is what the screenshot autopilot fakes. v2.3 keeps the
// bindings as one table (action, codes, held or one-shot) but looks them
// up through a Map built once at boot, tracks how long each held key has
// been down (the loop uses it for the run feel and the nitro boost), and
// ignores the browser's own shortcuts so a game key never reloads the
// page. The new rows are the garage: G opens Otto's shop at the door,
// and 1, 2 and 3 buy the engine, armour and nitro tracks while it is open.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_MISSIONS = 8;
export const ACTION_PUNCH = 16;
export const ACTION_MUTE = 32;
export const ACTION_GARAGE = 64;
export const ACTION_BUY_ENGINE = 128;
export const ACTION_BUY_ARMOUR = 256;
export const ACTION_BUY_NITRO = 512;

/** One row per action: the flag, the key codes, and whether it is held. */
const BINDINGS = [
  { flag: 0, codes: ['ArrowUp', 'KeyW'], held: 'up' },
  { flag: 0, codes: ['ArrowDown', 'KeyS'], held: 'down' },
  { flag: 0, codes: ['ArrowLeft', 'KeyA'], held: 'left' },
  { flag: 0, codes: ['ArrowRight', 'KeyD'], held: 'right' },
  { flag: 0, codes: ['ShiftLeft', 'ShiftRight'], held: 'run' },
  { flag: ACTION_CONFIRM, codes: ['Space', 'Enter'] },
  { flag: ACTION_PAUSE, codes: ['KeyP', 'Escape'] },
  { flag: ACTION_ENTER_CAR, codes: ['KeyE'] },
  { flag: ACTION_MISSIONS, codes: ['KeyM'] },
  { flag: ACTION_PUNCH, codes: ['KeyF'] },
  { flag: ACTION_MUTE, codes: ['KeyN'] },
  { flag: ACTION_GARAGE, codes: ['KeyG'] },
  { flag: ACTION_BUY_ENGINE, codes: ['Digit1', 'Numpad1'] },
  { flag: ACTION_BUY_ARMOUR, codes: ['Digit2', 'Numpad2'] },
  { flag: ACTION_BUY_NITRO, codes: ['Digit3', 'Numpad3'] },
];

/** Key code -> binding row, built once so every event is one lookup. */
const BINDING_BY_CODE = new Map();
for (const row of BINDINGS) {
  for (const code of row.codes) BINDING_BY_CODE.set(code, row);
}

/** Key codes the game swallows so the browser never acts on them. */
const SWALLOWED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(canvas, toWorld) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  const heldSince = { up: 0, down: 0, left: 0, right: 0, run: 0 };
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;
  let hasMouse = false;

  function releaseAll() {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.run = false;
    heldSince.up = 0;
    heldSince.down = 0;
    heldSince.left = 0;
    heldSince.right = 0;
    heldSince.run = 0;
    mouseDown = false;
  }

  function onKeyDown(event) {
    const row = BINDING_BY_CODE.get(event.code);
    if (!row) return;
    if (row.held) {
      if (!held[row.held]) heldSince[row.held] = performance.now();
      held[row.held] = true;
    } else if (!event.repeat) {
      actions |= row.flag;
    }
    if (SWALLOWED.has(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    const row = BINDING_BY_CODE.get(event.code);
    if (row && row.held) {
      held[row.held] = false;
      heldSince[row.held] = 0;
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', releaseAll);
  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    hasMouse = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('pointercancel', () => {
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    hasMouse = true;
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
    /** Milliseconds the named held key has been down, or 0 when it is up. */
    heldFor(name) {
      if (!held[name]) return 0;
      return performance.now() - heldSince[name];
    },
    /** True when the pointer has ever moved over the canvas. */
    hasMouse() {
      return hasMouse;
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
    /** Drop every held key as well, for example when the run restarts. */
    releaseAll,
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
