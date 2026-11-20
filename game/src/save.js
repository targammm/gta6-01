// Save / load through localStorage. Money, XP, missions and best stats persist.
import { createDefaultSave, SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return Object.assign(createDefaultSave(), data);
  } catch (err) { return null; }
}

export function writeSave(state) {
  try {
    const data = {
      money: state.money, xp: state.xp, missionsDone: state.missionsDone,
      bestMoney: Math.max(state.save?.bestMoney || 0, state.money),
      playTime: (state.save?.playTime || 0) + state.time,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.save = data;
    return true;
  } catch (err) { return false; }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
}

// Apply a loaded save onto fresh world state (called once at boot).
export function applySaveToState(state, save) {
  if (!save) return;
  state.money = save.money;
  state.xp = save.xp;
  state.missionsDone = Math.min(save.missionsDone, 3);
  state.save = save;
  state.hasSave = true;
}
