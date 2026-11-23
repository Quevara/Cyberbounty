// Vice Harbor v2.3 — one file holds every number the game tunes by.
// The city is 3200 x 2400, the camera shows a 1280 x 720 window of it,
// and the simulation steps at a fixed 1/60 s, so nothing here depends on
// the browser's size or speed. The warm sunset look of v2 stays — the
// same building and car colours, the same neon — and the balance stays
// too: no police car tops 610 against the player's 620. What v2.3 adds
// is room for the new systems: a day and night clock, taxi fares, Otto's
// garage upgrades, hidden golden hubcaps, and two new vehicle kinds
// (a motorbike that is fast and fragile, a truck that is slow and tough)
// alongside the cars. The HUD constants keep the same layout rule as
// ever — the wanted stars and the health bar live bottom-left, clear of
// the chase — and the label safe zone keeps floating names out of every
// corner panel.

export const GAME_VERSION = 'v2.3';

export const WORLD = { width: 3200, height: 2400 };

/** One simulation step, in seconds: 60 steps a second, whatever the display. */
export const STEP = 1 / 60;

/** The camera window, in world pixels. */
export const VIEW = { width: 1280, height: 720 };

/** A full in-game day, in seconds of play: dawn, day, dusk, then night. */
export const DAY_LENGTH = 300;

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.45,
  /** Seconds of extra speed after stepping out of a car, for a fair escape. */
  exitBoostSeconds: 1.0,
  exitBoostBonus: 60,
};

/** Every vehicle kind the city drives: cars, motorbikes and trucks. Each
 *  kind has its own top speed, acceleration, turning and health, so a
 *  stolen bike feels nothing like a stolen truck. */
export const VEHICLE_KINDS = {
  car: { length: 84, width: 46, topSpeed: 620, reverseSpeed: 220, accel: 520, turnRate: 2.9, health: 100, label: 'car' },
  bike: { length: 64, width: 26, topSpeed: 700, reverseSpeed: 140, accel: 700, turnRate: 4.4, health: 55, label: 'motorbike' },
  truck: { length: 104, width: 52, topSpeed: 460, reverseSpeed: 180, accel: 380, turnRate: 2.1, health: 180, label: 'truck' },
};

export const CAR = {
  width: 46,
  length: 84,
  accel: 520,
  brake: 900,
  reverseAccel: 300,
  maxSpeed: 620,
  maxReverse: 220,
  turnRate: 2.9,
  grip: 0.94,
  health: 100,
  stealRange: 70,
};

export const TRAFFIC = {
  count: 14,
  speed: 170,
  spawnInterval: 2.2,
  colours: [
    '#c0392b', '#2e86c1', '#f1c40f', '#7d3c98', '#16a085', '#e67e22',
    '#95a5a6', '#ecf0f1', '#d35400', '#1abc9c', '#8e44ad', '#2c3e50',
    '#b9770e', '#117a65',
  ],
  models: ['Harbor Sedan', 'Marina Coupe', 'Bay Taxi', 'Dock Van', 'Sunset Hatch', 'Pier Pickup', 'Palm Cab'],
  /** Body styles the renderer picks from: sedan, coupe, van, pickup. */
  styles: ['sedan', 'coupe', 'van', 'pickup'],
  /** Paint finishes: gloss gets a bright roof highlight, matte stays flat. */
  finishes: ['gloss', 'gloss', 'matte'],
  /** Lane offsets from the road centre line, left or right. */
  laneOffsets: [-14, 14],
  /** How often a spawned traffic vehicle is a bike or a truck instead of a car. */
  bikeChance: 0.12,
  truckChance: 0.1,
};

export const PEDESTRIAN = {
  count: 26,
  speedMin: 38,
  speedMax: 72,
  colours: ['#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#9b59b6', '#1abc9c', '#fd79a8', '#fdcb6e'],
  /** Outfit colours for shirts, hats and bags, drawn over the body colour. */
  outfits: ['#f5f1e6', '#2c3e50', '#e84393', '#00cec9', '#fdcb6e', '#6c5ce7'],
  /** Chance a walker stops to look at a shopfront or landmark instead. */
  browseChance: 0.22,
  browseSeconds: 4,
  /** Walkers in a crowd slow down a little, like people do. */
  crowdRadius: 60,
  crowdSlowdown: 0.75,
};

export const POLICE = {
  maxCars: 6,
  carSpeed: 560,
  officerSpeed: 210,
  ramDamage: 8,
  arrestRange: 46,
  wantedDecaySeconds: 14,
  heatPerCrime: 1,
  /** How far ahead of the player an interceptor aims, in world pixels. */
  interceptLead: 340,
  /** How far ahead on the player's heading a blocker stations itself. */
  blockAhead: 420,
  /** Extra speed a police car far behind the player may use to catch up.
   *  v2.1: 50, not 70 — with the hard cap below, no police car can ever
   *  outrun the player's car at its 620 top speed. */
  catchUpBoost: 50,
  /** Hard ceiling on any police car's speed, boost included. The player
   *  can always pull away on a straight; the chase wins by cutting the
   *  player off, not by being faster. */
  maxTopSpeed: 610,
  /** Seconds of continuous close contact before a bust lands. */
  bustSeconds: 0.9,
  bustRange: 70,
};

/** Wanted stars 0..5 and what each one sends after the player. */
export const WANTED = [
  { stars: 0, cars: 0, officers: 0 },
  { stars: 1, cars: 1, officers: 1 },
  { stars: 2, cars: 2, officers: 2 },
  { stars: 3, cars: 3, officers: 3 },
  { stars: 4, cars: 4, officers: 4 },
  { stars: 5, cars: 6, officers: 5 },
];

export const COMBAT = {
  bulletSpeed: 900,
  bulletDamage: 22,
  bulletRange: 520,
  shootCooldown: 0.28,
  ammoStart: 24,
  maxAmmo: 60,
  /** Below this many bullets the HUD warns the player to find ammo. */
  lowAmmoAt: 6,
};

export const CITY = {
  roadSpacing: 400,
  roadWidth: 96,
  sidewalk: 16,
  beachY: 2120,
  harbourX: 2920,
  /** Chance a city block is a park instead of buildings. */
  parkChance: 0.2,
  /** Street lamps stand this far apart along each road, on both sides. */
  lampSpacing: 200,
};

/** The six districts of Vice Harbor, west to east, north to south. */
export const DISTRICTS = [
  { name: 'Old Town', x: 0, y: 0, w: 1000, h: 800, tint: '#e8b04b' },
  { name: 'University', x: 1000, y: 0, w: 1000, h: 800, tint: '#7fb069' },
  { name: 'Downtown', x: 2000, y: 0, w: 1200, h: 1100, tint: '#5b8dd9' },
  { name: 'Marina', x: 2000, y: 1100, w: 1200, h: 700, tint: '#4fb3a9' },
  { name: 'Dockside', x: 0, y: 800, w: 1000, h: 900, tint: '#b08968' },
  { name: 'Beachfront', x: 1000, y: 1700, w: 1920, h: 420, tint: '#f4a261' },
];

/** Where the HUD pieces sit, in 1280 x 720 screen space. The layout
 *  keeps the top-left corner clear — the wanted stars and the health bar
 *  live in a compact strip at the bottom-left, above the mission
 *  objective, so a chase frame never hides a police car behind them. */
export const HUD = {
  statusX: 16,
  statusWidth: 190,
  minimapWidth: 220,
  minimapHeight: 165,
  objectiveWidth: 430,
  /** Minimum gap between a centred label and the left/right screen edge. */
  labelMarginX: 70,
  /** Minimum gap between a top label and the top screen edge. */
  labelMarginTop: 8,
  /** The district label's distance from the top edge, in pixels. */
  districtY: 18,
  /** The mission banner's distance from the top edge, in pixels. */
  bannerY: 46,
};

/** The safe zone for floating world labels (mission target names and the
 *  like), in 1280 x 720 screen space. A label's centre must stay inside
 *  these bounds, and out of the corner panels: the minimap and money
 *  column at the top right, the objective panel at the bottom left, and
 *  the speed readout at the bottom right. The renderer measures each
 *  label and clamps it into this zone, so "Harbor Market" can no longer
 *  sit half off the right edge and "St. Marina Hospital" can no longer
 *  hide behind the minimap. */
export const LABEL_SAFE = {
  /** Minimum distance from the left and right screen edges. */
  marginX: 96,
  /** Minimum distance from the top edge; labels never touch the district line. */
  marginTop: 96,
  /** Minimum distance from the bottom edge; the HUD band owns the bottom. */
  marginBottom: 200,
  /** The minimap's keep-out: labels above this y stay left of this x. */
  minimapBottomY: 268,
  minimapLeftX: 1000,
  /** The bottom-left objective panel's keep-out, for low labels. */
  panelTopY: 500,
  panelRightX: 480,
  /** The bottom-right speed readout's keep-out, for low labels. */
  speedTopY: 600,
  speedLeftX: 1080,
};

/** The cover chase framing: three police cars around the player's car,
 *  in screen pixels relative to the player — one behind-left, one
 *  ahead-right, one ahead-left — clear of every HUD panel. */
export const CHASE_FRAMING = [
  { dx: -280, dy: 60 },
  { dx: 320, dy: -100 },
  { dx: 220, dy: 260 },
];

/** The day and night clock: four phases across one full day, each with
 *  its own light level (1 is full daylight, 0.35 is deep night) and the
 *  lamp glow strength the renderer uses after dark. */
export const DAYNIGHT = {
  phases: [
    { name: 'Dawn', start: 0.0, light: 0.62, lamps: 0.55 },
    { name: 'Day', start: 0.15, light: 1.0, lamps: 0.0 },
    { name: 'Dusk', start: 0.55, light: 0.68, lamps: 0.5 },
    { name: 'Night', start: 0.72, light: 0.38, lamps: 1.0 },
  ],
  /** The clock starts in the late afternoon, so the first minutes play in daylight. */
  startPhase: 0.3,
};

/** Taxi fares: a passenger pays a base fare plus a per-pixel rate for the
 *  ride, and the meter ticks up while they sit in the car. */
export const TAXI = {
  baseFare: 30,
  perPixel: 0.045,
  maxFare: 320,
  /** Seconds a passenger waits at the kerb before giving up and leaving. */
  waitSeconds: 45,
  /** How close the car must be to pick a passenger up. */
  pickupRange: 80,
  /** How close the car must be to the destination to finish the ride. */
  dropoffRange: 110,
};

/** Otto's garage: three upgrade tracks, each with three levels. Prices
 *  rise per level; an engine level adds top speed, an armour level adds
 *  car health, a nitro level adds a stronger boost. */
export const GARAGE = {
  tracks: [
    { id: 'engine', name: 'Engine', prices: [250, 500, 900], bonusPerLevel: 55, blurb: '+55 top speed' },
    { id: 'armour', name: 'Armour', prices: [200, 450, 800], bonusPerLevel: 60, blurb: '+60 car health' },
    { id: 'nitro', name: 'Nitro', prices: [300, 600, 1000], bonusPerLevel: 1, blurb: 'faster launch' },
  ],
  /** How close Lena must be to the garage door to open the shop. */
  useRange: 130,
  /** The garage door sits at the Dockside Warehouse landmark. */
  place: 'Dockside Warehouse',
};

/** Hidden golden hubcaps: twelve of them, scattered across the city by
 *  the seeded random, each worth cash and score when Lena walks over it. */
export const COLLECTIBLES = {
  count: 12,
  value: 50,
  score: 100,
  pickupRange: 34,
};

/** The weather: clear spells and rain showers, on a seeded schedule.
 *  Rain makes the roads slippery — the player's car turns less sharply
 *  the harder it falls. */
export const WEATHER = {
  rainMinSeconds: 25,
  rainMaxSeconds: 60,
  clearMinSeconds: 40,
  clearMaxSeconds: 100,
  /** Grip lost in a full downpour: 1.0 dry, 0.75 in the heaviest rain. */
  gripLoss: 0.25,
};

/** Sunset palette: warm sun, teal sea, sand, asphalt, grass and neon. */
export const PALETTE = {
  backdrop: '#1a2233',
  grass: '#5c8a4d',
  grassLight: '#6b9a58',
  grassDark: '#4c7a40',
  park: '#4a7a3f',
  parkTree: '#2f5d2a',
  palmTrunk: '#8a6a4a',
  palmLeaf: '#3f8a4f',
  asphalt: '#33383f',
  asphaltDark: '#2a2e34',
  roadEdge: '#e8e4d8',
  roadLine: '#e8d44d',
  crosswalk: '#d8d4c8',
  sidewalk: '#8a8f96',
  sidewalkDark: '#767b82',
  building: '#6b5b73',
  buildingRoof: '#4a3f52',
  roofLight: '#7a6a80',
  windowLit: '#ffd97a',
  windowDark: '#3a3340',
  awning: '#e74c3c',
  awningAlt: '#f5f1e6',
  water: '#2e7f9e',
  waterDeep: '#256b87',
  waterShine: '#5fb3cf',
  sand: '#e8c98a',
  sandDark: '#d9b878',
  pier: '#7a5c3e',
  lampGlow: '#ffe9a8',
  lampPost: '#3a3f46',
  player: '#ffcf3f',
  playerCar: '#ffcf3f',
  policeCar: '#2f6fd0',
  policeLight: '#ff3b30',
  text: '#f5f1e6',
  muted: '#c9c2ae',
  panel: 'rgba(16, 20, 32, 0.88)',
  labelBack: 'rgba(10, 14, 24, 0.55)',
  gold: '#f2c94c',
  red: '#e5534b',
  green: '#4fc06a',
  blue: '#4fc3f7',
  neonPink: '#ff5fa2',
  neonCyan: '#4fe3d0',
  neonOrange: '#ff9f43',
  dusk: 'rgba(255, 140, 66, 0.07)',
  vignette: 'rgba(10, 8, 24, 0.22)',
  night: 'rgba(8, 12, 38, 0.55)',
  taxiGold: '#ffd34d',
  hubcap: '#ffe27a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (money, missions done, best score) is kept between visits. */
export const SAVE_KEY = 'vice-harbor.save.v1';
export const BEST_KEY = 'vice-harbor.best.v1';

/** Hard caps on live effects, so a long chase cannot grow them forever. */
export const LIMITS = {
  maxParticles: 400,
  maxSkids: 90,
};

/** Mission pay and the story's opening cash. */
export const ECONOMY = { startMoney: 120, missionPay: [150, 220, 300, 420, 600, 900] };

/** The game's name, shown on the title screen and in the dossier. */
export const GAME_NAME = 'Vice Harbor';
