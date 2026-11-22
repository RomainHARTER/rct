// Point d'entrée : boucle de jeu
import { G } from './state.js';
import { UI } from './uistate.js';
import { initRender, render } from './render.js';
import { initInput, updateCamera } from './input.js';
import { initUI, showMenu } from './ui.js';
import { tick } from './sim.js';

const canvas = document.getElementById('game');
initRender(canvas);
initUI();
initInput(canvas);
showMenu();

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (G.w) {
    updateCamera(dt);
    if (!UI.paused) {
      let remaining = dt * UI.speed;
      while (remaining > 0) {
        const step = Math.min(0.1, remaining);
        tick(step);
        remaining -= step;
      }
    }
    render(t / 1000);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('beforeunload', () => {
  if (G.w) { try { localStorage.setItem('ll_autosave', JSON.stringify(G)); } catch { /* quota */ } }
});
