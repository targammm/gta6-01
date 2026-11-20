// Combat: pistol shooting, enemy AI, health. Enemies take cover behind crates
// and shoot back; the player shoots with mouse aim from the third-person camera.
import * as THREE from 'three';
import { COMBAT, PLAYER } from './config.js';
import { clamp, dist2D } from './random.js';
import { muzzleFlash, burstSparks } from './effects.js';
import { playGunshot } from './audio.js';
import { addWanted } from './vehicles.js';

export function createCombat(state) {
  state.enemies = [];
  state.shotsFired = 0;
  state.lastShotT = 0;
  state.combat = {
    spawnEnemy: (s, x, z) => spawnEnemy(s, x, z),
  };
}

export function spawnEnemy(state, x, z) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.36, 0.9, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0x1c1c22 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.78), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  band.position.y = 1.35;
  group.add(band);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc98d64 }));
  head.position.y = 1.88;
  group.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.55), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.3, 1.25, -0.4);
  group.add(gun);
  group.position.set(x, 0, z);
  state.scene.add(group);
  const enemy = {
    mesh: group, x, z, angle: 0, health: COMBAT.enemyHealth,
    fireTimer: 1 + Math.random(), strafeDir: Math.random() < 0.5 ? 1 : -1,
    muzzleT: 0, dead: false,
  };
  state.enemies.push(enemy);
  return enemy;
}

// Shoot from the camera through the crosshair. Returns true on a hit.
export function playerShoot(state) {
  if (state.phase !== 'play') return false;
  if (state.time - state.lastShotT < COMBAT.fireRate) return false;
  state.lastShotT = state.time;
  state.shotsFired++;
  const cam = state.camera;
  const origin = new THREE.Vector3();
  cam.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const muzzle = origin.clone().add(dir.clone().multiplyScalar(1.2));
  muzzleFlash(state.fx, muzzle.x, muzzle.y, muzzle.z);
  playGunshot(state.audio);
  addWanted(state, 0, null);
  state.wantedTimer = 0;
  if (state.wanted < 1) addWanted(state, 1, 'Shots fired — someone called the cops');
  // Find the closest enemy or car the ray passes near.
  let best = null, bestT = COMBAT.pistolRange;
  for (const e of state.enemies) {
    const t = rayHit(origin, dir, e.x, 1.3, e.z, 1.1);
    if (t !== null && t < bestT) { best = { kind: 'enemy', ref: e }; bestT = t; }
  }
  for (const car of state.cars) {
    const t = rayHit(origin, dir, car.x, 1.0, car.z, 2.2);
    if (t !== null && t < bestT) { best = { kind: 'car', ref: car }; bestT = t; }
  }
  if (!best) return false;
  const hitPos = origin.clone().add(dir.clone().multiplyScalar(bestT));
  burstSparks(state.fx, hitPos.x, hitPos.y, hitPos.z, 10);
  if (best.kind === 'enemy') {
    const e = best.ref;
    e.health -= COMBAT.pistolDamage;
    e.muzzleT = 0.1;
    if (e.health <= 0) killEnemy(state, e);
  } else {
    const car = best.ref;
    car.speed *= 0.4;
    burstSparks(state.fx, hitPos.x, hitPos.y, hitPos.z, 6);
  }
  return true;
}

function rayHit(origin, dir, cx, cy, cz, radius) {
  // Ray vs vertical capsule approximated as a sphere at (cx, cy, cz).
  const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

export function killEnemy(state, enemy) {
  enemy.dead = true;
  burstSparks(state.fx, enemy.x, 1.4, enemy.z, 16);
  state.scene.remove(enemy.mesh);
  const idx = state.enemies.indexOf(enemy);
  if (idx >= 0) state.enemies.splice(idx, 1);
  if (state.enemiesToBeat > 0) state.enemiesToBeat--;
  state.xp += 25;
  state.hudMessage = 'Viper down! +25 XP';
  state.hudMessageT = 2;
}

export function updateEnemies(state, dt) {
  const px = state.player.x, pz = state.player.z;
  for (const e of [...state.enemies]) {
    if (e.dead) continue;
    const d = dist2D(e.x, e.z, px, pz);
    const wantAngle = Math.atan2(px - e.x, pz - e.z);
    let da = wantAngle - e.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    e.angle += clamp(da, -3 * dt, 3 * dt);
    if (d > 10) {
      e.x += Math.sin(e.angle) * COMBAT.enemySpeed * dt;
      e.z += Math.cos(e.angle) * COMBAT.enemySpeed * dt;
    } else {
      // Strafe sideways at close range so the fight moves.
      e.x += Math.cos(e.angle) * e.strafeDir * 1.6 * dt;
      e.z -= Math.sin(e.angle) * e.strafeDir * 1.6 * dt;
      if (Math.random() < 0.004) e.strafeDir *= -1;
    }
    e.mesh.position.set(e.x, 0, e.z);
    e.mesh.rotation.y = e.angle;
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && d < COMBAT.enemyRange && state.phase === 'play') {
      e.fireTimer = COMBAT.enemyFireRate * (0.8 + Math.random() * 0.5);
      e.muzzleT = 0.08;
      const mx = e.x + Math.sin(e.angle) * 0.6, mz = e.z + Math.cos(e.angle) * 0.6;
      muzzleFlash(state.fx, mx, 1.35, mz);
      playGunshot(state.audio);
      if (Math.random() < 0.45) {
        state.player.health = Math.max(0, state.player.health - COMBAT.enemyDamage);
        state.shake = Math.max(state.shake, 0.3);
        if (state.player.health <= 0) state.phase = 'dead';
      }
    }
    if (e.muzzleT > 0) e.muzzleT -= dt;
  }
}

export function playerPunch(state) {
  if (state.phase !== 'play' || state.player.inCar) return;
  let best = null, bestD = 2.4;
  for (const e of state.enemies) {
    const d = dist2D(e.x, e.z, state.player.x, state.player.z);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best) {
    best.health -= PLAYER.punchDamage;
    burstSparks(state.fx, best.x, 1.3, best.z, 6);
    if (best.health <= 0) killEnemy(state, best);
  }
}
