// Placement et fonctionnement des attractions, boutiques, décor, chemins
import { G, RT, idx, inB, invalidateFields, spend, canAfford, addMsg, rideById } from './state.js';
import { RIDES, STALLS, SCENERY, FURNITURE, TERRAIN, PATH_COST, TERRAFORM_COST, COASTERS } from './config.js';
import { adjacentPaths, isPath } from './path.js';
import { STATION_PIECES, demolishCoaster, updateCoaster, pieceRange } from './coaster.js';

export const defOf = r => r.kind === 'coaster' ? COASTERS[r.type] : (RIDES[r.type] || STALLS[r.type]);

export function footprint(r) {
  if (r.kind === 'coaster') return r.pieces.slice(0, STATION_PIECES).map(p => [p.x, p.y]);
  const out = [];
  for (let dy = 0; dy < r.size; dy++) for (let dx = 0; dx < r.size; dx++) out.push([r.x + dx, r.y + dy]);
  return out;
}

// Tuiles de chemin normal par lesquelles on rejoint / quitte l'attraction
export function accessTiles(r) {
  if (r.kind === 'coaster' && r.pieces.length < STATION_PIECES) return [];
  if (r.kind === 'stall') return adjacentPaths(footprint(r));
  const t = [];
  if (r.exit) t.push([r.exit.x, r.exit.y]);
  if (r.entrance) t.push([r.entrance.x, r.entrance.y]);
  return adjacentPaths(t);
}
export function exitTiles(r) {
  if (r.kind === 'stall' || !r.exit) return accessTiles(r);
  return adjacentPaths([[r.exit.x, r.exit.y]]);
}

// ---------- Entrées / sorties d'attraction ----------
export function isGate(i) { return !!RT.gate?.[i]; }
export function gateAt(x, y) { return inB(x, y) ? RT.gate[idx(x, y)] || null : null; }

export function canPlaceGate(r, x, y) {
  if (!inB(x, y)) return 'Hors limites';
  const i = idx(x, y);
  const own = footprint(r);
  if (!own.some(([fx, fy]) => Math.abs(fx - x) + Math.abs(fy - y) === 1)) return r.kind === 'coaster' ? 'Doit toucher la gare' : 'Doit toucher l\'attraction';
  if (G.entrance.x === x && G.entrance.y === y) return 'Entrée du parc';
  const g = RT.gate[i];
  if (g && g.ride !== r) return 'Déjà une entrée/sortie ici';
  if (G.path[i]) return 'Un chemin occupe cet emplacement (démolissez-le)';
  if (RT.obj[i]) return 'Emplacement occupé';
  if (lowTrack(i)) return 'Une voie passe ici';
  if (G.terrain[i] === TERRAIN.WATER) return 'Impossible sur l\'eau';
  return null;
}

export function placeGate(r, kind, x, y) {
  const err = canPlaceGate(r, x, y);
  if (err) return err;
  const i = idx(x, y);
  const other = kind === 'entrance' ? 'exit' : 'entrance';
  if (r[other] && r[other].x === x && r[other].y === y) r[other] = null;
  if (r[kind]) RT.gate[idx(r[kind].x, r[kind].y)] = null;
  r[kind] = { x, y };
  RT.gate[i] = { ride: r, kind };
  G.scen[i] = null;
  invalidateFields();
  return null;
}

function removeGates(r) {
  for (const k of ['entrance', 'exit']) if (r[k]) { RT.gate[idx(r[k].x, r[k].y)] = null; }
}

function lowTrack(i, minClear = 3) {
  return (RT.track[i] || []).some(t => pieceRange(t.ride.pieces[t.k])[0] < minClear);
}

// ---------- Attractions plates et boutiques ----------
export function canPlaceRide(type, x, y) {
  const def = RIDES[type] || STALLS[type];
  if (!def) return 'Type inconnu';
  if (!canAfford(def.cost)) return 'Fonds insuffisants';
  for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!inB(tx, ty)) return 'Hors des limites';
    const i = idx(tx, ty);
    if (G.entrance.x === tx && G.entrance.y === ty) return 'Entrée du parc';
    if (G.path[i]) return 'Un chemin occupe cet emplacement';
    if (RT.obj[i] || RT.gate[i]) return 'Emplacement occupé';
    if (RT.track[i]?.length) return 'Une voie occupe cet emplacement';
    if (G.terrain[i] === TERRAIN.WATER) return 'Impossible de construire sur l\'eau';
  }
  return null;
}

export function placeRide(type, x, y) {
  const err = canPlaceRide(type, x, y);
  if (err) return { err };
  const def = RIDES[type] || STALLS[type];
  const count = G.rides.filter(r => r.type === type).length + 1;
  const r = {
    id: G.nextId++, kind: def.kind, type, name: `${def.name} ${count}`,
    x, y, size: def.size, status: def.kind === 'stall' ? 'open' : 'closed', price: def.price,
    queue: [], riders: [], phase: 'loading', entrance: null, exit: null, timer: 0, anim: 0,
    reliability: 100, age: 0, totalRiders: 0, income: 0, monthIncome: 0, lastMonthIncome: 0,
    value: def.cost, breakdownTimer: 0, sales: 0,
    ratings: def.kind === 'ride' ? { exc: def.exc, int: def.int, nau: def.nau } : null,
  };
  for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) {
    const i = idx(x + dx, y + dy);
    RT.obj[i] = r.id;
    G.scen[i] = null;
  }
  G.rides.push(r);
  spend('construction', def.cost);
  invalidateFields();
  return { ride: r };
}

export function demolishRide(r, hooks) {
  hooks.evict(r);
  removeGates(r);
  if (r.kind === 'coaster') demolishCoaster(r);
  else for (const [x, y] of footprint(r)) RT.obj[idx(x, y)] = 0;
  G.rides = G.rides.filter(q => q !== r);
  spend('construction', -Math.round(r.value * 0.5));
  invalidateFields();
}

export function setRideStatus(r, status, hooks) {
  if (r.kind === 'coaster' && (!r.complete || r.ratings?.fail) && status === 'open') return 'Le circuit doit être terminé et testé';
  if (r.status === 'broken') return 'L\'attraction est en panne, un mécanicien doit la réparer';
  if (status === 'open' && r.kind !== 'stall' && (!r.entrance || !r.exit)) return 'Placez d\'abord l\'entrée et la sortie de l\'attraction';
  r.status = status;
  if (status === 'closed') hooks.evictQueue(r, 'L\'attraction a fermé…');
  invalidateFields();
  return null;
}

// ---------- Chemins, décor, mobilier, terrain ----------
export const QUEUE_COST = 12;
export function canPath(x, y, kind = 1) {
  if (!inB(x, y)) return 'Hors limites';
  const i = idx(x, y);
  if (G.path[i] === kind) return 'Déjà un chemin';
  if (G.entrance.x === x && G.entrance.y === y) return 'Entrée du parc';
  if (RT.gate[i]) return 'Entrée/sortie d\'attraction';
  if (G.terrain[i] === TERRAIN.WATER) return 'Impossible sur l\'eau';
  if (RT.obj[i]) return 'Emplacement occupé';
  if (lowTrack(i)) return 'Une voie trop basse passe ici';
  if (!canAfford(kind === 2 ? QUEUE_COST : PATH_COST)) return 'Fonds insuffisants';
  return null;
}
export function placePath(x, y, kind = 1) {
  const err = canPath(x, y, kind);
  if (err) return err;
  const i = idx(x, y);
  G.path[i] = kind; G.scen[i] = null; G.furn[i] = kind === 2 ? null : G.furn[i];
  spend('construction', kind === 2 ? QUEUE_COST : PATH_COST);
  invalidateFields();
  return null;
}

export function canScenery(type, x, y) {
  if (!inB(x, y)) return 'Hors limites';
  const i = idx(x, y);
  if (G.path[i] || RT.obj[i] || RT.gate[i]) return 'Emplacement occupé';
  if (G.scen[i]) return 'Déjà du décor ici';
  if (lowTrack(i, 4)) return 'Une voie passe trop bas';
  if (G.terrain[i] === TERRAIN.WATER) return 'Impossible sur l\'eau';
  if (!canAfford(SCENERY[type].cost)) return 'Fonds insuffisants';
  return null;
}
export function placeScenery(type, x, y) {
  const err = canScenery(type, x, y);
  if (err) return err;
  G.scen[idx(x, y)] = type;
  spend('construction', SCENERY[type].cost);
  return null;
}

export function canFurniture(type, x, y) {
  if (!inB(x, y)) return 'Hors limites';
  const i = idx(x, y);
  if (G.path[i] !== 1) return 'À placer sur un chemin normal';
  if (G.furn[i]) return 'Déjà occupé';
  if (G.entrance.x === x && G.entrance.y === y) return 'Entrée du parc';
  if (!canAfford(FURNITURE[type].cost)) return 'Fonds insuffisants';
  return null;
}
export function placeFurniture(type, x, y) {
  const err = canFurniture(type, x, y);
  if (err) return err;
  G.furn[idx(x, y)] = type;
  spend('construction', FURNITURE[type].cost);
  invalidateFields();
  return null;
}

export function canTerraform(mode, x, y) {
  if (!inB(x, y)) return 'Hors limites';
  const i = idx(x, y);
  if (G.path[i] || RT.obj[i] || RT.gate[i] || RT.track[i]?.length || G.scen[i]) return 'Libérez d\'abord la tuile';
  if (G.entrance.x === x && G.entrance.y === y) return 'Entrée du parc';
  if (mode === 'water' && G.terrain[i] === TERRAIN.WATER) return 'Déjà de l\'eau';
  if (mode !== 'water' && G.terrain[i] === (mode === 'sand' ? TERRAIN.SAND : TERRAIN.GRASS)) return 'Rien à changer';
  if (!canAfford(TERRAFORM_COST)) return 'Fonds insuffisants';
  return null;
}
export function terraform(mode, x, y) {
  const err = canTerraform(mode, x, y);
  if (err) return err;
  G.terrain[idx(x, y)] = mode === 'water' ? TERRAIN.WATER : mode === 'sand' ? TERRAIN.SAND : TERRAIN.GRASS;
  spend('landscaping', TERRAFORM_COST);
  return null;
}

// Démolition à une tuile : renvoie un descriptif ou une erreur
export function demolishAt(x, y, hooks) {
  if (!inB(x, y)) return 'Hors limites';
  const i = idx(x, y);
  if (RT.gate[i]) {
    const { ride, kind } = RT.gate[i];
    RT.gate[i] = null; ride[kind] = null;
    if (ride.status === 'open') { ride.status = 'closed'; hooks.evictQueue(ride, `${ride.name} a fermé`); }
    invalidateFields();
    return null;
  }
  if (RT.obj[i]) { const r = rideById(RT.obj[i]); demolishRide(r, hooks); return null; }
  if (RT.track[i]?.length) { const r = RT.track[i][0].ride; demolishRide(r, hooks); return null; }
  if (G.furn[i]) { G.furn[i] = null; invalidateFields(); return null; }
  if (G.scen[i]) { G.scen[i] = null; spend('landscaping', 5); return null; }
  if (G.path[i]) {
    if (G.entrance.x === x && G.entrance.y === y) return 'Impossible de détruire l\'entrée';
    G.path[i] = 0; G.litter[i] = 0; G.vomit[i] = 0;
    spend('construction', -Math.round(PATH_COST / 2));
    invalidateFields();
    return null;
  }
  return 'Rien à démolir';
}

// ---------- Fonctionnement ----------
export function updateRides(dt, hooks) {
  for (const r of G.rides) {
    if (r.kind === 'stall') continue;
    if (r.kind === 'coaster') updateCoaster(r, dt, hooks);
    else updateFlatRide(r, dt, hooks);
    // pannes
    if (r.status === 'open') {
      r.breakdownTimer += dt;
      if (r.breakdownTimer > 15) {
        r.breakdownTimer = 0;
        const idle = r.kind === 'coaster' ? r.train?.state === 'loading' : r.phase === 'loading';
        const p = (100 - r.reliability) / 100 * 0.12 + 0.002;
        if (idle && Math.random() < p) breakDown(r, hooks);
      }
    }
  }
}

function updateFlatRide(r, dt, hooks) {
  const def = RIDES[r.type];
  if (r.phase === 'loading') {
    r.anim *= 0.95;
    if (r.status !== 'open') { r.timer = 0; return; }
    r.timer += dt;
    if (r.timer > 1) hooks.board(r, def.cap - r.riders.length, r.riders);
    if ((r.timer > 6 && r.riders.length > 0) || r.riders.length >= def.cap) {
      r.phase = 'running'; r.timer = 0;
    }
  } else {
    r.timer += dt;
    r.anim = Math.min(1, r.anim + dt * 0.5);
    if (r.timer >= def.dur) {
      r.phase = 'loading'; r.timer = 0;
      const riders = r.riders.splice(0);
      hooks.release(r, riders);
    }
  }
  r.spin = (r.spin || 0) + dt * (r.phase === 'running' ? 1 : 0.05);
}

function breakDown(r, hooks) {
  r.status = 'broken';
  r.reliability = Math.max(10, r.reliability - 3);
  hooks.evictQueue(r, `${r.name} est en panne !`);
  hooks.evictRiders(r);
  if (r.kind !== 'coaster') r.phase = 'loading';
  addMsg(`${r.name} est en panne ! Un mécanicien est nécessaire.`, { x: r.x, y: r.y }, 'warn');
  invalidateFields();
}

export function repairRide(r) {
  r.status = 'open';
  r.reliability = Math.min(100, r.reliability + 12);
  addMsg(`${r.name} a été réparé.`, { x: r.x, y: r.y }, 'good');
  invalidateFields();
}
