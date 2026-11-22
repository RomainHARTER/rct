// État global du jeu, génération de carte, sauvegarde/chargement
import { SCENARIOS, TERRAIN, MONTHS, MONTH_SECONDS } from './config.js';
import { relinkAllQueues } from './path.js';

export const G = {};          // état sérialisable
export const RT = {           // état d'exécution (non sauvegardé)
  fieldVersion: 1,
  fields: new Map(),
  track: [],                  // par tuile : liste de { ride, piece }
  listeners: {},
};

export function on(evt, fn) { (RT.listeners[evt] ||= []).push(fn); }
export function emit(evt, data) { (RT.listeners[evt] || []).forEach(f => f(data)); }

export const idx = (x, y) => y * G.w + x;
export const inB = (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function valueNoise(w, h, rand, scale) {
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const grid = new Float32Array(gw * gh).map(() => rand());
  const out = new Float32Array(w * h);
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = sm(fx - ix), ty = sm(fy - iy);
    const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1], c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
    out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}

function quantile(arr, q) {
  const s = Array.from(arr).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function newGame(scenarioId) {
  const scn = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
  const n = scn.size;
  for (const k of Object.keys(G)) delete G[k];
  Object.assign(G, {
    version: 1,
    scenario: scn.id,
    parkName: 'Looping Land',
    w: n, h: n,
    terrain: new Array(n * n).fill(TERRAIN.GRASS),
    path: new Array(n * n).fill(0),
    qlink: new Array(n * n).fill(0),
    scen: new Array(n * n).fill(null),
    furn: new Array(n * n).fill(null),
    litter: new Array(n * n).fill(0),
    vomit: new Array(n * n).fill(0),
    owned: new Array(n * n).fill(1),
    rides: [],
    guests: [],
    staff: [],
    nextId: 1,
    money: scn.money,
    loan: scn.loan,
    maxLoan: scn.maxLoan,
    sandbox: !!scn.sandbox,
    entryFee: 10,
    time: 0,                      // secondes de jeu écoulées
    month: 0, year: 1,
    finances: { current: {}, history: [] },
    rating: 500,
    ratingHistory: [],
    guestHistory: [],
    messages: [],
    stats: { totalGuests: 0, guestsLeft: 0 },
    goalState: scn.goal ? 'running' : 'none',
    entranceClosed: true,
    entrance: { x: Math.floor(n / 2), y: n - 1 },
  });

  // Génération du terrain
  const rand = seeded(scn.seed * 9973 + 17);
  const wn = valueNoise(n, n, rand, 9);
  const tn = valueNoise(n, n, rand, 4);
  const sn = valueNoise(n, n, rand, 12);
  const wThr = scn.water > 0 ? quantile(wn, 1 - scn.water) : 2;
  const sThr = scn.sand > 0 ? quantile(sn, 1 - scn.sand) : 2;
  const e = G.entrance;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    const nearEntrance = Math.abs(x - e.x) < 5 && y > n - 12;
    if (sn[i] >= sThr) G.terrain[i] = TERRAIN.SAND;
    if (wn[i] >= wThr && !nearEntrance) G.terrain[i] = TERRAIN.WATER;
    if (G.terrain[i] === TERRAIN.SAND && wn[i] >= wThr - 0.04 && !nearEntrance && G.terrain[i] !== TERRAIN.WATER) G.terrain[i] = TERRAIN.GRASS;
    if (G.terrain[i] !== TERRAIN.WATER && !nearEntrance && tn[i] > 1 - scn.trees * 3 && rand() < 0.55) {
      const sandy = G.terrain[i] === TERRAIN.SAND;
      G.scen[i] = sandy ? (rand() < 0.7 ? 'palm' : 'bush') : (rand() < 0.5 ? 'oak' : rand() < 0.7 ? 'pine' : 'bush');
    }
  }
  // Chemin initial depuis l'entrée
  for (let k = 0; k < 6; k++) {
    const i = (e.y - k) * n + e.x;
    G.path[i] = 1; G.scen[i] = null; G.terrain[i] = G.terrain[i] === TERRAIN.WATER ? TERRAIN.GRASS : G.terrain[i];
  }
  G.scenarioData = { name: scn.name, goal: scn.goal };
  rebuildIndexes();
  addMsg(`Bienvenue à ${G.parkName} ! Scénario : ${scn.name}.`);
  addMsg('Le parc est fermé : construisez vos premières attractions, puis ouvrez-le avec le bouton 🔒 en haut.', null, 'warn');
  if (scn.goal) addMsg(`Objectif : ${scn.goal.guests} visiteurs et une note de ${scn.goal.rating} avant la fin de l'année ${scn.goal.year}.`);
  emit('newgame');
}

export function rebuildIndexes() {
  RT.track = new Array(G.w * G.h);
  RT.obj = new Int32Array(G.w * G.h);
  RT.gate = new Array(G.w * G.h).fill(null);
  for (const r of G.rides) {
    for (const k of ['entrance', 'exit']) if (r[k]) RT.gate[idx(r[k].x, r[k].y)] = { ride: r, kind: k };
    if (r.kind === 'coaster') {
      r.pieces.forEach((p, k) => addTrackRef(r, k));
    } else {
      for (let dy = 0; dy < r.size; dy++) for (let dx = 0; dx < r.size; dx++) RT.obj[idx(r.x + dx, r.y + dy)] = r.id;
    }
  }
  invalidateFields();
}

export function addTrackRef(ride, k) {
  const p = ride.pieces[k];
  const i = idx(p.x, p.y);
  (RT.track[i] ||= []).push({ ride, k });
}
export function removeTrackRef(ride, k) {
  const p = ride.pieces[k];
  const i = idx(p.x, p.y);
  if (RT.track[i]) RT.track[i] = RT.track[i].filter(t => !(t.ride === ride && t.k === k));
}

export function invalidateFields() { RT.fieldVersion++; RT.fields.clear(); }

export function rideById(id) { return G.rides.find(r => r.id === id); }
export function guestById(id) { return G.guests.find(g => g.id === id); }

export function addMsg(text, loc = null, type = 'info') {
  const m = { text, loc, type, date: dateString() };
  G.messages.push(m);
  if (G.messages.length > 80) G.messages.shift();
  emit('message', m);
}

export function dateString() {
  if (G.month === undefined) return '';
  const day = Math.min(31, 1 + Math.floor((G.time % MONTH_SECONDS) / MONTH_SECONDS * 31));
  return `${day} ${MONTHS[G.month]}, An ${G.year}`;
}

// Mouvement d'argent : montant positif = dépense
export function spend(cat, amount) {
  if (G.sandbox && amount > 0) return;
  G.money -= amount;
  G.finances.current[cat] = (G.finances.current[cat] || 0) - amount;
}
export function canAfford(cost) {
  return G.sandbox || G.money >= cost;
}

export function serialize() {
  const data = JSON.parse(JSON.stringify(G, (k, v) => {
    if (k === 'cache' || k === 'field') return undefined;
    return v;
  }));
  return data;
}

export function deserialize(data) {
  for (const k of Object.keys(G)) delete G[k];
  Object.assign(G, data);
  rebuildIndexes();
  if (!G.qlink) relinkAllQueues(); // anciennes sauvegardes
  emit('newgame');
}
