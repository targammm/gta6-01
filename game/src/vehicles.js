// Procedural cars: sedan, taxi, van, pickup and police cruiser.
// One factory, one arcade driving model, enter/exit with a wanted sting.
import * as THREE from 'three';
import { DRIVING, PALETTE } from './config.js';
import { clamp, damp } from './random.js';

const BODY_COLORS = [0xc23b2e, 0x2e6fc2, 0x3aa655, 0xd8d2c4, 0x22262c, 0x8a5fc2, 0xe08a2e, 0x4a90a4];

export function createCarMesh(kind, color) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181d });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1d2c3a, emissive: 0x0a1420 });
  const bodyLen = kind === 'van' ? 5.4 : kind === 'pickup' ? 5.2 : 4.6;
  const bodyW = 2.0;
  const bodyH = kind === 'van' ? 1.5 : 0.85;

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyLen), paint);
  body.position.y = 0.75;
  body.castShadow = true;
  car.add(body);

  if (kind === 'van') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.94, 0.7, bodyLen * 0.55), glass);
    cab.position.set(0, 1.75, -0.4);
    car.add(cab);
  } else if (kind === 'pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.92, 0.75, 1.7), glass);
    cab.position.set(0, 1.5, -0.9);
    car.add(cab);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.9, 0.35, 2.2), dark);
    bed.position.set(0, 1.2, 1.4);
    car.add(bed);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.86, 0.7, bodyLen * 0.48), glass);
    cabin.position.set(0, 1.42, -0.25);
    cabin.castShadow = true;
    car.add(cabin);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0e10 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    car.add(wheel);
    wheels.push(wheel);
  }

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), lightMat);
    head.position.set(sx, 0.8, -bodyLen / 2 - 0.03);
    car.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), tailMat);
    tail.position.set(sx, 0.8, bodyLen / 2 + 0.03);
    car.add(tail);
  }

  let lightBar = null;
  if (kind === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.5), dark);
    barBase.position.set(0, 1.95, -0.2);
    car.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.3, 2.05, -0.2);
    car.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    blue.position.set(0.3, 2.05, -0.2);
    car.add(blue);
    lightBar = { red, blue, phase: 0 };
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.02, 0.3, bodyLen * 0.9), new THREE.MeshLambertMaterial({ color: 0x1c2126 }));
    stripe.position.y = 0.75;
    car.add(stripe);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd21c }));
    sign.position.set(0, 1.95, -0.2);
    car.add(sign);
  }
  car.userData = { wheels, lightBar, bodyLen };
  return car;
}

export function spawnParkedCar(state, kind, x, z, angle, color) {
  const mesh = createCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = angle;
  state.scene.add(mesh);
  const car = {
    mesh, kind, x, z, angle, speed: 0, steer: 0,
    parked: true, traffic: false, police: kind === 'police',
    driver: null, color, honk: 0,
  };
  state.cars.push(car);
  return car;
}

export function spawnRandomCar(state, x, z, angle) {
  const rng = state.rng;
  const kind = rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'pickup']);
  const color = kind === 'taxi' ? PALETTE.taxi : rng.pick(BODY_COLORS);
  return spawnParkedCar(state, kind, x, z, angle, color);
}

// Arcade driving: throttle, steering that scales down with speed, drag, drift.
export function driveCar(state, car, throttle, steerInput, brake, dt) {
  const maxFwd = DRIVING.maxSpeed;
  const maxRev = DRIVING.maxReverse;
  if (throttle > 0) car.speed += DRIVING.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= DRIVING.brake * dt;
    else car.speed += DRIVING.reverseAccel * throttle * dt;
  }
  if (brake) car.speed -= Math.sign(car.speed) * DRIVING.brake * 0.7 * dt;
  car.speed -= car.speed * DRIVING.drag * dt;
  car.speed = clamp(car.speed, -maxRev, maxFwd);
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;

  const steerAuthority = clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.steer = damp(car.steer, steerInput * DRIVING.steer * steerAuthority, 8, dt);
  car.angle += car.steer * dt * clamp(Math.abs(car.speed) / 6, 0, 1.4) * (car.speed >= 0 ? 1 : -1) * 0.9;
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  return car.speed;
}

export function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  const spin = car.speed * 0.016;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  const bar = car.mesh.userData.lightBar;
  if (bar) {
    bar.phase += 0.016 * 14;
    const on = Math.sin(bar.phase) > 0;
    bar.red.material.color.setHex(on ? 0xff2020 : 0x551111);
    bar.blue.material.color.setHex(on ? 0x112266 : 0x2050ff);
  }
}

// Player steps into the nearest car. Stealing a car the player does not own
// raises the wanted level — that is the crime the whole game is about.
export function tryEnterCar(state) {
  if (state.player.inCar) return null;
  let best = null, bestD = DRIVING.enterRadius;
  for (const car of state.cars) {
    if (car.driver) continue;
    const d = Math.hypot(car.x - state.player.x, car.z - state.player.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return null;
  best.driver = 'player';
  best.parked = false;
  state.player.inCar = best;
  state.player.mesh.visible = false;
  if (!best.police) {
    state.stolenCars = (state.stolenCars || 0) + 1;
    addWanted(state, 1, 'Car stolen — witnesses called it in');
  }
  state.hudMessage = best.police ? 'Cruiser commandeered!' : 'Car stolen — get moving!';
  state.hudMessageT = 2.5;
  return best;
}

export function exitCar(state) {
  const car = state.player.inCar;
  if (!car) return;
  car.driver = null;
  state.player.inCar = null;
  state.player.mesh.visible = true;
  state.player.x = car.x + Math.cos(car.angle) * 2.4;
  state.player.z = car.z - Math.sin(car.angle) * 2.4;
  state.player.vx = 0; state.player.vz = 0;
  car.speed = 0;
}

export function addWanted(state, amount, reason) {
  const before = state.wanted;
  state.wanted = Math.min(5, state.wanted + amount);
  state.wantedTimer = 0;
  if (state.wanted > before && reason) {
    state.hudMessage = reason;
    state.hudMessageT = 2.5;
  }
}
