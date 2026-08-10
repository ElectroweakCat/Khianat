<?php
/*
 * Global game statistics backend, same pattern as poll.php.
 * Stores the results of all finished games in stats-data.json.
 *
 * GET  stats.php -> returns the full statistics as JSON
 * POST stats.php with body {"level": 3, "result": "w", "moves": 34, "firstMove": "e4"}
 *      -> records one finished game (result from the player's point of view)
 *         and returns the updated statistics
 */

header('Content-Type: application/json');
header('Cache-Control: no-store');

$file = __DIR__ . '/stats-data.json';
$levels = array('1', '2', '3', '4', '5');
$results = array('w', 'd', 'l');

// Default structure
$data = array(
    'levels' => array(),
    'games' => 0,
    'totalMoves' => 0,
    'shortestWin' => null,   // { moves, level }
    'longestGame' => null,   // moves
    'firstMoves' => array(), // SAN => count
    'countries' => array(),  // ISO code => { games, w } (guessed from browser timezone)
    'daily' => array()       // YYYY-MM-DD => games (last 30 days)
);
foreach ($levels as $lv) {
    $data['levels'][$lv] = array('w' => 0, 'd' => 0, 'l' => 0);
}

// Load stored data defensively
if (file_exists($file)) {
    $stored = json_decode(file_get_contents($file), true);
    if (is_array($stored)) {
        foreach ($levels as $lv) {
            if (isset($stored['levels'][$lv]) && is_array($stored['levels'][$lv])) {
                foreach ($results as $r) {
                    if (isset($stored['levels'][$lv][$r])) {
                        $data['levels'][$lv][$r] = (int) $stored['levels'][$lv][$r];
                    }
                }
            }
        }
        if (isset($stored['games']))      { $data['games'] = (int) $stored['games']; }
        if (isset($stored['totalMoves'])) { $data['totalMoves'] = (int) $stored['totalMoves']; }
        if (isset($stored['shortestWin']['moves'], $stored['shortestWin']['level'])) {
            $data['shortestWin'] = array(
                'moves' => (int) $stored['shortestWin']['moves'],
                'level' => (int) $stored['shortestWin']['level']
            );
        }
        if (isset($stored['longestGame'])) { $data['longestGame'] = (int) $stored['longestGame']; }
        if (isset($stored['firstMoves']) && is_array($stored['firstMoves'])) {
            $data['firstMoves'] = $stored['firstMoves'];
        }
        if (isset($stored['countries']) && is_array($stored['countries'])) {
            $data['countries'] = $stored['countries'];
        }
        if (isset($stored['daily']) && is_array($stored['daily'])) {
            $data['daily'] = $stored['daily'];
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $level = isset($body['level']) ? (string) (int) $body['level'] : '';
    $result = isset($body['result']) ? $body['result'] : '';
    $moves = isset($body['moves']) ? (int) $body['moves'] : 0;
    $firstMove = isset($body['firstMove']) ? $body['firstMove'] : '';

    if (!in_array($level, $levels, true) || !in_array($result, $results, true)
        || $moves < 1 || $moves > 500) {
        http_response_code(400);
        echo json_encode(array('error' => 'invalid game data'));
        exit;
    }

    $data['levels'][$level][$result]++;
    $data['games']++;
    $data['totalMoves'] += $moves;

    if ($result === 'w'
        && ($data['shortestWin'] === null || $moves < $data['shortestWin']['moves'])) {
        $data['shortestWin'] = array('moves' => $moves, 'level' => (int) $level);
    }
    if ($data['longestGame'] === null || $moves > $data['longestGame']) {
        $data['longestGame'] = $moves;
    }

    // Country: an anonymous two-letter guess derived from the browser
    // timezone or language. Anything invalid counts as ZZ (unknown region),
    // so the country totals always add up to the number of games.
    $country = isset($body['country']) ? $body['country'] : '';
    if (!is_string($country) || !preg_match('/^[A-Z]{2}$/', $country)) {
        $country = 'ZZ';
    }
    if (!isset($data['countries'][$country])) {
        $data['countries'][$country] = array('games' => 0, 'w' => 0);
    }
    $data['countries'][$country]['games']++;
    if ($result === 'w') {
        $data['countries'][$country]['w']++;
    }

    // Games per day, kept for the last 30 days only
    $today = date('Y-m-d');
    if (!isset($data['daily'][$today])) {
        $data['daily'][$today] = 0;
    }
    $data['daily'][$today]++;
    if (count($data['daily']) > 30) {
        krsort($data['daily']);
        $data['daily'] = array_slice($data['daily'], 0, 30, true);
    }

    // First move of the player: only accept plausible SAN strings
    if (is_string($firstMove) && preg_match('/^[a-hRNBQKOx1-8=+#-]{2,7}$/', $firstMove)) {
        if (!isset($data['firstMoves'][$firstMove])) {
            $data['firstMoves'][$firstMove] = 0;
        }
        $data['firstMoves'][$firstMove]++;

        // keep the list from growing without bounds
        if (count($data['firstMoves']) > 30) {
            arsort($data['firstMoves']);
            $data['firstMoves'] = array_slice($data['firstMoves'], 0, 20, true);
        }
    }

    file_put_contents($file, json_encode($data), LOCK_EX);
}

echo json_encode($data);
