// Montagnes russes : géométrie du circuit, construction, physique, notes
import { G, RT, idx, inB, addTrackRef, removeTrackRef, invalidateFields, spend, canAfford, addMsg } from './state.js';
import { COASTERS, PIECES, DX, DY, TILE_M, H_M, G_ACC, TERRAIN } from './config.js';

export const STATION_PIECES = 3;
const CAR_SP = 2.6;          // espacement des wagons (m)
const STATION_V = 2.5;       // vitesse en gare (m/s)
const CHAIN_V = 3.2;         // vitesse du lift (m/s)
const BOOST_V = 20;          // vitesse visée par les propulseurs (m/s)
const CLEARANCE = 3;         // dégagement vertical entre deux voies

// ---------- Géométrie ----------
export function nextCursor(type, c) {
  const def = PIECES[type];
  const dir = (c.dir + (def.turn || 0) + 4) % 4;
  return { x: c.x + DX[dir], y: c.y + DY[dir], h: c.h + def.dh, dir };
}

export function makePiece(type, c, chain = false) {
  const n = nextCursor(type, c);
  const def = PIECES[type];
  return { type, x: c.x, y: c.y, h: c.h, dir: c.dir, eh: c.h + def.dh, edir: n.dir, chain: chain && def.dh > 0 };
}

export function pieceLen(p) {
  const def = PIECES[p.type];
  if (def.turn) return TILE_M * Math.PI / 4;
  const dz = (p.eh - p.h) * H_M;
  return Math.hypot(TILE_M, dz);
}

// Point sur la pièce, t ∈ [0,1], en coordonnées tuile (x,y) et unités de hauteur (z)
export function piecePoint(p, t) {
  const vdx = DX[p.dir], vdy = DY[p.dir];
  const ex = p.x + 0.5 - 0.5 * vdx, ey = p.y + 0.5 - 0.5 * vdy;
  if (p.dir === p.edir) {
    return { x: ex + t * vdx, y: ey + t * vdy, z: p.h + (p.eh - p.h) * t };
  }
  const d2 = p.edir;
  const kx = ex + 0.5 * DX[d2], ky = ey + 0.5 * DY[d2];
  const a = t * Math.PI / 2;
  return { x: kx + 0.5 * (-DX[d2] * Math.cos(a) + vdx * Math.sin(a)), y: ky + 0.5 * (-DY[d2] * Math.cos(a) + vdy * Math.sin(a)), z: p.h };
}

export function computeGeometry(r) {
  let s = 0;
  for (const p of r.pieces) { p.s0 = s; p.len = pieceLen(p); s += p.len; }
  r.length = s;
}

function pieceIndexAt(r, s) {
  const ps = r.pieces;
  let lo = 0, hi = ps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ps[mid].s0 <= s) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function wrapS(r, s) { const L = r.length; return ((s % L) + L) % L; }

export function posAt(r, s) {
  s = wrapS(r, s);
  const k = pieceIndexAt(r, s);
  const p = r.pieces[k];
  const pt = piecePoint(p, Math.min(1, (s - p.s0) / p.len));
  pt.k = k;
  return pt;
}

function p3(r, s) { const p = posAt(r, s); return [p.x * TILE_M, p.y * TILE_M, p.z * H_M]; }

function slopeAt(r, s) {
  const p = r.pieces[pieceIndexAt(r, wrapS(r, s))];
  return (p.eh - p.h) * H_M / p.len;
}

// ---------- Construction ----------
export function pieceRange(p) { return [Math.min(p.h, p.eh), Math.max(p.h, p.eh)]; }

export function checkPiece(r, p) {
  const def = COASTERS[r.type];
  if (!inB(p.x, p.y)) return 'Hors des limites du parc';
  const i = idx(p.x, p.y);
  const [lo, hi] = pieceRange(p);
  if (lo < 0) return 'Impossible de descendre sous le sol';
  if (hi > def.maxH) return `Hauteur maximale atteinte (${def.maxH})`;
  if (G.entrance.x === p.x && G.entrance.y === p.y) return 'Entrée du parc';
  if (RT.obj[i]) return 'Une attraction occupe cet emplacement';
  if (G.terrain[i] === TERRAIN.WATER && lo < 1) return 'Il faut surélever la voie au-dessus de l\'eau';
  if (G.path[i] && lo < CLEARANCE) return 'Un chemin est en dessous (hauteur 3 minimum)';
  for (const t of RT.track[i] || []) {
    const q = t.ride.pieces[t.k];
    const [qlo, qhi] = pieceRange(q);
    if (!(lo >= qhi + CLEARANCE || hi + CLEARANCE <= qlo)) return 'Collision avec une autre voie';
  }
  return null;
}

export function stationTiles(x, y, dir) {
  const out = [];
  for (let k = 0; k < STATION_PIECES; k++) out.push([x + DX[dir] * k, y + DY[dir] * k]);
  return out;
}

export function canStartCoaster(type, x, y, dir) {
  const def = COASTERS[type];
  const cost = def.stationCost * STATION_PIECES;
  if (!canAfford(cost)) return 'Fonds insuffisants';
  const fake = { type, pieces: [] };
  let c = { x, y, h: 0, dir };
  for (let k = 0; k < STATION_PIECES; k++) {
    const p = makePiece('station', c);
    const err = checkPiece(fake, p);
    if (err) return err;
    c = nextCursor('station', c);
  }
  return null;
}

export function createCoaster(type, x, y, dir) {
  const err = canStartCoaster(type, x, y, dir);
  if (err) return { err };
  const def = COASTERS[type];
  const count = G.rides.filter(r => r.type === type).length + 1;
  const r = {
    id: G.nextId++, kind: 'coaster', type, name: `${def.name} ${count}`,
    x, y, size: 1, status: 'building', price: def.price, queue: [],
    pieces: [], start: { x, y, dir }, cursor: { x, y, h: 0, dir },
    complete: false, ratings: null, reliability: 100, age: 0,
    totalRiders: 0, income: 0, monthIncome: 0, lastMonthIncome: 0, value: 0,
    train: null, color: def.color, chainMode: false, breakdownTimer: 0,
  };
  G.rides.push(r);
  for (let k = 0; k < STATION_PIECES; k++) appendPiece(r, 'station', true);
  spend('construction', def.stationCost * STATION_PIECES);
  r.value += def.stationCost * STATION_PIECES;
  return { ride: r };
}

export function previewPiece(r, type) {
  return makePiece(type, r.cursor, r.chainMode);
}

export function canAppend(r, type) {
  if (r.complete) return 'Circuit déjà terminé';
  const def = COASTERS[r.type];
  if (type === 'booster' && !def.boost) return 'Pas de propulseur sur ce modèle';
  if (!canAfford(def.pieceCost)) return 'Fonds insuffisants';
  const p = makePiece(type, r.cursor, r.chainMode);
  return checkPiece(r, p);
}

export function appendPiece(r, type, free = false) {
  if (!free) {
    const err = canAppend(r, type);
    if (err) return err;
  }
  const p = makePiece(type, r.cursor, r.chainMode);
  r.pieces.push(p);
  addTrackRef(r, r.pieces.length - 1);
  if (Math.min(p.h, p.eh) < 4) G.scen[idx(p.x, p.y)] = null; // le décor gênant est rasé
  r.cursor = nextCursor(type, r.cursor);
  if (!free) {
    const cost = COASTERS[r.type].pieceCost;
    spend('construction', cost);
    r.value += cost;
  }
  invalidateFields();
  const s = r.start;
  if (r.pieces.length > STATION_PIECES && r.cursor.x === s.x && r.cursor.y === s.y && r.cursor.h === 0 && r.cursor.dir === s.dir) {
    completeCoaster(r);
  }
  return null;
}

export function removeLastPiece(r) {
  if (r.pieces.length <= STATION_PIECES) return 'La gare ne peut pas être retirée (démolissez l\'attraction)';
  const k = r.pieces.length - 1;
  const p = r.pieces[k];
  removeTrackRef(r, k);
  r.pieces.pop();
  r.cursor = { x: p.x, y: p.y, h: p.h, dir: p.dir };
  r.complete = false;
  r.ratings = null;
  r.status = 'building';
  r.train = null;
  const refund = Math.round(COASTERS[r.type].pieceCost * 0.75);
  spend('construction', -refund);
  r.value -= COASTERS[r.type].pieceCost;
  invalidateFields();
  return null;
}

function completeCoaster(r) {
  r.complete = true;
  computeGeometry(r);
  const res = testRun(r);
  r.ratings = res;
  if (res.fail) {
    r.status = 'closed';
    addMsg(`${r.name} : essai échoué — ${res.fail}`, { x: r.x, y: r.y }, 'warn');
  } else {
    r.status = 'closed';
    addMsg(`${r.name} terminé ! Excitation ${res.exc.toFixed(2)}, Intensité ${res.int.toFixed(2)}, Nausée ${res.nau.toFixed(2)}. Ouvrez-le depuis sa fenêtre.`, { x: r.x, y: r.y }, 'good');
  }
  resetTrain(r);
}

export function capacity(r) {
  const def = COASTERS[r.type];
  return def.cars * def.perCar;
}

export function resetTrain(r) {
  const S = STATION_PIECES * TILE_M;
  r.train = { s: S - 0.4, v: 0, state: 'loading', timer: 0, riders: [], lapped: false };
}

// ---------- Physique ----------
function physicsStep(r, t, dt, test) {
  const def = COASTERS[r.type];
  const cars = def.cars;
  let slope = 0, onChain = false;
  for (let i = 0; i < cars; i++) {
    const s = t.s - i * CAR_SP;
    slope += slopeAt(r, s);
    const p = r.pieces[pieceIndexAt(r, wrapS(r, s))];
    if (p.chain) onChain = true;
  }
  slope /= cars;
  const front = r.pieces[pieceIndexAt(r, wrapS(r, t.s))];
  let a = -G_ACC * slope - def.friction * G_ACC - def.drag * t.v * t.v * 10;
  t.v += a * dt;
  if (onChain && t.v < CHAIN_V) t.v = CHAIN_V;
  if (front.type === 'booster' && t.v < BOOST_V) t.v = Math.min(BOOST_V, t.v + 14 * dt);
  const S = STATION_PIECES * TILE_M;
  const fs = wrapS(r, t.s);
  if (fs < S) {
    if (!t.lapped) t.v = Math.max(t.v, STATION_V);
    else t.v = Math.max(1.5, Math.min(t.v, t.v - 7 * dt));
  }
  if (!test && t.v < 0.4) t.v = 0.4;
  t.s += t.v * dt;
  if (t.s >= r.length) { t.s -= r.length; t.lapped = true; }
  if (t.lapped && t.s >= S - 0.4 && t.s < S) {
    t.s = S - 0.4;
    return 'arrived';
  }
  return null;
}

export function testRun(r) {
  const t = { s: STATION_PIECES * TILE_M - 0.4, v: 0, lapped: false };
  const dt = 1 / 60;
  let time = 0, maxV = 0, sumV = 0, n = 0;
  let maxVG = 1, minVG = 1, maxLG = 0, air = 0;
  let drops = 0, maxDrop = 0, dropStart = null, highest = 0;
  const dS = 4;
  const def = COASTERS[r.type];
  while (time < 900) {
    const res = physicsStep(r, t, dt, true);
    time += dt;
    if (res === 'arrived') break;
    if (t.v <= 0.02) {
      return { fail: 'le train n\'a pas assez de vitesse et s\'arrête (ajoutez un lift ou réduisez les montées)', exc: 0, int: 0, nau: 0 };
    }
    const mid = t.s - (def.cars - 1) * CAR_SP / 2;
    const a = p3(r, mid - dS), b = p3(r, mid), c = p3(r, mid + dS);
    const kz = (a[2] - 2 * b[2] + c[2]) / (dS * dS);
    const kx = (a[0] - 2 * b[0] + c[0]) / (dS * dS), ky = (a[1] - 2 * b[1] + c[1]) / (dS * dS);
    const v2 = t.v * t.v;
    const vg = 1 + v2 * kz / G_ACC * 0.7;
    const lg = v2 * Math.hypot(kx, ky) / G_ACC * 0.18;
    if (vg > maxVG) maxVG = vg;
    if (vg < minVG) minVG = vg;
    if (lg > maxLG) maxLG = lg;
    if (vg < 0.35) air += dt;
    maxV = Math.max(maxV, t.v); sumV += t.v; n++;
    highest = Math.max(highest, b[2]);
    const sl = slopeAt(r, t.s);
    if (sl < -0.05) { if (dropStart === null) dropStart = b[2]; }
    else if (dropStart !== null) {
      const d = dropStart - b[2];
      if (d > 1) { drops++; maxDrop = Math.max(maxDrop, d); }
      dropStart = null;
    }
  }
  if (time >= 900) return { fail: 'le circuit est trop long ou bloqué', exc: 0, int: 0, nau: 0 };
  const turns = r.pieces.filter(p => PIECES[p.type].turn).length;
  const kmh = maxV * 3.6;
  let exc = 0.8 + kmh / 24 + drops * 0.3 + maxDrop / 10 + air * 0.6 + Math.min(turns, 24) * 0.05 + r.length / 350;
  let int = Math.max(0, maxVG - 1) * 1.15 + maxLG * 1.0 + Math.max(0, 1 - minVG) * 1.3 + kmh / 40;
  let nau = turns * 0.035 + maxLG * 0.55 + Math.max(0, 1 - minVG) * 0.9 + int * 0.18;
  if (r.type === 'junior') { exc *= 0.9; int *= 0.85; }
  if (r.type === 'wooden') { exc *= 1.1; }
  if (int > 9) exc *= 9 / int;
  return {
    exc: Math.max(0.3, exc), int: Math.max(0.2, int), nau: Math.max(0.2, nau),
    maxV: kmh, maxVG, minVG, maxLG, air, drops, maxDrop, length: r.length, time, highest,
  };
}

// ---------- Exploitation ----------
export function updateCoaster(r, dt, hooks) {
  if (!r.complete || !r.train || r.ratings?.fail) return;
  const t = r.train;
  if (t.state === 'loading') {
    t.v = 0;
    t.timer += dt;
    if (r.status === 'open' && t.timer > 1.5) hooks.board(r, capacity(r) - t.riders.length, t.riders);
    const shouldGo = r.status === 'open' && t.timer > 7 && (t.riders.length > 0 || t.timer > 14);
    if (shouldGo || (r.status === 'testing' && t.timer > 3)) {
      t.state = 'running'; t.timer = 0; t.lapped = false;
    }
    return;
  }
  if (t.state === 'running') {
    const steps = Math.ceil(dt / (1 / 60));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (physicsStep(r, t, sdt, false) === 'arrived') {
        t.v = 0;
        t.state = 'loading'; t.timer = 0; t.lapped = false;
        const riders = t.riders.splice(0);
        if (riders.length) hooks.release(r, riders);
        break;
      }
    }
  }
}

export function carPositions(r) {
  const def = COASTERS[r.type];
  const out = [];
  if (!r.train) return out;
  for (let i = 0; i < def.cars; i++) {
    const s = r.train.s - i * CAR_SP;
    const p = posAt(r, s), q = posAt(r, s + 0.6), b = posAt(r, s - 0.6);
    out.push({ p, dir: [q.x - b.x, q.y - b.y, q.z - b.z], i });
  }
  return out;
}

export function demolishCoaster(r) {
  r.pieces.forEach((p, k) => removeTrackRef(r, k));
}
