# 🎢 Looping Land

Jeu de gestion de parc d'attractions en ligne, jouable dans le navigateur (vue isométrique).
Il est inspiré du genre « tycoon » : tous les graphismes sont procéduraux et le contenu est original.

- **Client** : JavaScript (modules ES, Canvas 2D), sans dépendance ni étape de build.
- **Serveur** : PHP 8.1+ avec SQLite (PDO) pour les sauvegardes en ligne et le classement.

## Lancer le jeu

```bash
php -S localhost:8000 -t public
# puis ouvrir http://localhost:8000
```

Avec Docker :

```bash
docker build -t looping-land . && docker run -p 8080:80 -v ll-data:/var/www/data looping-land
```

Sur un hébergement mutualisé, il suffit de copier le dossier `public/` à la racine web et
`data/` à côté (ou de définir la variable d'environnement `LL_DATA_DIR`). L'extension `pdo_sqlite` est requise.

## Fonctionnalités

- **Carte isométrique** générée par scénario (herbe, sable, lacs, forêts), zoom et déplacement.
- **Chemins** tracés au cliqué-glissé, avec bancs, poubelles et lampadaires.
- **7 manèges animés** : carrousel, grande roue, bateau balançoire, autos tamponneuses, tasses, tour de chute, chaises volantes.
- **7 boutiques et services** : burgers, pizzas, boissons, glaces, ballons, toilettes, kiosque d'information.
- **Constructeur de montagnes russes** (acier, bois, junior), pièce par pièce : virages, montées et descentes (normales ou raides), lift à chaîne, propulseurs, croisements à différentes hauteurs.
  - Simulation physique du train (gravité, frottements, lift, freins en gare).
  - Essai automatique et calcul des notes **Excitation / Intensité / Nausée**, de la vitesse max, des G verticaux et latéraux, des chutes…
- **Visiteurs simulés** avec besoins (faim, soif, toilettes, énergie, nausée), préférences d'intensité, budget, pensées, files d'attente, déchets et vomi.
- **Personnel** : agents d'entretien, mécaniciens (pannes des attractions) et animateurs.
- **Économie** : prix d'entrée, prix de chaque attraction et produit, coûts mensuels, salaires, emprunt avec intérêts, tableau des finances.
- **Note du parc** (0-999) et 4 scénarios avec objectifs, dont un bac à sable.
- **En ligne** : sauvegardes protégées par pseudo et code secret, classement par scénario. Une sauvegarde automatique est aussi faite en local à chaque fin de mois.

## Commandes

| Action | Contrôle |
|---|---|
| Construire / sélectionner | Clic gauche |
| Déplacer la vue | Clic droit glissé, flèches ou ZQSD/WASD |
| Zoom | Molette (pincer sur mobile) |
| Annuler l'outil | Clic droit ou Échap |
| Pivoter la gare | R |
| Pièces de circuit | Pavé numérique (8 droit, 4/6 virages, 9/7 montées, 3/1 descentes, 5 propulseur), Retour arrière pour retirer, C pour le lift |
| Pause / vitesses | Espace, 1, 2, 3 |

## Structure

```
public/
  index.php        page du jeu
  api.php          API JSON (save, load, list, delete, score, leaderboard)
  css/style.css
  js/
    main.js        boucle de jeu
    config.js      définitions (attractions, boutiques, scénarios…)
    state.js       état, génération de carte, sérialisation
    path.js        champs de distance (pathfinding BFS)
    coaster.js     géométrie, construction, physique et notes des montagnes russes
    rides.js       placement et fonctionnement des attractions
    guests.js      IA des visiteurs
    staff.js       personnel
    sim.js         temps, finances, note du parc, objectifs
    render.js      rendu isométrique
    ui.js          interface et fenêtres
    input.js       souris, tactile, clavier
    net.js         client de l'API
data/              base SQLite (créée automatiquement)
```
