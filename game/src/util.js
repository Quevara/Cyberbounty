// Vice Harbor v2.3 — the shared toolbox: numbers, angles, rectangles,
// deterministic hashes and the little formatters the HUD leans on. Every
// function here is pure — no DOM, no game state — so the headless tests
// can call them exactly as the renderer does. The helpers are written
// out plainly on purpose: the whole game leans on them, and a bug here
// would show up everywhere at once.

/** Keep `value` between `low` and `high`, inclusive. */
export function clamp(value, low, high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** Keep `value` between 0 and 1: progress bars, fades, alphas. */
export function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Where a centred label of `halfWidth` may sit inside a strip from
 *  `minX` to `maxX`, so the text never runs off either edge. */
export function clampLabelX(centreX, halfWidth, minX, maxX) {
  const lo = minX + halfWidth;
  const hi = maxX - halfWidth;
  if (lo > hi) return (minX + maxX) / 2;
  if (centreX < lo) return lo;
  if (centreX > hi) return hi;
  return centreX;
}

/** Fit a label box {x, y, w, h} (centre x, top y) inside a screen box
 *  {x, y, w, h} with a margin on every side, and hand back the fitted
 *  centre x and top y. When the label is wider than the box it is
 *  centred in it rather than pushed off-screen. */
export function clampLabelBox(label, screen, margin) {
  const halfW = label.w / 2;
  let minX = screen.x + margin + halfW;
  let maxX = screen.x + screen.w - margin - halfW;
  if (minX > maxX) {
    minX = screen.x + screen.w / 2;
    maxX = minX;
  }
  let minY = screen.y + margin;
  let maxY = screen.y + screen.h - margin - label.h;
  if (minY > maxY) {
    minY = screen.y + margin;
    maxY = minY;
  }
  return { x: clamp(label.x, minX, maxX), y: clamp(label.y, minY, maxY) };
}

/** True when rectangles a and b overlap, each grown by `margin` pixels. */
export function rectsOverlapMargin(a, b, margin) {
  const m = margin || 0;
  if (a.x + a.w + m <= b.x - m) return false;
  if (b.x + b.w + m <= a.x - m) return false;
  if (a.y + a.h + m <= b.y - m) return false;
  if (b.y + b.h + m <= a.y - m) return false;
  return true;
}

/** Straight-line blend from a to b at fraction t. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep: 0 below edge0, 1 above edge1, eased between. */
export function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Ease in-out: slow at both ends, fast in the middle. */
export function easeInOut(t) {
  const c = clamp01(t);
  if (c < 0.5) return 2 * c * c;
  const u = 1 - c;
  return 1 - 2 * u * u;
}

/** Ease out: fast at the start, gentle at the end. */
export function easeOut(t) {
  const c = clamp01(t);
  const u = 1 - c;
  return 1 - u * u;
}

/** Straight-line distance between two points. */
export function distance(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Squared distance — cheaper when only a comparison is needed. */
export function distanceSquared(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** The shortest signed turn from `from` to `to`, in (-PI, PI]. */
export function angleDifference(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move `angle` toward `target` by at most `maxStep` radians. */
export function turnToward(angle, target, maxStep) {
  const d = angleDifference(angle, target);
  if (d > maxStep) return angle + maxStep;
  if (d < -maxStep) return angle - maxStep;
  return target;
}

/** Bring any angle into (-PI, PI]. */
export function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Blend `angle` toward `target` by fraction `t` along the short way round. */
export function angleLerp(angle, target, t) {
  return wrapAngle(angle + angleDifference(angle, target) * clamp01(t));
}

/** The angle from (ax, ay) to (bx, by). */
export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

/** True when rectangles a and b overlap at all. */
export function rectsOverlap(a, b) {
  if (a.x + a.w <= b.x) return false;
  if (b.x + b.w <= a.x) return false;
  if (a.y + a.h <= b.y) return false;
  if (b.y + b.h <= a.y) return false;
  return true;
}

/** True when the point (x, y) lies inside rect (with .x/.y/.w/.h). */
export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** True when the circle at (cx, cy) with radius r touches the rect. */
export function circleRectOverlap(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** One entry of `list`, drawn with the seeded `random` function. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** A deterministic 0..1 hash of two integer tile coordinates — speckles,
 *  grass blades and window lights that must look the same every frame
 *  without storing anything. */
export function hash2(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The same hash, mixed with a seed, so different layers never share a pattern. */
export function hash2Seeded(seed, ix, iy) {
  return hash2(ix + Math.imul(seed, 101), iy - Math.imul(seed, 57));
}

/** Map `value` from one range to another, clamped to the output range. */
export function mapRange(value, inLow, inHigh, outLow, outHigh) {
  if (inHigh === inLow) return outLow;
  const t = clamp01((value - inLow) / (inHigh - inLow));
  return outLow + (outHigh - outLow) * t;
}

/** "$1,234" for a money amount, without depending on Intl. */
export function formatMoney(amount) {
  const whole = Math.max(0, Math.floor(amount));
  const digits = String(whole);
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return `$${out}`;
}

/** "149 km/h" for a speed in game units, as the HUD shows it. */
export function formatSpeed(speed) {
  return `${Math.round(Math.abs(speed) * 0.24)} km/h`;
}

/** "3:24" for a number of seconds, for mission timers and the day clock. */
export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}
