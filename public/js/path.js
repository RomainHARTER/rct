// Champs de distance (BFS) sur le réseau de chemins
import { G, RT, idx, inB } from './state.js';
import { DX, DY } from './config.js';

export const isPath = (x, y) => inB(x, y) && G.path[idx(x, y)] === 1;      // chemin normal
export const isQueue = (x, y) => inB(x, y) && G.path[idx(x, y)] === 2;     // file d'attente

export function getField(key, sourcesFn) {
  let f = RT.fields.get(key);
  if (f) return f;
  f = bfs(sourcesFn());
  RT.fields.set(key, f);
  return f;
}

function bfs(sources) {
  const n = G.w * G.h;
  const dist = new Int16Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0, tail = 0;
  for (const i of sources) {
    if (dist[i] === -1 && G.path[i] === 1) { dist[i] = 0; q[tail++] = i; }
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % G.w, y = (i / G.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inB(nx, ny)) continue;
      const j = ny * G.w + nx;
      if (dist[j] !== -1 || G.path[j] !== 1) continue;
      dist[j] = dist[i] + 1;
      q[tail++] = j;
    }
  }
  return dist;
}

// Prochaine tuile vers la source du champ (ou null si inaccessible / arrivé)
export function stepToward(field, x, y, strict = false) {
  const d0 = field[idx(x, y)];
  if (d0 <= 0) return null;
  const opts = [];
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!inB(nx, ny)) continue;
    const dv = field[idx(nx, ny)];
    if (dv >= 0 && dv < d0 && (!strict || G.path[idx(nx, ny)] !== 2 || canStep(x, y, nx, ny))) opts.push([nx, ny]);
  }
  return opts.length ? opts[(Math.random() * opts.length) | 0] : null;
}

export function pathNeighbors(x, y) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (isPath(nx, ny)) out.push([nx, ny]);
  }
  return out;
}

// Tuiles de chemin adjacentes à une empreinte (liste de tuiles)
export function adjacentPaths(tiles) {
  const set = new Set();
  const own = new Set(tiles.map(([x, y]) => idx(x, y)));
  for (const [x, y] of tiles) {
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!isPath(nx, ny)) continue;
      const i = idx(nx, ny);
      if (!own.has(i)) set.add(i);
    }
  }
  return [...set];
}

// ---------- Files d'attente ----------
// G.qlink[i] : masque des directions reliées (file ↔ file, file ↔ entrée d'attraction).
// Chaque case de file a au plus 2 liaisons. Le raccord au chemin normal est calculé :
// seule l'extrémité libre de la file (la plus éloignée de l'entrée) se raccorde à UN chemin.
const OPP = [2, 3, 0, 1];
const bits = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
export const qdeg = i => bits(G.qlink[i] || 0);

function entranceGateAt(x, y) {
  if (!inB(x, y)) return null;
  const g = RT.gate?.[idx(x, y)];
  return g && g.kind === 'entrance' ? g : null;
}
export function gateLinked(gx, gy) {
  for (let d = 0; d < 4; d++) {
    const nx = gx + DX[d], ny = gy + DY[d];
    if (inB(nx, ny) && G.path[idx(nx, ny)] === 2 && (G.qlink[idx(nx, ny)] & (1 << OPP[d]))) return true;
  }
  return false;
}

// À appeler quand une case devient une file d'attente
export function linkQueueTile(x, y) {
  const i = idx(x, y);
  // 1) l'entrée d'une attraction voisine, si aucune autre file n'y est déjà reliée
  for (let d = 0; d < 4 && qdeg(i) < 2; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (entranceGateAt(nx, ny) && !gateLinked(nx, ny)) G.qlink[i] |= 1 << d;
  }
  // 2) les cases de file voisines encore libres
  for (let d = 0; d < 4 && qdeg(i) < 2; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!inB(nx, ny)) continue;
    const j = idx(nx, ny);
    if (G.path[j] === 2 && !(G.qlink[i] & (1 << d)) && qdeg(j) < 2) { G.qlink[i] |= 1 << d; G.qlink[j] |= 1 << OPP[d]; }
  }
}

// À appeler quand une case cesse d'être une file (ou qu'une entrée est retirée)
export function unlinkTile(x, y) {
  const i = idx(x, y);
  G.qlink[i] = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (inB(nx, ny)) G.qlink[idx(nx, ny)] &= ~(1 << OPP[d]);
  }
}

// À appeler quand une entrée d'attraction est posée
export function linkEntrance(x, y) {
  if (gateLinked(x, y)) return;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!inB(nx, ny)) continue;
    const j = idx(nx, ny);
    if (G.path[j] === 2 && qdeg(j) < 2) { G.qlink[j] |= 1 << OPP[d]; return; }
  }
}

export function relinkAllQueues() {
  G.qlink = new Array(G.w * G.h).fill(0);
  for (let i = 0; i < G.path.length; i++) if (G.path[i] === 2) linkQueueTile(i % G.w, (i / G.w) | 0);
}

// Raccord de chaque file au chemin normal : RT.qexit[i] = direction, ou -1
export function queueExits() {
  if (RT.qexitVersion === RT.fieldVersion && RT.qexit) return RT.qexit;
  const n = G.w * G.h;
  const qexit = new Int8Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const qNeighbors = i => {
    const x = i % G.w, y = (i / G.w) | 0, out = [];
    for (let d = 0; d < 4; d++) {
      if (!(G.qlink[i] & (1 << d))) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (inB(nx, ny) && G.path[idx(nx, ny)] === 2) out.push(idx(nx, ny));
    }
    return out;
  };
  const linkedToGate = i => {
    const x = i % G.w, y = (i / G.w) | 0;
    for (let d = 0; d < 4; d++) if ((G.qlink[i] & (1 << d)) && entranceGateAt(x + DX[d], y + DY[d])) return true;
    return false;
  };
  // s'il y a plusieurs chemins possibles, on préfère celui relié à l'entrée du parc
  const parkField = getField('exit', () => [idx(G.entrance.x, G.entrance.y)]);
  const normalDir = i => {
    const x = i % G.w, y = (i / G.w) | 0;
    let best = -1, bestD = Infinity;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inB(nx, ny) || G.path[idx(nx, ny)] !== 1 || (G.qlink[i] & (1 << d))) continue;
      const fd = parkField[idx(nx, ny)];
      const score = fd >= 0 ? fd : 1e6 + d;
      if (score < bestD) { bestD = score; best = d; }
    }
    return best;
  };
  for (let i = 0; i < n; i++) {
    if (G.path[i] !== 2 || seen[i]) continue;
    // composante (une ligne de file)
    const comp = [];
    const stack = [i]; seen[i] = 1;
    while (stack.length) { const k = stack.pop(); comp.push(k); for (const j of qNeighbors(k)) if (!seen[j]) { seen[j] = 1; stack.push(j); } }
    let start = comp.find(linkedToGate);
    let tail = -1;
    if (start !== undefined) {
      // parcours depuis l'entrée jusqu'au bout de la ligne
      const vis = new Set([start]); let cur = start;
      for (;;) { const nx = qNeighbors(cur).find(j => !vis.has(j)); if (nx === undefined) break; vis.add(nx); cur = nx; }
      tail = cur;
      if (qNeighbors(tail).length + 1 > 2 && tail !== start) tail = -1;
    } else {
      tail = comp.find(k => qNeighbors(k).length <= 1 && normalDir(k) >= 0) ?? -1;
    }
    if (tail >= 0) qexit[tail] = normalDir(tail);
  }
  RT.qexit = qexit; RT.qexitVersion = RT.fieldVersion;
  return qexit;
}

// La case (x,y) de file est-elle reliée dans la direction d ?
export function queueLinked(x, y, d) {
  const i = idx(x, y);
  return !!(G.qlink[i] & (1 << d)) || queueExits()[i] === d;
}

// Un pas from -> to est-il permis (on n'entre dans une file que par son extrémité) ?
export function canStep(fx, fy, tx, ty) {
  const a = G.path[idx(fx, fy)], b = G.path[idx(tx, ty)];
  if (a === 1 && b === 1) return true;
  const d = DX.findIndex((dx, k) => dx === tx - fx && DY[k] === ty - fy);
  if (a === 2) return queueLinked(fx, fy, d);
  if (b === 2) return queueLinked(tx, ty, OPP[d]);
  return false;
}

// Champ vers l'entrée d'une attraction : entrée -> file (dans l'ordre) -> chemins normaux
export function rideFieldFrom(entranceIdx) {
  const n = G.w * G.h;
  const dist = new Int16Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0, tail = 0;
  dist[entranceIdx] = 0;
  const ex = entranceIdx % G.w, ey = (entranceIdx / G.w) | 0;
  const hasQueue = gateLinked(ex, ey);
  for (let d = 0; d < 4; d++) {
    const nx = ex + DX[d], ny = ey + DY[d];
    if (!inB(nx, ny)) continue;
    const j = idx(nx, ny);
    const ok = hasQueue ? (G.path[j] === 2 && (G.qlink[j] & (1 << OPP[d]))) : G.path[j] === 1;
    if (ok) { dist[j] = 1; q[tail++] = j; }
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % G.w, y = (i / G.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inB(nx, ny)) continue;
      const j = idx(nx, ny);
      if (dist[j] !== -1 || !G.path[j]) continue;
      if (!canStep(x, y, nx, ny)) continue;
      dist[j] = dist[i] + 1; q[tail++] = j;
    }
  }
  return dist;
}

// Ordre des cases d'une file depuis l'entrée
export function queueChainFrom(gx, gy) {
  const out = [];
  let cur = -1;
  for (let d = 0; d < 4; d++) {
    const nx = gx + DX[d], ny = gy + DY[d];
    if (inB(nx, ny) && G.path[idx(nx, ny)] === 2 && (G.qlink[idx(nx, ny)] & (1 << OPP[d]))) { cur = idx(nx, ny); break; }
  }
  const vis = new Set();
  while (cur >= 0 && !vis.has(cur)) {
    vis.add(cur); out.push(cur);
    const x = cur % G.w, y = (cur / G.w) | 0;
    let nxt = -1;
    for (let d = 0; d < 4; d++) {
      if (!(G.qlink[cur] & (1 << d))) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (inB(nx, ny) && G.path[idx(nx, ny)] === 2 && !vis.has(idx(nx, ny))) { nxt = idx(nx, ny); break; }
    }
    cur = nxt;
  }
  return out;
}
