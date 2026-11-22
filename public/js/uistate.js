// État de l'interface partagé entre rendu, saisie et fenêtres
export const UI = {
  tool: null,          // outil de construction actif
  hover: null,         // tuile survolée {x,y}
  mouse: { x: 0, y: 0 },
  selected: null,      // { type: 'guest'|'staff'|'ride', id }
  speed: 1,
  paused: false,
  showGrid: false,
  player: localStorage.getItem('ll_player') || '',
  pin: localStorage.getItem('ll_pin') || '',
};
