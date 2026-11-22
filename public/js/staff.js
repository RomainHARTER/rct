// Personnel : agents d'entretien, mécaniciens, animateurs
import { G, RT, idx, inB, spend, rideById, addMsg } from './state.js';
import { STAFF, FIRST_NAMES, DX, DY } from './config.js';
import { getField, stepToward, pathNeighbors, isPath } from './path.js';
import { accessTiles, repairRide } from './rides.js';

const SPEED = 1.3;

export function hireStaff(type) {
  const e = G.entrance;
  const def = STAFF[type];
  const count = G.staff.filter(s => s.type === type).length + 1;
  const s = {
    id: G.nextId++, type, name: `${def.name} ${count}`, first: FIRST_NAMES[(Math.random() * FIRST_NAMES.length) | 0],
    x: e.x + 0.5, y: e.y + 0.5, tx: e.x, ty: e.y, nx: e.x, ny: e.y, px: e.x, py: e.y,
    ox: (Math.random() - 0.5) * 0.3, oy: (Math.random() - 0.5) * 0.3,
    state: 'walk', timer: 0, done: 0,
  };
  G.staff.push(s);
  addMsg(`${s.first} a été embauché(e) comme ${def.name.toLowerCase()}.`);
  return s;
}

export function fireStaff(s) {
  G.staff = G.staff.filter(x => x !== s);
}

function dirtField() {
  const key = 'dirt:' + Math.floor(G.time / 3);
  return getField(key, () => {
    const out = [];
    for (let i = 0; i < G.litter.length; i++) if (G.path[i] && (G.litter[i] || G.vomit[i])) out.push(i);
    return out;
  });
}
function brokenField() {
  return getField('broken', () => {
    const out = [];
    for (const r of G.rides) if (r.status === 'broken') out.push(...accessTiles(r));
    return out;
  });
}

function adjacentBroken(x, y) {
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!inB(nx, ny)) continue;
    const i = idx(nx, ny);
    let r = RT.obj[i] ? rideById(RT.obj[i]) : null;
    if (!r && RT.track[i]?.length) r = RT.track[i][0].ride;
    if (r && r.status === 'broken') return r;
  }
  return null;
}

export function updateStaff(dt) {
  for (const s of G.staff) {
    if (s.state === 'work') {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.state = 'walk';
        if (s.type === 'handyman') { const i = idx(s.tx, s.ty); G.litter[i] = 0; G.vomit[i] = 0; s.done++; }
        if (s.type === 'mechanic') { const r = adjacentBroken(s.tx, s.ty); if (r) { repairRide(r); s.done++; } }
      }
      continue;
    }
    if (!isPath(s.tx, s.ty)) {
      const e = G.entrance;
      s.tx = s.nx = s.px = e.x; s.ty = s.ny = s.py = e.y; s.x = e.x + 0.5; s.y = e.y + 0.5;
    }
    const tx = s.nx + 0.5 + s.ox, ty = s.ny + 0.5 + s.oy;
    const dx = tx - s.x, dy = ty - s.y, dist = Math.hypot(dx, dy);
    const step = SPEED * dt;
    if (dist > step) { s.x += dx / dist * step; s.y += dy / dist * step; continue; }
    s.x = tx; s.y = ty; s.px = s.tx; s.py = s.ty; s.tx = s.nx; s.ty = s.ny;
    const i = idx(s.tx, s.ty);
    let field = null;
    if (s.type === 'handyman') {
      if (G.litter[i] || G.vomit[i]) { s.state = 'work'; s.timer = 1.5; continue; }
      field = dirtField();
    } else if (s.type === 'mechanic') {
      if (adjacentBroken(s.tx, s.ty)) { s.state = 'work'; s.timer = 4; continue; }
      field = brokenField();
    }
    if (field && field[i] > 0 && field[i] < 40) {
      const n = stepToward(field, s.tx, s.ty);
      if (n) { s.nx = n[0]; s.ny = n[1]; continue; }
    }
    const nb = pathNeighbors(s.tx, s.ty);
    if (!nb.length) continue;
    let opts = nb.filter(([x, y]) => !(x === s.px && y === s.py));
    if (!opts.length) opts = nb;
    const n = opts[(Math.random() * opts.length) | 0];
    s.nx = n[0]; s.ny = n[1];
  }
}

export function monthlyWages() {
  let total = 0;
  for (const s of G.staff) total += STAFF[s.type].wage;
  if (total) spend('wages', total);
}
