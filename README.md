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

- WASD / arrows — walk and drive (Shift to run; Shift while driving spends nitro)
- E — steal a car / get out of a car
- Mouse aim + click — shoot
- F — punch
- G — open Otto's garage at the Dockside Warehouse door
- 1 / 2 / 3 — buy engine, armour, nitro in the garage
- Space — start / confirm
- P — pause
- M — mission list
- N — mute / unmute sound

## The game

- A 3200 x 2400 city with six districts, a beach and a harbour
- Traffic and pedestrians who react to gunfire and sirens, stop to look
  at landmarks and shopfronts, chat with each other on the sidewalk, and
  slow down in a crowd
- Cars, motorbikes and trucks to steal, each with its own handling:
  a bike is fast and fragile, a truck is slow and tough
- Driving physics, crashes, smoke, skid marks, brake lights, paint
  finishes and horns when the traffic jams
- A wanted level (0–5 stars) with police cars and officers who chase
  in roles — pursuers, interceptors that cut across, blockers that cut
  the player off — plus busted and wanted decay
- Six missions with a story, objectives, tips, dialogue and pay
- Combat on foot, health, ammo and cash pickups that respawn
- A HUD with wanted stars, health, money, ammo, speed and a minimap —
  the status strip sits at the bottom-left, clear of the action, and
  every label is clamped so it can never be cut by a screen edge or hide
  behind a panel
- A start screen, a save in localStorage, and synthesised WebAudio sound

## What's new in v2.3

v2.3 is a major rewrite of the whole game in one recorded session: every
counted file is rewritten, and four new systems are added on top of the
v2.2 game, which keeps the story, missions, controls and rules exactly
as they played.

- **Day and night.** A clock runs across a full in-game day — dawn, day,
  dusk, night. The light fades, the street lamps burn, the windows light
  up and the city goes dark blue after dusk. The HUD shows the time and
  the phase, and the screenshots are staged in it: the cover at dusk,
  the mission shot at night.
- **Weather.** Clear spells and rain showers roll through on a seeded
  schedule. While it rains the roads are slippery — the player's car
  turns less sharply — and the rain streaks across the frame. The
  downtown screenshot is staged in a light shower.
- **Taxi work.** Drive any car and passengers flag you down at the kerb.
  Pick them up, carry them to the landmark they name, and the fare is
  yours. The fare, the waiting passenger and the destination all read on
  the HUD and the minimap.
- **Hidden hubcaps.** Twelve golden hubcaps are hidden across the city —
  by landmarks, in parks, along the beach. Walk over one to collect it
  for cash and score; the HUD keeps the count.
- **Otto's garage.** The Dockside Warehouse door is Otto's shop. Buy
  engine levels (more top speed), armour levels (more car health) and
  nitro levels (a boost meter, spent by holding Shift while driving)
  with mission money. Bought levels apply to every car Lena steals.
- **New vehicles.** Motorbikes and trucks join the traffic, with their
  own shapes, top speeds, turning and health.
- **Pedestrians who chat.** Two walkers who meet on a sidewalk stop and
  talk face to face for a while, so a corner can have a conversation.

The v1 entry scored a provisional 0.978 (12 won, 0 lost) in development.
No police car can outrun the player's car: the catch-up boost is small
and every police car is capped at 610 against the player's 620 top
speed — the chase wins by cutting the player off, not by being faster.

## Tests

The game is verified headless before every submit: 600 and 1,200
simulation steps without a crash, all six missions end-to-end, each new
system tested (a taxi order completed, an upgrade bought, a hubcap
collected, a full day cycled), the entrypoint run twice with
byte-identical dossiers, and the four screenshots rendered with real
Playwright Chromium and read back by eye.

## Files

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`
- `game/index.html` — the page (with an inline SVG favicon)
- `game/src/config.js` — tuning, palette, city constants, HUD layout, the label safe zone, and the new systems' numbers
- `game/src/city.js` — the map: roads, blocks, buildings, landmarks, lamps and flower beds
- `game/src/player.js` — Lena on foot and getting in and out of cars
- `game/src/vehicles.js` — car, bike and truck physics, traffic, horns and skid marks
- `game/src/pedestrians.js` — the people of the city
- `game/src/police.js` — the wanted level and the role-based police chase
- `game/src/missions.js` — the six-mission story
- `game/src/combat.js` — punching and shooting
- `game/src/hud.js` — HUD and minimap
- `game/src/audio.js` — synthesised sound, no audio files
- `game/src/render.js` — the camera and all drawing, in layers
- `game/src/world.js` — the rules: one fixed step advances everything
- `game/src/daynight.js` — the day and night clock
- `game/src/weather.js` — the weather: clear spells and rain showers
- `game/src/taxi.js` — the taxi trade
- `game/src/collectibles.js` — the hidden golden hubcaps
- `game/src/garage.js` — Otto's garage upgrades
- `game/src/shots.js` — the deterministic screenshot scenes
- `game/src/main.js` — boot, the game loop and the screens

## Screenshots

The four screenshots in `screenshots/` are real renders of the game,
staged by `game/src/shots.js` through `?shot=chase|downtown|mission|start`
with seed 4. The first, `1-cover.jpg`, is the cover: the chase at dusk,
three police cars around Lena's car.
