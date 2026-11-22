// Visiteurs : besoins, décisions, déplacements, files d'attente
import { G, RT, idx, inB, spend, rideById, invalidateFields } from './state.js';
import { FIRST_NAMES, SHIRTS, SKINS, SCENERY, STALLS, DX, DY } from './config.js';
import { getField, stepToward, pathNeighbors, isPath, rideFieldFrom, queueChainFrom } from './path.js';
import { accessTiles, exitTiles, defOf } from './rides.js';

const SPEED = 1.15; // tuiles / seconde
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export function thought(g, text) {
  if (g.thoughts.length && g.thoughts[0].text === text) { g.thoughts[0].t = G.time; return; }
  g.thoughts.unshift({ text, t: G.time });
  if (g.thoughts.length > 6) g.thoughts.pop();
}

// ---------- Champs de destination ----------
export function rideField(r) {
  if (r.kind === 'stall') return getField('ride:' + r.id, () => accessTiles(r));
  if (!r.entrance) { const f = getField('none', () => []); return f; }
  const key = 'ride:' + r.id;
  let f = RT.fields.get(key);
  if (!f) { f = rideFieldFrom(idx(r.entrance.x, r.entrance.y)); RT.fields.set(key, f); }
  return f;
}

// Tracé de la file d'attente : entrée puis tuiles de file reliées
function queueLine(r) {
  const key = 'qline:' + r.id;
  let line = RT.fields.get(key);
  if (line) return line;
  line = [];
  if (r.entrance) {
    line.push([r.entrance.x + 0.5, r.entrance.y + 0.5]);
    for (const i of queueChainFrom(r.entrance.x, r.entrance.y)) line.push([i % G.w + 0.5, ((i / G.w) | 0) + 0.5]);
  }
  RT.fields.set(key, line);
  return line;
}
function pointOnLine(line, dist) {
  for (let k = 1; k < line.length; k++) {
    const [ax, ay] = line[k - 1], [bx, by] = line[k];
    const l = Math.hypot(bx - ax, by - ay);
    if (dist <= l) return [ax + (bx - ax) * dist / l, ay + (by - ay) * dist / l, false];
    dist -= l;
  }
  const e = line[line.length - 1];
  return [e[0], e[1], true];
}

function leaveQueue(g) {
  g.state = 'walk'; g.goal = null;
  const q = g.qret || G.entrance;
  g.tx = g.nx = g.px = q.x; g.ty = g.ny = g.py = q.y;
}
export function needField(need) {
  return getField('need:' + need, () => {
    const out = [];
    for (const r of G.rides) if (r.kind === 'stall' && r.status === 'open' && STALLS[r.type].need === need) out.push(...accessTiles(r));
    return out;
  });
}
export function exitField() {
  return getField('exit', () => [idx(G.entrance.x, G.entrance.y)]);
}
function benchField() {
  return getField('bench', () => {
    const out = [];
    for (let i = 0; i < G.furn.length; i++) if (G.furn[i] === 'bench' && G.path[i]) out.push(i);
    return out;
  });
}

function fieldForGoal(goal) {
  if (!goal) return null;
  if (goal.type === 'ride') { const r = rideById(goal.id); return r ? rideField(r) : null; }
  if (goal.type === 'need') return needField(goal.need);
  if (goal.type === 'exit') return exitField();
  if (goal.type === 'bench') return benchField();
  return null;
}

// ---------- Apparition ----------
export function spawnGuest() {
  const e = G.entrance;
  const money = Math.round(rnd(35, 110));
  if (money < G.entryFee) return null;
  const g = {
    id: G.nextId++, name: `${pick(FIRST_NAMES)} ${String.fromCharCode(65 + (Math.random() * 26) | 0)}.`,
    shirt: pick(SHIRTS), pants: pick(['#2c3e50', '#34495e', '#795548', '#1e3799', '#57606f']), skin: pick(SKINS),
    x: e.x + 0.5, y: e.y + 0.5, tx: e.x, ty: e.y, nx: e.x, ny: e.y, px: e.x, py: e.y + 1,
    ox: rnd(-0.22, 0.22), oy: rnd(-0.22, 0.22),
    state: 'walk', goal: null, timer: 0, decide: rnd(0.5, 2),
    money: money - G.entryFee, spent: G.entryFee,
    hunger: rnd(5, 40), thirst: rnd(5, 40), toilet: rnd(0, 30), energy: rnd(70, 100), happy: rnd(60, 85), nausea: 0,
    intMax: rnd(3, 9.5), intMin: rnd(0, 3), nauTol: rnd(2, 9),
    stay: rnd(360, 1100), timeInPark: 0, rides: {}, items: {}, trash: 0, thoughts: [], boredom: 0,
  };
  G.guests.push(g);
  G.stats.totalGuests++;
  spend('entry', -G.entryFee);
  thought(g, G.entryFee > 25 ? 'L\'entrée était chère…' : 'Allons nous amuser !');
  return g;
}

// ---------- Valeur perçue d'une attraction ----------
export function rideValue(r) {
  if (!r.ratings) return 0;
  const base = r.ratings.exc * 1.2 + r.ratings.int * 0.3 + 0.6;
  return base * (r.kind === 'coaster' ? 1.25 : 1) * (G.entryFee > 0 ? 0.85 : 1.15);
}

// ---------- Décision ----------
function decide(g) {
  const here = idx(g.tx, g.ty);
  if (g.goal?.type === 'exit') return;
  if (g.toilet > 75) { if (tryNeed(g, 'toilet', 'Il me faut des toilettes !')) return; }
  if (g.hunger > 65) { if (tryNeed(g, 'food', 'J\'ai faim')) return; }
  if (g.thirst > 65) { if (tryNeed(g, 'drink', 'J\'ai soif')) return; }
  if (g.happy < 18) return leave(g, 'Je ne m\'amuse pas, je rentre');
  if (g.energy < 12) return leave(g, 'Je suis épuisé(e)');
  if (g.money < 1.5) return leave(g, 'Je n\'ai plus d\'argent');
  if (g.timeInPark > g.stay) return leave(g, 'Quelle bonne journée, je rentre');
  if (g.energy < 35 && Math.random() < 0.5) {
    const f = benchField();
    if (f[here] >= 0) { g.goal = { type: 'bench' }; return; }
  }
  if (!g.items.balloon && g.money > 8 && Math.random() < 0.06) { if (tryNeed(g, 'gift', null)) return; }
  if (!g.items.map && g.boredom > 40 && Math.random() < 0.2) { if (tryNeed(g, 'map', null)) return; }
  if (Math.random() < 0.75) {
    let best = null, bestScore = -1e9, tooExpensive = null, tooIntense = null;
    for (const r of G.rides) {
      if (r.kind === 'stall' || r.status !== 'open' || !r.ratings || r.ratings.fail) continue;
      const f = rideField(r);
      const d = f[here];
      if (d < 0) continue;
      const rt = r.ratings;
      if (rt.int > g.intMax) { tooIntense = r; continue; }
      if (rt.int < g.intMin) continue;
      if (g.nausea > 45 && rt.nau > 2.5) continue;
      if (rt.nau > g.nauTol + 2) continue;
      if (r.price > g.money) continue;
      if (r.price > rideValue(r) * 1.3) { tooExpensive = r; continue; }
      const times = g.rides[r.id] || 0;
      if (times >= 3) continue;
      const q = r.queue.length;
      const score = rt.exc * 2 - d * 0.08 - times * 3 - q * 0.15 + Math.random() * 4;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (best) { g.goal = { type: 'ride', id: best.id }; return; }
    if (tooExpensive && Math.random() < 0.5) thought(g, `${tooExpensive.name} est bien trop cher !`);
    else if (tooIntense && Math.random() < 0.3) thought(g, `${tooIntense.name} a l'air trop intense pour moi`);
    else if (Math.random() < 0.2) { g.boredom += 6; if (g.boredom > 60) thought(g, 'Je m\'ennuie… il n\'y a rien à faire'); }
  }
  g.goal = null;
}

function tryNeed(g, need, msg) {
  const f = needField(need);
  if (f[idx(g.tx, g.ty)] >= 0) { g.goal = { type: 'need', need }; return true; }
  if (msg) { thought(g, msg); if (Math.random() < 0.2) thought(g, `Je ne trouve pas de ${needName(need)}`); }
  return false;
}
const needName = n => ({ food: 'nourriture', drink: 'boisson', toilet: 'toilettes', gift: 'boutique', map: 'kiosque' })[n];

function leave(g, msg) {
  if (g.goal?.type !== 'exit') thought(g, msg);
  g.goal = { type: 'exit' };
}

// ---------- Arrivée à destination ----------
function arrive(g) {
  const goal = g.goal;
  if (!goal) return;
  if (goal.type === 'exit') {
    if (g.tx === G.entrance.x && g.ty === G.entrance.y) { g.state = 'gone'; }
    return;
  }
  if (goal.type === 'bench') {
    if (G.furn[idx(g.tx, g.ty)] === 'bench') { g.state = 'sit'; g.timer = rnd(6, 12); }
    g.goal = null;
    return;
  }
  if (goal.type === 'ride') {
    const r = rideById(goal.id);
    g.goal = null;
    if (!r || r.status !== 'open') return;
    if (r.queue.length >= 40) { thought(g, `La file pour ${r.name} est trop longue`); return; }
    g.state = 'queue'; g.timer = 0; g.rideId = r.id; g.qret = { x: g.tx, y: g.ty };
    r.queue.push(g.id);
    return;
  }
  if (goal.type === 'need') {
    const stall = adjacentStall(g.tx, g.ty, goal.need);
    g.goal = null;
    if (!stall) return;
    const def = STALLS[stall.type];
    if (g.money < stall.price) { thought(g, `Je n'ai pas assez d'argent pour ${def.item ? 'un ' + def.item.toLowerCase() : 'ça'}`); return; }
    if (def.need === 'food' && g.hunger < 20) return;
    if (def.need === 'drink' && g.thirst < 20) return;
    g.state = 'buy'; g.timer = 1.6; g.stallId = stall.id;
  }
}

function adjacentStall(x, y, need) {
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!inB(nx, ny)) continue;
    const id = RT.obj[idx(nx, ny)];
    if (!id) continue;
    const r = rideById(id);
    if (r && r.kind === 'stall' && r.status === 'open' && STALLS[r.type].need === need) return r;
  }
  return null;
}

function completePurchase(g) {
  const r = rideById(g.stallId);
  g.state = 'walk';
  if (!r) return;
  const def = STALLS[r.type];
  const price = r.price;
  if (g.money < price) return;
  g.money -= price; g.spent += price;
  spend('shops', -price);
  if (def.itemCost) spend('stock', def.itemCost);
  r.income += price; r.monthIncome += price - def.itemCost; r.sales++; r.totalRiders++;
  switch (def.need) {
    case 'food': g.hunger = clamp(g.hunger - def.satisfies / 2.55); g.happy = clamp(g.happy + 4); thought(g, `Ce ${def.item.toLowerCase()} était délicieux`); break;
    case 'drink': g.thirst = clamp(g.thirst - def.satisfies / 2.55); if (def.food) g.hunger = clamp(g.hunger - def.food / 2.55); g.happy = clamp(g.happy + 4); g.toilet = clamp(g.toilet + 12); thought(g, `Rafraîchissant !`); break;
    case 'toilet': g.toilet = 0; g.happy = clamp(g.happy + 3); thought(g, 'Quel soulagement !'); break;
    case 'gift': g.items.balloon = true; g.happy = clamp(g.happy + 10); thought(g, 'J\'adore mon ballon !'); break;
    case 'map': g.items.map = true; g.boredom = 0; thought(g, 'Avec ce plan, je trouverai tout'); break;
  }
  if (def.litter && Math.random() < 0.6) g.trash = rnd(8, 25); // secondes avant de jeter le déchet
  if (def.need === 'food') g.toilet = clamp(g.toilet + 10);
}

// ---------- Interaction avec les attractions (hooks) ----------
export const hooks = {
  board(r, n, arr) {
    while (n > 0 && r.queue.length) {
      const g = guestMap().get(r.queue.shift());
      if (!g || g.state !== 'queue') continue;
      if (g.money < r.price) { g.state = 'walk'; thought(g, 'Je n\'ai plus assez d\'argent'); continue; }
      g.money -= r.price; g.spent += r.price;
      spend('rides', -r.price);
      r.income += r.price; r.monthIncome += r.price; r.totalRiders++;
      g.state = 'ride'; g.rideId = r.id;
      arr.push(g.id);
      n--;
    }
  },
  release(r, ids) {
    const exits = exitTiles(r);
    const m = guestMap();
    for (const id of ids) {
      const g = m.get(id);
      if (!g) continue;
      placeAt(g, exits);
      if (r.exit && exits.length) { g.x = r.exit.x + 0.5; g.y = r.exit.y + 0.5; } // sort par la sortie
      g.state = 'walk'; g.goal = null; g.decide = rnd(1, 3);
      g.rides[r.id] = (g.rides[r.id] || 0) + 1;
      const rt = r.ratings || { exc: 1, int: 1, nau: 1 };
      g.boredom = 0;
      g.energy = clamp(g.energy - 3);
      g.nausea = clamp(g.nausea + rt.nau * 7 * (1.2 - g.nauTol / 12));
      if (rt.int > g.intMax) { g.happy = clamp(g.happy - 12); thought(g, `${r.name} était beaucoup trop intense !`); }
      else { g.happy = clamp(g.happy + 6 + rt.exc * 2.5); thought(g, rt.exc > 5 ? `${r.name} était incroyable !` : `${r.name} était sympa`); }
      if (g.nausea > 70) {
        G.vomit[idx(g.tx, g.ty)]++;
        g.nausea = 25; g.happy = clamp(g.happy - 8);
        thought(g, 'Je me sens mal…');
      }
    }
  },
  evictQueue(r, msg) {
    const m = guestMap();
    for (const id of r.queue) {
      const g = m.get(id);
      if (g && g.state === 'queue') { leaveQueue(g); g.happy = clamp(g.happy - 5); thought(g, msg); }
    }
    r.queue = [];
  },
  evict(r) {
    hooks.evictQueue(r, `${r.name} a été démoli`);
    hooks.evictRiders(r);
  },
  evictRiders(r) {
    const riders = r.kind === 'coaster' ? (r.train?.riders || []) : (r.riders || []);
    const m = guestMap();
    for (const id of riders.splice(0)) {
      const g = m.get(id);
      if (g) { placeAt(g, exitTiles(r)); g.state = 'walk'; g.goal = null; }
    }
  },
};

let _gm = null, _gmT = -1;
function guestMap() {
  if (_gmT !== G.time || !_gm || _gm.size !== G.guests.length) { _gm = new Map(G.guests.map(g => [g.id, g])); _gmT = G.time; }
  return _gm;
}

function placeAt(g, tiles) {
  let i = tiles.length ? tiles[(Math.random() * tiles.length) | 0] : idx(G.entrance.x, G.entrance.y);
  const x = i % G.w, y = (i / G.w) | 0;
  g.tx = g.nx = g.px = x; g.ty = g.ny = g.py = y;
  g.x = x + 0.5 + g.ox; g.y = y + 0.5 + g.oy;
}

// ---------- Mise à jour ----------
let envTimer = 0;
export function updateGuests(dt) {
  envTimer += dt;
  const envTick = envTimer > 4;
  if (envTick) envTimer = 0;
  _gm = null;
  for (const g of G.guests) updateGuest(g, dt, envTick);
  const before = G.guests.length;
  G.guests = G.guests.filter(g => g.state !== 'gone');
  G.stats.guestsLeft += before - G.guests.length;
}

function updateGuest(g, dt, envTick) {
  g.timeInPark += dt;
  if (g.state !== 'ride') {
    g.hunger = clamp(g.hunger + dt * 0.32);
    g.thirst = clamp(g.thirst + dt * 0.38 * (G.terrain[idx(g.tx, g.ty)] === 2 ? 1.4 : 1));
    g.toilet = clamp(g.toilet + dt * 0.18);
    g.energy = clamp(g.energy - dt * 0.07);
  }
  g.nausea = clamp(g.nausea - dt * 0.4);
  if (envTick) environment(g);

  switch (g.state) {
    case 'queue': {
      g.timer += dt;
      const r = rideById(g.rideId);
      if (!r || r.status !== 'open') { leaveQueue(g); break; }
      const pos = r.queue.indexOf(g.id);
      const line = queueLine(r);
      let tx, ty;
      if (line.length) {
        const [px, py, end] = pointOnLine(line, 0.55 + pos * 0.38);
        tx = px + g.ox * 0.35; ty = py + g.oy * 0.35;
        if (end && g.qret) { tx = px + (g.qret.x + 0.5 - px) * 0.45 + g.ox; ty = py + (g.qret.y + 0.5 - py) * 0.45 + g.oy; }
      } else { tx = g.x; ty = g.y; }
      const k = Math.min(1, dt * 3);
      g.x += (tx - g.x) * k; g.y += (ty - g.y) * k;
      if (g.timer > 150) {
        r.queue = r.queue.filter(id => id !== g.id);
        leaveQueue(g); g.happy = clamp(g.happy - 15);
        thought(g, `J'attends depuis trop longtemps pour ${r.name}`);
      } else if (g.timer > 60 && envTick) g.happy = clamp(g.happy - 1);
      return;
    }
    case 'ride': return;
    case 'buy': g.timer -= dt; if (g.timer <= 0) completePurchase(g); return;
    case 'sit':
      g.timer -= dt; g.energy = clamp(g.energy + dt * 4); g.happy = clamp(g.happy + dt * 0.3);
      if (g.timer <= 0) { g.state = 'walk'; thought(g, 'Ça fait du bien de s\'asseoir'); }
      return;
  }
  // marche
  if (!isPath(g.tx, g.ty)) { placeAt(g, []); g.goal = { type: 'exit' }; }
  if (g.trash > 0) {
    g.trash -= dt;
    if (g.trash <= 0) {
      const i = idx(g.tx, g.ty);
      if (binNear(g.tx, g.ty)) g.trash = 0;
      else if (Math.random() < 0.3 || g.trash < -40) { G.litter[i] = Math.min(9, G.litter[i] + 1); g.trash = 0; }
      else g.trash = 3; // garde son déchet et cherche une poubelle
    }
  }
  const tx = g.nx + 0.5 + g.ox, ty = g.ny + 0.5 + g.oy;
  const dx = tx - g.x, dy = ty - g.y, dist = Math.hypot(dx, dy);
  const step = SPEED * dt * (g.energy < 25 ? 0.7 : 1);
  if (dist > step) { g.x += dx / dist * step; g.y += dy / dist * step; return; }
  g.x = tx; g.y = ty;
  g.px = g.tx; g.py = g.ty;
  g.tx = g.nx; g.ty = g.ny;
  onTile(g);
  if (g.state !== 'walk') return;
  g.decide -= 1 / SPEED;
  if (!g.goal && g.decide <= 0) { g.decide = rnd(2, 5); decide(g); }
  chooseNext(g);
}

function binNear(x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (inB(x + dx, y + dy) && G.furn[idx(x + dx, y + dy)] === 'bin') return true;
  }
  return false;
}

function onTile(g) {
  const i = idx(g.tx, g.ty);
  if (g.goal) {
    const f = fieldForGoal(g.goal);
    if (f && f[i] === 0) arrive(g);
  }
  if (g.state === 'walk' && !g.goal && G.furn[i] === 'bench' && g.energy < 45 && Math.random() < 0.5) { g.state = 'sit'; g.timer = rnd(5, 10); }
}

function chooseNext(g) {
  const here = idx(g.tx, g.ty);
  if (g.goal) {
    const f = fieldForGoal(g.goal);
    if (!f || f[here] < 0) {
      if (g.goal.type === 'exit') { thought(g, 'Je suis perdu(e), où est la sortie ?'); g.happy = clamp(g.happy - 1); }
      else if (g.goal.type === 'ride') thought(g, 'Je n\'arrive pas à rejoindre cette attraction');
      if (g.goal.type !== 'exit') g.goal = null;
    } else {
      if (f[here] === 0) { arrive(g); if (g.state !== 'walk') return; }
      const n = g.goal ? stepToward(fieldForGoal(g.goal), g.tx, g.ty, g.goal.type === 'ride') : null;
      if (n && g.goal.type === 'ride' && (G.path[idx(n[0], n[1])] === 2 || RT.gate[idx(n[0], n[1])])) { arrive(g); if (g.state !== 'walk') return; }
      else if (n) { g.nx = n[0]; g.ny = n[1]; return; }
    }
  }
  const nb = pathNeighbors(g.tx, g.ty);
  if (!nb.length) { g.nx = g.tx; g.ny = g.ty; return; }
  let opts = nb.filter(([x, y]) => !(x === g.px && y === g.py));
  if (!opts.length) opts = nb;
  // les visiteurs évitent de sortir par l'entrée en flânant
  const noExit = opts.filter(([x, y]) => !(x === G.entrance.x && y === G.entrance.y));
  if (noExit.length) opts = noExit;
  const n = opts[(Math.random() * opts.length) | 0];
  g.nx = n[0]; g.ny = n[1];
}

function environment(g) {
  if (g.state === 'ride') return;
  let beauty = 0, dirt = 0, ent = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = g.tx + dx, y = g.ty + dy;
    if (!inB(x, y)) continue;
    const i = idx(x, y);
    if (G.scen[i]) beauty += SCENERY[G.scen[i]].beauty;
    if (G.terrain[i] === 1) beauty += 0.5;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) dirt += G.litter[i] + G.vomit[i] * 3;
  }
  for (const s of G.staff) if (s.type === 'entertainer' && Math.abs(s.x - g.x) < 3 && Math.abs(s.y - g.y) < 3) ent++;
  if (beauty > 12) { g.happy = clamp(g.happy + 1.2); if (Math.random() < 0.08) thought(g, 'Ce parc est vraiment joli'); }
  if (dirt > 6) { g.happy = clamp(g.happy - 2); if (Math.random() < 0.3) thought(g, dirt > 10 ? 'C\'est dégoûtant ici !' : 'C\'est sale ici'); }
  if (ent) { g.happy = clamp(g.happy + 1.5); if (Math.random() < 0.1) thought(g, 'L\'animateur est trop drôle !'); }
  if (g.items.balloon) g.happy = clamp(g.happy + 0.3);
  if (g.hunger > 85) g.happy = clamp(g.happy - 1.5);
  if (g.thirst > 85) g.happy = clamp(g.happy - 1.5);
  if (g.toilet > 90) { g.happy = clamp(g.happy - 2.5); thought(g, 'Il me faut des toilettes, vite !'); }
  if (g.nausea > 50 && Math.random() < 0.2) thought(g, 'J\'ai la nausée');
  if (g.state === 'walk' && !g.goal) {
    g.boredom += 1.5;
    if (g.boredom > 80) { g.happy = clamp(g.happy - 1); }
  }
  if (g.state === 'queue') g.boredom += 0.5;
  // perte de déchets et nausée en marchant
  if (g.state === 'walk' && g.nausea > 80 && Math.random() < 0.3) {
    G.vomit[idx(g.tx, g.ty)]++; g.nausea = 30; thought(g, 'Je me sens mal…');
  }
}

export function avgHappiness() {
  if (!G.guests.length) return 0;
  return G.guests.reduce((s, g) => s + g.happy, 0) / G.guests.length;
}
