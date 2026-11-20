// Solmar Bay itself: avenues, sidewalks, towers, beach, harbour, props.
// Everything procedural — canvas textures for windows and road markings.
import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { clamp } from './random.js';

function makeWindowTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 22) {
    for (let x = 10; x < 118; x += 18) {
      const on = Math.random() < 0.42;
      g.fillStyle = on ? lit : 'rgba(20,30,44,0.85)';
      g.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f46';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2f3339';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
  g.fillStyle = '#d8d2a0';
  g.fillRect(8, 60, 40, 8);
  g.fillRect(80, 60, 40, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene, rng) {
  const colliders = []; // {x, z, hw, hd}
  const lamps = [];
  const group = new THREE.Group();
  scene.add(group);

  const roadTex = makeRoadTexture();
  const winTex = PALETTE.building.slice(0, 4).map((col, i) => {
    const hex = '#' + col.toString(16).padStart(6, '0');
    return makeWindowTexture(hex, ['#ffe9a8', '#bfe6ff', '#ffd2a0', '#fff6d8'][i]);
  });

  // Ground base (grass / dirt under everything).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 60, WORLD.half * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x8a7a5e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  // Beach sand + sea on the south edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 60, 46),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, WORLD.beachZ + 12);
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 60, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.15, WORLD.seaZ + 30);
  group.add(sea);

  // Avenues in both directions + sidewalks.
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const line of WORLD.roads) {
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.roadHalf * 2), roadMat.clone());
      road.material.map = roadTex.clone();
      road.material.map.needsUpdate = true;
      road.material.map.repeat.set(WORLD.half * 2 / 32, 1);
      road.rotation.x = -Math.PI / 2;
      if (vertical) road.rotation.z = Math.PI / 2;
      road.position.set(vertical ? line : 0, 0.05, vertical ? 0 : line);
      group.add(road);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, 5.5), walkMat);
        walk.rotation.x = -Math.PI / 2;
        if (vertical) walk.rotation.z = Math.PI / 2;
        walk.position.set(
          vertical ? line + side * (WORLD.roadHalf + 3.2) : 0,
          0.08,
          vertical ? 0 : line + side * (WORLD.roadHalf + 3.2),
        );
        group.add(walk);
      }
    }
  }

  // Buildings: one or two towers per block, height by district, rooftop props.
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5148 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa2a8 });
  const neonMats = PALETTE.neon.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  let neonIdx = 0;
  for (let bx = 0; bx < WORLD.roads.length - 1; bx++) {
    for (let bz = 0; bz < WORLD.roads.length - 1; bz++) {
      const x0 = WORLD.roads[bx] + WORLD.roadHalf + 4;
      const x1 = WORLD.roads[bx + 1] - WORLD.roadHalf - 4;
      const z0 = WORLD.roads[bz] + WORLD.roadHalf + 4;
      const z1 = WORLD.roads[bz + 1] - WORLD.roadHalf - 4;
      if (z0 > WORLD.beachZ - 8) continue; // keep the beach open
      const downtown = Math.abs((x0 + x1) / 2) < 95 && Math.abs((z0 + z1) / 2) < 95;
      const harbour = (z0 + z1) / 2 < -120;
      const count = rng.chance(0.55) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = (x1 - x0) / (count === 2 ? 2.1 : 1.15);
        const d = (z1 - z0) * (count === 2 ? 0.62 : 0.8);
        const cx = count === 2 ? x0 + w / 2 + i * (w + 3) : (x0 + x1) / 2;
        const cz = (z0 + z1) / 2 + (count === 2 ? (i === 0 ? -d * 0.18 : d * 0.18) : 0);
        const h = downtown ? rng.range(26, 62) : harbour ? rng.range(10, 20) : rng.range(10, 30);
        const tex = rng.pick(winTex);
        const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x554422, emissiveMap: tex, emissiveIntensity: 0.25 });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(cx, h / 2, cz);
        tower.castShadow = true;
        group.add(tower);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 1.2, d * 0.9), roofMat);
        roof.position.set(cx, h + 0.6, cz);
        group.add(roof);
        if (rng.chance(0.7)) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2.4), acMat);
          ac.position.set(cx + rng.range(-w / 4, w / 4), h + 1.8, cz + rng.range(-d / 4, d / 4));
          group.add(ac);
        }
        if (rng.chance(0.5)) {
          const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, rng.range(4, 9), 5), acMat);
          antenna.position.set(cx + w * 0.3, h + 4, cz - d * 0.3);
          group.add(antenna);
        }
        if (downtown && rng.chance(0.6)) {
          const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 2.2, 0.4), neonMats[neonIdx++ % neonMats.length]);
          sign.position.set(cx, Math.min(h - 3, 14), cz + d / 2 + 0.3);
          group.add(sign);
        }
        colliders.push({ x: cx, z: cz, hw: w / 2, hd: d / 2 });
      }
    }
  }

  // Street lamps along every avenue.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3136 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const line of WORLD.roads) {
    for (let t = -180; t <= 180; t += 36) {
      for (const [px, pz] of [[line + 8.6, t], [t, line + 8.6]]) {
        if (pz > WORLD.beachZ) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), poleMat);
        pole.position.set(px, 3.5, pz);
        group.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bulbMat);
        bulb.position.set(px, 7.1, pz);
        group.add(bulb);
        lamps.push(bulb);
      }
    }
  }

  // Palms along the beach + marina, hydrants and benches near intersections.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4a });
  for (let i = 0; i < 26; i++) {
    const px = -190 + i * 15 + rng.range(-4, 4);
    const pz = rng.chance(0.6) ? WORLD.beachZ + rng.range(2, 16) : rng.range(-150, 150);
    if (pz > WORLD.beachZ - 2 && pz < WORLD.beachZ + 20) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6, 6), trunkMat);
      trunk.position.set(px, 3, pz);
      trunk.rotation.z = rng.range(-0.12, 0.12);
      group.add(trunk);
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), frondMat);
        const a = (f / 5) * Math.PI * 2;
        frond.position.set(px + Math.cos(a) * 1.1, 6.4, pz + Math.sin(a) * 1.1);
        frond.rotation.z = Math.cos(a) * 0.9;
        frond.rotation.x = -Math.sin(a) * 0.9;
        group.add(frond);
      }
    }
  }
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc22e2e });
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const line of WORLD.roads) {
    for (const cross of WORLD.roads) {
      if (cross > WORLD.beachZ) continue;
      if (rng.chance(0.5)) {
        const hyd = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), hydrantMat);
        hyd.position.set(line + 10.5, 0.45, cross + 10.5);
        group.add(hyd);
      }
      if (rng.chance(0.4)) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.8), benchMat);
        bench.position.set(line - 10.5, 0.4, cross - 10.5);
        group.add(bench);
      }
    }
  }

  // Beach umbrellas.
  const umbMat = new THREE.MeshLambertMaterial({ color: 0xff6a5e });
  for (let i = 0; i < 8; i++) {
    const px = -160 + i * 44 + rng.range(-8, 8);
    const pz = WORLD.beachZ + 8 + rng.range(0, 10);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 5), poleMat);
    pole.position.set(px, 1.3, pz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 8), umbMat);
    top.position.set(px, 2.9, pz);
    group.add(top);
  }

  return { group, colliders, lamps, roadTex };
}

export function pointInBuilding(colliders, x, z, pad) {
  for (const c of colliders) {
    if (Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad) return c;
  }
  return null;
}

export function clampToCity(x, z) {
  const m = WORLD.half - 2;
  return { x: clamp(x, -m, m), z: clamp(z, -m, m) };
}
