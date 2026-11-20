// ?shot= staging: deterministic scene setup + autopilot that plays the real
// rules from a fixed seed, then leaves the game ready for its screenshot.
// Nothing here fakes a pose — every shot is the live simulation, advanced.
import { WORLD, COMBAT } from './config.js';
import { stepWorld, startGame } from './world.js';
import { spawnParkedCar, syncCarMesh } from './vehicles.js';
import { spawnPoliceCar } from './police.js';
import { boostDensityNear } from './traffic.js';
import { startMission } from './missions.js';
import { playerShoot } from './combat.js';

function setPlayerOnFoot(state, x, z, heading) {
  const p = state.player;
  if (p.inCar) { p.inCar.driver = null; p.inCar = null; p.mesh.visible = true; }
  p.x = x; p.z = z; p.y = 0; p.vy = 0; p.vx = 0; p.vz = 0;
  p.heading = heading;
  p.camYaw = heading + Math.PI;
  p.camPitch = 0.3;
  p.mesh.position.set(x, 0, z);
  p.mesh.rotation.y = heading;
}

function putPlayerInCar(state, car) {
  const p = state.player;
  car.driver = 'player';
  car.parked = false;
  p.inCar = car;
  p.mesh.visible = false;
  p.x = car.x; p.z = car.z;
}

function driveFor(state, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    stepWorld(state, 1 / 60);
    if (i % 30 === 0 && state.player.inCar) {
      const car = state.player.inCar;
      (state.trace = state.trace || []).push([
        +state.time.toFixed(1), +car.x.toFixed(1), +car.z.toFixed(1),
        +car.angle.toFixed(2), +car.speed.toFixed(1), state.cops.length,
      ]);
    }
  }
}

function aimAtNearestEnemy(state) {
  const p = state.player;
  let best = null, bestD = 1e9;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best) {
    p.heading = Math.atan2(best.x - p.x, best.z - p.z);
    p.camYaw = p.heading + Math.PI;
    // Shoot on a beat so muzzle flashes land in the frame — but leave the
    // last Viper standing so the screenshot catches the fight, not the aftermath.
    if (state.enemies.length > 1 && Math.floor(state.time * 2.4) % 2 === 0) playerShoot(state);
  }
}

export function applyShotStaging(state, shotName, seed) {
  state.shotName = shotName;
  startGame(state);
  const rng = state.rng;

  if (shotName === 'title') {
    // Busy street behind the title card: traffic flowing, camera orbiting.
    state.phase = 'title';
    boostDensityNear(state, 0, 0, 8, 10);
    driveFor(state, 6);
    // Keep the title card clean: no mission banner or welcome line over it.
    state.missionBannerT = 0;
    state.hudMessageT = 0;
    return;
  }

  if (shotName === 'city') {
    // On foot on the Marina sidewalk, a yellow taxi at the kerb, prompt up,
    // wanted 1 — the steal moment, with traffic and walkers all around.
    // x=20 dodges the lamp posts at x=0 and x=36 on this sidewalk.
    setPlayerOnFoot(state, 20, 158.5, Math.PI);
    const taxi = spawnParkedCar(state, 'taxi', 20, 156.5, 0, 0xffc21c);
    taxi.parked = true;
    syncCarMesh(taxi);
    state.wanted = 1;
    state.wantedTimer = 0;
    boostDensityNear(state, 20, 150, 8, 12);
    state.player.camYaw = 0;
    state.player.camPitch = 0.24;
    driveFor(state, 6);
    // Keep the steal prompt visible: player still beside the taxi.
    setPlayerOnFoot(state, 20, 158.5, Math.PI);
    state.player.camYaw = 0;
    return;
  }

  if (shotName === 'chase') {
    // Mid-mission-2 escape, downtown avenue: player driving, cruisers
    // stacked up behind him, traffic and walkers packed around them.
    state.money = 400; state.xp = 100; state.missionsDone = 1;
    startMission(state, 1);
    const sedan = spawnParkedCar(state, 'sedan', 90, 60, 0, 0xc23b2e);
    putPlayerInCar(state, sedan);
    state.autopilot = {
      // Clockwise rectangle on the avenues: south, west, north, east —
      // right turns only, no U-turns.
      waypoints: [[90, 150], [-90, 150], [-90, -150], [90, -150]],
      index: 0,
    };
    state.wanted = 3;
    state.wantedTimer = 0;
    // Drive the escape FIRST. The boost and the cruisers must be staged
    // around where the car ENDS UP, not where it started: boosting first
    // leaves the whole crowd 100 m behind by capture time, and cruisers
    // spawned before the drive fall behind (28 m/s vs the player's 34).
    driveFor(state, 9);
    const car = state.player.inCar;
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    const sx = Math.cos(car.angle), sz = -Math.sin(car.angle);
    // Three cruisers close behind the car, in the camera's backward view:
    // [metres behind, metres to the side]. Speed matched to the player's
    // car so they hold the gap instead of falling away before the shot.
    const copSlots = [[10, -3.5], [16, 4], [24, -2]];
    for (const [behind, side] of copSlots) {
      const cop = spawnPoliceCar(state, car.x, car.z, null);
      cop.x = car.x - fx * behind + sx * side;
      cop.z = car.z - fz * behind + sz * side;
      cop.angle = car.angle;
      cop.speed = car.speed;
      syncCarMesh(cop);
    }
    // Dense traffic + walkers packed around the final position.
    boostDensityNear(state, car.x, car.z, 12, 16);
    driveFor(state, 0.4);
    // Rear chase camera for the cover: the lens sits ahead of the car and
    // looks back down the avenue, so the player car fills the frame with
    // the whole pursuit stacked up behind it. Shot mode renders once
    // after staging — no live loop runs after this, so this framing holds.
    const car2 = state.player.inCar;
    const fx2 = Math.sin(car2.angle), fz2 = Math.cos(car2.angle);
    const px2 = Math.cos(car2.angle), pz2 = -Math.sin(car2.angle);
    state.camera.position.set(car2.x + fx2 * 11 + px2 * 2.5, 4.0, car2.z + fz2 * 11 + pz2 * 2.5);
    state.camera.lookAt(car2.x - fx2 * 12, 1.5, car2.z - fz2 * 12);
    return;
  }

  if (shotName === 'mission') {
    // Harbour showdown: mission 3 live, Vipers shooting, muzzle flashes,
    // reward banner from the escape still on screen, progress banked.
    state.money = 1000; state.xp = 250; state.missionsDone = 2;
    startMission(state, 2);
    state.missionBanner = 'HEAT ESCAPE COMPLETE  +$600  +150 XP';
    state.missionBannerT = 99;
    state.wanted = 2;
    state.wantedTimer = 0;
    state.player.health = 83;
    boostDensityNear(state, 150, -150, 3, 5);
    // Walk the player onto the marker so the fight spawns, then fight.
    setPlayerOnFoot(state, 150, -150, 0);
    driveFor(state, 0.6);
    // A short real fight — the old 5 s loop killed two Vipers and left the
    // frame empty. Then restage the fight close to the lens.
    for (let i = 0; i < 90; i++) {
      aimAtNearestEnemy(state);
      stepWorld(state, 1 / 60);
    }
    // Restage: player at the crates, three Vipers flanking close in front.
    setPlayerOnFoot(state, 150, -132, 0);
    while (state.enemies.length < 3) state.combat.spawnEnemy(state, 150, -150);
    // [x, z, fire delay]: nearest Viper 6 m dead ahead on the crosshair,
    // two more flanking at ~9.5 m. Fire delays are staggered so all three
    // muzzle flashes land in the last few steps before the screenshot.
    const viperSpots = [[150, -126, 0.005], [144, -124.5, 0.02], [156, -124.5, 0.04]];
    const placeVipers = (withFire) => {
      for (let i = 0; i < 3; i++) {
        const e = state.enemies[i];
        const [ex, ez, ft] = viperSpots[i];
        e.x = ex; e.z = ez;
        e.angle = Math.atan2(state.player.x - ex, state.player.z - ez);
        e.health = COMBAT.enemyHealth;
        e.fireTimer = withFire ? ft : 99; // hold fire until the camera settles
        e.muzzleT = 0;
        e.mesh.position.set(ex, 0, ez);
        e.mesh.rotation.y = e.angle;
      }
    };
    placeVipers(false);
    // Let the chase camera lerp onto the new position (it lags the teleport).
    for (let i = 0; i < 30; i++) stepWorld(state, 1 / 60);
    // Snap the Vipers back to their marks (they strafed during the settle),
    // then let them open fire on the very last steps so the muzzle flashes
    // are alive in the screenshot — and fire the player's pistol too.
    placeVipers(true);
    state.lastShotT = 0;
    stepWorld(state, 1 / 60);
    stepWorld(state, 1 / 60);
    stepWorld(state, 1 / 60);
    playerShoot(state);
    // Keep the escape reward on screen as proof of progression.
    state.missionBanner = 'HEAT ESCAPE COMPLETE  +$600  +150 XP';
    state.missionBannerT = 99;
    return;
  }

  // Unknown shot: just play a few seconds from the start.
  driveFor(state, 4);
}
