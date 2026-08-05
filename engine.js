/*
 * engine.js - the Khianat chess engine.
 *
 * How Khianat picks a move:
 *  1. Opening book: in the very first moves Khianat plays its personal,
 *     hand-written opening repertoire (weighted random choice).
 *  2. Search: afterwards it runs a negamax search (minimax formulated for
 *     both sides at once) with:
 *       - alpha-beta pruning        (skips branches that cannot matter)
 *       - iterative deepening      (depth 1, 2, 3, ... until the time budget is used)
 *       - move ordering            (captures/promotions first, best move of the
 *                                   previous iteration first at the root)
 *       - quiescence search        (at the leaves, capture sequences are played
 *                                   out so the engine never stops in the middle
 *                                   of an exchange)
 *  3. The board is evaluated with evaluateBoard() from evaluation.js
 *     (material + piece square tables).
 *
 * Mate is scored as a huge value minus the distance to mate, so Khianat
 * prefers the fastest mate and delays being mated as long as possible.
 * Stalemate and drawn positions are scored 0.
 */

// ---------------------------------------------------------------------------
// Search configuration
// ---------------------------------------------------------------------------

// Difficulty levels: how long and how deep Khianat may think per move.
// Level 5 is the full engine, lower levels cap the depth and thinking time.
var DIFFICULTY_LEVELS = {
    1: { timeMs: 500,  maxDepth: 1 },
    2: { timeMs: 1000, maxDepth: 2 },
    3: { timeMs: 2000, maxDepth: 3 },
    4: { timeMs: 3000, maxDepth: 5 },
    5: { timeMs: 5000, maxDepth: 40 }
};
var currentDifficulty = 3;

function setDifficulty (level) {
    if (DIFFICULTY_LEVELS[level]) {
        currentDifficulty = level;
    }
}

var MAX_SEARCH_DEPTH = 40;   // safety cap for iterative deepening
var MATE_VALUE = 1000000;    // base score for checkmate

// When the time budget is used up, searchAborted is set and the search
// unwinds normally. Never abort via exceptions here: the search plays its
// trial moves on the real game object, and a thrown exception would skip
// the game.undo() calls and leave half a search line on the board.
var searchDeadline = 0;
var searchNodes = 0;
var searchAborted = false;

// ---------------------------------------------------------------------------
// Opening book - Khianat's personal repertoire (kept from the very first
// version of the engine). Keys are FEN strings, values are weighted replies.
// ---------------------------------------------------------------------------

var OPENING_BOOK = {
    // --- first black move ---

    // 1. e4
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1':
        [{ move: 'e5', weight: 0.5 }, { move: 'c5', weight: 0.5 }],

    // 1. d4
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1':
        [{ move: 'g6', weight: 0.7 }, { move: 'e5', weight: 0.3 }],

    // 1. Nf3
    'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1':
        [{ move: 'b5', weight: 0.5 }, { move: 'c5', weight: 0.5 }],

    // 1. c4
    'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1':
        [{ move: 'b6', weight: 0.5 }, { move: 'e5', weight: 0.5 }],

    // 1. Nc3
    'rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 1':
        [{ move: 'd5', weight: 0.5 }, { move: 'c5', weight: 0.5 }],

    // 1. g3
    'rnbqkbnr/pppppppp/8/8/8/6P1/PPPPPP1P/RNBQKBNR b KQkq - 0 1':
        [{ move: 'e5', weight: 0.5 }, { move: 'c5', weight: 0.5 }],

    // --- second black move ---

    // Englund gambit: 1. d4 e5 2. dxe5
    'rnbqkbnr/pppp1ppp/8/4P3/8/8/PPP1PPPP/RNBQKBNR b KQkq - 0 2':
        [{ move: 'Nc6', weight: 0.9 }, { move: 'Qh4', weight: 0.1 }],

    // Sicilian defense: 1. e4 c5 2. Nf3
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2':
        [{ move: 'e6', weight: 0.5 }, { move: 'a6', weight: 0.5 }],

    // Kings pawn opening, kings knight variation: 1. e4 e5 2. Nf3
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2':
        [{ move: 'Nc6', weight: 0.5 }, { move: 'f5', weight: 0.5 }],

    // Vienna game: 1. e4 e5 2. Nc3
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2':
        [{ move: 'Nf6', weight: 0.5 }, { move: 'Nc6', weight: 0.5 }],

    // Modern defense with d4, e4: 1. d4 g6 2. e4
    'rnbqkbnr/pppppp1p/6p1/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq e3 0 2':
        [{ move: 'Bg7', weight: 0.5 }, { move: 'd6', weight: 0.5 }],

    // Modern defense with d4, c4: 1. d4 g6 2. c4
    'rnbqkbnr/pppppp1p/6p1/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2':
        [{ move: 'Bg7', weight: 0.5 }, { move: 'Nf6', weight: 0.5 }]
};

/*
 * Returns a book move (SAN string) for the current position, or null.
 * Every book move is validated against the legal moves, so a wrong book
 * entry can never freeze the game.
 */
function getBookMove (game) {
    var entries = OPENING_BOOK[game.fen()];
    if (!entries) return null;

    // weighted random choice
    var totalWeight = 0;
    var i;
    for (i = 0; i < entries.length; i++) {
        totalWeight += entries[i].weight;
    }
    var pick = Math.random() * totalWeight;
    var chosen = entries[entries.length - 1].move;
    for (i = 0; i < entries.length; i++) {
        pick -= entries[i].weight;
        if (pick <= 0) {
            chosen = entries[i].move;
            break;
        }
    }

    // validate against the legal moves of the position
    var legalMoves = game.moves();
    if (legalMoves.indexOf(chosen) !== -1) {
        return chosen;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Move ordering: search promising moves first so alpha-beta prunes more.
// ---------------------------------------------------------------------------

/*
 * Score used only for sorting (not for evaluation):
 * promotions and "capture a big piece with a small piece" come first.
 */
function moveOrderScore (move) {
    var score = 0;
    if (move.captured) {
        score += 10 * PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece];
    }
    if (move.promotion) {
        score += PIECE_VALUES.q;
    }
    return score;
}

function orderMoves (moves) {
    moves.sort(function (a, b) {
        return moveOrderScore(b) - moveOrderScore(a);
    });
    return moves;
}

// ---------------------------------------------------------------------------
// Time control
// ---------------------------------------------------------------------------

function checkTime () {
    // Date.now() is not free, so only check it every 1024 nodes
    if ((searchNodes & 1023) === 0 && Date.now() > searchDeadline) {
        searchAborted = true;
    }
}

// ---------------------------------------------------------------------------
// Quiescence search: at depth 0, keep playing captures (and promotions)
// until the position is "quiet". Prevents the classic horizon effect
// ("takes a pawn, loses the queen one move later").
// ---------------------------------------------------------------------------

function quiescence (game, alpha, beta, colorSign) {
    searchNodes++;
    checkTime();
    if (searchAborted) return 0; // score is discarded anyway

    // "stand pat": the side to move may also decline all captures
    var standPat = colorSign * evaluateBoard(game);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    var moves = game.moves({ verbose: true });
    var noisyMoves = [];
    for (var i = 0; i < moves.length; i++) {
        if (moves[i].captured || moves[i].promotion) {
            noisyMoves.push(moves[i]);
        }
    }
    orderMoves(noisyMoves);

    for (var j = 0; j < noisyMoves.length; j++) {
        game.move(noisyMoves[j]);
        var score = -quiescence(game, -beta, -alpha, -colorSign);
        game.undo(); // must always run, even when the search is being aborted

        if (searchAborted) return 0;
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }

    return alpha;
}

// ---------------------------------------------------------------------------
// Negamax with alpha-beta pruning
// ---------------------------------------------------------------------------

/*
 * Returns the score of the position from the point of view of the side
 * to move. colorSign is +1 when White is to move, -1 when Black is.
 * ply is the distance from the root (used to prefer faster mates).
 */
function negamax (game, depth, alpha, beta, colorSign, ply) {
    searchNodes++;
    checkTime();
    if (searchAborted) return 0;

    var moves = game.moves({ verbose: true });

    // no legal moves: checkmate (bad for the side to move) or stalemate (draw)
    if (moves.length === 0) {
        return game.in_check() ? -(MATE_VALUE - ply) : 0;
    }

    // draw by 50-move rule, insufficient material or threefold repetition
    if (game.in_draw() || game.in_threefold_repetition()) {
        return 0;
    }

    if (depth === 0) {
        return quiescence(game, alpha, beta, colorSign);
    }

    orderMoves(moves);

    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
        game.move(moves[i]);
        var score = -negamax(game, depth - 1, -beta, -alpha, -colorSign, ply + 1);
        game.undo(); // must always run, even when the search is being aborted

        if (searchAborted) return 0;
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break; // alpha-beta pruning
    }

    return best;
}

/*
 * Root search for one fixed depth. Returns { move, score }, or null when
 * the time ran out midway (an unfinished depth must not be trusted).
 * rootMoves is reordered between iterations so the best move so far
 * is examined first (principal variation ordering).
 */
function searchRoot (game, depth, colorSign, rootMoves) {
    var alpha = -Infinity;
    var beta = Infinity;
    var bestMove = rootMoves[0];
    var bestScore = -Infinity;

    for (var i = 0; i < rootMoves.length; i++) {
        game.move(rootMoves[i]);
        var score = -negamax(game, depth - 1, -beta, -alpha, -colorSign, 1);
        game.undo(); // must always run, even when the search is being aborted

        if (searchAborted) return null;
        if (score > bestScore) {
            bestScore = score;
            bestMove = rootMoves[i];
        }
        if (bestScore > alpha) alpha = bestScore;
    }

    return { move: bestMove, score: bestScore };
}

/*
 * Iterative deepening: search depth 1, 2, 3, ... until the time budget
 * runs out. The result of the last fully completed depth is used, so a
 * timeout can never produce a half-searched, bad move.
 */
function getBestMove (game) {
    var level = DIFFICULTY_LEVELS[currentDifficulty];
    searchDeadline = Date.now() + level.timeMs;
    searchNodes = 0;
    searchAborted = false;

    // remember where the real game ends, so trial moves can never leak out
    var realHistoryLength = game.history().length;

    var colorSign = game.turn() === 'w' ? 1 : -1;
    var rootMoves = orderMoves(game.moves({ verbose: true }));

    if (rootMoves.length === 0) return null;
    if (rootMoves.length === 1) return rootMoves[0]; // forced move: no need to think

    var bestMove = rootMoves[0];

    for (var depth = 1; depth <= level.maxDepth; depth++) {
        var result = searchRoot(game, depth, colorSign, rootMoves);

        // time ran out during this depth: keep the move of the last finished depth
        if (result === null) break;

        bestMove = result.move;

        // put the best move first for the next, deeper iteration
        var idx = rootMoves.indexOf(bestMove);
        if (idx > 0) {
            rootMoves.splice(idx, 1);
            rootMoves.unshift(bestMove);
        }

        // stop early if a forced mate was found
        if (Math.abs(result.score) >= MATE_VALUE - MAX_SEARCH_DEPTH) {
            break;
        }
    }

    // safety net: take back anything the search may have left on the board.
    // With the flag-based abort this should never trigger, but the game
    // state staying consistent is too important to rely on "should".
    while (game.history().length > realHistoryLength) {
        game.undo();
    }

    return bestMove;
}

// ---------------------------------------------------------------------------
// Public entry point, called from index.html after the player's move
// ---------------------------------------------------------------------------

function makeMove () {
    if (game.game_over()) return;
    if (game.turn() !== 'b') return; // Khianat plays Black only

    // 1. try the opening book, 2. otherwise search
    var move = getBookMove(game);
    if (move === null) {
        move = getBestMove(game);
    }
    if (move === null) return; // should never happen, but never crash the UI

    var played = game.move(move);
    if (played === null) return;

    board.position(game.fen());
    playMoveSound();
    highlightMove(played.from, played.to);
    updateStatus();
}
