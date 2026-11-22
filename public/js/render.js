// Rendu isométrique sur canvas (graphismes 100 % procéduraux)
import { G, RT, idx, inB, rideById } from './state.js';
import { TW, TH, ZH, TERRAIN, COASTERS, RIDES, STALLS, DX, DY, STAFF, TILE_M, H_M } from './config.js';
import { piecePoint, carPositions, previewPiece, canAppend, stationTiles, canStartCoaster, STATION_PIECES, designPieces, canPlaceDesign } from './coaster.js';
import { DESIGNS } from './config.js';
import { canPlaceRide, canPath, canScenery, canFurniture, canTerraform, canPlaceGate, footprint } from './rides.js';
import { UI } from './uistate.js';

export const cam = { x: 0, y: 0, zoom: 1 };
let canvas, ctx, W = 0, H = 0, dpr = 1, now = 0;

export function initRender(c) {
  canvas = c; ctx = c.getContext('2d');
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  };
  window.addEventListener('resize', resize);
  resize();
}

export function centerOn(wx, wy) {
  cam.x = (wx - wy) * TW / 2;
  cam.y = (wx + wy) * TH / 2;
}

const ix = (x, y) => (x - y) * TW / 2;
const iy = (x, y, z = 0) => (x + y) * TH / 2 - z * ZH;

export function worldToScreen(x, y, z = 0) {
  return [(ix(x, y) - cam.x) * cam.zoom + W / 2, (iy(x, y, z) - cam.y) * cam.zoom + H / 2];
}
export function screenToWorld(sx, sy) {
  const X = (sx - W / 2) / cam.zoom + cam.x, Y = (sy - H / 2) / cam.zoom + cam.y;
  const a = X / (TW / 2), b = Y / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
export function screenToTile(sx, sy) {
  const w = screenToWorld(sx, sy);
  return { x: Math.floor(w.x), y: Math.floor(w.y) };
}

// ---------- Primitives ----------
function poly(pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => { const X = ix(x, y), Y = iy(x, y, z || 0); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function line(a, b, color, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(ix(a[0], a[1]), iy(a[0], a[1], a[2] || 0));
  ctx.lineTo(ix(b[0], b[1]), iy(b[0], b[1], b[2] || 0));
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}
function polyline(pts, color, lw) {
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => { const X = ix(x, y), Y = iy(x, y, z || 0); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r * f)); g = Math.max(0, Math.min(255, g * f)); b = Math.max(0, Math.min(255, b * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
// Boîte iso alignée sur les axes
function box(x0, y0, x1, y1, z0, z1, color) {
  poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], shade(color, 0.72));
  poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade(color, 0.86));
  poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color);
}
function circlePts(cx, cy, z, r, n = 20, a0 = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); }
  return out;
}
function disc(cx, cy, z, r, fill, stroke) { poly(circlePts(cx, cy, z, r, 24), fill, stroke); }
function blob(x, y, z, rpx, color) {
  ctx.beginPath(); ctx.arc(ix(x, y), iy(x, y, z), rpx, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function hash(x, y) { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---------- Sol ----------
const GRASS = ['#5c9e4a', '#62a54f', '#589848', '#5fa24c'];
const SAND = ['#e0c78a', '#e5cc90', '#dbc285'];

function drawGround(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y), t = G.terrain[i], h = hash(x, y);
    let c;
    if (t === TERRAIN.WATER) {
      const w = Math.sin(now * 1.5 + x * 0.7 + y * 0.4) * 0.5 + 0.5;
      c = `rgb(${50 + w * 15 | 0},${115 + w * 20 | 0},${200 + w * 15 | 0})`;
    } else if (t === TERRAIN.SAND) c = SAND[(h * 3) | 0];
    else c = GRASS[(h * 4) | 0];
    poly([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], c, UI.showGrid ? 'rgba(0,0,0,0.12)' : null);
    if (t === TERRAIN.WATER) {
      // berges
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (inB(nx, ny) && G.terrain[idx(nx, ny)] !== TERRAIN.WATER) {
          const e = edge(x, y, d);
          line(e[0], e[1], 'rgba(255,255,255,0.35)', 2);
        }
      }
      if (h > 0.85) {
        const sx = x + 0.3 + h * 0.4, sy = y + 0.3 + hash(y, x) * 0.4;
        const k = (Math.sin(now * 2 + h * 10) + 1) / 2;
        line([sx - 0.12, sy], [sx + 0.12, sy], `rgba(255,255,255,${0.2 + k * 0.3})`, 1);
      }
    } else if (t === TERRAIN.GRASS && h > 0.93) {
      blob(x + 0.3 + hash(y, x) * 0.4, y + 0.5, 0, 1.2, '#4b8a3b');
    }
    if (G.path[i]) drawPath(x, y);
  }
}
function edge(x, y, d) {
  if (d === 0) return [[x + 1, y], [x + 1, y + 1]];
  if (d === 1) return [[x, y + 1], [x + 1, y + 1]];
  if (d === 2) return [[x, y], [x, y + 1]];
  return [[x, y], [x + 1, y]];
}

function pathRects(x, y, w) {
  const a = 0.5 - w / 2, b = 0.5 + w / 2;
  const out = [[x + a, y + a, x + b, y + b]];
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (!(inB(nx, ny) && (G.path[idx(nx, ny)] || RT.gate[idx(nx, ny)])) && !(d === 1 && x === G.entrance.x && y === G.entrance.y)) continue;
    if (d === 0) out.push([x + 0.5, y + a, x + 1, y + b]);
    if (d === 1) out.push([x + a, y + 0.5, x + b, y + 1]);
    if (d === 2) out.push([x, y + a, x + 0.5, y + b]);
    if (d === 3) out.push([x + a, y, x + b, y + 0.5]);
  }
  return out;
}
function drawPath(x, y) {
  const i = idx(x, y);
  const q = G.path[i] === 2;
  for (const [a, b, c, d] of pathRects(x, y, q ? 0.74 : 0.84)) poly([[a, b], [c, b], [c, d], [a, d]], q ? '#3f5f86' : '#8d8577');
  for (const [a, b, c, d] of pathRects(x, y, q ? 0.6 : 0.7)) poly([[a, b], [c, b], [c, d], [a, d]], q ? '#86a9d4' : '#b9b0a0');
  if (q) for (const [a, b, c, d] of pathRects(x, y, 0.08)) poly([[a, b], [c, b], [c, d], [a, d]], 'rgba(255,255,255,0.55)');
  // déchets et vomi
  for (let k = 0; k < G.litter[i]; k++) {
    const h1 = hash(x * 7 + k, y * 3 - k), h2 = hash(y * 5 + k, x * 11 + k);
    blob(x + 0.25 + h1 * 0.5, y + 0.25 + h2 * 0.5, 0, 1.6, ['#e74c3c', '#ecf0f1', '#f1c40f', '#3498db'][k % 4]);
  }
  for (let k = 0; k < G.vomit[i]; k++) {
    const h1 = hash(x * 3 + k, y * 13), h2 = hash(y * 9, x * 5 + k);
    ctx.beginPath(); ctx.ellipse(ix(x + 0.3 + h1 * 0.4, y + 0.3 + h2 * 0.4), iy(x + 0.3 + h1 * 0.4, y + 0.3 + h2 * 0.4), 4, 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#b8c43a'; ctx.fill();
  }
}

// ---------- Décor ----------
function drawScenery(type, x, y, alpha = 1) {
  const cx = x + 0.5, cy = y + 0.5, h = hash(x, y);
  ctx.globalAlpha = alpha;
  switch (type) {
    case 'oak':
      line([cx, cy, 0], [cx, cy, 1.6], '#6d4c2f', 3);
      blob(cx, cy, 2.6, 13, '#2f6b2a'); blob(cx - 0.12, cy + 0.12, 2.9, 10, '#3f8a35'); blob(cx + 0.1, cy - 0.05, 3.4, 9, '#4d9c40'); blob(cx - 0.05, cy - 0.1, 3.3, 6, '#5bb04b');
      break;
    case 'pine':
      line([cx, cy, 0], [cx, cy, 1], '#5b3d26', 3);
      for (let k = 0; k < 3; k++) {
        const z = 1 + k * 1.1, w = 11 - k * 3;
        ctx.beginPath(); ctx.moveTo(ix(cx, cy) - w, iy(cx, cy, z)); ctx.lineTo(ix(cx, cy) + w, iy(cx, cy, z)); ctx.lineTo(ix(cx, cy), iy(cx, cy, z + 1.8)); ctx.closePath();
        ctx.fillStyle = k % 2 ? '#2e6b3a' : '#255a30'; ctx.fill();
      }
      break;
    case 'palm': {
      const tx = ix(cx, cy), ty = iy(cx, cy, 0);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + 6, ty - 25, tx + 2, ty - 50); ctx.strokeStyle = '#8b6b3d'; ctx.lineWidth = 3; ctx.stroke();
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + h;
        ctx.beginPath(); ctx.moveTo(tx + 2, ty - 50); ctx.quadraticCurveTo(tx + 2 + Math.cos(a) * 12, ty - 58 + Math.sin(a) * 4, tx + 2 + Math.cos(a) * 18, ty - 46 + Math.sin(a) * 6);
        ctx.strokeStyle = '#3c9a3c'; ctx.lineWidth = 3; ctx.stroke();
      }
      break;
    }
    case 'bush': blob(cx - 0.1, cy, 0.6, 7, '#3d7d33'); blob(cx + 0.1, cy + 0.05, 0.7, 6, '#4b9140'); break;
    case 'flowers':
      for (let k = 0; k < 9; k++) {
        const fx = x + 0.15 + hash(x + k, y) * 0.7, fy = y + 0.15 + hash(y - k, x + k * 3) * 0.7;
        blob(fx, fy, 0.25, 2.2, ['#e84393', '#fdcb6e', '#a29bfe', '#ff7675', '#fff'][k % 5]);
      }
      break;
    case 'hedge': box(x + 0.1, y + 0.1, x + 0.9, y + 0.9, 0, 0.9, '#3a7a30'); break;
    case 'fountain': {
      disc(cx, cy, 0.2, 0.42, '#bdc3c7', '#7f8c8d'); disc(cx, cy, 0.25, 0.34, '#5dade2');
      box(cx - 0.06, cy - 0.06, cx + 0.06, cy + 0.06, 0, 1.4, '#ecf0f1');
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + now;
        const p = (now * 1.5 + k / 6) % 1;
        blob(cx + Math.cos(a) * 0.25 * p, cy + Math.sin(a) * 0.25 * p, 1.4 + Math.sin(p * Math.PI) * 1.2, 1.8, 'rgba(180,220,255,0.9)');
      }
      break;
    }
    case 'statue':
      box(cx - 0.2, cy - 0.2, cx + 0.2, cy + 0.2, 0, 1, '#95a5a6');
      line([cx, cy, 1], [cx, cy, 2.2], '#c9b037', 4); blob(cx, cy, 2.6, 4, '#c9b037');
      line([cx, cy, 2], [cx + 0.15, cy - 0.1, 2.8], '#c9b037', 2);
      break;
  }
  ctx.globalAlpha = 1;
}

function drawFurniture(type, x, y) {
  const cx = x + 0.5, cy = y + 0.5;
  if (type === 'bench') { box(x + 0.78, y + 0.3, x + 0.92, y + 0.7, 0.25, 0.4, '#8e5b34'); line([x + 0.92, y + 0.3, 0.4], [x + 0.92, y + 0.7, 0.4], '#6b4226', 2); line([x + 0.92, y + 0.3, 0.4], [x + 0.92, y + 0.3, 0.8], '#6b4226', 1); line([x + 0.92, y + 0.7, 0.4], [x + 0.92, y + 0.7, 0.8], '#6b4226', 1); line([x + 0.92, y + 0.3, 0.8], [x + 0.92, y + 0.7, 0.8], '#8e5b34', 3); }
  if (type === 'bin') box(x + 0.08, y + 0.08, x + 0.2, y + 0.2, 0, 0.6, '#2d3436');
  if (type === 'lamp') {
    line([x + 0.12, y + 0.85, 0], [x + 0.12, y + 0.85, 2.4], '#2d3436', 2);
    blob(x + 0.12, y + 0.85, 2.5, 3.5, '#ffeaa7');
  }
}

// ---------- Personnages ----------
function drawPerson(x, y, z, shirt, pants, skin, extra) {
  const X = ix(x, y), Y = iy(x, y, z);
  ctx.fillStyle = pants; ctx.fillRect(X - 2.5, Y - 6, 2, 6); ctx.fillRect(X + 0.5, Y - 6, 2, 6);
  ctx.fillStyle = shirt; ctx.fillRect(X - 3, Y - 12, 6, 7);
  ctx.beginPath(); ctx.arc(X, Y - 14.5, 2.7, 0, Math.PI * 2); ctx.fillStyle = skin; ctx.fill();
  if (extra?.hat) { ctx.fillStyle = extra.hat; ctx.fillRect(X - 3, Y - 18.5, 6, 2); }
  if (extra?.balloon) {
    ctx.beginPath(); ctx.moveTo(X + 3, Y - 10); ctx.lineTo(X + 6, Y - 26); ctx.strokeStyle = '#555'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(X + 6, Y - 30, 3.5, 4.5, 0, 0, Math.PI * 2); ctx.fillStyle = extra.balloon; ctx.fill();
  }
}

// ---------- Montagnes russes ----------
function drawPiece(r, p, alpha = 1, color = null) {
  const def = COASTERS[r.type];
  ctx.globalAlpha = alpha;
  const N = p.dir === p.edir ? 4 : 8;
  const L = [], R = [], C = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const a = piecePoint(p, Math.max(0, t - 0.02)), b = piecePoint(p, Math.min(1, t + 0.02)), c = piecePoint(p, t);
    let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const z = c.z + 0.35;
    L.push([c.x - ty * 0.14, c.y + tx * 0.14, z]); R.push([c.x + ty * 0.14, c.y - tx * 0.14, z]); C.push([c.x, c.y, z - 0.25]);
  }
  // supports
  const mid = piecePoint(p, 0.5);
  if (mid.z > 0.2 && p.type !== 'station') {
    if (def.wood) {
      line([mid.x - 0.15, mid.y - 0.15, 0], [mid.x - 0.15, mid.y - 0.15, mid.z + 0.1], def.support, 2);
      line([mid.x + 0.15, mid.y + 0.15, 0], [mid.x + 0.15, mid.y + 0.15, mid.z + 0.1], def.support, 2);
      for (let z = 0; z < mid.z - 1; z += 2) line([mid.x - 0.15, mid.y - 0.15, z], [mid.x + 0.15, mid.y + 0.15, z + 2], def.support, 1);
    } else {
      line([mid.x, mid.y, 0], [mid.x, mid.y, mid.z], def.support, 3);
      blob(mid.x, mid.y, 0, 2.5, shade(def.support.length === 7 ? def.support : '#7f8c8d', 0.7));
    }
  }
  if (p.type === 'station') {
    box(p.x + 0.05, p.y + 0.05, p.x + 0.95, p.y + 0.95, 0, 0.25, '#a4a4a4');
    poly([[p.x + 0.05, p.y + 0.05, 0.26], [p.x + 0.95, p.y + 0.05, 0.26], [p.x + 0.95, p.y + 0.95, 0.26], [p.x + 0.05, p.y + 0.95, 0.26]], null, '#f1c40f', 1);
  }
  // traverses
  for (let k = 0; k <= N; k++) line(L[k], R[k], def.wood ? '#5d4037' : '#555', 2);
  polyline(C, color || def.color, 4);
  polyline(L, def.rail, 2); polyline(R, def.rail, 2);
  if (p.chain) for (let k = 0; k < N; k++) line(C[k], C[k + 1], '#222', 2);
  if (p.type === 'booster') for (let k = 0; k <= N; k++) blob(C[k][0], C[k][1], C[k][2] + 0.2, 1.8, '#f39c12');
  if (p.type === 'station') {
    // toit de gare
    const x = p.x, y = p.y;
    for (const [a, b] of [[0.1, 0.1], [0.9, 0.9]]) line([x + a, y + b, 0.25], [x + a, y + b, 3], '#7f8c8d', 2);
    poly([[x, y, 3], [x + 1, y, 3], [x + 1, y + 1, 3], [x, y + 1, 3]], 'rgba(230,126,34,0.85)', '#a04000');
  }
  ctx.globalAlpha = 1;
}

function drawCar(r, car, riders) {
  const def = COASTERS[r.type];
  const p = car.p;
  let [fx, fy] = car.dir; const fz = car.dir[2] * H_M / TILE_M;
  let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; const uz = fz / l;
  const hl = Math.hypot(fx, fy) || 1;
  const sx = -fy / hl, sy = fx / hl;
  const Lh = 0.3, Wh = 0.17;
  const z0 = p.z + 0.45;
  const corner = (a, b, dz) => [p.x + fx * a + sx * b, p.y + fy * a + sy * b, z0 + uz * a * TILE_M / H_M + dz];
  const top = [corner(Lh, Wh, 0.55), corner(Lh, -Wh, 0.55), corner(-Lh, -Wh, 0.55), corner(-Lh, Wh, 0.55)];
  const bot = [corner(Lh, Wh, 0), corner(Lh, -Wh, 0), corner(-Lh, -Wh, 0), corner(-Lh, Wh, 0)];
  for (let k = 0; k < 4; k++) poly([bot[k], bot[(k + 1) % 4], top[(k + 1) % 4], top[k]], shade(r.color, 0.65));
  poly(top, r.color, shade(r.color, 0.5));
  // passagers
  const per = def.perCar;
  for (let k = 0; k < per; k++) {
    const g = riders[car.i * per + k];
    if (!g) continue;
    const a = per > 2 ? (k < per / 2 ? 0.12 : -0.12) : 0;
    const b = (k % 2 ? -0.08 : 0.08);
    const c = corner(a, b, 0.55);
    const X = ix(c[0], c[1]), Y = iy(c[0], c[1], c[2]);
    ctx.fillStyle = g.shirt; ctx.fillRect(X - 2, Y - 5, 4, 4);
    ctx.beginPath(); ctx.arc(X, Y - 7, 2, 0, Math.PI * 2); ctx.fillStyle = g.skin; ctx.fill();
  }
}

// ---------- Attractions plates ----------
function drawRide(r, alpha = 1, ghost = false) {
  const def = RIDES[r.type] || STALLS[r.type];
  const s = def.size, x = r.x, y = r.y, cx = x + s / 2, cy = y + s / 2;
  const spin = r.spin || 0, anim = r.anim || 0;
  ctx.globalAlpha = alpha;
  if (def.kind === 'stall') { drawStall(r, def); ctx.globalAlpha = 1; return; }
  // plateforme
  box(x + 0.05, y + 0.05, x + s - 0.05, y + s - 0.05, 0, 0.2, '#b2a48f');
  const c = def.color;
  switch (r.type) {
    case 'carousel': {
      disc(cx, cy, 0.3, 0.85, shade(c, 0.8)); disc(cx, cy, 0.5, 0.82, '#f5e6c8');
      const pts = [];
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + spin * 1.6;
        pts.push({ a, x: cx + Math.cos(a) * 0.62, y: cy + Math.sin(a) * 0.62 });
      }
      pts.sort((p, q) => (p.x + p.y) - (q.x + q.y));
      for (const p of pts) {
        line([p.x, p.y, 0.5], [p.x, p.y, 3.4], '#d4ac0d', 1.5);
        const bob = Math.sin(spin * 4 + p.a * 3) * 0.3 * (r.phase === 'running' ? 1 : 0);
        box(p.x - 0.1, p.y - 0.1, p.x + 0.1, p.y + 0.1, 1.2 + bob, 1.7 + bob, ['#fff', '#e74c3c', '#3498db', '#f1c40f'][Math.round(p.a * 8 / Math.PI / 2) % 4]);
      }
      line([cx, cy, 0.5], [cx, cy, 3.4], '#d4ac0d', 4);
      const rim = circlePts(cx, cy, 3.4, 0.9, 16, spin * 1.6);
      for (let k = 0; k < 16; k++) poly([rim[k], rim[(k + 1) % 16], [cx, cy, 4.7]], k % 2 ? c : '#fff');
      break;
    }
    case 'teacups': {
      disc(cx, cy, 0.25, 0.9, '#f5e6c8', shade(c, 0.7));
      const cups = [];
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + spin * 1.2; cups.push([cx + Math.cos(a) * 0.5, cy + Math.sin(a) * 0.5, k]); }
      cups.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
      for (const [ux, uy, k] of cups) {
        const col = ['#e74c3c', '#3498db', '#2ecc71'][k];
        disc(ux, uy, 0.3, 0.26, shade(col, 0.7)); disc(ux, uy, 0.75, 0.3, col, '#fff');
        const sp = spin * 4 + k;
        blob(ux + Math.cos(sp) * 0.15, uy + Math.sin(sp) * 0.15, 0.9, 2.5, '#f5d0b0');
      }
      break;
    }
    case 'ferris': {
      const zc = 6.2, R = 1.25;
      line([cx - 0.8, cy - 0.3, 0.2], [cx, cy - 0.3, zc], '#7f8c8d', 3); line([cx + 0.8, cy - 0.3, 0.2], [cx, cy - 0.3, zc], '#7f8c8d', 3);
      const rimPts = [];
      for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; rimPts.push([cx + Math.cos(a) * R, cy, zc + Math.sin(a) * R * 2]); }
      poly(rimPts, null, c, 3);
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + spin * 0.5;
        const px = cx + Math.cos(a) * R, pz = zc + Math.sin(a) * R * 2;
        line([cx, cy, zc], [px, cy, pz], '#bdc3c7', 1);
      }
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + spin * 0.5;
        const px = cx + Math.cos(a) * R, pz = zc + Math.sin(a) * R * 2;
        box(px - 0.13, cy - 0.13, px + 0.13, cy + 0.13, pz - 0.9, pz - 0.1, ['#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6'][k % 4]);
      }
      line([cx + 0.8, cy + 0.3, 0.2], [cx, cy + 0.3, zc], '#95a5a6', 3); line([cx - 0.8, cy + 0.3, 0.2], [cx, cy + 0.3, zc], '#95a5a6', 3);
      blob(cx, cy, zc, 4, '#2c3e50');
      break;
    }
    case 'ship': {
      const pivot = 6;
      const ang = Math.sin(spin * 1.8) * 1.0 * anim;
      line([cx, cy - 0.5, 0.2], [cx, cy - 0.5, pivot], '#7f8c8d', 3);
      const rot = (dx, dz) => { const ca = Math.cos(ang), sa = Math.sin(ang); const zt = dz / 2; return [cx + dx * ca - zt * sa, cy, pivot + (dx * sa + zt * ca) * 2]; };
      const hull = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10 - 0.5; hull.push(rot(t * 2.4, -4.2 + Math.cos(t * Math.PI) * 0 + (Math.abs(t) > 0.4 ? 0.8 : 0))); }
      for (let k = 10; k >= 0; k--) { const t = k / 10 - 0.5; hull.push(rot(t * 2.0, -5.0 - Math.cos(t * Math.PI) * 0.6)); }
      line([cx, cy, pivot], rot(-0.8, -4.2), '#95a5a6', 2); line([cx, cy, pivot], rot(0.8, -4.2), '#95a5a6', 2);
      poly(hull, c, shade(c, 0.6), 2);
      for (let k = 0; k < 5; k++) { const p = rot(-0.8 + k * 0.4, -4.1); blob(p[0], p[1], p[2], 2.2, '#f5d0b0'); }
      line([cx, cy + 0.5, 0.2], [cx, cy + 0.5, pivot], '#95a5a6', 3);
      blob(cx, cy, pivot, 3, '#2c3e50');
      break;
    }
    case 'bumper': {
      box(x + 0.2, y + 0.2, x + s - 0.2, y + s - 0.2, 0.2, 0.35, '#34495e');
      for (let k = 0; k < 6; k++) {
        const t = spin * 0.8 + k * 1.7;
        const px = cx + Math.sin(t * 1.3 + k) * 0.9, py = cy + Math.cos(t * 0.9 + k * 2) * 0.9;
        box(px - 0.13, py - 0.13, px + 0.13, py + 0.13, 0.35, 0.6, ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#e67e22', '#ecf0f1'][k]);
      }
      for (const [a, b] of [[0.25, 0.25], [s - 0.25, 0.25], [0.25, s - 0.25], [s - 0.25, s - 0.25]]) line([x + a, y + b, 0.3], [x + a, y + b, 2.5], '#7f8c8d', 2);
      poly([[x + 0.15, y + 0.15, 2.5], [x + s - 0.15, y + 0.15, 2.5], [x + s - 0.15, y + s - 0.15, 2.5], [x + 0.15, y + s - 0.15, 2.5]], 'rgba(155,89,182,0.55)', '#6c3483');
      break;
    }
    case 'tower': {
      const H = 13;
      box(cx - 0.18, cy - 0.18, cx + 0.18, cy + 0.18, 0.2, H, '#7f8c8d');
      let ring = 0.8;
      if (r.phase === 'running') {
        const t = r.timer / def.dur;
        ring = t < 0.55 ? 0.8 + (H - 2) * (t / 0.55) : t < 0.7 ? H - 1.2 : t < 0.78 ? (H - 1.2) - (H - 2) * ((t - 0.7) / 0.08) : 0.8;
      }
      box(cx - 0.38, cy - 0.38, cx + 0.38, cy + 0.38, ring, ring + 0.6, c);
      blob(cx, cy, H + 0.3, 4, '#e74c3c');
      break;
    }
    case 'swing': {
      line([cx, cy, 0.2], [cx, cy, 5.5], '#7f8c8d', 4);
      const rad = 0.45 + 0.75 * anim, zs = 4.5 - (1 - anim) * 2.2 + anim * 0.5;
      const seats = [];
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + spin * 1.5; seats.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, k]); }
      seats.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
      for (const [sx, sy, k] of seats) {
        const tx = cx + (sx - cx) * 0.5, ty = cy + (sy - cy) * 0.5;
        line([tx, ty, 5.8], [sx, sy, zs], '#bdc3c7', 1);
        box(sx - 0.06, sy - 0.06, sx + 0.06, sy + 0.06, zs - 0.3, zs, ['#e74c3c', '#f1c40f', '#3498db'][k % 3]);
      }
      const top = circlePts(cx, cy, 5.8, 0.7, 12, spin * 1.5);
      for (let k = 0; k < 12; k++) poly([top[k], top[(k + 1) % 12], [cx, cy, 6.6]], k % 2 ? c : '#fff');
      break;
    }
  }
  if (!ghost && r.status === 'broken') {
    const X = ix(cx, cy), Y = iy(cx, cy, 3);
    ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔧', X, Y);
  }
  ctx.globalAlpha = 1;
}

function drawStall(r, def) {
  const x = r.x, y = r.y;
  box(x + 0.15, y + 0.15, x + 0.85, y + 0.85, 0, 1.6, '#f5e6c8');
  // auvent rayé
  for (let k = 0; k < 4; k++) {
    const a = 0.1 + k * 0.2;
    poly([[x + 0.1, y + a, 1.6], [x + 0.1, y + a + 0.2, 1.6], [x + 0.5, y + a + 0.2, 2.4], [x + 0.5, y + a, 2.4]], k % 2 ? '#fff' : def.color);
    poly([[x + 0.9, y + a, 1.6], [x + 0.9, y + a + 0.2, 1.6], [x + 0.5, y + a + 0.2, 2.4], [x + 0.5, y + a, 2.4]], k % 2 ? '#eee' : shade(def.color, 0.85));
  }
  ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.icon, ix(x + 0.5, y + 0.5), iy(x + 0.5, y + 0.5, 3.4));
  ctx.textBaseline = 'alphabetic';
  if (r.status === 'closed') { ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#c0392b'; ctx.fillText('FERMÉ', ix(x + 0.5, y + 0.5), iy(x + 0.5, y + 0.5, 1)); }
}

function drawGate(x, y, kind, alpha = 1) {
  ctx.globalAlpha = alpha;
  const col = kind === 'entrance' ? '#27ae60' : '#c0392b';
  poly([[x + 0.08, y + 0.08], [x + 0.92, y + 0.08], [x + 0.92, y + 0.92], [x + 0.08, y + 0.92]], '#cfc6b4', shade(col, 0.7));
  for (const [a, b] of [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]]) box(x + a - 0.05, y + b - 0.05, x + a + 0.05, y + b + 0.05, 0, 2.2, '#d5d8dc');
  box(x + 0.1, y + 0.1, x + 0.9, y + 0.9, 2.2, 2.6, col);
  ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText(kind === 'entrance' ? 'ENTRÉE' : 'SORTIE', ix(x + 0.5, y + 0.5), iy(x + 0.5, y + 0.5, 2.6) - 3);
  ctx.globalAlpha = 1;
}

function drawEntrance() {
  const e = G.entrance, x = e.x, y = e.y;
  for (const [a] of [[0.02], [0.98]]) box(x + a - 0.07, y + 0.4, x + a + 0.07, y + 0.6, 0, 4, '#c0392b');
  poly([[x - 0.05, y + 0.45, 4], [x + 1.05, y + 0.45, 4], [x + 1.05, y + 0.45, 5.2], [x - 0.05, y + 0.45, 5.2]], '#f1c40f', '#c0392b', 2);
  ctx.save();
  const X = ix(x + 0.5, y + 0.45), Y = iy(x + 0.5, y + 0.45, 4.6);
  ctx.translate(X, Y); ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.font = 'bold 5.5px sans-serif'; ctx.fillStyle = '#c0392b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((G.parkName || 'LOOPING LAND').toUpperCase().slice(0, 14), 0, 0);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

// ---------- Prévisualisations d'outils ----------
function tileOutline(x, y, color, fill) {
  poly([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], fill, color, 2);
}

function drawPreview(items) {
  const t = UI.tool, h = UI.hover;
  if (t?.kind === 'coasterBuild') {
    const r = rideById(t.rideId);
    if (!r || r.complete) return;
    const p = previewPiece(r, t.piece);
    const err = canAppend(r, t.piece);
    items.push({ d: p.x + p.y + 1.5 + p.h * 0.01, f: () => {
      if (!inB(p.x, p.y)) return;
      drawPiece(r, p, 0.55, err ? '#e74c3c' : '#2ecc71');
      tileOutline(p.x, p.y, err ? '#e74c3c' : '#2ecc71');
    } });
    return;
  }
  if (!h || !t) { if (h) tileOutline(h.x, h.y, 'rgba(255,255,255,0.5)'); return; }
  const ok = c => c ? 'rgba(231,76,60,0.9)' : 'rgba(46,204,113,0.9)';
  const okF = c => c ? 'rgba(231,76,60,0.25)' : 'rgba(46,204,113,0.25)';
  switch (t.kind) {
    case 'ride': {
      const def = RIDES[t.type] || STALLS[t.type];
      const x = h.x - Math.floor((def.size - 1) / 2), y = h.y - Math.floor((def.size - 1) / 2);
      const err = canPlaceRide(t.type, x, y);
      for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) if (inB(x + dx, y + dy)) tileOutline(x + dx, y + dy, ok(err), okF(err));
      items.push({ d: x + y + def.size, f: () => drawRide({ type: t.type, x, y, spin: now, anim: 0.5, phase: 'running', timer: 0, status: 'open' }, 0.55, true) });
      break;
    }
    case 'gate': {
      const r = rideById(t.rideId);
      if (!r) break;
      for (const [fx, fy] of footprint(r)) for (let d = 0; d < 4; d++) {
        const sx = fx + DX[d], sy = fy + DY[d];
        if (!canPlaceGate(r, sx, sy)) tileOutline(sx, sy, 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.08)');
      }
      const err = canPlaceGate(r, h.x, h.y);
      tileOutline(h.x, h.y, ok(err), okF(err));
      if (!err) items.push({ d: h.x + h.y + 1, f: () => drawGate(h.x, h.y, t.gate, 0.6) });
      break;
    }
    case 'design': {
      const def = DESIGNS[t.key];
      const pieces = designPieces(t.key, h.x, h.y, t.dir);
      const err = canPlaceDesign(t.key, h.x, h.y, t.dir);
      const fake = { type: def.type };
      for (const p of pieces) {
        if (!inB(p.x, p.y)) continue;
        tileOutline(p.x, p.y, ok(err), okF(err));
        items.push({ d: p.x + p.y + 1 + p.h * 0.01, f: () => drawPiece(fake, p, 0.6, err ? '#e74c3c' : null) });
      }
      break;
    }
    case 'coasterStart': {
      const tiles = stationTiles(h.x, h.y, t.dir);
      const err = canStartCoaster(t.type, h.x, h.y, t.dir);
      for (const [x, y] of tiles) if (inB(x, y)) tileOutline(x, y, ok(err), okF(err));
      const [lx, ly] = tiles[tiles.length - 1];
      const ax = lx + 0.5 + DX[t.dir] * 0.9, ay = ly + 0.5 + DY[t.dir] * 0.9;
      line([lx + 0.5, ly + 0.5], [ax, ay], '#fff', 3); blob(ax, ay, 0, 4, '#fff');
      break;
    }
    case 'path': {
      const err = canPath(h.x, h.y, t.queue ? 2 : 1);
      tileOutline(h.x, h.y, ok(err), okF(err));
      break;
    }
    case 'scenery': {
      const err = canScenery(t.type, h.x, h.y);
      tileOutline(h.x, h.y, ok(err), okF(err));
      items.push({ d: h.x + h.y + 1, f: () => drawScenery(t.type, h.x, h.y, 0.6) });
      break;
    }
    case 'furn': { const err = canFurniture(t.type, h.x, h.y); tileOutline(h.x, h.y, ok(err), okF(err)); break; }
    case 'terraform': { const err = canTerraform(t.mode, h.x, h.y); tileOutline(h.x, h.y, ok(err), okF(err)); break; }
    case 'demolish': tileOutline(h.x, h.y, '#e74c3c', 'rgba(231,76,60,0.3)'); break;
    default: tileOutline(h.x, h.y, 'rgba(255,255,255,0.5)');
  }
}

// ---------- Rendu principal ----------
export function render(time) {
  now = time;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2b3a2a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const z = cam.zoom * dpr;
  ctx.setTransform(z, 0, 0, z, (W / 2 - cam.x * cam.zoom) * dpr, (H / 2 - cam.y * cam.zoom) * dpr);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // plage visible
  const c = [screenToWorld(0, 0), screenToWorld(W, 0), screenToWorld(0, H + 300 * cam.zoom), screenToWorld(W, H + 300 * cam.zoom)];
  const x0 = Math.max(0, Math.floor(Math.min(...c.map(p => p.x))) - 1), x1 = Math.min(G.w - 1, Math.ceil(Math.max(...c.map(p => p.x))) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(...c.map(p => p.y))) - 1), y1 = Math.min(G.h - 1, Math.ceil(Math.max(...c.map(p => p.y))) + 1);

  // bord de carte
  poly([[0, 0], [G.w, 0], [G.w, G.h], [0, G.h]], null, '#1e2b1d', 6);
  drawGround(x0, y0, x1, y1);

  // objets triés en profondeur
  const items = [];
  const vis = (x, y, m = 2) => x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y);
    if (G.scen[i]) { const s = G.scen[i]; items.push({ d: x + y + 1, f: () => drawScenery(s, x, y) }); }
    if (G.furn[i]) { const f = G.furn[i]; items.push({ d: x + y + 0.9, f: () => drawFurniture(f, x, y) }); }
    if (RT.gate[i]) { const k = RT.gate[i].kind; items.push({ d: x + y + 1, f: () => drawGate(x, y, k) }); }
    const tr = RT.track[i];
    if (tr) for (const t of tr) { const p = t.ride.pieces[t.k]; const r = t.ride; items.push({ d: x + y + 1 + p.h * 0.01, f: () => drawPiece(r, p) }); }
  }
  for (const r of G.rides) {
    if (r.kind === 'coaster') {
      if (r.complete && r.train) {
        const cars = carPositions(r);
        const riders = r.train.riders.map(id => G.guests.find(g => g.id === id)).filter(Boolean);
        for (const car of cars) {
          if (!vis(car.p.x, car.p.y)) continue;
          items.push({ d: car.p.x + car.p.y + 0.2 + car.p.z * 0.01, f: () => drawCar(r, car, riders) });
        }
      }
      continue;
    }
    if (!vis(r.x, r.y, r.size + 2)) continue;
    items.push({ d: r.x + r.y + r.size, f: () => drawRide(r) });
  }
  if (vis(G.entrance.x, G.entrance.y)) items.push({ d: G.entrance.x + G.entrance.y + 1.2, f: drawEntrance });
  for (const g of G.guests) {
    if (g.state === 'ride' || !vis(g.x, g.y)) continue;
    const sel = UI.selected?.type === 'guest' && UI.selected.id === g.id;
    items.push({ d: g.x + g.y, f: () => {
      if (sel) { ctx.beginPath(); ctx.ellipse(ix(g.x, g.y), iy(g.x, g.y), 7, 3.5, 0, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      drawPerson(g.x, g.y, g.state === 'sit' ? -0.2 : 0, g.shirt, g.pants, g.skin, { balloon: g.items.balloon ? g.shirt : null });
    } });
  }
  for (const s of G.staff) {
    if (!vis(s.x, s.y)) continue;
    const def = STAFF[s.type];
    const sel = UI.selected?.type === 'staff' && UI.selected.id === s.id;
    items.push({ d: s.x + s.y, f: () => {
      if (sel) { ctx.beginPath(); ctx.ellipse(ix(s.x, s.y), iy(s.x, s.y), 7, 3.5, 0, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      if (s.type === 'entertainer') {
        const X = ix(s.x, s.y), Y = iy(s.x, s.y);
        ctx.beginPath(); ctx.arc(X, Y - 10, 7, 0, Math.PI * 2); ctx.fillStyle = '#e67e22'; ctx.fill();
        ctx.beginPath(); ctx.arc(X, Y - 19, 5, 0, Math.PI * 2); ctx.fillStyle = '#e67e22'; ctx.fill();
        ctx.fillStyle = '#000'; ctx.fillRect(X - 2.5, Y - 21, 1.5, 1.5); ctx.fillRect(X + 1, Y - 21, 1.5, 1.5);
      } else drawPerson(s.x, s.y, 0, def.color, '#2c3e50', '#f5d0b0', { hat: def.color });
      if (s.state === 'work') { ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(s.type === 'mechanic' ? '🔧' : '🧹', ix(s.x, s.y), iy(s.x, s.y) - 22); }
    } });
  }
  drawPreview(items);
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.f();

  // sélection d'attraction
  if (UI.selected?.type === 'ride') {
    const r = rideById(UI.selected.id);
    if (r && r.kind !== 'coaster') for (let dy = 0; dy < r.size; dy++) for (let dx = 0; dx < r.size; dx++) tileOutline(r.x + dx, r.y + dy, 'rgba(255,255,255,0.8)');
    if (r && r.kind === 'coaster') for (const p of r.pieces.slice(0, STATION_PIECES)) tileOutline(p.x, p.y, 'rgba(255,255,255,0.8)');
  }
}

// Sélection par clic : visiteur / personnel / attraction
export function pickAt(sx, sy) {
  let best = null, bd = 14;
  const test = (o, type) => {
    const [X, Y] = worldToScreen(o.x, o.y);
    const d = Math.hypot(sx - X, sy - (Y - 10 * cam.zoom));
    if (d < bd * Math.max(1, cam.zoom)) { bd = d / Math.max(1, cam.zoom); best = { type, id: o.id }; }
  };
  for (const g of G.guests) if (g.state !== 'ride') test(g, 'guest');
  for (const s of G.staff) test(s, 'staff');
  if (best) return best;
  const t = screenToTile(sx, sy);
  if (!inB(t.x, t.y)) return null;
  const i = idx(t.x, t.y);
  if (RT.obj[i]) return { type: 'ride', id: RT.obj[i] };
  if (RT.track[i]?.length) return { type: 'ride', id: RT.track[i][0].ride.id };
  return null;
}
