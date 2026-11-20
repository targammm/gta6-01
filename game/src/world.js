// World state + the fixed 1/60 s step that runs every system in order.
// Shot staging reuses this exact step — the screenshots play real rules.
import * as THREE from 'three';
import { createSeededRandom } from './random.js';
import { createRender } from './render.js';
import { createCity } from './city.js';
import { createEffects, updateEffects } from './effects.js';
import { createAudio, ensureAudio, updateEngineSound, updateSirenSound, updateMusic, setMuted } from './audio.js';
import { createInput, readMoveAxes, endInputStep, wasPressed } from './input.js';
import { createPlayer, updatePlayer, updateCamera } from './player.js';
import { createTraffic, updateTraffic, updatePedestrians } from './traffic.js';
import { createPolice, updateWantedLevel, updatePoliceChase } from './police.js';
import { createCombat, updateEnemies, playerShoot, playerPunch } from './combat.js';
import { createMissions, updateMissions, startMission } from './missions.js';
import { createHud, updateHud } from './hud.js';
import { tryEnterCar, driveCar, spawnParkedCar, syncCarMesh } from './vehicles.js';
import { loadSave, applySaveToState, writeSave } from './save.js';
import { WORLD } from './config.js';

export function createWorld(canvas, seed) {
  const rng = createSeededRandom(seed);
  const render = createRender(canvas);
  const state = {
    rng, seed,
    scene: render.scene, camera: render.camera, render,
    time: 0, phase: 'title', paused: false,
    money: 0, xp: 0, missionsDone: 0, wanted: 0,
    cars: [], traffic: [], peds: [], cops: [], enemies: [],
    shake: 0, hudMessage: '', hudMessageT: 0,
    missionBanner: '', missionBannerT: 0,
    hasSave: false, save: null, saveTimer: 0,
    stolenCars: 0, autopilot: null, shotName: null,
    city: null, fx: null, audio: null, input: null, hud: null, minimapCtx: null,
  };
  state.city = createCity(state.scene, rng);
  state.fx = createEffects(state.scene);
  state.audio = createAudio();
  state.input = createInput(canvas);
  createPlayer(state);
  createTraffic(state);
  createPolice(state);
  createCombat(state);
  const save = loadSave();
  applySaveToState(state, save);
  createMissions(state);
  createHud(state);
  // A few parked cars waiting to be stolen, on road edges around town.
  const spotColors = { sedan: 0xc23b2e, taxi: 0xffc21c, pickup: 0x3aa655, van: 0xd8d2c4 };
  const spots = [
    ['sedan', 36, 150, 0], ['taxi', -84, 90, Math.PI / 2], ['sedan', -24, -30, 0],
    ['pickup', 96, -90, Math.PI], ['sedan', -150, 36, Math.PI / 2], ['van', 150, -24, 0],
  ];
  for (const [kind, x, z, angle] of spots) {
    spawnParkedCar(state, kind, x, z, angle, spotColors[kind] || 0x888888);
  }
  return state;
}

export function stepWorld(state, dt) {
  state.time += dt;
  const input = state.input;
  if (state.phase === 'title') {
    updateTraffic(state, dt);
    updatePedestrians(state, dt);
    updateEffects(state.fx, dt);
    // Slow attract orbit over downtown while the title card sits on top.
    const t = state.time * 0.05;
    state.camera.position.set(Math.sin(t) * 130, 72 + Math.sin(t * 0.7) * 6, Math.cos(t) * 130);
    state.camera.lookAt(0, 10, 0);
    updateHud(state);
    endInputStep(input);
    return;
  }
  if (state.phase === 'pause' || state.phase === 'dead' || state.phase === 'busted') {
    updateEffects(state.fx, dt);
    if (wasPressed(input, 'Enter')) respawnPlayer(state);
    if (wasPressed(input, 'KeyP') && state.phase === 'pause') state.phase = 'play';
    updateHud(state);
    endInputStep(input);
    return;
  }
  // --- play phase ---
  readMoveAxes(input);
  if (input.anyKey || wasPressed(input, 'Mouse0')) ensureAudio(state.audio);
  if (wasPressed(input, 'KeyM')) setMuted(state.audio, !state.audio.muted);
  if (wasPressed(input, 'KeyP') || wasPressed(input, 'Escape')) {
    state.phase = 'pause';
    endInputStep(input);
    updateHud(state);
    return;
  }
  if (wasPressed(input, 'KeyR')) restartMission(state);
  if (wasPressed(input, 'KeyE') && !state.player.inCar) {
    tryEnterCar(state);
    // Consume the press here: updatePlayer runs in the same step and its
    // driving branch would otherwise read the same KeyE as "exit the car".
    input.pressed.KeyE = false;
  }
  if (wasPressed(input, 'KeyF') || wasPressed(input, 'Mouse0')) {
    if (!state.player.inCar) playerShoot(state);
  }
  if (wasPressed(input, 'KeyV')) playerPunch(state);
  if (wasPressed(input, 'Enter') && state.phase === 'play') ensureAudio(state.audio);

  if (state.autopilot) runAutopilot(state, dt);
  else updatePlayer(state, dt);
  updateTraffic(state, dt);
  updatePedestrians(state, dt);
  updateWantedLevel(state, dt);
  updatePoliceChase(state, dt);
  updateMissions(state, dt);
  updateEnemies(state, dt);
  updateEffects(state.fx, dt);
  updateCamera(state, dt);
  const speedKmh = state.player.speedKmh || 0;
  updateEngineSound(state.audio, speedKmh, !!state.player.inCar);
  updateSirenSound(state.audio, state.wanted);
  updateMusic(state.audio, dt);
  if (state.hudMessageT > 0) state.hudMessageT -= dt;
  state.saveTimer += dt;
  if (state.saveTimer > 5) { state.saveTimer = 0; writeSave(state); }
  updateHud(state);
  endInputStep(input);
}

// Autopilot drives the staged car along waypoints (shot mode only).
function runAutopilot(state, dt) {
  const ap = state.autopilot;
  const p = state.player;
  if (!p.inCar) { updatePlayer(state, dt); return; }
  const car = p.inCar;
  const wp = ap.waypoints[ap.index];
  const dx = wp[0] - car.x, dz = wp[1] - car.z;
  const d = Math.hypot(dx, dz);
  if (d < 10) ap.index = (ap.index + 1) % ap.waypoints.length;
  const wantAngle = Math.atan2(dx, dz);
  let da = wantAngle - car.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, da * 1.4));
  // Slow hard for corners so the car turns inside the intersection instead
  // of overshooting into the block behind it: look at the NEXT leg while
  // approaching this waypoint and brake from 50 m out when it turns.
  const next = ap.waypoints[(ap.index + 1) % ap.waypoints.length];
  const nextAngle = Math.atan2(next[0] - car.x, next[1] - car.z);
  let nda = nextAngle - car.angle;
  while (nda > Math.PI) nda -= Math.PI * 2;
  while (nda < -Math.PI) nda += Math.PI * 2;
  const needTurn = Math.abs(da);
  let throttle = 1, brake = false;
  if (d < 50 && Math.abs(nda) > 0.5) { throttle = 0.25; brake = car.speed > 14; }
  else if (needTurn > 0.7) { throttle = 0.6; brake = car.speed > 14; }
  else if (d < 12) { throttle = 0.5; }
  driveCar(state, car, throttle, steer, brake, dt);
  // Keep the camera glued behind the car for a stable chase frame.
  p.camYaw = car.angle;
  p.camPitch = 0.22;
  syncCarMesh(car);
  updateCamera(state, dt);
  // Sync the chase camera's player position for the HUD/minimap.
  p.x = car.x; p.z = car.z;
  p.speedKmh = Math.abs(car.speed) * 3.6;
}

export function startGame(state) {
  ensureAudio(state.audio);
  state.phase = 'play';
  state.hudMessage = state.missionsDone > 0
    ? 'Welcome back, Rico. Mara has work for you.'
    : 'Welcome to Solmar Bay, Rico. Mara is waiting at the Marina.';
  state.hudMessageT = 4;
}

export function respawnPlayer(state) {
  const p = state.player;
  if (p.inCar) {
    p.inCar.driver = null;
    p.inCar = null;
    p.mesh.visible = true;
  }
  p.x = 0; p.z = 40; p.y = 0; p.vy = 0; p.vx = 0; p.vz = 0;
  p.health = 100;
  p.heading = Math.PI;
  state.money = Math.max(0, state.money - 200);
  state.wanted = 0;
  state.cops.length = 0;
  state.phase = 'play';
  state.hudMessage = 'Back on the street. $200 lighter.';
  state.hudMessageT = 3;
  writeSave(state);
}

export function restartMission(state) {
  if (!state.mission) return;
  const index = state.missionIndex;
  state.wanted = 0;
  state.player.health = 100;
  startMission(state, index);
}
