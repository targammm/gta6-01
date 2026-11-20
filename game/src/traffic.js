// Traffic and pedestrians: cars cruise the avenues and turn at crossings,
// walkers stroll the sidewalks and step aside for the player.
import * as THREE from 'three';
import { WORLD, TRAFFIC_COUNT, PED_COUNT } from './config.js';
import { clamp, dist2D } from './random.js';
import { spawnRandomCar, syncCarMesh, driveCar } from './vehicles.js';
import { pointInBuilding } from './city.js';

function nearestRoadCoord(v) {
  let best = WORLD.roads[0], bd = 1e9;
  for (const r of WORLD.roads) {
    const d = Math.abs(v - r);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

export function createTraffic(state) {
  state.traffic = [];
  state.peds = [];
  const rng = state.rng;
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(WORLD.roads);
    const along = rng.range(-180, 180);
    const car = spawnRandomCar(state, vertical ? line : along, vertical ? along : line, vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2));
    car.traffic = true;
    car.parked = false;
    car.cruiseSpeed = rng.range(9, 15);
    car.vertical = vertical;
    car.line = line;
    car.dir = rng.chance(0.5) ? 1 : -1;
    state.traffic.push(car);
  }
  for (let i = 0; i < PED_COUNT; i++) spawnPedestrian(state, false);
}

export function spawnPedestrian(state, nearPlayer) {
  const rng = state.rng;
  let x, z;
  if (nearPlayer) {
    const a = rng.angle();
    const r = rng.range(8, 55);
    x = state.player.x + Math.cos(a) * r;
    z = state.player.z + Math.sin(a) * r;
  } else {
    const line = rng.pick(WORLD.roads);
    const along = rng.range(-180, 180);
    const side = rng.chance(0.5) ? 1 : -1;
    if (rng.chance(0.5)) { x = line + side * 10.2; z = along; }
    else { x = along; z = line + side * 10.2; }
  }
  x = clamp(x, -200, 200);
  z = clamp(z, -200, Math.min(200, WORLD.beachZ - 2));
  const colors = [0xe8e0d0, 0x3a6ea8, 0xc25a5a, 0x4a8a5a, 0xd8a03a, 0x7a5a9a];
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.85, 3, 8),
    new THREE.MeshLambertMaterial({ color: rng.pick(colors) }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
  head.position.y = 1.85;
  group.add(head);
  group.position.set(x, 0, z);
  state.scene.add(group);
  const ped = {
    mesh: group, x, z, angle: rng.angle(), speed: rng.range(1.1, 2.1),
    vertical: Math.abs(x - nearestRoadCoord(x)) < Math.abs(z - nearestRoadCoord(z)),
    line: 0, dir: rng.chance(0.5) ? 1 : -1, walkPhase: rng.range(0, 6),
    scared: 0,
  };
  ped.line = ped.vertical ? nearestRoadCoord(x) : nearestRoadCoord(z);
  state.peds.push(ped);
  return ped;
}

// Extra cars + walkers staged close to the camera for a dense screenshot.
export function boostDensityNear(state, cx, cz, cars, peds) {
  const rng = state.rng;
  for (let i = 0; i < cars; i++) {
    const vertical = rng.chance(0.5);
    const line = nearestRoadCoord(vertical ? cx + rng.range(-45, 45) : cz + rng.range(-45, 45));
    const along = rng.range(-45, 45);
    const car = spawnRandomCar(state,
      vertical ? line : cx + along, vertical ? cz + along : line,
      vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2));
    car.traffic = true;
    car.parked = false;
    car.cruiseSpeed = rng.range(9, 14);
    car.vertical = vertical;
    car.line = line;
    car.dir = rng.chance(0.5) ? 1 : -1;
    state.traffic.push(car);
  }
  for (let i = 0; i < peds; i++) spawnPedestrian(state, true);
}

function carAheadBlocked(state, car, dist) {
  const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
  for (const other of state.cars) {
    if (other === car || other.driver === 'player') continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < dist && side < 2.4) return true;
  }
  const px = state.player.x - car.x, pz = state.player.z - car.z;
  const alongP = px * fx + pz * fz;
  const sideP = Math.abs(px * fz - pz * fx);
  if (state.player.inCar !== car && alongP > 0 && alongP < dist && sideP < 2.2) return true;
  return false;
}

export function updateTraffic(state, dt) {
  for (const car of state.traffic) {
    if (car.driver === 'player') continue;
    // At a crossing, sometimes turn onto the other avenue.
    const onCross = Math.abs(car.x - nearestRoadCoord(car.x)) < 1.2 && Math.abs(car.z - nearestRoadCoord(car.z)) < 1.2;
    if (onCross && state.rng.chance(0.012)) {
      car.vertical = !car.vertical;
      car.line = car.vertical ? nearestRoadCoord(car.x) : nearestRoadCoord(car.z);
      car.dir = state.rng.chance(0.5) ? 1 : -1;
    }
    const targetAngle = car.vertical ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    let da = targetAngle - car.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    car.angle += clamp(da, -1.6 * dt, 1.6 * dt);
    const blocked = carAheadBlocked(state, car, 9);
    const want = blocked ? 0 : car.cruiseSpeed;
    car.speed += clamp(want - car.speed, -14 * dt, 8 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    // Stay on the avenue; wrap around the city edge.
    if (car.vertical) car.x += (car.line - car.x) * Math.min(1, 3 * dt);
    else car.z += (car.line - car.z) * Math.min(1, 3 * dt);
    if (car.x > 205) car.x = -205;
    if (car.x < -205) car.x = 205;
    if (car.z > 205) car.z = -205;
    if (car.z < -205) car.z = 205;
    syncCarMesh(car);
  }
}

export function updatePedestrians(state, dt) {
  for (const ped of state.peds) {
    const dPlayer = dist2D(ped.x, ped.z, state.player.x, state.player.z);
    if (dPlayer < 6 && state.player.inCar) ped.scared = 1.2;
    if (ped.scared > 0) {
      ped.scared -= dt;
      const away = Math.atan2(ped.x - state.player.x, ped.z - state.player.z);
      ped.x += Math.sin(away) * 3.4 * dt;
      ped.z += Math.cos(away) * 3.4 * dt;
      ped.angle = away;
    } else {
      const onCross = Math.abs(ped.x - nearestRoadCoord(ped.x)) < 1.5 && Math.abs(ped.z - nearestRoadCoord(ped.z)) < 1.5;
      if (onCross && state.rng.chance(0.008)) {
        ped.vertical = !ped.vertical;
        ped.dir = state.rng.chance(0.5) ? 1 : -1;
      }
      const targetAngle = ped.vertical ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      ped.angle += clamp(targetAngle - ped.angle, -2.4 * dt, 2.4 * dt);
      ped.x += Math.sin(ped.angle) * ped.speed * dt;
      ped.z += Math.cos(ped.angle) * ped.speed * dt;
      if (ped.x > 205) ped.x = -205;
      if (ped.x < -205) ped.x = 205;
      if (ped.z > WORLD.beachZ - 2) ped.z = WORLD.beachZ - 2;
      if (ped.z < -205) ped.z = 205;
    }
    ped.walkPhase += dt * 7;
    ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.05, ped.z);
    ped.mesh.rotation.y = ped.angle;
    // Keep walkers out of buildings.
    const hit = pointInBuilding(state.city.colliders, ped.x, ped.z, 0.4);
    if (hit) {
      ped.x -= Math.sin(ped.angle) * ped.speed * dt * 2;
      ped.z -= Math.cos(ped.angle) * ped.speed * dt * 2;
      ped.dir *= -1;
    }
  }
}
