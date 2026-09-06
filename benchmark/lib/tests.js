/*
 * The actual tests, kept separate so both the main process and the worker
 * threads can use exactly the same code.
 */

function uciOf (move) {
    return move.from + move.to + (move.promotion || '');
}

function moveFromUci (uci) {
    return {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined
    };
}

function randomMove (game) {
    const moves = game.moves({ verbose: true });
    return moves[Math.floor(Math.random() * moves.length)];
}

/*
 * A puzzle counts as solved when the engine finds the whole expected line.
 * As on Lichess, a different move is accepted if it mates immediately.
 */
function solvePuzzle (engine, puzzle) {
    const game = new engine.Chess(puzzle.fen);
    game.move(moveFromUci(puzzle.moves[0])); // the move that sets up the puzzle

    for (let i = 1; i < puzzle.moves.length; i += 2) {
        const chosen = engine.getBestMove(game);
        if (!chosen) return false;

        if (uciOf(chosen) !== puzzle.moves[i]) {
            game.move(chosen);
            const mated = game.in_checkmate();
            game.undo();
            return mated;
        }

        game.move(chosen);
        const reply = puzzle.moves[i + 1];
        if (reply) game.move(moveFromUci(reply));
    }
    return true;
}

/*
 * The engine plays the strong side against a random defence and has to
 * mate within the move limit.
 */
function playEndgame (engine, test) {
    const game = new engine.Chess(test.fen);
    const strongSide = game.turn();
    let moves = 0;
    let mated = false;

    while (moves < test.maxMoves && !game.game_over()) {
        const move = game.turn() === strongSide
            ? engine.getBestMove(game)
            : randomMove(game);
        if (!move) break;

        game.move(move);
        if (game.turn() !== strongSide) moves++;
        if (game.in_checkmate()) { mated = true; break; }
    }

    return {
        id: test.id,
        description: test.description,
        solved: mated,
        moves: mated ? moves : null,
        maxMoves: test.maxMoves
    };
}

module.exports = { uciOf, moveFromUci, randomMove, solvePuzzle, playEndgame };
