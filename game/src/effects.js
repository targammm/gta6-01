// Particles (dust, smoke, muzzle sparks, impact bursts) and skid marks.
// One pooled THREE.Points cloud; systems spawn bursts, the step fades them.
import * as THREE from 'three';
import { clamp } from './random.js';

const MAX_PARTICLES = 600;

export function createEffects(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.9,
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const skidGeo = new THREE.PlaneGeometry(0.5, 1.4);
  const skidMat = new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.55, depthWrite: false });
  return {
    points, positions, colors, geo,
    list: [], // {x,y,z,vx,vy,vz,life,maxLife,r,g,b}
    cursor: 0,
    skids: [], skidGeo, skidMat, scene,
    flash: null, flashLife: 0,
  };
}

function spawnParticle(fx, x, y, z, vx, vy, vz, life, r, g, b) {
  const i = fx.cursor;
  fx.cursor = (fx.cursor + 1) % MAX_PARTICLES;
  fx.list[i] = { x, y, z, vx, vy, vz, life, maxLife: life, r, g, b };
}

export function burstDust(fx, x, y, z, n, spread) {
  for (let i = 0; i < n; i++) {
    spawnParticle(fx, x, y + 0.1, z,
      (Math.random() - 0.5) * spread, Math.random() * 1.6, (Math.random() - 0.5) * spread,
      0.5 + Math.random() * 0.5, 0.72, 0.66, 0.55);
  }
}

export function burstSmoke(fx, x, y, z, n) {
  for (let i = 0; i < n; i++) {
    spawnParticle(fx, x, y + 0.3, z,
      (Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.4, (Math.random() - 0.5) * 1.2,
      0.8 + Math.random() * 0.8, 0.35, 0.35, 0.36);
  }
}

export function burstSparks(fx, x, y, z, n) {
  for (let i = 0; i < n; i++) {
    spawnParticle(fx, x, y, z,
      (Math.random() - 0.5) * 9, Math.random() * 5, (Math.random() - 0.5) * 9,
      0.25 + Math.random() * 0.3, 1.0, 0.75, 0.2);
  }
}

export function muzzleFlash(fx, x, y, z) {
  burstSparks(fx, x, y, z, 8);
  fx.flash = { x, y, z };
  fx.flashLife = 0.07;
}

export function dropSkid(fx, x, y, z, angle) {
  const mesh = new THREE.Mesh(fx.skidGeo, fx.skidMat.clone());
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = angle;
  mesh.position.set(x, y + 0.02, z);
  fx.scene.add(mesh);
  fx.skids.push({ mesh, life: 6 });
  if (fx.skids.length > 90) {
    const old = fx.skids.shift();
    fx.scene.remove(old.mesh);
    old.mesh.material.dispose();
  }
}

export function updateEffects(fx, dt) {
  const pos = fx.positions, col = fx.colors;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = fx.list[i];
    if (!p || p.life <= 0) { pos[i * 3 + 1] = -100; continue; }
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= 1.5 * dt;
    const a = clamp(p.life / p.maxLife, 0, 1);
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    col[i * 3] = p.r * a; col[i * 3 + 1] = p.g * a; col[i * 3 + 2] = p.b * a;
  }
  fx.geo.attributes.position.needsUpdate = true;
  fx.geo.attributes.color.needsUpdate = true;
  for (let i = fx.skids.length - 1; i >= 0; i--) {
    const s = fx.skids[i];
    s.life -= dt;
    s.mesh.material.opacity = clamp(s.life / 6, 0, 1) * 0.55;
    if (s.life <= 0) {
      fx.scene.remove(s.mesh);
      s.mesh.material.dispose();
      fx.skids.splice(i, 1);
    }
  }
  if (fx.flashLife > 0) fx.flashLife -= dt;
}
