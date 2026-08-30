<?php
/*
 * Simple poll backend for the "What level of chess player are you?" survey.
 * Stores the vote counts in poll-data.json next to this script.
 *
 * GET  poll.php -> returns current counts as JSON
 * POST poll.php with body {"vote": "one"} -> adds one vote, returns updated counts
 *
 * Spam protection: one vote per visitor per day. To recognise repeat votes
 * without storing personal data, the IP address is only kept as a salted
 * hash that also contains the current date, so it changes every day and
 * cannot be traced back to an address. Old hashes are deleted automatically.
 */

header('Content-Type: application/json');
header('Cache-Control: no-store');

$file = __DIR__ . '/poll-data.json';
$voterFile = __DIR__ . '/poll-voters.json';
$options = array('one', 'two', 'three', 'four', 'five');

// change this to any other random string if you ever want to reset the hashes
$hashSalt = 'khianat-poll-2026-4f9c1b';
$voteWindow = 86400; // one day

function voterFingerprint ($salt) {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
    return hash('sha256', $ip . '|' . date('Y-m-d') . '|' . $salt);
}

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

    // load the known voters of the last day and drop everything older
    $voters = array();
    if (file_exists($voterFile)) {
        $stored = json_decode(file_get_contents($voterFile), true);
        if (is_array($stored)) {
            $limit = time() - $voteWindow;
            foreach ($stored as $hash => $seen) {
                if ((int) $seen > $limit) {
                    $voters[$hash] = (int) $seen;
                }
            }
        }
    }

    $fingerprint = voterFingerprint($hashSalt);

    // only count the first vote per visitor and day, but never complain:
    // repeat visitors simply get the current numbers back
    if (!isset($voters[$fingerprint])) {
        $counts[$vote]++;
        file_put_contents($file, json_encode($counts), LOCK_EX);

        $voters[$fingerprint] = time();
        file_put_contents($voterFile, json_encode($voters), LOCK_EX);
    }
}

echo json_encode($counts);
