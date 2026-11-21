# Vice Harbor

An original 2D top-down open-world crime game, built for make.fun's
gta6-01 bounty: "Make GTA 6".

Lena Marlowe, a courier who owes the wrong people money, takes work from
Otto Reyes, a Dockside garage owner, across six story missions in Vice
Harbor — a sun-soaked coastal city of her own, with no names, characters,
map, art, music or assets from any commercial game.

## Play it

Serve the static files and open the game in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request: every file the game loads is under
`game/`.

## Controls

- WASD / arrows — walk and drive (Shift to run)
- E — steal a car / get out of a car
- Mouse aim + click — shoot
- F — punch
- Space — start / confirm
- P — pause
- M — mission list

## The game

- A 3200 x 2400 city with six districts, a beach and a harbour
- Traffic and pedestrians who react to gunfire and sirens
- Cars to steal, with driving physics, crashes and smoke
- A wanted level (0–5 stars) with police cars and officers who chase
- Six missions with a story, objectives, dialogue and pay
- Combat on foot, health, ammo and cash pickups
- A HUD with wanted stars, health, money, ammo, speed and a minimap
- A start screen, a save in localStorage, and synthesised WebAudio sound

## Files

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`
- `game/index.html` — the page
- `game/src/config.js` — tuning, palette and city constants
- `game/src/city.js` — the map: roads, blocks, buildings, landmarks
- `game/src/player.js` — Lena on foot and getting in and out of cars
- `game/src/vehicles.js` — car physics and traffic
- `game/src/pedestrians.js` — the people of the city
- `game/src/police.js` — the wanted level and the police chase
- `game/src/missions.js` — the six-mission story
- `game/src/combat.js` — punching and shooting
- `game/src/hud.js` — HUD and minimap
- `game/src/audio.js` — synthesised sound, no audio files
- `game/src/render.js` — the camera and all drawing
- `game/src/world.js` — the rules: one fixed step advances everything
- `game/src/shots.js` — the deterministic screenshot scenes
- `game/src/main.js` — boot, the game loop and the screens

## Screenshots

The four screenshots in `screenshots/` are real renders of the game,
staged by `game/src/shots.js` through `?shot=chase|downtown|mission|start`
with a fixed seed. The first, `1-cover.jpg`, is the cover.
