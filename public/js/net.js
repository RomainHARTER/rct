// Communication avec le serveur PHP (sauvegardes en ligne et classement)
const API = 'api.php';

async function call(action, params = {}, body = null) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const res = await fetch(`${API}?${qs}`, opts);
  let data;
  try { data = await res.json(); } catch { throw new Error('Réponse serveur invalide'); }
  if (!res.ok || data.error) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const net = {
  list: (player, pin) => call('list', {}, { player, pin }),
  save: (player, pin, slot, name, data) => call('save', {}, { player, pin, slot, name, data }),
  load: (player, pin, slot) => call('load', {}, { player, pin, slot }),
  remove: (player, pin, slot) => call('delete', {}, { player, pin, slot }),
  submitScore: (entry) => call('score', {}, entry),
  leaderboard: (scenario) => call('leaderboard', { scenario }),
};
