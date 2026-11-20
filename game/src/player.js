// Rico Vale on foot: third-person movement, sprint, jump, and the chase
// camera that follows him — or his car — through Solmar Bay.
import * as THREE from 'three';
import { PLAYER, WORLD } from './config.js';
import { clamp, damp, angleLerp } from './random.js';
import { pointInBuilding, clampToCity } from './city.js';
import { driveCar, exitCar, syncCarMesh } from './vehicles.js';
import { burstDust, dropSkid } from './effects.js';
import { playCrash } from './audio.js';

export function createPlayer(state) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f7a6e });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2c3e55 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.85, 3, 8), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.88;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0xe8c21c }));
  cap.position.y = 2.06;
  group.add(cap);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), jeans);
  legs.position.y = 0.4;
  group.add(legs);
  group.position.set(0, 0, 40);
  state.scene.add(group);
  state.player = {
    mesh: group, x: 0, z: 40, y: 0, vy: 0, vx: 0, vz: 0,
    heading: Math.PI, camYaw: Math.PI, camPitch: 0.32,
    health: PLAYER.maxHealth, inCar: null, onGround: true,
    walkPhase: 0, speedKmh: 0,
  };
}

export function updatePlayer(state, dt) {
  const p = state.player;
  const input = state.input;
  if (p.inCar) {
    updateDriving(state, dt);
    return;
  }
  // Mouse orbit.
  p.camYaw -= input.mouseDX * 0.0032;
  p.camPitch = clamp(p.camPitch + input.mouseDY * 0.0022, -0.15, 0.9);

  const sprint = input.keys.ShiftLeft || input.keys.ShiftRight;
  const speed = sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const fx = Math.sin(p.camYaw), fz = Math.cos(p.camYaw);
  const rx = Math.cos(p.camYaw), rz = -Math.sin(p.camYaw);
  const ix = input.axisX, iz = input.axisZ;
  let mx = fx * iz + rx * ix;
  let mz = fz * iz + rz * ix;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const targetVx = mx * speed, targetVz = mz * speed;
  p.vx = damp(p.vx, targetVx, 12, dt);
  p.vz = damp(p.vz, targetVz, 12, dt);
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const moving = Math.hypot(p.vx, p.vz);
  p.speedKmh = moving * 3.6;
  if (moving > 0.5) {
    p.heading = angleLerp(p.heading, Math.atan2(p.vx, p.vz), Math.min(1, 12 * dt));
    p.walkPhase += dt * moving * 1.4;
    if (Math.random() < dt * moving * 0.12) burstDust(state.fx, p.x, 0.1, p.z, 1, 1.2);
  }
  // Jump + gravity.
  if (input.pressed.Space && p.onGround) {
    p.vy = PLAYER.jumpSpeed;
    p.onGround = false;
  }
  p.vy -= PLAYER.gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  // Buildings block the player; the city edge clamps him.
  const hit = pointInBuilding(state.city.colliders, p.x, p.z, PLAYER.radius);
  if (hit) {
    const dx = p.x - hit.x, dz = p.z - hit.z;
    if (Math.abs(dx) / (hit.hw + PLAYER.radius) > Math.abs(dz) / (hit.hd + PLAYER.radius)) {
      p.x = hit.x + Math.sign(dx) * (hit.hw + PLAYER.radius);
    } else {
      p.z = hit.z + Math.sign(dz) * (hit.hd + PLAYER.radius);
    }
    p.vx *= 0.4; p.vz *= 0.4;
  }
  const c = clampToCity(p.x, p.z);
  p.x = c.x; p.z = c.z;
  // Slow health regen on foot, out of combat.
  if (p.health < PLAYER.maxHealth && state.wanted < 1) {
    p.health = Math.min(PLAYER.maxHealth, p.health + 2 * dt);
  }
  p.mesh.position.set(p.x, p.y + Math.abs(Math.sin(p.walkPhase)) * 0.06, p.z);
  p.mesh.rotation.y = p.heading;
}

function updateDriving(state, dt) {
  const p = state.player;
  const car = p.inCar;
  const input = state.input;
  p.camYaw -= input.mouseDX * 0.0032;
  p.camPitch = clamp(p.camPitch + input.mouseDY * 0.0022, -0.1, 0.7);
  const axes = { throttle: 0, steer: 0, brake: false };
  const k = input.keys;
  axes.throttle = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  axes.steer = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
  axes.brake = !!k.Space;
  const before = car.speed;
  driveCar(state, car, axes.throttle, axes.steer, axes.brake, dt);
  p.speedKmh = Math.abs(car.speed) * 3.6;
  // Skid marks + dust on hard turns at speed.
  if (Math.abs(car.speed) > 12 && Math.abs(axes.steer) > 0.4 && Math.random() < 0.5) {
    dropSkid(state.fx, car.x - Math.sin(car.angle) * 1.6, 0.05, car.z - Math.cos(car.angle) * 1.6, car.angle);
    burstDust(state.fx, car.x, 0.2, car.z, 2, 2);
  }
  // Building collision: bounce off with a crash sound.
  const hit = pointInBuilding(state.city.colliders, car.x, car.z, 1.4);
  if (hit) {
    const dx = car.x - hit.x, dz = car.z - hit.z;
    if (Math.abs(dx) / (hit.hw + 1.4) > Math.abs(dz) / (hit.hd + 1.4)) {
      car.x = hit.x + Math.sign(dx) * (hit.hw + 1.4);
    } else {
      car.z = hit.z + Math.sign(dz) * (hit.hd + 1.4);
    }
    if (Math.abs(car.speed) > 6) {
      playCrash(state.audio, Math.abs(car.speed) > 16);
      state.shake = Math.max(state.shake, 0.4);
      burstDust(state.fx, car.x, 0.5, car.z, 6, 3);
      car.speed *= -0.25;
    } else {
      car.speed *= 0.4;
    }
  }
  const c = clampToCity(car.x, car.z);
  car.x = c.x; car.z = c.z;
  // Bumping traffic / peds: traffic car slows, pedestrian gets scared.
  for (const other of state.cars) {
    if (other === car || other.driver === 'player') continue;
    const d = Math.hypot(other.x - car.x, other.z - car.z);
    if (d < 3.4 && Math.abs(car.speed) > 2) {
      const push = (3.4 - d) * 0.5;
      const nx = (other.x - car.x) / (d || 1), nz = (other.z - car.z) / (d || 1);
      other.x += nx * push; other.z += nz * push;
      other.speed = Math.max(other.speed, car.speed * 0.5);
      syncCarMesh(other);
      car.speed *= 0.85;
      if (Math.abs(before) > 8) {
        playCrash(state.audio, false);
        state.shake = Math.max(state.shake, 0.25);
      }
    }
  }
  if (input.pressed.KeyE) exitCar(state);
  syncCarMesh(car);
}

// Chase camera: behind the player or the car, lerped, with a little shake.
export function updateCamera(state, dt) {
  const p = state.player;
  const cam = state.camera;
  let tx, ty, tz, lx, ly, lz;
  if (p.inCar) {
    const car = p.inCar;
    const back = 9.5, up = 4.2;
    const yaw = car.angle + Math.PI + (p.camYaw - car.angle) * 0.12;
    tx = car.x + Math.sin(yaw) * back;
    tz = car.z + Math.cos(yaw) * back;
    ty = up + p.camPitch * 4;
    lx = car.x + Math.sin(car.angle) * 8;
    ly = 1.6;
    lz = car.z + Math.cos(car.angle) * 8;
  } else {
    const back = 7.5, up = 3.4;
    tx = p.x + Math.sin(p.camYaw) * back;
    tz = p.z + Math.cos(p.camYaw) * back;
    ty = up + p.camPitch * 4;
    lx = p.x - Math.sin(p.camYaw) * 4;
    ly = 1.7;
    lz = p.z - Math.cos(p.camYaw) * 4;
  }
  const k = 1 - Math.exp(-7 * dt);
  cam.position.x += (tx - cam.position.x) * k;
  cam.position.y += (ty - cam.position.y) * k;
  cam.position.z += (tz - cam.position.z) * k;
  if (state.shake > 0) {
    cam.position.x += (Math.random() - 0.5) * state.shake * 0.5;
    cam.position.y += (Math.random() - 0.5) * state.shake * 0.4;
    state.shake = Math.max(0, state.shake - dt * 1.8);
  }
  cam.lookAt(lx, ly, lz);
}
