<?php
// Looping Land — API : sauvegardes en ligne et classement (SQLite)
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

const MAX_SAVE_BYTES = 8 * 1024 * 1024;
const MAX_SLOTS = 20;

function out(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 400): never { out(['error' => $msg], $code); }

function db(): PDO {
    $dir = getenv('LL_DATA_DIR') ?: dirname(__DIR__) . '/data';
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) fail('Impossible de créer le dossier de données', 500);
    $pdo = new PDO('sqlite:' . $dir . '/game.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('CREATE TABLE IF NOT EXISTS players (name TEXT PRIMARY KEY, pin_hash TEXT NOT NULL, created TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS saves (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, name TEXT NOT NULL, data BLOB NOT NULL, updated TEXT NOT NULL)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS saves_player ON saves(player)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, scenario TEXT NOT NULL, park TEXT NOT NULL, value INTEGER NOT NULL, guests INTEGER NOT NULL, rating INTEGER NOT NULL, won INTEGER NOT NULL, game_date TEXT, created TEXT NOT NULL, UNIQUE(player, scenario))');
    return $pdo;
}

function body(): array {
    $raw = file_get_contents('php://input', false, null, 0, MAX_SAVE_BYTES + 1024);
    if ($raw === false || $raw === '') return [];
    if (strlen($raw) > MAX_SAVE_BYTES) fail('Sauvegarde trop volumineuse', 413);
    $j = json_decode($raw, true);
    if (!is_array($j)) fail('JSON invalide');
    return $j;
}

function player(array $b): string {
    $p = trim((string)($b['player'] ?? ''));
    if (!preg_match('/^[\w\-]{2,32}$/u', $p)) fail('Pseudo invalide (2-32 caractères : lettres, chiffres, - ou _)');
    return $p;
}

// Vérifie (ou crée) le compte joueur protégé par code secret
function auth(PDO $db, array $b, bool $create): string {
    $p = player($b);
    $pin = (string)($b['pin'] ?? '');
    if (strlen($pin) < 3 || strlen($pin) > 64) fail('Code secret invalide (3 caractères minimum)');
    $st = $db->prepare('SELECT pin_hash FROM players WHERE name = ?');
    $st->execute([$p]);
    $row = $st->fetch();
    if (!$row) {
        if (!$create) fail('Joueur inconnu : sauvegardez d\'abord une partie', 404);
        $db->prepare('INSERT INTO players(name, pin_hash, created) VALUES (?,?,?)')
           ->execute([$p, password_hash($pin, PASSWORD_DEFAULT), date('c')]);
        return $p;
    }
    if (!password_verify($pin, $row['pin_hash'])) fail('Code secret incorrect pour ce pseudo', 403);
    return $p;
}

$action = $_GET['action'] ?? '';
try {
    $db = db();
    switch ($action) {
        case 'list': {
            $b = body();
            $p = auth($db, $b, false);
            $st = $db->prepare('SELECT id AS slot, name, updated FROM saves WHERE player = ? ORDER BY updated DESC');
            $st->execute([$p]);
            out(['saves' => array_map(fn($r) => ['slot' => (int)$r['slot'], 'name' => $r['name'], 'updated' => $r['updated']], $st->fetchAll())]);
        }
        case 'save': {
            $b = body();
            $p = auth($db, $b, true);
            if (!isset($b['data']) || !is_array($b['data'])) fail('Données manquantes');
            $name = mb_substr(trim((string)($b['name'] ?? 'Sans nom')), 0, 60) ?: 'Sans nom';
            $data = json_encode($b['data'], JSON_UNESCAPED_UNICODE);
            $slot = (int)($b['slot'] ?? 0);
            $now = date('Y-m-d H:i');
            if ($slot > 0) {
                $st = $db->prepare('UPDATE saves SET name = ?, data = ?, updated = ? WHERE id = ? AND player = ?');
                $st->execute([$name, $data, $now, $slot, $p]);
                if ($st->rowCount() === 0) fail('Sauvegarde introuvable', 404);
            } else {
                $c = $db->prepare('SELECT COUNT(*) FROM saves WHERE player = ?');
                $c->execute([$p]);
                if ((int)$c->fetchColumn() >= MAX_SLOTS) fail('Nombre maximal de sauvegardes atteint (' . MAX_SLOTS . '). Écrasez-en une.');
                $db->prepare('INSERT INTO saves(player, name, data, updated) VALUES (?,?,?,?)')->execute([$p, $name, $data, $now]);
                $slot = (int)$db->lastInsertId();
            }
            out(['ok' => true, 'slot' => $slot]);
        }
        case 'load': {
            $b = body();
            $p = auth($db, $b, false);
            $st = $db->prepare('SELECT data FROM saves WHERE id = ? AND player = ?');
            $st->execute([(int)($b['slot'] ?? 0), $p]);
            $row = $st->fetch();
            if (!$row) fail('Sauvegarde introuvable', 404);
            echo '{"data":' . $row['data'] . '}';
            exit;
        }
        case 'delete': {
            $b = body();
            $p = auth($db, $b, false);
            $db->prepare('DELETE FROM saves WHERE id = ? AND player = ?')->execute([(int)($b['slot'] ?? 0), $p]);
            out(['ok' => true]);
        }
        case 'score': {
            $b = body();
            $p = auth($db, $b, true);
            $scenario = (string)($b['scenario'] ?? '');
            if (!preg_match('/^[a-z0-9_]{1,24}$/', $scenario)) fail('Scénario invalide');
            $park = mb_substr(trim((string)($b['park'] ?? 'Parc')), 0, 32) ?: 'Parc';
            $value = max(-10000000, min(1000000000, (int)($b['value'] ?? 0)));
            $guests = max(0, min(100000, (int)($b['guests'] ?? 0)));
            $rating = max(0, min(999, (int)($b['rating'] ?? 0)));
            $won = !empty($b['won']) ? 1 : 0;
            $gdate = mb_substr((string)($b['date'] ?? ''), 0, 40);
            // on ne garde que le meilleur score par joueur et scénario
            $st = $db->prepare('SELECT value FROM scores WHERE player = ? AND scenario = ?');
            $st->execute([$p, $scenario]);
            $old = $st->fetch();
            if ($old && (int)$old['value'] >= $value) out(['ok' => true, 'improved' => false]);
            $db->prepare('INSERT INTO scores(player, scenario, park, value, guests, rating, won, game_date, created) VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(player, scenario) DO UPDATE SET park=excluded.park, value=excluded.value, guests=excluded.guests, rating=excluded.rating, won=MAX(won, excluded.won), game_date=excluded.game_date, created=excluded.created')
               ->execute([$p, $scenario, $park, $value, $guests, $rating, $won, $gdate, date('c')]);
            out(['ok' => true, 'improved' => true]);
        }
        case 'leaderboard': {
            $scenario = (string)($_GET['scenario'] ?? '');
            $st = $db->prepare('SELECT player, park, value, guests, rating, won, game_date FROM scores WHERE scenario = ? ORDER BY won DESC, value DESC LIMIT 50');
            $st->execute([$scenario]);
            out(['scores' => array_map(fn($r) => [
                'player' => $r['player'], 'park' => $r['park'], 'value' => (int)$r['value'], 'guests' => (int)$r['guests'],
                'rating' => (int)$r['rating'], 'won' => (bool)$r['won'], 'date' => $r['game_date'],
            ], $st->fetchAll())]);
        }
        default:
            fail('Action inconnue', 404);
    }
} catch (PDOException $e) {
    error_log('Looping Land API: ' . $e->getMessage());
    fail('Erreur de base de données', 500);
}
