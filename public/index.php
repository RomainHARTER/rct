<?php
// Looping Land — page principale du jeu
$v = substr(md5((string) @filemtime(__DIR__ . '/js/ui.js') . (string) @filemtime(__DIR__ . '/css/style.css')), 0, 8);
?><!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Looping Land — Parc d'attractions</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎢</text></svg>">
  <link rel="stylesheet" href="css/style.css?v=<?= $v ?>">
</head>
<body>
  <canvas id="game"></canvas>
  <div id="hud"></div>
  <div id="toolbar"></div>
  <div id="palette" class="hidden"></div>
  <div id="windows"></div>
  <div id="ticker"></div>
  <div id="flash"></div>
  <div id="menu" class="hidden"></div>
  <noscript>Ce jeu nécessite JavaScript.</noscript>
  <script type="module" src="js/main.js?v=<?= $v ?>"></script>
</body>
</html>
