// Keyboard + mouse input. One shared object; systems read it, never the DOM.
export function createInput(canvas) {
  const input = {
    keys: Object.create(null),
    pressed: Object.create(null), // edge-triggered, consumed by systems each step
    mouseDX: 0, mouseDY: 0,
    locked: false,
    axisX: 0, axisZ: 0, // -1..1 movement axes
    anyKey: false,
  };

  function codeOf(e) { return e.code || e.key || ''; }

  window.addEventListener('keydown', (e) => {
    const c = codeOf(e);
    if (!input.keys[c]) input.pressed[c] = true;
    input.keys[c] = true;
    input.anyKey = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { input.keys[codeOf(e)] = false; });
  window.addEventListener('blur', () => { input.keys = Object.create(null); });

  canvas.addEventListener('mousedown', () => {
    input.pressed.Mouse0 = true;
    if (!input.locked && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch (err) { /* pointer lock is optional */ }
    }
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  // Drag-to-look fallback when pointer lock is unavailable (headless / screenshots).
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (dragging && !input.locked) {
      input.mouseDX += (e.clientX - lastX) * 1.6;
      input.mouseDY += (e.clientY - lastY) * 1.6;
      lastX = e.clientX; lastY = e.clientY;
    }
  });

  return input;
}

export function readMoveAxes(input) {
  const k = input.keys;
  const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  const strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  input.axisZ = fwd;
  input.axisX = strafe;
  return input;
}

export function wasPressed(input, code) {
  return !!input.pressed[code];
}

export function endInputStep(input) {
  input.pressed = Object.create(null);
  input.mouseDX = 0;
  input.mouseDY = 0;
  input.anyKey = false;
}

export function driveAxes(input) {
  const k = input.keys;
  const throttle = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  const steer = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
  return { throttle, steer, brake: !!k.Space, handbrake: !!k.KeyR };
}
