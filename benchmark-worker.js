/*
 * Worker for the quick self test on benchmark.html.
 *
 * Runs a handful of positions through the engine in the background, so the
 * page stays responsive. This is the small browser version of the offline
 * runner in benchmark/: same engine, far fewer positions, and the result
 * depends on the device it runs on.
 */

importScripts('chess.js', 'evaluation.js', 'engine.js');

// fixed depth and no opening randomisation, exactly like the offline runner
function prepareEngine (depth) {
    DIFFICULTY_LEVELS[99] = { timeMs: 3600000, maxDepth: depth, varietyMargin: 0 };
    OPENING_VARIETY_PLIES = 0;
    setDifficulty(99);
}

function uciOf (move) {
    return move.from + move.to + (move.promotion || '');
}

function solveMate (test, depth) {
    var game = new Chess(test.fen);
    var started = Date.now();
    var move = getBestMove(game);
    var elapsed = Date.now() - started;

    var solved = false;
    if (move) {
        game.move(move);
        solved = game.in_checkmate() || uciOf(move) === test.best;
    }
    return { id: test.id, solved: solved, ms: elapsed };
}

function playEndgame (test, depth) {
    var game = new Chess(test.fen);
    var strongSide = game.turn();
    var moves = 0;
    var mated = false;
    var started = Date.now();

    while (moves < test.maxMoves && !game.game_over()) {
        var move;
        if (game.turn() === strongSide) {
            move = getBestMove(game);
        } else {
            var legal = game.moves({ verbose: true });
            move = legal[Math.floor(Math.random() * legal.length)];
        }
        if (!move) break;
        game.move(move);
        if (game.turn() !== strongSide) moves++;
        if (game.in_checkmate()) { mated = true; break; }
    }

    return {
        id: test.id,
        solved: mated,
        moves: mated ? moves : null,
        ms: Date.now() - started
    };
}

onmessage = function (event) {
    var request = event.data;
    var total = request.mates.length + request.endgames.length;

    try {
        prepareEngine(request.depth);

        var results = [];
        for (var i = 0; i < request.mates.length; i++) {
            results.push(solveMate(request.mates[i], request.depth));
            postMessage({ progress: results.length, total: total });
        }
        for (var j = 0; j < request.endgames.length; j++) {
            results.push(playEndgame(request.endgames[j], request.depth));
            postMessage({ progress: results.length, total: total });
        }

        // older engine versions do not carry a version number yet
        var version = (typeof KHIANAT_VERSION !== 'undefined') ? KHIANAT_VERSION : 'unknown';

        postMessage({ done: true, results: results, version: version });
    } catch (error) {
        postMessage({ error: error && error.message ? error.message : String(error) });
    }
};
