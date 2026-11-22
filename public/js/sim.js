// Boucle de simulation : temps, finances mensuelles, note du parc, objectifs
import { G, spend, addMsg, emit, invalidateFields } from './state.js';
import { MONTH_SECONDS, MONTHS } from './config.js';
import { updateGuests, spawnGuest, avgHappiness, hooks } from './guests.js';
import { updateStaff, monthlyWages } from './staff.js';
import { updateRides, defOf } from './rides.js';

let spawnAcc = 0, ratingTimer = 0;

export function tick(dt) {
  const prevMonthIdx = Math.floor(G.time / MONTH_SECONDS);
  G.time += dt;
  updateRides(dt, hooks);
  updateGuests(dt);
  updateStaff(dt);
  spawning(dt);
  ratingTimer += dt;
  if (ratingTimer > 2) { ratingTimer = 0; updateRating(); }
  if (Math.floor(G.time / MONTH_SECONDS) !== prevMonthIdx) endOfMonth();
}

export function attractionScore() {
  let s = 0;
  for (const r of G.rides) {
    if (r.status !== 'open' || !r.ratings || r.ratings.fail) continue;
    s += Math.min(r.ratings.exc, 9) * (r.kind === 'coaster' ? 1.6 : 1);
  }
  return s;
}

export function guestCapacity() {
  return Math.round(40 + attractionScore() * 32 + G.rides.filter(r => r.kind === 'stall').length * 8);
}

function spawning(dt) {
  if (G.entranceClosed) return;
  const score = attractionScore();
  const ratingF = Math.pow(Math.max(G.rating, 50) / 1000, 1.4);
  const feeF = Math.max(0.15, Math.min(1.3, 1.35 - G.entryFee / 35));
  let rate = (0.15 + score * 0.06) * ratingF * feeF * 2.6;
  const cap = guestCapacity();
  if (G.guests.length > cap) rate *= 0.08;
  spawnAcc += rate * dt;
  while (spawnAcc >= 1) { spawnAcc -= 1; spawnGuest(); }
}

export function ratingTarget() {
  let r = 230;
  const n = G.guests.length;
  r += (n ? avgHappiness() : 55) * 3.6;
  const open = G.rides.filter(x => x.kind !== 'stall' && x.status === 'open').length;
  r += Math.min(open, 15) * 14;
  let litter = 0, vomit = 0;
  for (let i = 0; i < G.litter.length; i++) { litter += G.litter[i]; vomit += G.vomit[i]; }
  r -= Math.min(160, litter * 1.2 + vomit * 3);
  r -= G.rides.filter(x => x.status === 'broken').length * 25;
  const unhappy = G.guests.filter(g => g.happy < 25).length;
  r -= Math.min(120, unhappy * 2);
  return Math.max(0, Math.min(999, r));
}

function updateRating() {
  const t = ratingTarget();
  G.rating = Math.round(G.rating + (t - G.rating) * 0.15);
}

export function parkValue() {
  return G.rides.reduce((s, r) => s + r.value * Math.max(0.4, 1 - r.age * 0.02), 0);
}
export function companyValue() {
  return Math.round(G.money - G.loan + parkValue());
}

function endOfMonth() {
  // frais de fonctionnement
  let running = 0;
  for (const r of G.rides) {
    const def = defOf(r);
    r.age++;
    r.reliability = Math.max(20, r.reliability - 0.7 - Math.random() * 0.6);
    r.lastMonthIncome = r.monthIncome; r.monthIncome = 0;
    if (r.status !== 'closed' || r.kind === 'stall') running += def.run;
  }
  if (running) spend('running', running);
  monthlyWages();
  if (G.loan > 0) spend('interest', Math.round(G.loan * 0.07 / 8));
  G.finances.history.push({ label: `${MONTHS[G.month]} ${G.year}`, ...G.finances.current, guests: G.guests.length, rating: G.rating, money: Math.round(G.money) });
  if (G.finances.history.length > 16) G.finances.history.shift();
  G.finances.current = {};
  G.guestHistory.push(G.guests.length); if (G.guestHistory.length > 32) G.guestHistory.shift();
  G.ratingHistory.push(G.rating); if (G.ratingHistory.length > 32) G.ratingHistory.shift();
  G.month++;
  if (G.month >= MONTHS.length) { G.month = 0; G.year++; addMsg(`Bonne année ! Début de l'année ${G.year}.`, null, 'good'); }
  checkGoal();
  if (G.money < 0 && !G.sandbox) addMsg('Attention : votre trésorerie est négative !', null, 'warn');
  invalidateFields();
  emit('month');
}

function checkGoal() {
  const scnGoal = G.scenarioData?.goal;
  if (!scnGoal || G.goalState !== 'running') return;
  if (G.guests.length >= scnGoal.guests && G.rating >= scnGoal.rating) {
    G.goalState = 'won';
    addMsg('🏆 Félicitations ! Vous avez atteint l\'objectif du scénario !', null, 'good');
    emit('goal', 'won');
  } else if (G.year > scnGoal.year) {
    G.goalState = 'lost';
    addMsg('Objectif non atteint… Vous pouvez continuer à jouer librement.', null, 'warn');
    emit('goal', 'lost');
  }
}

export function takeLoan(amount) {
  amount = Math.min(amount, G.maxLoan - G.loan);
  if (amount <= 0) return;
  G.loan += amount; G.money += amount;
}
export function repayLoan(amount) {
  amount = Math.min(amount, G.loan, Math.max(0, G.money));
  if (amount <= 0) return;
  G.loan -= amount; G.money -= amount;
}
