// Solmar Bay r2 — boot + main loop. Fixed 1/60 s steps, render every frame,
// ?shot= staging runs the same simulation deterministically and then flags ready.
import { createWorld, stepWorld, startGame } from './world.js';
import { renderFrame } from './render.js';
import { applyShotStaging } from './shots.js';
import { updateHud } from './hud.js';
import { endInputStep } from './input.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || '20261120');

const canvas = document.getElementById('game');
const state = createWorld(canvas, seed);
window.__solmar = state;
window.__shotReady = false;

const FIXED = 1 / 60;
let accumulator = 0;
let last = performance.now();

if (shotName) {
  // Deterministic staging: run the real simulation forward, then render once.
  applyShotStaging(state, shotName, seed);
  updateHud(state); // refresh overlays after staging changed the phase
  renderFrame(state);
  window.__shotReady = true;
} else {
  // Title screen first; Enter starts the game.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && (state.phase === 'title' || state.phase === 'dead' || state.phase === 'busted')) {
      if (state.phase === 'title') startGame(state);
    }
  });
  canvas.addEventListener('mousedown', () => {
    if (state.phase === 'title') startGame(state);
  });

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED && steps < 5) {
      stepWorld(state, FIXED);
      accumulator -= FIXED;
      steps++;
    }
    if (steps === 5) accumulator = 0;
    renderFrame(state);
  }
  requestAnimationFrame(frame);
}
