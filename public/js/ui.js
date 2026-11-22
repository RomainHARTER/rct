// Interface HTML : barre du haut, palettes, fenêtres
import { G, rideById, guestById, dateString, serialize, deserialize, newGame, on, invalidateFields } from './state.js';
import { RIDES, STALLS, COASTERS, SCENERY, FURNITURE, STAFF, PIECES, DESIGNS, PATH_COST, TERRAFORM_COST, SCENARIOS, MONTHS } from './config.js';
import { UI } from './uistate.js';
import { centerOn } from './render.js';
import { setRideStatus, demolishRide, defOf, accessTiles, QUEUE_COST } from './rides.js';
import { appendPiece, removeLastPiece, canAppend, capacity, STATION_PIECES, resetTrain, designCost } from './coaster.js';
import { hooks, rideValue, avgHappiness } from './guests.js';
import { hireStaff, fireStaff } from './staff.js';
import { takeLoan, repayLoan, companyValue, parkValue, guestCapacity } from './sim.js';
import { net } from './net.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = v => (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
const money2 = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function fields(root) { const o = {}; root.querySelectorAll('[data-f]').forEach(e => o[e.dataset.f] = e); return o; }
function bar(v, color) { return `<div class="bar"><div style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></div></div>`; }

// ---------- Messages flash ----------
let flashTimer = null;
export function flash(msg, bad = true) {
  const t = $('#flash');
  t.textContent = msg; t.className = bad ? 'bad show' : 'good show';
  t.style.left = (UI.mouse.x + 16) + 'px'; t.style.top = (UI.mouse.y + 12) + 'px';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => t.className = '', 1600);
}

// ---------- Fenêtres ----------
const wins = new Map();
let zTop = 300, cascade = 0;
export function openWin(key, title, build, opts = {}) {
  if (wins.has(key)) { const w = wins.get(key); w.el.style.zIndex = ++zTop; return w; }
  const el = h(`<div class="win"><div class="win-h"><span class="win-t">${esc(title)}</span><button class="win-x" title="Fermer">✕</button></div><div class="win-b"></div></div>`);
  el.style.zIndex = ++zTop;
  const w0 = opts.width || 300;
  el.style.width = w0 + 'px';
  el.style.left = Math.max(0, Math.min(window.innerWidth - w0 - 10, 310 + (cascade % 6) * 28)) + 'px';
  el.style.top = (70 + (cascade % 6) * 28) + 'px';
  cascade++;
  $('#windows').appendChild(el);
  const body = el.querySelector('.win-b');
  const w = { el, body, key, onClose: opts.onClose, update: null };
  wins.set(key, w);
  w.update = build(body, w) || null;
  el.querySelector('.win-x').onclick = () => closeWin(key);
  el.addEventListener('pointerdown', () => el.style.zIndex = ++zTop);
  const head = el.querySelector('.win-h');
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
    const mv = ev => { el.style.left = Math.max(0, ev.clientX - sx) + 'px'; el.style.top = Math.max(44, ev.clientY - sy) + 'px'; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  w.update?.();
  return w;
}
export function closeWin(key) {
  const w = wins.get(key);
  if (!w) return;
  w.el.remove(); wins.delete(key);
  w.onClose?.();
}
export function closeAllWins() { [...wins.keys()].forEach(closeWin); }
export function setWinTitle(key, title) { const w = wins.get(key); if (w) w.el.querySelector('.win-t').textContent = title; }
function refreshWins() { for (const w of wins.values()) { try { w.update?.(); } catch (e) { console.error(e); } } }

// ---------- Barre d'outils et palettes ----------
const CATEGORIES = [
  { id: 'paths', icon: '🛤️', name: 'Chemins' },
  { id: 'rides', icon: '🎡', name: 'Manèges' },
  { id: 'coasters', icon: '🎢', name: 'Montagnes russes' },
  { id: 'shops', icon: '🍔', name: 'Boutiques' },
  { id: 'scenery', icon: '🌳', name: 'Décor' },
  { id: 'terrain', icon: '⛰️', name: 'Terrain' },
  { id: 'staff', icon: '👷', name: 'Personnel' },
  { id: 'demolish', icon: '💥', name: 'Démolir' },
];

function paletteItems(cat) {
  switch (cat) {
    case 'paths': return [
      { label: 'Chemin', icon: '🟫', cost: PATH_COST, tool: { kind: 'path' }, tip: 'Cliquez-glissez pour tracer' },
      { label: 'File d\'attente', icon: '🟦', cost: QUEUE_COST, tool: { kind: 'path', queue: true }, tip: 'Relie l\'entrée d\'une attraction au chemin : les visiteurs y font la queue' },
      ...Object.entries(FURNITURE).map(([k, d]) => ({ label: d.name, icon: { bench: '🪑', bin: '🗑️', lamp: '💡' }[k], cost: d.cost, tool: { kind: 'furn', type: k }, tip: 'Sur un chemin' })),
    ];
    case 'rides': return Object.entries(RIDES).map(([k, d]) => ({ label: d.name, icon: d.icon, cost: d.cost, tool: { kind: 'ride', type: k }, tip: `${d.size}×${d.size} · Exc ${d.exc} · Int ${d.int} · Nau ${d.nau}` }));
    case 'coasters': return [
      ...Object.entries(DESIGNS).map(([k, d]) => ({ label: d.name, icon: d.icon, cost: designCost(k), tool: { kind: 'design', key: k, dir: 0 }, tip: `${d.desc} · ${COASTERS[d.type].name} · R pour pivoter` })),
      ...Object.entries(COASTERS).map(([k, d]) => ({ label: 'Créer : ' + d.name, icon: d.icon, cost: d.stationCost * STATION_PIECES, tool: { kind: 'coasterStart', type: k, dir: 0 }, tip: `Construction libre · Hauteur max ${d.maxH} · ${d.pieceCost} €/pièce · R pour tourner la gare` }))];
    case 'shops': return Object.entries(STALLS).map(([k, d]) => ({ label: d.name, icon: d.icon, cost: d.cost, tool: { kind: 'ride', type: k }, tip: d.item ? `Vend : ${d.item}` : 'Service' }));
    case 'scenery': return Object.entries(SCENERY).map(([k, d]) => ({ label: d.name, icon: { oak: '🌳', pine: '🌲', palm: '🌴', bush: '🌿', flowers: '🌷', fountain: '⛲', statue: '🗿', hedge: '🟩' }[k], cost: d.cost, tool: { kind: 'scenery', type: k }, tip: `Beauté +${d.beauty}` }));
    case 'terrain': return [
      { label: 'Creuser (eau)', icon: '💧', cost: TERRAFORM_COST, tool: { kind: 'terraform', mode: 'water' } },
      { label: 'Herbe', icon: '🟩', cost: TERRAFORM_COST, tool: { kind: 'terraform', mode: 'grass' } },
      { label: 'Sable', icon: '🟨', cost: TERRAFORM_COST, tool: { kind: 'terraform', mode: 'sand' } },
    ];
  }
  return [];
}

let openCat = null;
function toggleCategory(cat) {
  if (cat === 'staff') { openStaffWindow(); return; }
  if (cat === 'demolish') { setTool(UI.tool?.kind === 'demolish' ? null : { kind: 'demolish' }); closePalette(); return; }
  if (openCat === cat) { closePalette(); return; }
  openCat = cat;
  const p = $('#palette');
  p.innerHTML = '';
  for (const it of paletteItems(cat)) {
    const b = h(`<button class="pal-item" title="${esc(it.tip || '')}"><span class="pi">${it.icon}</span><span class="pl">${esc(it.label)}</span><span class="pc">${money(it.cost)}</span></button>`);
    b.onclick = () => { setTool({ ...it.tool }); p.querySelectorAll('.pal-item').forEach(x => x.classList.remove('active')); b.classList.add('active'); };
    p.appendChild(b);
  }
  p.classList.remove('hidden');
  document.querySelectorAll('#toolbar button').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
}
function closePalette() {
  openCat = null; $('#palette').classList.add('hidden');
  document.querySelectorAll('#toolbar button').forEach(b => b.classList.toggle('active', b.dataset.cat === 'demolish' && UI.tool?.kind === 'demolish'));
}

export function setTool(tool) {
  if (UI.tool?.kind === 'coasterBuild' && tool?.kind !== 'coasterBuild') closeWin('builder');
  UI.tool = tool;
  UI.showGrid = !!tool;
  document.body.classList.toggle('tooling', !!tool);
  document.querySelectorAll('#toolbar button').forEach(b => b.classList.toggle('active', (b.dataset.cat === openCat) || (b.dataset.cat === 'demolish' && tool?.kind === 'demolish')));
  if (!tool) $('#palette').querySelectorAll('.pal-item').forEach(x => x.classList.remove('active'));
}

// ---------- HUD ----------
function updateHUD() {
  const f = $('#hud');
  f.querySelector('[data-f=money]').textContent = G.sandbox ? '∞' : money(Math.round(G.money));
  f.querySelector('[data-f=money]').classList.toggle('neg', G.money < 0);
  f.querySelector('[data-f=guests]').textContent = G.guests.length;
  f.querySelector('[data-f=rating]').textContent = G.rating;
  f.querySelector('[data-f=date]').textContent = dateString();
  const pb = f.querySelector('[data-f=parkbtn]');
  pb.textContent = G.entranceClosed ? '🔒 Parc fermé' : '🔓 Parc ouvert';
  pb.classList.toggle('closed', !!G.entranceClosed);
  document.querySelectorAll('.speed button').forEach(b => b.classList.toggle('active', UI.paused ? b.dataset.s === '0' : +b.dataset.s === UI.speed));
}

// ---------- Fenêtre attraction ----------
export function openRideWindow(id) {
  const r = rideById(id);
  if (!r) return;
  const def = defOf(r);
  const key = 'ride:' + id;
  openWin(key, r.name, (body) => {
    const isStall = r.kind === 'stall';
    body.innerHTML = `
      <div class="row"><input data-f="name" class="name-in" value="${esc(r.name)}" maxlength="32"></div>
      <div class="row status-row">
        <span data-f="status" class="badge"></span>
        <button data-f="open">Ouvrir</button><button data-f="close">Fermer</button>
      </div>
      <div class="row" data-f="buildrow"><button data-f="build" class="wide">🛠️ Continuer la construction</button></div>
      <div class="row" data-f="gaterow"><button data-f="gin">🟩 Placer l'entrée</button><button data-f="gout">🟥 Placer la sortie</button></div>
      <div class="row price-row"><span>${isStall ? 'Prix de vente' : 'Prix du billet'}</span>
        <button data-f="pm">−</button><b data-f="price"></b><button data-f="pp">+</button></div>
      <div data-f="ratings" class="ratings"></div>
      <table class="stats" data-f="stats"></table>
      <div class="row"><button data-f="locate">📍 Localiser</button><button data-f="demolish" class="danger">💥 Démolir</button></div>`;
    const F = fields(body);
    F.name.onchange = () => { r.name = F.name.value.trim().slice(0, 32) || r.name; setWinTitle(key, r.name); };
    F.open.onclick = () => { const e = setRideStatus(r, 'open', hooks); if (e) flash(e); };
    F.close.onclick = () => { const e = setRideStatus(r, 'closed', hooks); if (e) flash(e); };
    F.pm.onclick = () => { r.price = Math.max(0, Math.round((r.price - 0.5) * 2) / 2); };
    F.pp.onclick = () => { r.price = Math.min(30, Math.round((r.price + 0.5) * 2) / 2); };
    F.locate.onclick = () => centerOn(r.x + 0.5, r.y + 0.5);
    F.build.onclick = () => openBuilder(r);
    F.gin.onclick = () => startGatePlacement(r, 'entrance');
    F.gout.onclick = () => startGatePlacement(r, 'exit');
    F.demolish.onclick = () => {
      if (!confirm(`Démolir ${r.name} ? Vous récupérerez ${money(Math.round(r.value * 0.5))}.`)) return;
      if (UI.tool?.rideId === r.id) setTool(null);
      demolishRide(r, hooks); closeWin(key); UI.selected = null;
    };
    if (isStall && r.type === 'toilets') F.price.parentElement.style.display = 'none';
    return () => {
      if (!G.rides.includes(r)) { closeWin(key); return; }
      const st = { open: ['Ouvert', 'ok'], closed: ['Fermé', 'off'], broken: ['En panne', 'bad'], building: ['En construction', 'off'] }[r.status] || [r.status, 'off'];
      F.status.textContent = st[0]; F.status.className = 'badge ' + st[1];
      F.price.textContent = money2(r.price);
      F.buildrow.style.display = r.kind === 'coaster' && !r.complete ? '' : 'none';
      F.gaterow.style.display = isStall || (r.kind === 'coaster' && !r.complete) ? 'none' : '';
      F.gin.textContent = r.entrance ? '🟩 Déplacer l\'entrée' : '🟩 Placer l\'entrée';
      F.gout.textContent = r.exit ? '🟥 Déplacer la sortie' : '🟥 Placer la sortie';
      F.open.disabled = r.status === 'open'; F.close.disabled = r.status === 'closed' || r.status === 'building';
      if (r.ratings && !r.ratings.fail && !isStall) {
        const rt = r.ratings, lvl = v => v < 2 ? 'Faible' : v < 4 ? 'Moyenne' : v < 6 ? 'Élevée' : v < 8 ? 'Très élevée' : 'Extrême';
        F.ratings.innerHTML = `
          <div>Excitation <b>${rt.exc.toFixed(2)}</b> <i>(${lvl(rt.exc)})</i></div>
          <div>Intensité <b>${rt.int.toFixed(2)}</b> <i>(${lvl(rt.int)})</i></div>
          <div>Nausée <b>${rt.nau.toFixed(2)}</b> <i>(${lvl(rt.nau)})</i></div>
          <div class="hint">Valeur perçue : ~${money2(rideValue(r))}</div>`;
      } else if (r.ratings?.fail) F.ratings.innerHTML = `<div class="err">Essai échoué : ${esc(r.ratings.fail)}.<br>Retirez des pièces pour corriger le circuit.</div>`;
      else F.ratings.innerHTML = isStall ? `<div class="hint">${def.item ? 'Coût de revient : ' + money2(def.itemCost) : 'Service gratuit pour les visiteurs'}</div>` : '';
      const rows = [];
      if (!isStall) {
        rows.push(['File d\'attente', `${r.queue.length} visiteurs`]);
        rows.push(['Capacité', r.kind === 'coaster' ? capacity(r) : def.cap]);
        if (r.kind === 'coaster' && r.ratings && !r.ratings.fail) {
          rows.push(['Vitesse max', `${r.ratings.maxV.toFixed(0)} km/h`]);
          rows.push(['Longueur', `${r.ratings.length.toFixed(0)} m`]);
          rows.push(['Chute max', `${r.ratings.maxDrop.toFixed(1)} m`]);
          rows.push(['G vertical', `${r.ratings.maxVG.toFixed(2)} / ${r.ratings.minVG.toFixed(2)}`]);
          rows.push(['G latéral', r.ratings.maxLG.toFixed(2)]);
          rows.push(['Durée', `${r.ratings.time.toFixed(0)} s`]);
        }
        rows.push(['Fiabilité', `${Math.round(r.reliability)} %`]);
        if (!r.entrance || !r.exit) rows.push(['⚠️', '<span class="err">Placez l\'entrée et la sortie</span>']);
        else {
          if (!accessTiles(r).filter(i => r.entrance && Math.abs(i % G.w - r.entrance.x) + Math.abs(((i / G.w) | 0) - r.entrance.y) === 1).length && !queueConnected(r)) rows.push(['⚠️', '<span class="err">L\'entrée n\'est reliée à aucun chemin</span>']);
          if (!accessTiles(r).filter(i => Math.abs(i % G.w - r.exit.x) + Math.abs(((i / G.w) | 0) - r.exit.y) === 1).length) rows.push(['⚠️', '<span class="err">La sortie n\'est reliée à aucun chemin</span>']);
        }
      } else if (!accessTiles(r).length) rows.push(['⚠️', '<span class="err">Reliez la boutique à un chemin</span>']);
      rows.push([isStall ? 'Ventes' : 'Passagers', r.totalRiders]);
      rows.push(['Recette totale', money2(r.income)]);
      rows.push(['Bénéfice ce mois', money2(r.monthIncome)]);
      rows.push(['Mois dernier', money2(r.lastMonthIncome)]);
      rows.push(['Coût mensuel', money(def.run)]);
      F.stats.innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    };
  }, { width: 290 });
}

// ---------- Constructeur de montagnes russes ----------
export function openBuilder(r) {
  setTool({ kind: 'coasterBuild', rideId: r.id, piece: 'straight' });
  closePalette();
  const def = COASTERS[r.type];
  openWin('builder', `Construction : ${r.name}`, (body) => {
    const pieces = Object.entries(PIECES).filter(([k]) => k !== 'station' && (k !== 'booster' || def.boost));
    body.innerHTML = `
      <div class="hint">Survolez une pièce pour la prévisualiser, cliquez pour la poser. Raccourcis : pavé numérique, Retour arrière pour annuler.</div>
      <div class="pieces">${pieces.map(([k, p]) => `<button data-p="${k}" title="${p.name} (touche ${p.key})"><span class="pic">${pieceIcon(k)}</span>${p.name}</button>`).join('')}</div>
      <label class="row"><input type="checkbox" data-f="chain"> Lift à chaîne sur les montées</label>
      <div class="row"><button data-f="undo">↩️ Retirer la dernière pièce</button></div>
      <div data-f="info" class="hint"></div>
      <div data-f="err" class="err"></div>
      <div class="row"><button data-f="ride" class="wide">Fenêtre de l'attraction</button></div>`;
    const F = fields(body);
    F.chain.checked = r.chainMode;
    F.chain.onchange = () => { r.chainMode = F.chain.checked; };
    body.querySelectorAll('[data-p]').forEach(b => {
      b.onmouseenter = () => { if (UI.tool?.kind === 'coasterBuild') UI.tool.piece = b.dataset.p; };
      b.onclick = () => buildPiece(r, b.dataset.p);
    });
    F.undo.onclick = () => { const e = removeLastPiece(r); if (e) flash(e); else if (UI.tool?.kind !== 'coasterBuild') setTool({ kind: 'coasterBuild', rideId: r.id, piece: 'straight' }); };
    F.ride.onclick = () => openRideWindow(r.id);
    return () => {
      if (!G.rides.includes(r)) { closeWin('builder'); return; }
      F.chain.checked = r.chainMode;
      const c = r.cursor;
      F.info.innerHTML = r.complete ? '<b>Circuit terminé !</b>' : `Pièces : ${r.pieces.length} · Hauteur actuelle : ${c.h} / ${def.maxH} · ${money(def.pieceCost)} par pièce<br>Revenez à l'entrée de la gare (hauteur 0) pour fermer le circuit.`;
      const piece = UI.tool?.piece || 'straight';
      F.err.textContent = r.complete ? '' : (canAppend(r, piece) || '');
      body.querySelectorAll('[data-p]').forEach(b => { b.disabled = r.complete; b.classList.toggle('active', b.dataset.p === piece); });
    };
  }, { width: 330, onClose: () => { if (UI.tool?.kind === 'coasterBuild') { UI.tool = null; UI.showGrid = false; } } });
}
function pieceIcon(k) { return { straight: '⬆️', left: '↰', right: '↱', up: '↗️', down: '↘️', steepUp: '⏫', steepDown: '⏬', booster: '⚡' }[k] || '▪'; }

export function buildPiece(r, type) {
  if (UI.tool?.kind === 'coasterBuild') UI.tool.piece = type;
  const e = appendPiece(r, type);
  if (e) { flash(e); return; }
  if (r.complete) {
    setTool(null);
    closeWin('builder');
    openRideWindow(r.id);
    if (r.ratings && !r.ratings.fail) { flash('Circuit terminé ! Placez maintenant l\'entrée près de la gare.', false); startGatePlacement(r, 'entrance'); }
  }
}

function queueConnected(r) {
  if (!r.entrance) return false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = r.entrance.x + dx, y = r.entrance.y + dy;
    if (x >= 0 && y >= 0 && x < G.w && y < G.h && G.path[y * G.w + x] === 2) return true;
  }
  return false;
}

// Outil de placement d'entrée / sortie
export function startGatePlacement(r, gate) {
  setTool({ kind: 'gate', rideId: r.id, gate });
  closePalette();
  UI.tool.kind = 'gate';
}
export function gatePlaced(r, gate) {
  if (gate === 'entrance' && !r.exit) { startGatePlacement(r, 'exit'); flash('Entrée placée. Placez maintenant la sortie.', false); return; }
  setTool(null);
  openRideWindow(r.id);
  flash(gate === 'entrance' ? 'Entrée placée' : 'Sortie placée. Reliez-les aux chemins puis ouvrez l\'attraction !', false);
}

// ---------- Fenêtre visiteur ----------
export function openGuestWindow(id) {
  const g = guestById(id);
  if (!g) return;
  const key = 'guest:' + id;
  openWin(key, g.name, (body) => {
    body.innerHTML = `<div data-f="state" class="hint"></div><div data-f="needs"></div><table class="stats" data-f="stats"></table><div class="sub">Pensées</div><ul class="thoughts" data-f="th"></ul>
      <div class="row"><button data-f="follow">📍 Localiser</button></div>`;
    const F = fields(body);
    F.follow.onclick = () => centerOn(g.x, g.y);
    return () => {
      if (!G.guests.includes(g)) { F.state.textContent = 'Ce visiteur a quitté le parc.'; return; }
      const r = g.rideId ? rideById(g.rideId) : null;
      const goal = g.goal?.type === 'ride' ? rideById(g.goal.id)?.name : g.goal?.type === 'exit' ? 'la sortie' : g.goal?.type === 'need' ? { food: 'à manger', drink: 'à boire', toilet: 'des toilettes', gift: 'une boutique', map: 'un kiosque' }[g.goal.need] : null;
      F.state.textContent = { walk: goal ? `Se dirige vers ${goal}` : 'Se promène', queue: `Fait la queue pour ${r?.name}`, ride: `Est sur ${r?.name}`, buy: 'Achète quelque chose', sit: 'Se repose sur un banc' }[g.state] || '';
      F.needs.innerHTML = [
        ['Bonheur', g.happy, '#2ecc71'], ['Énergie', g.energy, '#3498db'], ['Faim', g.hunger, '#e67e22'],
        ['Soif', g.thirst, '#00cec9'], ['Toilettes', g.toilet, '#a29bfe'], ['Nausée', g.nausea, '#badc58'],
      ].map(([n, v, c]) => `<div class="need"><span>${n}</span>${bar(v, c)}</div>`).join('');
      const nb = Object.values(g.rides).reduce((a, b) => a + b, 0);
      F.stats.innerHTML = [
        ['Argent', money2(g.money)], ['Dépensé', money2(g.spent)], ['Temps dans le parc', `${Math.floor(g.timeInPark / 60)} min`],
        ['Manèges faits', nb], ['Intensité préférée', `${g.intMin.toFixed(1)} – ${g.intMax.toFixed(1)}`],
        ['Objets', [g.items.balloon && '🎈 Ballon', g.items.map && '🗺️ Plan'].filter(Boolean).join(', ') || '—'],
      ].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
      F.th.innerHTML = g.thoughts.map(t => `<li>${esc(t.text)}</li>`).join('') || '<li>…</li>';
    };
  }, { width: 270 });
}

// ---------- Personnel ----------
export function openStaffWindow(selectId = null) {
  openWin('staff', 'Personnel', (body) => {
    body.innerHTML = `<div class="hire">${Object.entries(STAFF).map(([k, d]) => `<button data-h="${k}">+ ${d.name}<br><small>${money(d.wage)}/mois</small></button>`).join('')}</div><div data-f="list" class="list"></div>`;
    const F = fields(body);
    body.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { hireStaff(b.dataset.h); });
    let last = '';
    return () => {
      const sig = G.staff.map(s => s.id + ':' + s.done).join(',');
      if (sig === last) return; last = sig;
      F.list.innerHTML = G.staff.length ? G.staff.map(s => `<div class="li"><span>${{ handyman: '🧹', mechanic: '🔧', entertainer: '🤡' }[s.type]} ${esc(s.first)} <small>(${esc(STAFF[s.type].name)}) · ${s.type === 'handyman' ? s.done + ' nettoyages' : s.type === 'mechanic' ? s.done + ' réparations' : ''}</small></span><span><button data-loc="${s.id}">📍</button><button data-fire="${s.id}" class="danger">Renvoyer</button></span></div>`).join('') : '<div class="hint">Aucun employé. Embauchez des agents d\'entretien pour garder le parc propre et des mécaniciens pour réparer les pannes.</div>';
      F.list.querySelectorAll('[data-fire]').forEach(b => b.onclick = () => { fireStaff(G.staff.find(s => s.id === +b.dataset.fire)); last = ''; });
      F.list.querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { const s = G.staff.find(s => s.id === +b.dataset.loc); if (s) { centerOn(s.x, s.y); UI.selected = { type: 'staff', id: s.id }; } });
    };
  }, { width: 360 });
}

// ---------- Finances ----------
const CATS = { entry: 'Entrées du parc', rides: 'Billets manèges', shops: 'Ventes boutiques', stock: 'Achats stock', running: 'Fonctionnement', wages: 'Salaires', construction: 'Construction', landscaping: 'Aménagement', interest: 'Intérêts' };
export function openFinances() {
  openWin('finances', 'Finances', (body) => {
    body.innerHTML = `<table class="fin" data-f="t"></table>
      <div class="row loan"><span>Emprunt : <b data-f="loan"></b> / <span data-f="max"></span></span>
      <button data-f="borrow">+1 000 €</button><button data-f="repay">−1 000 €</button></div>
      <div class="hint">Intérêts : 7 % par an. Valeur du parc : <b data-f="pv"></b> · Valeur de l'entreprise : <b data-f="cv"></b></div>`;
    const F = fields(body);
    F.borrow.onclick = () => { if (G.loan + 1000 > G.maxLoan) flash('Plafond d\'emprunt atteint'); else takeLoan(1000); };
    F.repay.onclick = () => { if (G.money < 1000) flash('Fonds insuffisants'); else repayLoan(1000); };
    return () => {
      const cols = [...G.finances.history.slice(-3), { label: 'Ce mois', ...G.finances.current }];
      let html = `<tr><th></th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr>`;
      for (const [k, n] of Object.entries(CATS)) html += `<tr><td>${n}</td>${cols.map(c => `<td class="${(c[k] || 0) < 0 ? 'neg' : (c[k] || 0) > 0 ? 'pos' : ''}">${c[k] ? money(Math.round(c[k])) : '—'}</td>`).join('')}</tr>`;
      html += `<tr class="tot"><td>Total</td>${cols.map(c => { const t = Object.keys(CATS).reduce((s, k) => s + (c[k] || 0), 0); return `<td class="${t < 0 ? 'neg' : 'pos'}">${money(Math.round(t))}</td>`; }).join('')}</tr>`;
      F.t.innerHTML = html;
      F.loan.textContent = money(G.loan); F.max.textContent = money(G.maxLoan);
      F.pv.textContent = money(Math.round(parkValue())); F.cv.textContent = money(companyValue());
    };
  }, { width: 520 });
}

// ---------- Parc ----------
export function openParkWindow() {
  openWin('park', 'Parc', (body) => {
    body.innerHTML = `
      <div class="row"><input data-f="name" class="name-in" maxlength="24"></div>
      <div class="row price-row"><span>Prix d'entrée</span><button data-f="fm">−</button><b data-f="fee"></b><button data-f="fp">+</button></div>
      <div class="row"><button data-f="toggle"></button></div>
      <table class="stats" data-f="stats"></table>
      <div class="sub">Visiteurs (par mois)</div><canvas data-f="chart" width="300" height="60" class="chart"></canvas>
      <div class="sub">Objectif</div><div data-f="goal" class="hint"></div>
      <div class="sub">Ce que pensent les visiteurs</div><ul class="thoughts" data-f="th"></ul>
      <div class="row"><button data-f="score" class="wide">🏆 Publier mon score en ligne</button></div>`;
    const F = fields(body);
    F.name.value = G.parkName;
    F.name.onchange = () => { G.parkName = F.name.value.trim().slice(0, 24) || G.parkName; };
    F.fm.onclick = () => { G.entryFee = Math.max(0, G.entryFee - 1); };
    F.fp.onclick = () => { G.entryFee = Math.min(100, G.entryFee + 1); };
    F.toggle.onclick = () => { G.entranceClosed = !G.entranceClosed; };
    F.score.onclick = () => submitScore();
    let tick = 0;
    return () => {
      F.fee.textContent = money(G.entryFee);
      F.toggle.textContent = G.entranceClosed ? '🔓 Ouvrir le parc' : '🔒 Fermer le parc aux nouveaux visiteurs';
      const lit = G.litter.reduce((a, b) => a + b, 0), vom = G.vomit.reduce((a, b) => a + b, 0);
      F.stats.innerHTML = [
        ['Note du parc', `<b>${G.rating}</b> / 999`], ['Visiteurs', `${G.guests.length} (capacité estimée ${guestCapacity()})`],
        ['Bonheur moyen', `${Math.round(avgHappiness())} %`], ['Visiteurs accueillis', G.stats.totalGuests],
        ['Déchets / vomi', `${lit} / ${vom}`], ['Attractions', G.rides.filter(r => r.kind !== 'stall').length + ' (+ ' + G.rides.filter(r => r.kind === 'stall').length + ' boutiques)'],
      ].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
      const goal = G.scenarioData?.goal;
      F.goal.innerHTML = goal ? `Avoir au moins <b>${goal.guests}</b> visiteurs et une note d'au moins <b>${goal.rating}</b> à la fin d'un mois, avant la fin d'Octobre de l'année ${goal.year}.<br>État : <b>${{ running: 'En cours', won: '✅ Réussi !', lost: '❌ Échoué' }[G.goalState]}</b>` : 'Mode libre — aucun objectif.';
      if (tick++ % 5 === 0) {
        const counts = new Map();
        for (const g of G.guests) if (g.thoughts[0] && G.time - g.thoughts[0].t < 60) counts.set(g.thoughts[0].text, (counts.get(g.thoughts[0].text) || 0) + 1);
        F.th.innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t, n]) => `<li><b>${n}×</b> ${esc(t)}</li>`).join('') || '<li>…</li>';
        drawChart(F.chart, [...G.guestHistory, G.guests.length]);
      }
    };
  }, { width: 340 });
}
function drawChart(cv, data) {
  const c = cv.getContext('2d'); const w = cv.width, hh = cv.height;
  c.clearRect(0, 0, w, hh);
  if (data.length < 2) { c.fillStyle = '#888'; c.font = '11px sans-serif'; c.fillText('Pas encore de données', 8, 30); return; }
  const mx = Math.max(10, ...data);
  c.beginPath();
  data.forEach((v, i) => { const x = i / (data.length - 1) * (w - 4) + 2, y = hh - 4 - v / mx * (hh - 10); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.strokeStyle = '#2ecc71'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#aaa'; c.font = '10px sans-serif'; c.fillText(mx, 4, 10);
}

// ---------- Liste des attractions ----------
export function openRidesList() {
  openWin('rides', 'Attractions et boutiques', (body) => {
    body.innerHTML = '<div data-f="list" class="list"></div>';
    const F = fields(body);
    return () => {
      F.list.innerHTML = G.rides.length ? G.rides.map(r => `<div class="li click" data-r="${r.id}"><span>${defOf(r).icon} ${esc(r.name)}</span><span class="badge ${r.status === 'open' ? 'ok' : r.status === 'broken' ? 'bad' : 'off'}">${{ open: 'Ouvert', closed: 'Fermé', broken: 'Panne', building: 'Chantier' }[r.status]}</span><span>${r.kind === 'stall' ? '' : r.queue.length + ' 👥'}</span><span>${money2(r.lastMonthIncome || r.monthIncome)}</span></div>`).join('') : '<div class="hint">Aucune attraction.</div>';
      F.list.querySelectorAll('[data-r]').forEach(e => e.onclick = () => openRideWindow(+e.dataset.r));
    };
  }, { width: 420 });
}

// ---------- Messages ----------
export function openMessages() {
  openWin('messages', 'Messages', (body) => {
    body.innerHTML = '<div data-f="list" class="list msgs"></div>';
    const F = fields(body);
    let n = -1;
    return () => {
      if (n === G.messages.length) return; n = G.messages.length;
      F.list.innerHTML = G.messages.slice().reverse().map((m, i) => `<div class="li msg ${m.type} ${m.loc ? 'click' : ''}" data-i="${G.messages.length - 1 - i}"><small>${esc(m.date)}</small> ${esc(m.text)}</div>`).join('');
      F.list.querySelectorAll('[data-i]').forEach(e => e.onclick = () => { const m = G.messages[+e.dataset.i]; if (m?.loc) centerOn(m.loc.x + 0.5, m.loc.y + 0.5); });
    };
  }, { width: 380 });
}

function showTicker(m) {
  const t = $('#ticker');
  t.innerHTML = `<span class="${m.type}">${esc(m.text)}</span>`;
  t.classList.add('show');
  t.onclick = () => { if (m.loc) centerOn(m.loc.x + 0.5, m.loc.y + 0.5); else openMessages(); };
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 7000);
}

// ---------- Sauvegarde / chargement ----------
const LOCAL_KEY = 'll_autosave';
export function saveLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(serialize())); return true; } catch (e) { console.warn(e); return false; }
}
export function hasLocal() { return !!localStorage.getItem(LOCAL_KEY); }
export function loadLocal() {
  const s = localStorage.getItem(LOCAL_KEY);
  if (!s) return false;
  deserialize(JSON.parse(s));
  return true;
}

function credsForm() {
  return `<div class="creds"><input data-f="player" placeholder="Pseudo" maxlength="32" value="${esc(UI.player)}"><input data-f="pin" type="password" placeholder="Code secret" maxlength="32" value="${esc(UI.pin)}"></div>
  <div class="hint">Le pseudo et le code secret protègent vos sauvegardes en ligne (le code est créé à la première sauvegarde).</div>`;
}
function readCreds(F) {
  UI.player = F.player.value.trim(); UI.pin = F.pin.value;
  localStorage.setItem('ll_player', UI.player); localStorage.setItem('ll_pin', UI.pin);
  if (!/^[\w\-]{2,32}$/u.test(UI.player)) throw new Error('Pseudo invalide (2-32 caractères : lettres, chiffres, - ou _)');
  if (UI.pin.length < 3) throw new Error('Code secret trop court (3 caractères minimum)');
  return [UI.player, UI.pin];
}

export function openSaveWindow(mode = 'save') {
  closeWin('saves');
  openWin('saves', mode === 'save' ? 'Sauvegarder (en ligne)' : 'Charger une partie', (body) => {
    body.innerHTML = `${credsForm()}
      ${mode === 'save' ? `<div class="row"><input data-f="sname" placeholder="Nom de la sauvegarde" maxlength="40" value="${esc(G.parkName || '')} – ${esc(dateString())}"><button data-f="new">💾 Nouvelle</button></div>` : ''}
      <div class="row"><button data-f="refresh">🔄 Voir mes sauvegardes</button>${mode === 'load' && hasLocal() ? '<button data-f="local">💻 Sauvegarde locale</button>' : ''}</div>
      <div data-f="list" class="list"></div><div data-f="msg" class="hint"></div>`;
    const F = fields(body);
    const refresh = async () => {
      try {
        const [p, pin] = readCreds(F);
        F.msg.textContent = 'Chargement…';
        const res = await net.list(p, pin);
        F.msg.textContent = res.saves.length ? '' : 'Aucune sauvegarde en ligne pour ce pseudo.';
        F.list.innerHTML = res.saves.map(s => `<div class="li"><span>${esc(s.name)}<br><small>${esc(s.updated)}</small></span><span>${mode === 'save' ? `<button data-ow="${s.slot}">Écraser</button>` : `<button data-ld="${s.slot}">Charger</button>`}<button data-del="${s.slot}" class="danger">✕</button></span></div>`).join('');
        F.list.querySelectorAll('[data-ow]').forEach(b => b.onclick = () => doSave(+b.dataset.ow, F.sname.value));
        F.list.querySelectorAll('[data-ld]').forEach(b => b.onclick = async () => {
          try { const r = await net.load(p, pin, +b.dataset.ld); deserialize(r.data); closeAllWins(); hideMenu(); flash('Partie chargée !', false); } catch (e) { F.msg.textContent = e.message; }
        });
        F.list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          if (!confirm('Supprimer cette sauvegarde ?')) return;
          try { await net.remove(p, pin, +b.dataset.del); refresh(); } catch (e) { F.msg.textContent = e.message; }
        });
      } catch (e) { F.msg.textContent = '⚠️ ' + e.message; }
    };
    const doSave = async (slot, name) => {
      try {
        const [p, pin] = readCreds(F);
        F.msg.textContent = 'Sauvegarde…';
        await net.save(p, pin, slot, name || 'Sans nom', serialize());
        saveLocal();
        F.msg.textContent = '✅ Partie sauvegardée en ligne.';
        refresh();
      } catch (e) { F.msg.textContent = '⚠️ ' + e.message; }
    };
    F.refresh.onclick = refresh;
    if (F.new) F.new.onclick = () => doSave(0, F.sname.value);
    if (F.local) F.local.onclick = () => { loadLocal(); closeAllWins(); hideMenu(); };
    if (UI.player && UI.pin) refresh();
  }, { width: 380 });
}

export async function submitScore() {
  if (!UI.player) { flash('Indiquez d\'abord un pseudo dans la fenêtre de sauvegarde'); openSaveWindow('save'); return; }
  try {
    await net.submitScore({
      player: UI.player, pin: UI.pin, scenario: G.scenario, park: G.parkName,
      value: companyValue(), guests: G.guests.length, rating: G.rating, won: G.goalState === 'won',
      date: dateString(),
    });
    flash('Score publié !', false);
    openLeaderboard(G.scenario);
  } catch (e) { flash(e.message); }
}

export function openLeaderboard(scenario = SCENARIOS[0].id) {
  closeWin('lb');
  openWin('lb', 'Classement en ligne', (body) => {
    body.innerHTML = `<div class="tabs">${SCENARIOS.map(s => `<button data-s="${s.id}">${esc(s.name)}</button>`).join('')}</div><div data-f="list" class="list"></div>`;
    const F = fields(body);
    const load = async sc => {
      body.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('active', b.dataset.s === sc));
      F.list.innerHTML = '<div class="hint">Chargement…</div>';
      try {
        const res = await net.leaderboard(sc);
        F.list.innerHTML = res.scores.length ? `<table class="stats lb"><tr><th>#</th><th>Joueur</th><th>Parc</th><th>Valeur</th><th>Visiteurs</th><th>Note</th></tr>${res.scores.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.player)}${s.won ? ' 🏆' : ''}</td><td>${esc(s.park)}</td><td>${money(s.value)}</td><td>${s.guests}</td><td>${s.rating}</td></tr>`).join('')}</table>` : '<div class="hint">Aucun score pour ce scénario. Soyez le premier !</div>';
      } catch (e) { F.list.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => load(b.dataset.s));
    load(scenario);
  }, { width: 520 });
}

// ---------- Menu principal ----------
export function showMenu() {
  const m = $('#menu');
  m.innerHTML = `<div class="menu-box">
    <h1>🎢 Looping Land</h1><p class="tag">Construisez le parc d'attractions de vos rêves</p>
    ${hasLocal() ? '<button class="big" data-f="cont">▶ Continuer la partie</button>' : ''}
    <h3>Nouvelle partie</h3>
    <div class="scenarios">${SCENARIOS.map(s => `<button class="scn" data-s="${s.id}"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span><small>${s.goal ? `Objectif : ${s.goal.guests} visiteurs, note ${s.goal.rating}, an ${s.goal.year}` : 'Aucun objectif'} · ${s.sandbox ? 'Argent illimité' : 'Départ : ' + money(s.money)}</small></button>`).join('')}</div>
    <div class="row center"><button data-f="load">📂 Charger en ligne</button><button data-f="lb">🏆 Classement</button>${G.w ? '<button data-f="close">✕ Retour au jeu</button>' : ''}</div>
    <p class="hint">Clic gauche : construire / sélectionner · Clic droit ou glisser : déplacer la vue · Molette : zoom · R : pivoter · Échap : annuler</p>
  </div>`;
  m.classList.remove('hidden');
  UI.paused = true;
  const F = fields(m);
  m.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    if (G.w && !confirm('Commencer une nouvelle partie ? La partie en cours non sauvegardée sera perdue.')) return;
    newGame(b.dataset.s); closeAllWins(); setTool(null); hideMenu();
  });
  if (F.cont) F.cont.onclick = () => { if (!G.w) loadLocal(); hideMenu(); };
  F.load.onclick = () => openSaveWindow('load');
  F.lb.onclick = () => openLeaderboard();
  if (F.close) F.close.onclick = hideMenu;
}
export function hideMenu() { $('#menu').classList.add('hidden'); UI.paused = false; }

function onGoal(state) {
  openWin('goal', state === 'won' ? '🏆 Objectif atteint !' : 'Objectif manqué', (body) => {
    body.innerHTML = state === 'won'
      ? `<p>Bravo ! Votre parc <b>${esc(G.parkName)}</b> a atteint l'objectif du scénario.</p><p>Vous pouvez continuer à jouer et publier votre score en ligne.</p><div class="row"><button data-f="s" class="wide">🏆 Publier mon score</button></div>`
      : `<p>Le temps est écoulé. Vous pouvez continuer à développer votre parc librement.</p>`;
    const F = fields(body);
    if (F.s) F.s.onclick = () => submitScore();
  }, { width: 320 });
}

// ---------- Initialisation ----------
export function initUI() {
  const tb = $('#toolbar');
  for (const c of CATEGORIES) {
    const b = h(`<button data-cat="${c.id}" title="${c.name}"><span>${c.icon}</span><small>${c.name}</small></button>`);
    b.onclick = () => toggleCategory(c.id);
    tb.appendChild(b);
  }
  $('#hud').innerHTML = `
    <div class="brand" title="Menu">🎢</div>
    <div class="stat" title="Trésorerie"><span>💰</span><b data-f="money"></b></div>
    <div class="stat click" data-w="park" title="Visiteurs"><span>👥</span><b data-f="guests"></b></div>
    <div class="stat click" data-w="park" title="Note du parc"><span>⭐</span><b data-f="rating"></b></div>
    <div class="stat" title="Date"><span>📅</span><b data-f="date"></b></div>
    <button class="park-btn" data-f="parkbtn" title="Ouvrir / fermer le parc"></button>
    <div class="speed"><button data-s="0" title="Pause (Espace)">⏸</button><button data-s="1" title="Vitesse normale">▶</button><button data-s="2" title="Rapide">⏩</button><button data-s="4" title="Très rapide">⏭</button></div>
    <div class="menu-btns">
      <button data-w="park" title="Parc">🏞️</button><button data-w="rides" title="Attractions">🎠</button><button data-w="finances" title="Finances">📊</button>
      <button data-w="staff" title="Personnel">👷</button><button data-w="messages" title="Messages">✉️</button>
      <button data-w="save" title="Sauvegarder">💾</button><button data-w="menu" title="Menu principal">☰</button>
    </div>`;
  $('#hud [data-f=parkbtn]').onclick = () => {
    G.entranceClosed = !G.entranceClosed;
    flash(G.entranceClosed ? 'Parc fermé aux nouveaux visiteurs' : 'Le parc est ouvert ! Les visiteurs arrivent.', !!G.entranceClosed);
  };
  document.querySelectorAll('.speed button').forEach(b => b.onclick = () => { const s = +b.dataset.s; if (s === 0) UI.paused = !UI.paused; else { UI.speed = s; UI.paused = false; } });
  document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => ({
    park: openParkWindow, rides: openRidesList, finances: openFinances, staff: () => openStaffWindow(), messages: openMessages,
    save: () => openSaveWindow('save'), menu: showMenu,
  })[b.dataset.w]());
  $('#hud .brand').onclick = showMenu;
  on('message', showTicker);
  on('goal', onGoal);
  on('newgame', () => { centerOn(G.entrance.x - 2, G.entrance.y - 8); setTool(null); UI.selected = null; });
  on('month', () => saveLocal());
  setInterval(refreshWins, 400);
  setInterval(() => { if (G.w) updateHUD(); }, 200);
}
