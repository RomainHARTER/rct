// Souris, tactile et clavier
import { G, rideById, inB } from './state.js';
import { RIDES, STALLS, PIECES } from './config.js';
import { UI } from './uistate.js';
import { cam, screenToTile, pickAt } from './render.js';
import { placeRide, placePath, placeScenery, placeFurniture, terraform, demolishAt, placeGate } from './rides.js';
import { createCoaster, removeLastPiece, placeDesign } from './coaster.js';
import { hooks } from './guests.js';
import { flash, setTool, openRideWindow, openGuestWindow, openStaffWindow, openBuilder, buildPiece, closeAllWins, startGatePlacement, gatePlaced } from './ui.js';

const keys = new Set();
let drag = null;     // { mode: 'pan'|'paint', sx, sy, cx, cy, moved }
const pointers = new Map();
let pinch = null;

function applyTool(x, y, painting = false) {
  const t = UI.tool;
  if (!t) return;
  let err = null;
  switch (t.kind) {
    case 'path': err = placePath(x, y, t.queue ? 2 : 1); if (painting && err) err = null; break;
    case 'furn': err = placeFurniture(t.type, x, y); break;
    case 'scenery': err = placeScenery(t.type, x, y); if (painting && err) err = null; break;
    case 'terraform': err = terraform(t.mode, x, y); if (painting && err) err = null; break;
    case 'demolish': err = demolishAt(x, y, hooks); if (painting && err) err = null; break;
    case 'ride': {
      const def = RIDES[t.type] || STALLS[t.type];
      const ox = x - Math.floor((def.size - 1) / 2), oy = y - Math.floor((def.size - 1) / 2);
      const res = placeRide(t.type, ox, oy);
      if (res.err) err = res.err;
      else if (def.kind === 'ride') { openRideWindow(res.ride.id); startGatePlacement(res.ride, 'entrance'); flash(`${def.name} construit ! Placez son entrée (case verte) contre l'attraction.`, false); }
      break;
    }
    case 'gate': {
      const r = rideById(t.rideId);
      if (!r) { setTool(null); break; }
      err = placeGate(r, t.gate, x, y);
      if (!err) gatePlaced(r, t.gate);
      break;
    }
    case 'design': {
      const res = placeDesign(t.key, x, y, t.dir);
      if (res.err) err = res.err;
      else if (res.ride.ratings && !res.ride.ratings.fail) { openRideWindow(res.ride.id); startGatePlacement(res.ride, 'entrance'); flash(`${res.ride.name} construit ! Placez l'entrée contre la gare.`, false); }
      break;
    }
    case 'coasterStart': {
      const res = createCoaster(t.type, x, y, t.dir);
      if (res.err) err = res.err;
      else openBuilder(res.ride);
      break;
    }
  }
  if (err) flash(err);
}

const PAINT_TOOLS = new Set(['path', 'scenery', 'terraform', 'demolish']);

export function initInput(canvas) {
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.zoom };
      drag = null;
      return;
    }
    UI.mouse = { x: e.clientX, y: e.clientY };
    const touch = e.pointerType === 'touch';
    if (e.button === 2 || e.button === 1 || (touch && !UI.tool)) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, button: e.button, touch };
      return;
    }
    if (e.button !== 0) return;
    const t = screenToTile(e.clientX, e.clientY);
    UI.hover = t;
    if (UI.tool) {
      if (UI.tool.kind === 'coasterBuild') return;
      applyTool(t.x, t.y);
      if (PAINT_TOOLS.has(UI.tool?.kind)) drag = { mode: 'paint', last: `${t.x},${t.y}`, sx: e.clientX, sy: e.clientY };
      return;
    }
    selectAt(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      cam.zoom = Math.max(0.35, Math.min(3, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      return;
    }
    UI.mouse = { x: e.clientX, y: e.clientY };
    const t = screenToTile(e.clientX, e.clientY);
    UI.hover = inB(t.x, t.y) ? t : null;
    if (!drag) return;
    if (drag.mode === 'pan') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      cam.x = drag.cx - dx / cam.zoom; cam.y = drag.cy - dy / cam.zoom;
    } else if (drag.mode === 'paint' && UI.hover) {
      const k = `${t.x},${t.y}`;
      if (k !== drag.last) { drag.last = k; applyTool(t.x, t.y, true); }
    }
  });

  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag?.mode === 'pan' && !drag.moved) {
      if (drag.button === 2 && UI.tool) setTool(null);
      else if (drag.touch) selectAt(e.clientX, e.clientY);
    }
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!drag) UI.hover = null; });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nz = Math.max(0.35, Math.min(3, cam.zoom * f));
    // zoom centré sur le curseur
    const W = window.innerWidth, H = window.innerHeight;
    const wx = (e.clientX - W / 2) / cam.zoom + cam.x, wy = (e.clientY - H / 2) / cam.zoom + cam.y;
    cam.zoom = nz;
    cam.x = wx - (e.clientX - W / 2) / nz; cam.y = wy - (e.clientY - H / 2) / nz;
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    keys.add(e.key.toLowerCase());
    const t = UI.tool;
    if (e.key === 'Escape') { if (t) setTool(null); else closeAllWins(); UI.selected = null; }
    if (e.key === ' ') { UI.paused = !UI.paused; e.preventDefault(); }
    if (e.key.toLowerCase() === 'r' && (t?.kind === 'coasterStart' || t?.kind === 'design')) t.dir = (t.dir + 1) % 4;
    if (t?.kind === 'coasterBuild') {
      const r = rideById(t.rideId);
      if (!r) return;
      if (e.key === 'Backspace') { const err = removeLastPiece(r); if (err) flash(err); e.preventDefault(); }
      const p = Object.entries(PIECES).find(([, d]) => d.key === e.key);
      if (p) { buildPiece(r, p[0]); e.preventDefault(); }
      if (e.key.toLowerCase() === 'c') r.chainMode = !r.chainMode;
    } else if (!t) {
      if (e.key === '1') UI.speed = 1;
      if (e.key === '2') UI.speed = 2;
      if (e.key === '3') UI.speed = 4;
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
}

function selectAt(sx, sy) {
  const p = pickAt(sx, sy);
  UI.selected = p;
  if (!p) return;
  if (p.type === 'guest') openGuestWindow(p.id);
  else if (p.type === 'staff') openStaffWindow(p.id);
  else if (p.type === 'ride') openRideWindow(p.id);
}

export function updateCamera(dt) {
  const sp = 700 * dt / cam.zoom;
  if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) cam.x -= sp;
  if (keys.has('arrowright') || keys.has('d')) cam.x += sp;
  if (keys.has('arrowup') || keys.has('z') || keys.has('w')) cam.y -= sp;
  if (keys.has('arrowdown') || keys.has('s')) cam.y += sp;
}
