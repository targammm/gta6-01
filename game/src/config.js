// Solmar Bay — every tuning number, colour and story beat in one place.
// The city is a 420 m square grid of avenues; districts colour each quadrant.
export const GAME_NAME = 'SOLMAR BAY';
export const GAME_TAGLINE = 'A sun-soaked open-world crime story — Rico Vale is back in town, and the town owes him.';
export const HERO_NAME = 'Rico Vale';
export const SAVE_KEY = 'solmar-bay-save-v1';

export const WORLD = {
  half: 210,            // city extends -210..210 on x and z
  roadHalf: 7,          // half width of an avenue
  block: 60,            // block pitch (road centre to road centre)
  roads: [-150, -90, -30, 30, 90, 150], // avenue centre lines
  beachZ: 178,          // sand strip starts here (south edge)
  seaZ: 205,
};

export const PALETTE = {
  sky: 0xffd9a3, fog: 0xf7c98d, sun: 0xffe6b8, hemiSky: 0xbfd9ff, hemiGround: 0x8a6f52,
  asphalt: 0x3a3f46, asphaltLine: 0xd8d2a0, sidewalk: 0x9a938a, sand: 0xe8cf9a,
  sea: 0x2e7f9e, grass: 0x6f9e5a,
  building: [0xe8b48a, 0xd99a7a, 0xc9d6dd, 0xb7c4a8, 0xe0cfa8, 0x9fb8c8, 0xd8a0a0, 0xf0e0c0],
  glass: 0x7fb2d9, neon: [0xff5a7a, 0x37e0c8, 0xffc233, 0x7a86ff, 0xff8a3d],
  taxi: 0xffc21c, policeWhite: 0xf2f2f2, policeBlack: 0x1c2126,
};

export const PLAYER = {
  walkSpeed: 6, runSpeed: 11, jumpSpeed: 8.5, gravity: 24,
  radius: 0.7, height: 1.8, maxHealth: 100, punchDamage: 12,
};

export const DRIVING = {
  accel: 26, brake: 42, reverseAccel: 14, maxSpeed: 34, maxReverse: 10,
  steer: 1.9, grip: 6.5, drag: 0.55, enterRadius: 3.4,
};

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 26;
export const MAX_POLICE = 5;
export const SHOT_TRAFFIC_BOOST = 10;   // extra cars staged near the camera per shot
export const SHOT_PED_BOOST = 14;       // extra pedestrians staged near the camera per shot

export const WANTED = {
  steal: 1, hitPed: 1, hitCop: 2, shoot: 1, kill: 2,
  decayDelay: 14, decayRate: 0.12, max: 5,
  copSpeed: [0, 22, 25, 28, 31, 34],    // per wanted level
  spawnGap: [0, 9, 7, 5, 4, 3],
};

export const COMBAT = {
  pistolDamage: 34, pistolRange: 60, fireRate: 0.22, enemyHealth: 100,
  enemyDamage: 7, enemyRange: 34, enemyFireRate: 1.4, enemySpeed: 4.2,
};

export const MISSIONS = [
  {
    id: 'package-run', title: 'PACKAGE RUN', pay: 400, xp: 100,
    brief: 'Mara needs a package moved from the Marina to the Downtown drop. No questions. No cops.',
    steps: [
      { kind: 'goto', label: 'Pick up the package at the Marina', pos: [150, 150], radius: 7 },
      { kind: 'goto', label: 'Deliver the package to the Downtown drop', pos: [-30, -90], radius: 7 },
    ],
  },
  {
    id: 'heat-escape', title: 'HEAT ESCAPE', pay: 600, xp: 150,
    brief: 'The drop was watched. Three stars and every cruiser in Solmar Bay is on you. Lose them.',
    steps: [
      { kind: 'escape', label: 'Lose the cops — get your wanted level to zero', pos: [0, 0], radius: 0 },
      { kind: 'goto', label: 'Reach the hideout under the Coral Bridge', pos: [-150, 150], radius: 8 },
    ],
  },
  {
    id: 'harbor-showdown', title: 'HARBOR SHOWDOWN', pay: 1000, xp: 250,
    brief: 'The Vipers took the harbour cut. Take it back. Three of them guard the crates.',
    steps: [
      { kind: 'goto', label: 'Reach the harbour crates', pos: [150, -150], radius: 9 },
      { kind: 'fight', label: 'Clear the harbour — defeat all 3 Vipers', pos: [150, -150], radius: 0 },
      { kind: 'goto', label: 'Collect the harbour cut', pos: [150, -150], radius: 6 },
    ],
  },
];

export const DISTRICTS = [
  { name: 'MARINA', x0: 60, z0: 60, x1: 210, z1: 210, tint: 0x9fd4e0 },
  { name: 'DOWNTOWN', x0: -90, z0: -150, x1: 90, z1: 30, tint: 0xd8cfa8 },
  { name: 'HARBOR', x0: 60, z0: -210, x1: 210, z1: -60, tint: 0xb8c4c8 },
  { name: 'CORAL HILLS', x0: -210, z0: 60, x1: -60, z1: 210, tint: 0xe0b890 },
];

export const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look around'], ['Shift', 'Sprint'],
  ['Space', 'Jump'], ['E', 'Enter / steal car'], ['F / Click', 'Shoot'],
  ['R', 'Reload the mission'], ['P / Esc', 'Pause'], ['M', 'Mute'],
];

export function createDefaultSave() {
  return { money: 0, xp: 0, missionsDone: 0, bestMoney: 0, playTime: 0 };
}
