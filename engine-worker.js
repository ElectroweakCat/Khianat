/*
 * engine-worker.js - runs the Khianat search in a background thread,
 * so the page stays responsive while the engine is thinking.
 *
 * Request:  { id, history, difficulty }
 *   id         request number, echoed back so stale replies can be ignored
 *   history    the moves of the game so far (needed for repetition detection)
 *   difficulty difficulty level for this move
 *
 * Reply:    { id, move }
 *   move       a book move as { san } or a search move as { from, to, promotion },
 *              null if there is nothing to play
 */

importScripts('chess.js', 'evaluation.js', 'engine.js');

onmessage = function (event) {
    var request = event.data;

    // rebuild the game including its history
    var game = new Chess();
    for (var i = 0; i < request.history.length; i++) {
        game.move(request.history[i]);
    }

    setDifficulty(request.difficulty);

    // 1. try the opening book, 2. otherwise search
    var move = getBookMove(game);
    if (move === null) {
        move = getBestMove(game);
    }

    var reply = null;
    if (typeof move === 'string') {
        reply = { san: move };
    } else if (move !== null) {
        reply = { from: move.from, to: move.to, promotion: move.promotion };
    }

    postMessage({ id: request.id, move: reply });
};
