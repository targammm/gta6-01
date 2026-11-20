// Wanted level + police response. Stars rise with crime, cruisers hunt the
// player, and hiding long enough lets the heat cool off.
import { WANTED, MAX_POLICE, PALETTE } from './config.js';
import { clamp, dist2D } from './random.js';
import { spawnParkedCar, syncCarMesh } from './vehicles.js';

export function createPolice(state) {
  state.cops = [];
  state.wantedTimer = 0;
  state.copSpawnTimer = 0;
  state.bustedTimer = 0;
}

export function spawnPoliceCar(state, nearX, nearZ, flank) {
  const rng = state.rng;
  let x, z, angle;
  if (flank === 'front') {
    // Ahead and to the side, so the camera sees the whole cruiser.
    const px = state.player.inCar ? state.player.inCar.x : state.player.x;
    const pz = state.player.inCar ? state.player.inCar.z : state.player.z;
    const heading = state.player.inCar ? state.player.inCar.angle : state.player.heading;
    x = px + Math.sin(heading) * 24 + Math.cos(heading) * 4;
    z = pz + Math.cos(heading) * 24 - Math.sin(heading) * 4;
    angle = heading;
  } else if (flank === 'side') {
    const px = state.player.inCar ? state.player.inCar.x : state.player.x;
    const pz = state.player.inCar ? state.player.inCar.z : state.player.z;
    const heading = state.player.inCar ? state.player.inCar.angle : state.player.heading;
    x = px + Math.cos(heading) * 5 - Math.sin(heading) * 4;
    z = pz - Math.sin(heading) * 5 - Math.cos(heading) * 4;
    angle = heading;
  } else {
    const a = rng.angle();
    const r = rng.range(55, 80);
    x = nearX + Math.cos(a) * r;
    z = nearZ + Math.sin(a) * r;
    angle = rng.angle();
  }
  x = clamp(x, -200, 200);
  z = clamp(z, -200, 200);
  const car = spawnParkedCar(state, 'police', x, z, angle, PALETTE.policeWhite);
  car.police = true;
  car.traffic = false;
  car.parked = false;
  car.cruiseSpeed = 0;
  car.ramCooldown = 0;
  state.cops.push(car);
  return car;
}

export function updateWantedLevel(state, dt) {
  // Heat cools only while the player stays out of trouble and out of sight.
  if (state.wanted > 0) {
    state.wantedTimer += dt;
    const nearestCop = state.cops.reduce((m, c) => Math.min(m, dist2D(c.x, c.z, state.player.x, state.player.z)), 1e9);
    const hiding = nearestCop > 70 || state.cops.length === 0;
    if (state.wantedTimer > WANTED.decayDelay && hiding) {
      state.wanted = Math.max(0, state.wanted - WANTED.decayRate * dt);
      if (state.wanted < 0.4) {
        state.wanted = 0;
        state.hudMessage = 'You lost them. The heat is off — for now.';
        state.hudMessageT = 3;
      }
    }
  }
  // Spawn cruisers up to the wanted level's cap.
  const want = state.wanted >= 1 ? Math.min(MAX_POLICE, 1 + Math.floor(state.wanted)) : 0;
  state.copSpawnTimer -= dt;
  if (state.cops.length < want && state.copSpawnTimer <= 0) {
    spawnPoliceCar(state, state.player.x, state.player.z, null);
    state.copSpawnTimer = WANTED.spawnGap[Math.min(5, Math.floor(state.wanted))] || 6;
  }
  // Despawn the farthest cruiser when the heat is gone.
  if (state.wanted === 0 && state.cops.length > 0) {
    const car = state.cops.pop();
    const idx = state.cars.indexOf(car);
    if (idx >= 0) state.cars.splice(idx, 1);
    state.scene.remove(car.mesh);
  }
}

export function updatePoliceChase(state, dt) {
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const pz = state.player.inCar ? state.player.inCar.z : state.player.z;
  const targetSpeed = WANTED.copSpeed[Math.min(5, Math.floor(state.wanted))] || 0;
  for (const cop of state.cops) {
    const d = dist2D(cop.x, cop.z, px, pz);
    if (cop.ramCooldown > 0) cop.ramCooldown -= dt;
    const wantAngle = Math.atan2(px - cop.x, pz - cop.z);
    let da = wantAngle - cop.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const turn = clamp(da, -2.2 * dt, 2.2 * dt);
    cop.angle += turn;
    // Ram the player when close; otherwise close the gap fast. After a ram
    // the cruiser backs off for a beat instead of pinning the player's car.
    const desired = cop.ramCooldown > 0 ? 0 : d < 4 ? Math.max(0, targetSpeed * 0.4) : targetSpeed;
    cop.speed += clamp(desired - cop.speed, -20 * dt, 12 * dt);
    cop.x += Math.sin(cop.angle) * cop.speed * dt;
    cop.z += Math.cos(cop.angle) * cop.speed * dt;
    // Keep cruisers on the map and out of buildings.
    cop.x = clamp(cop.x, -205, 205);
    cop.z = clamp(cop.z, -205, 205);
    const hit = state.city.colliders.find((c) => Math.abs(cop.x - c.x) < c.hw + 1.4 && Math.abs(cop.z - c.z) < c.hd + 1.4);
    if (hit) {
      cop.x -= Math.sin(cop.angle) * cop.speed * dt * 2;
      cop.z -= Math.cos(cop.angle) * cop.speed * dt * 2;
      cop.angle += 0.6 * dt * 8;
    }
    // Ramming the player's car shakes it and slows it down — a nudge, not a pin.
    if (state.player.inCar && d < 4.2) {
      const car = state.player.inCar;
      car.speed *= (1 - 0.35 * dt);
      state.shake = Math.max(state.shake, 0.35);
      cop.ramCooldown = 1.2;
      if (state.rng.chance(0.02)) {
        state.player.health = Math.max(1, state.player.health - 1);
      }
    }
    if (d < 3 && !state.player.inCar) {
      state.bustedTimer += dt;
      if (state.bustedTimer > 2.5) {
        state.phase = 'busted';
        state.hudMessage = 'BUSTED — the Solmar Bay PD has you.';
        state.hudMessageT = 4;
      }
    } else {
      state.bustedTimer = Math.max(0, state.bustedTimer - dt);
    }
    syncCarMesh(cop);
  }
}
