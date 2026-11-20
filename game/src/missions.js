// Missions + story: a three-job chain with objectives, beacons, rewards.
// Mara, the fixer, calls the shots; the Vipers want the harbour cut.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { dist2D } from './random.js';
import { playMissionComplete, playPickup } from './audio.js';
import { writeSave } from './save.js';

export function createMissions(state) {
  state.missionIndex = Math.min(state.missionsDone, MISSIONS.length - 1);
  state.missionStep = 0;
  state.mission = null;
  state.missionBeacon = null;
  state.missionBanner = '';
  state.missionBannerT = 0;
  state.enemiesToBeat = 0;
  if (state.missionsDone >= MISSIONS.length) {
    state.storyDone = true;
    return;
  }
  startMission(state, state.missionIndex);
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  state.missionIndex = index;
  state.missionStep = 0;
  state.mission = def;
  state.storyDone = false;
  state.missionBanner = def.title + ' — ' + def.brief;
  state.missionBannerT = 5;
  state.hudMessage = 'New mission: ' + def.title;
  state.hudMessageT = 3;
  placeMissionBeacon(state);
  if (def.id === 'heat-escape') {
    // The drop was watched: the heat is already on.
    state.wanted = Math.max(state.wanted, 3);
  }
}

function placeMissionBeacon(state) {
  removeMissionBeacon(state);
  const step = state.mission.steps[state.missionStep];
  if (!step || step.kind === 'fight' || step.kind === 'escape') return;
  const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffc21c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.set(step.pos[0], 30, step.pos[1]);
  state.scene.add(beam);
  const ringGeo = new THREE.RingGeometry(3, 6.5, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc21c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(step.pos[0], 0.15, step.pos[1]);
  state.scene.add(ring);
  state.missionBeacon = { beam, ring, mat, ringMat, pulse: 0 };
}

export function removeMissionBeacon(state) {
  if (!state.missionBeacon) return;
  state.scene.remove(state.missionBeacon.beam);
  state.scene.remove(state.missionBeacon.ring);
  state.missionBeacon.beam.geometry.dispose();
  state.missionBeacon.ring.geometry.dispose();
  state.missionBeacon = null;
}

export function currentObjective(state) {
  if (state.storyDone) return 'Free roam — Solmar Bay is yours. Earn cash, dodge the law.';
  if (!state.mission) return '';
  const step = state.mission.steps[state.missionStep];
  return step ? state.mission.title + ': ' + step.label : '';
}

export function missionTargetPos(state) {
  if (!state.mission || state.storyDone) return null;
  const step = state.mission.steps[state.missionStep];
  return step && step.pos ? { x: step.pos[0], z: step.pos[1] } : null;
}

function advanceMissionStep(state) {
  state.missionStep++;
  playPickup(state.audio);
  if (state.missionStep >= state.mission.steps.length) {
    completeMission(state);
  } else {
    placeMissionBeacon(state);
    const step = state.mission.steps[state.missionStep];
    state.hudMessage = step.label;
    state.hudMessageT = 3;
    if (step.kind === 'fight') {
      state.enemiesToBeat = 3;
      spawnMissionEnemies(state, step.pos[0], step.pos[1]);
    }
  }
}

function completeMission(state) {
  const def = state.mission;
  state.money += def.pay;
  state.xp += def.xp;
  state.missionsDone++;
  state.missionBanner = def.title + ' COMPLETE  +$' + def.pay + '  +' + def.xp + ' XP';
  state.missionBannerT = 5;
  state.hudMessage = def.title + ' complete! +$' + def.pay;
  state.hudMessageT = 4;
  playMissionComplete(state.audio);
  removeMissionBeacon(state);
  state.mission = null;
  writeSave(state);
  if (state.missionsDone >= MISSIONS.length) {
    state.storyDone = true;
    state.missionBanner = 'STORY COMPLETE — Rico Vale owns Solmar Bay. Free roam!';
    state.missionBannerT = 6;
  } else {
    startMission(state, state.missionsDone);
  }
}

export function updateMissions(state, dt) {
  if (state.missionBannerT > 0) state.missionBannerT -= dt;
  if (state.missionBeacon) {
    state.missionBeacon.pulse += dt;
    const s = 1 + Math.sin(state.missionBeacon.pulse * 3) * 0.12;
    state.missionBeacon.ring.scale.set(s, s, 1);
    state.missionBeacon.mat.opacity = 0.28 + Math.sin(state.missionBeacon.pulse * 3) * 0.1;
  }
  if (!state.mission || state.storyDone) return;
  const step = state.mission.steps[state.missionStep];
  if (!step) return;
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const pz = state.player.inCar ? state.player.inCar.z : state.player.z;
  if (step.kind === 'goto') {
    if (dist2D(px, pz, step.pos[0], step.pos[1]) < step.radius) advanceMissionStep(state);
  } else if (step.kind === 'escape') {
    if (state.wanted < 0.5) advanceMissionStep(state);
  } else if (step.kind === 'fight') {
    if (state.enemiesToBeat <= 0 && state.enemies.length === 0) advanceMissionStep(state);
  }
}

// Enemies for the harbour fight. They are spawned by the mission, not by combat.
export function spawnMissionEnemies(state, cx, cz) {
  const spots = [[-8, -6], [7, -9], [2, 8]];
  for (const [dx, dz] of spots) {
    state.combat.spawnEnemy(state, cx + dx, cz + dz);
  }
}
