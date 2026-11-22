// Constantes et définitions du jeu "Looping Land"

export const TW = 64;          // largeur d'une tuile iso (px)
export const TH = 32;          // hauteur d'une tuile iso (px)
export const ZH = 16;          // px par unité de hauteur
export const TILE_M = 3;       // mètres par tuile
export const H_M = 1.5;        // mètres par unité de hauteur
export const G_ACC = 9.81;

export const MONTH_SECONDS = 90;           // durée d'un mois en secondes de jeu (vitesse x1)
export const MONTHS = ['Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre'];

export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export const TERRAIN = { GRASS: 0, WATER: 1, SAND: 2 };

// Manèges "plats" (empreinte carrée)
export const RIDES = {
  carousel: { name: 'Carrousel', kind: 'ride', size: 2, cost: 1800, run: 33, cap: 12, dur: 18, exc: 1.6, int: 0.7, nau: 0.4, price: 1.5, color: '#e85d75', icon: '🎠' },
  ferris:   { name: 'Grande roue', kind: 'ride', size: 3, cost: 3200, run: 44, cap: 16, dur: 26, exc: 2.3, int: 0.6, nau: 0.3, price: 2, color: '#4aa3df', icon: '🎡' },
  ship:     { name: 'Bateau balançoire', kind: 'ride', size: 3, cost: 3600, run: 49, cap: 20, dur: 20, exc: 3.1, int: 3.6, nau: 2.9, price: 2.5, color: '#b5651d', icon: '⛵' },
  bumper:   { name: 'Autos tamponneuses', kind: 'ride', size: 3, cost: 2800, run: 38, cap: 12, dur: 22, exc: 2.6, int: 1.8, nau: 0.8, price: 2, color: '#9b59b6', icon: '🚗' },
  teacups:  { name: 'Tasses folles', kind: 'ride', size: 2, cost: 2300, run: 33, cap: 12, dur: 18, exc: 2.0, int: 2.2, nau: 3.6, price: 1.5, color: '#f39c12', icon: '☕' },
  tower:    { name: 'Tour de chute', kind: 'ride', size: 2, cost: 5200, run: 66, cap: 8, dur: 16, exc: 4.6, int: 6.2, nau: 3.0, price: 3, color: '#2c3e50', icon: '🗼' },
  swing:    { name: 'Chaises volantes', kind: 'ride', size: 3, cost: 3000, run: 41, cap: 16, dur: 20, exc: 2.8, int: 2.6, nau: 1.6, price: 2, color: '#16a085', icon: '🎪' },
};

// Boutiques et services (1x1)
export const STALLS = {
  burger:  { name: 'Stand burgers', kind: 'stall', size: 1, cost: 400, run: 13, need: 'food', item: 'Burger', itemCost: 0.9, price: 2.5, satisfies: 140, color: '#c0392b', icon: '🍔', litter: true },
  pizza:   { name: 'Stand pizza', kind: 'stall', size: 1, cost: 450, run: 13, need: 'food', item: 'Pizza', itemCost: 1.0, price: 3, satisfies: 160, color: '#d35400', icon: '🍕', litter: true },
  drinks:  { name: 'Stand boissons', kind: 'stall', size: 1, cost: 350, run: 11, need: 'drink', item: 'Soda', itemCost: 0.4, price: 1.5, satisfies: 150, color: '#2980b9', icon: '🥤', litter: true },
  icecream:{ name: 'Glacier', kind: 'stall', size: 1, cost: 380, run: 11, need: 'drink', item: 'Glace', itemCost: 0.5, price: 1.8, satisfies: 90, food: 40, color: '#e84393', icon: '🍦', litter: true },
  balloons:{ name: 'Ballons', kind: 'stall', size: 1, cost: 300, run: 8, need: 'gift', item: 'Ballon', itemCost: 0.5, price: 2, satisfies: 0, color: '#fd79a8', icon: '🎈' },
  toilets: { name: 'Toilettes', kind: 'stall', size: 1, cost: 350, run: 8, need: 'toilet', item: null, itemCost: 0, price: 0, satisfies: 255, color: '#7f8c8d', icon: '🚻' },
  info:    { name: 'Kiosque info', kind: 'stall', size: 1, cost: 350, run: 8, need: 'map', item: 'Plan', itemCost: 0.2, price: 0.5, satisfies: 0, color: '#27ae60', icon: 'ℹ️' },
};

// Types de montagnes russes
export const COASTERS = {
  steel:  { name: 'Montagnes russes acier', kind: 'coaster', pieceCost: 70, stationCost: 400, run: 82, maxH: 22, cars: 4, perCar: 4, friction: 0.012, drag: 0.0008, color: '#e74c3c', rail: '#bdc3c7', support: '#7f8c8d', price: 4, icon: '🎢', boost: true },
  wooden: { name: 'Montagnes russes bois', kind: 'coaster', pieceCost: 55, stationCost: 350, run: 71, maxH: 16, cars: 4, perCar: 4, friction: 0.018, drag: 0.0011, color: '#8e44ad', rail: '#5d4037', support: '#a1887f', price: 3.5, icon: '🪵', boost: false, wood: true },
  junior: { name: 'Mini grand huit', kind: 'coaster', pieceCost: 35, stationCost: 250, run: 44, maxH: 8, cars: 3, perCar: 2, friction: 0.016, drag: 0.001, color: '#f1c40f', rail: '#95a5a6', support: '#bdc3c7', price: 2, icon: '🐛', boost: false },
};

// Pièces de circuit : dh = variation de hauteur, turn = +1 droite / -1 gauche
export const PIECES = {
  station:   { name: 'Station', dh: 0, turn: 0 },
  straight:  { name: 'Tout droit', dh: 0, turn: 0, key: '8' },
  left:      { name: 'Virage gauche', dh: 0, turn: -1, key: '4' },
  right:     { name: 'Virage droite', dh: 0, turn: 1, key: '6' },
  up:        { name: 'Montée', dh: 1, turn: 0, key: '9' },
  down:      { name: 'Descente', dh: -1, turn: 0, key: '3' },
  steepUp:   { name: 'Montée raide', dh: 2, turn: 0, key: '7' },
  steepDown: { name: 'Descente raide', dh: -2, turn: 0, key: '1' },
  booster:   { name: 'Propulseur', dh: 0, turn: 0, key: '5' },
};

// Décor (1 par tuile)
export const SCENERY = {
  oak:      { name: 'Chêne', cost: 20, beauty: 2 },
  pine:     { name: 'Sapin', cost: 20, beauty: 2 },
  palm:     { name: 'Palmier', cost: 30, beauty: 3 },
  bush:     { name: 'Buisson', cost: 10, beauty: 1 },
  flowers:  { name: 'Fleurs', cost: 15, beauty: 3 },
  fountain: { name: 'Fontaine', cost: 300, beauty: 8 },
  statue:   { name: 'Statue', cost: 220, beauty: 6 },
  hedge:    { name: 'Haie', cost: 12, beauty: 1 },
};

// Mobilier de chemin (placé sur une tuile de chemin)
export const FURNITURE = {
  bench: { name: 'Banc', cost: 40 },
  bin:   { name: 'Poubelle', cost: 30 },
  lamp:  { name: 'Lampadaire', cost: 25 },
};

export const STAFF = {
  handyman:    { name: 'Agent d\'entretien', wage: 50, color: '#27ae60' },
  mechanic:    { name: 'Mécanicien', wage: 80, color: '#2980b9' },
  entertainer: { name: 'Animateur', wage: 55, color: '#e67e22' },
};

export const PATH_COST = 10;
export const TERRAFORM_COST = 60;

export const FIRST_NAMES = ['Léa', 'Hugo', 'Emma', 'Louis', 'Chloé', 'Gabriel', 'Manon', 'Arthur', 'Jade', 'Jules', 'Inès', 'Adam', 'Zoé', 'Paul', 'Lina', 'Nathan', 'Camille', 'Tom', 'Sarah', 'Noah', 'Alice', 'Lucas', 'Lou', 'Ethan', 'Rose', 'Théo', 'Anna', 'Raphaël', 'Mila', 'Sacha', 'Julia', 'Mathis', 'Eva', 'Nolan', 'Clara', 'Malo'];
export const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1', '#34495e', '#fd79a8', '#00cec9', '#6c5ce7'];
export const SKINS = ['#f5d0b0', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export const SCENARIOS = [
  {
    id: 'prairie', name: 'Prairie Tranquille', desc: 'Un grand terrain plat et verdoyant. Idéal pour débuter.',
    size: 56, money: 15000, loan: 10000, maxLoan: 30000, water: 0.08, trees: 0.06, sand: 0,
    goal: { guests: 300, rating: 550, year: 2 }, seed: 11,
  },
  {
    id: 'lac', name: 'Lac Doré', desc: 'Un parc au bord d\'un grand lac. Construisez au-dessus de l\'eau !',
    size: 64, money: 12000, loan: 10000, maxLoan: 25000, water: 0.32, trees: 0.08, sand: 0.05,
    goal: { guests: 600, rating: 600, year: 3 }, seed: 42,
  },
  {
    id: 'desert', name: 'Oasis du Désert', desc: 'Sable chaud, peu d\'argent. Les visiteurs ont soif !',
    size: 60, money: 8000, loan: 8000, maxLoan: 20000, water: 0.06, trees: 0.02, sand: 0.85,
    goal: { guests: 800, rating: 650, year: 4 }, seed: 7,
  },
  {
    id: 'sandbox', name: 'Bac à sable', desc: 'Argent illimité, aucun objectif. Laissez parler votre créativité.',
    size: 72, money: 1000000, loan: 0, maxLoan: 0, water: 0.12, trees: 0.05, sand: 0,
    goal: null, seed: 3, sandbox: true,
  },
];

// Montagnes russes prédéfinies : [pièce, nombre, lift à chaîne]
export const DESIGNS = {
  chenille: {
    name: 'La Chenille', type: 'junior', icon: '🐛', desc: 'Petit circuit familial, idéal pour débuter',
    seq: [['up', 3, 1], ['right', 2], ['down', 3], ['straight', 3], ['right', 2]],
  },
  tornade: {
    name: 'La Tornade', type: 'steel', icon: '🌪️', desc: 'Lift raide de 15 m et longue descente rapide',
    seq: [['steepUp', 5, 1], ['straight', 1], ['right', 2], ['steepDown', 3], ['down', 4], ['straight', 2], ['right', 2]],
  },
  grizzly: {
    name: 'Le Grizzly', type: 'wooden', icon: '🐻', desc: 'Grand classique en bois avec virages et bosses',
    seq: [['up', 6, 1], ['straight', 1], ['right', 1], ['straight', 1], ['right', 1], ['steepDown', 3], ['up', 2], ['down', 2], ['straight', 3], ['right', 1], ['straight', 1], ['right', 1]],
  },
};
