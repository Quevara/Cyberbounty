// Vice Harbor: every tuning number, colour and city constant in one place.
// The world is a fixed 3200 x 2400 top-down city; the camera shows a 1280 x 720
// window of it, so no rule below depends on the browser window size.

export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** The camera window, in world pixels, at the default zoom. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.45,
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
  colours: ['#c0392b', '#2e86c1', '#f1c40f', '#7d3c98', '#16a085', '#e67e22', '#95a5a6', '#ecf0f1'],
  models: ['Harbor Sedan', 'Marina Coupe', 'Bay Taxi', 'Dock Van', 'Sunset Hatch', 'Pier Pickup'],
};

export const PEDESTRIAN = {
  count: 26,
  speedMin: 38,
  speedMax: 72,
  colours: ['#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#9b59b6', '#1abc9c', '#fd79a8', '#fdcb6e'],
};

export const POLICE = {
  maxCars: 6,
  carSpeed: 560,
  officerSpeed: 210,
  ramDamage: 8,
  arrestRange: 46,
  wantedDecaySeconds: 14,
  heatPerCrime: 1,
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
};

export const CITY = {
  roadSpacing: 400,
  roadWidth: 96,
  sidewalk: 16,
  beachY: 2120,
  harbourX: 2920,
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

/** Sunset palette: warm sun, teal sea, sand, asphalt, grass and neon. */
export const PALETTE = {
  backdrop: '#1a2233',
  grass: '#5c8a4d',
  park: '#4a7a3f',
  asphalt: '#33383f',
  roadLine: '#e8d44d',
  sidewalk: '#8a8f96',
  building: '#6b5b73',
  buildingRoof: '#4a3f52',
  water: '#2e7f9e',
  sand: '#e8c98a',
  pier: '#7a5c3e',
  player: '#ffcf3f',
  playerCar: '#ffcf3f',
  policeCar: '#2f6fd0',
  policeLight: '#ff3b30',
  text: '#f5f1e6',
  muted: '#c9c2ae',
  panel: 'rgba(16, 20, 32, 0.88)',
  gold: '#f2c94c',
  red: '#e5534b',
  green: '#4fc06a',
  blue: '#4fc3f7',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (money, missions done, best score) is kept between visits. */
export const SAVE_KEY = 'vice-harbor.save.v1';
export const BEST_KEY = 'vice-harbor.best.v1';

/** Mission pay and the story's opening cash. */
export const ECONOMY = { startMoney: 120, missionPay: [150, 220, 300, 420, 600, 900] };

/** The game's name, shown on the title screen and in the dossier. */
export const GAME_NAME = 'Vice Harbor';
