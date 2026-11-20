// Renderer: three.js scene, sun-soaked lighting, warm fog and the sky.
// One directional sun with shadows, one hemisphere fill, one big warm sky dome.
import * as THREE from 'three';
import { PALETTE } from './config.js';

export function createRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 120, 420);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 6, 55);

  // Late-afternoon sun, low enough for long shadows, warm enough for the coast.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(120, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));
  const warmBounce = new THREE.DirectionalLight(0xff9a5e, 0.35);
  warmBounce.position.set(-80, 40, -100);
  scene.add(warmBounce);

  // Sun disc + a few flat clouds for the skyline.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(18, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3c8, fog: false }),
  );
  sunDisc.position.set(180, 150, -260);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(9 + j * 4, 8, 6), cloudMat);
      puff.position.set(j * 10 - 10, j * 1.5, 0);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(-220 + i * 48, 95 + (i % 3) * 14, -240 + (i % 2) * 60);
    scene.add(cloud);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, sun };
}

export function renderFrame(state) {
  state.render.renderer.render(state.scene, state.camera);
}
