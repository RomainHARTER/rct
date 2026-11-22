// Champs de distance (BFS) sur le réseau de chemins
import { G, RT, idx, inB } from './state.js';
import { DX, DY } from './config.js';

export const isPath = (x, y) => inB(x, y) && G.path[idx(x, y)] === 1;

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
    if (dist[i] === -1 && G.path[i]) { dist[i] = 0; q[tail++] = i; }
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % G.w, y = (i / G.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!inB(nx, ny)) continue;
      const j = ny * G.w + nx;
      if (dist[j] !== -1 || !G.path[j]) continue;
      dist[j] = dist[i] + 1;
      q[tail++] = j;
    }
  }
  return dist;
}

// Prochaine tuile vers la source du champ (ou null si inaccessible / arrivé)
export function stepToward(field, x, y) {
  const d0 = field[idx(x, y)];
  if (d0 <= 0) return null;
  const opts = [];
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!inB(nx, ny)) continue;
    const dv = field[idx(nx, ny)];
    if (dv >= 0 && dv < d0) opts.push([nx, ny]);
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
