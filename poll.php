<?php
/*
 * Simple poll backend for the "What level of chess player are you?" survey.
 * Stores the vote counts in poll-data.json next to this script.
 *
 * GET  poll.php -> returns current counts as JSON
 * POST poll.php with body {"vote": "one"} -> adds one vote, returns updated counts
 */

header('Content-Type: application/json');
header('Cache-Control: no-store');

$file = __DIR__ . '/poll-data.json';
$options = array('one', 'two', 'three', 'four', 'five');

// Load current counts (default: all zero)
$counts = array_fill_keys($options, 0);
if (file_exists($file)) {
    $data = json_decode(file_get_contents($file), true);
    if (is_array($data)) {
        foreach ($options as $o) {
            if (isset($data[$o])) {
                $counts[$o] = (int) $data[$o];
            }
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $vote = isset($body['vote']) ? $body['vote'] : null;

    if (!in_array($vote, $options, true)) {
        http_response_code(400);
        echo json_encode(array('error' => 'invalid vote'));
        exit;
    }

    $counts[$vote]++;
    file_put_contents($file, json_encode($counts), LOCK_EX);
}

echo json_encode($counts);
