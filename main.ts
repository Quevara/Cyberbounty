// Vice Harbor v2.3 — a gta6-01 entry (Node 22, standard library only): the
// game is this directory's game/ folder, plain static files a desktop browser
// loads offline (game/index.html and its ES modules, no library and no network
// request), and the program hands it in. It copies game/ and screenshots/
// from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library. Vice Harbor
// is an original 2D top-down open-world crime game: a sun-soaked coastal
// city to explore on foot and by car, traffic and pedestrians, cars, bikes
// and trucks to steal, a wanted level with police who chase with roles —
// pursuer, interceptor and blocker — six story missions for Otto Reyes,
// combat, a HUD with a minimap and a status strip that never covers the
// chase, a start screen and a save. v2.3 adds a day and night clock, rain
// showers with slippery roads, taxi work, hidden hubcaps and Otto's
// garage upgrades, and rewrites every counted file in one recorded
// session, with the screenshot scenes re-staged with seed 4. Screenshots: 1-cover (the chase at dusk),
// 2-downtown (on foot, a taxi passenger waiting), 3-mission (the delivery
// at night), 4-start (the title screen at dawn).
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Run it twice: both runs must write identical bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The scorer's own caps (reference/gate.json): only text_max_bytes shapes
 *  the bytes; the others refuse an entry the scorer would refuse (more than
 *  4 screenshots or one over 256 KiB; more than 993 files in game/ or 48
 *  MiB of game files, in all, or a path under game/ over 1000 bytes:
 *  game/ counts beside /output's own 1000-entry cap, its screenshots/ and
 *  dossier.json). */
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** The folders this entry hands in, and where they land in /output. */
const HAND_IN = [
  { from: 'game', to: 'game' },
  { from: 'screenshots', to: 'screenshots' },
];

/** Copy one handed-in folder into the output directory, when it exists. */
function copyFolder(here, out, entry) {
  const source = join(here, entry.from);
  const target = join(out, entry.to);
  mkdirSync(target, { recursive: true });
  if (existsSync(source)) cpSync(source, target, { recursive: true });
}

/** Write the dossier the judge reads. */
function writeDossier(out) {
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (!existsSync(join(here, 'game'))) {
  throw new Error('Vice Harbor: game/ is missing beside main.ts — nothing to hand in.');
}

mkdirSync(out, { recursive: true });
for (const entry of HAND_IN) copyFolder(here, out, entry);
writeDossier(out);
