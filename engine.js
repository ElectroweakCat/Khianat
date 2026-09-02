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

// Bump this whenever the engine changes in a way that could affect its
// playing strength, so benchmark results stay comparable across versions.
var KHIANAT_VERSION = '1.3.0';

// Difficulty levels: how long and how deep Khianat may think per move.
// Level 5 is the full engine, lower levels cap the depth and thinking time.
// varietyMargin says how much worse than the best move an opening move may
// be and still be considered (in centipawns, 100 = one pawn). The weaker the
// level, the more Khianat is allowed to improvise.
var DIFFICULTY_LEVELS = {
    1: { timeMs: 500,  maxDepth: 1,  varietyMargin: 120 },
    2: { timeMs: 1000, maxDepth: 2,  varietyMargin: 90 },
    3: { timeMs: 2000, maxDepth: 3,  varietyMargin: 60 },
    4: { timeMs: 3000, maxDepth: 5,  varietyMargin: 40 },
    5: { timeMs: 5000, maxDepth: 40, varietyMargin: 25 }
};
var currentDifficulty = 3;

// How long the opening phase lasts (in half-moves). Only inside this phase
// does Khianat vary between equally good moves; afterwards it always plays
// the move it considers best, so middlegame and endgame keep full strength.
var OPENING_VARIETY_PLIES = 16;

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
    // Deliberately broad: the more replies per position, the harder it is to
    // prepare a line against Khianat. Odd choices keep a small weight.

    // 1. e4
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1':
        [{ move: 'c5', weight: 0.25 },   // Sicilian
         { move: 'e5', weight: 0.25 },   // open games
         { move: 'e6', weight: 0.15 },   // French
         { move: 'c6', weight: 0.15 },   // Caro-Kann
         { move: 'd5', weight: 0.05 },   // Scandinavian
         { move: 'Nf6', weight: 0.05 },  // Alekhine
         { move: 'g6', weight: 0.05 },   // Modern
         { move: 'd6', weight: 0.05 }],  // Pirc

    // 1. d4
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1':
        [{ move: 'Nf6', weight: 0.3 },
         { move: 'd5', weight: 0.25 },
         { move: 'e6', weight: 0.15 },
         { move: 'g6', weight: 0.15 },
         { move: 'f5', weight: 0.1 },    // Dutch
         { move: 'e5', weight: 0.05 }],  // Englund gambit, just for fun

    // 1. Nf3
    'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1':
        [{ move: 'd5', weight: 0.3 },
         { move: 'Nf6', weight: 0.3 },
         { move: 'c5', weight: 0.2 },
         { move: 'g6', weight: 0.15 },
         { move: 'b5', weight: 0.05 }],  // Polish defence, cheeky

    // 1. c4
    'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1':
        [{ move: 'e5', weight: 0.3 },
         { move: 'Nf6', weight: 0.3 },
         { move: 'c5', weight: 0.15 },
         { move: 'e6', weight: 0.15 },
         { move: 'g6', weight: 0.1 }],

    // 1. Nc3
    'rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 1':
        [{ move: 'd5', weight: 0.4 },
         { move: 'c5', weight: 0.25 },
         { move: 'e5', weight: 0.2 },
         { move: 'Nf6', weight: 0.15 }],

    // 1. g3
    'rnbqkbnr/pppppppp/8/8/8/6P1/PPPPPP1P/RNBQKBNR b KQkq - 0 1':
        [{ move: 'd5', weight: 0.3 },
         { move: 'e5', weight: 0.3 },
         { move: 'Nf6', weight: 0.2 },
         { move: 'c5', weight: 0.2 }],

    // 1. b3
    'rnbqkbnr/pppppppp/8/8/8/1P6/P1PPPPPP/RNBQKBNR b KQkq - 0 1':
        [{ move: 'e5', weight: 0.4 },
         { move: 'd5', weight: 0.35 },
         { move: 'Nf6', weight: 0.25 }],

    // 1. f4 (Bird)
    'rnbqkbnr/pppppppp/8/8/5P2/8/PPPPP1PP/RNBQKBNR b KQkq f3 0 1':
        [{ move: 'd5', weight: 0.5 },
         { move: 'Nf6', weight: 0.3 },
         { move: 'e5', weight: 0.2 }],   // From gambit

    // 1. e3
    'rnbqkbnr/pppppppp/8/8/8/4P3/PPPP1PPP/RNBQKBNR b KQkq - 0 1':
        [{ move: 'd5', weight: 0.5 },
         { move: 'e5', weight: 0.3 },
         { move: 'Nf6', weight: 0.2 }],

    // 1. d3
    'rnbqkbnr/pppppppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR b KQkq - 0 1':
        [{ move: 'd5', weight: 0.5 },
         { move: 'e5', weight: 0.3 },
         { move: 'Nf6', weight: 0.2 }],

    // 1. b4 (Sokolsky)
    'rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq b3 0 1':
        [{ move: 'e5', weight: 0.5 },
         { move: 'd5', weight: 0.3 },
         { move: 'Nf6', weight: 0.2 }],

    // --- second black move ---

    // Englund gambit: 1. d4 e5 2. dxe5
    'rnbqkbnr/pppp1ppp/8/4P3/8/8/PPP1PPPP/RNBQKBNR b KQkq - 0 2':
        [{ move: 'Nc6', weight: 0.9 }, { move: 'Qh4', weight: 0.1 }],

    // Sicilian defense: 1. e4 c5 2. Nf3
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2':
        [{ move: 'd6', weight: 0.3 },
         { move: 'Nc6', weight: 0.3 },
         { move: 'e6', weight: 0.25 },
         { move: 'a6', weight: 0.15 }],

    // Kings pawn opening, kings knight variation: 1. e4 e5 2. Nf3
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2':
        [{ move: 'Nc6', weight: 0.5 },
         { move: 'Nf6', weight: 0.3 },   // Petrov
         { move: 'd6', weight: 0.15 },   // Philidor
         { move: 'f5', weight: 0.05 }],  // Latvian gambit, very Khianat

    // Vienna game: 1. e4 e5 2. Nc3
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2':
        [{ move: 'Nf6', weight: 0.5 }, { move: 'Nc6', weight: 0.5 }],

    // Caro-Kann: 1. e4 c6 2. d4
    'rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2':
        [{ move: 'd5', weight: 0.8 }, { move: 'g6', weight: 0.2 }],

    // French defence: 1. e4 e6 2. d4
    'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2':
        [{ move: 'd5', weight: 0.8 }, { move: 'c5', weight: 0.2 }],

    // Indian defences: 1. d4 Nf6 2. c4
    'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2':
        [{ move: 'e6', weight: 0.4 },
         { move: 'g6', weight: 0.4 },
         { move: 'c5', weight: 0.2 }],   // Benoni

    // Queens gambit: 1. d4 d5 2. c4
    'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2':
        [{ move: 'e6', weight: 0.35 },   // declined
         { move: 'c6', weight: 0.35 },   // Slav
         { move: 'dxc4', weight: 0.3 }], // accepted

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
// Draw detection
//
// chess.js can detect repetitions, but the way it does it is to take the
// whole game apart move by move, build a FEN for every position and play
// everything back again. That is fine once per move, but the search called
// it in every single node, which made it by far the most expensive thing
// the engine did. So repetitions are tracked here instead: a small list of
// position keys, made of the real game plus the current search path.
// ---------------------------------------------------------------------------

var repetitionKeys = [];

// a FEN without the move counters identifies the position itself
function positionKey (game) {
    return game.fen().split(' ').slice(0, 4).join(' ');
}

// has the position at the end of the list occurred before?
function isRepetition () {
    var last = repetitionKeys.length - 1;
    if (last < 1) return false;

    var key = repetitionKeys[last];
    for (var i = last - 1; i >= 0; i--) {
        if (repetitionKeys[i] === key) return true;
    }
    return false;
}

/*
 * Position keys of the game played so far, so the engine also notices
 * repetitions of positions from before it started thinking. Captures and
 * pawn moves are irreversible: everything before them can never come back,
 * so the list is cleared there and stays short.
 */
function buildRepetitionHistory (game) {
    var keys = [];
    var replay = new Chess();
    var history = game.history({ verbose: true });

    keys.push(positionKey(replay));
    for (var i = 0; i < history.length; i++) {
        replay.move(history[i].san);
        if (history[i].captured || history[i].piece === 'p') {
            keys.length = 0;
        }
        keys.push(positionKey(replay));
    }
    return keys;
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
 * halfMoves is the fifty-move counter, carried along instead of asking
 * chess.js for it.
 */
function negamax (game, depth, alpha, beta, colorSign, ply, halfMoves) {
    searchNodes++;
    checkTime();
    if (searchAborted) return 0;

    var moves = game.moves({ verbose: true });

    // no legal moves: checkmate (bad for the side to move) or stalemate (draw)
    if (moves.length === 0) {
        return game.in_check() ? -(MATE_VALUE - ply) : 0;
    }

    // fifty-move rule
    if (halfMoves >= 100) return 0;

    // repetition (impossible before four half-moves without a capture)
    if (halfMoves >= 4 && isRepetition()) return 0;

    // too little material to mate: this can only newly appear right after
    // a capture or pawn move, which is exactly when halfMoves is back to 0
    if (halfMoves === 0 && game.insufficient_material()) return 0;

    if (depth === 0) {
        return quiescence(game, alpha, beta, colorSign);
    }

    orderMoves(moves);

    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
        var childHalfMoves = (moves[i].captured || moves[i].piece === 'p')
            ? 0
            : halfMoves + 1;

        game.move(moves[i]);
        var tracked = childHalfMoves >= 4;
        if (tracked) repetitionKeys.push(positionKey(game));

        var score = -negamax(game, depth - 1, -beta, -alpha, -colorSign,
                             ply + 1, childHalfMoves);

        if (tracked) repetitionKeys.pop();
        game.undo(); // must always run, even when the search is being aborted

        if (searchAborted) return 0;
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break; // alpha-beta pruning
    }

    return best;
}

/*
 * Root search for one fixed depth. Returns { move, score, scored }, or null
 * when the time ran out midway (an unfinished depth must not be trusted).
 * rootMoves is reordered between iterations so the best move so far
 * is examined first (principal variation ordering).
 *
 * With exactScores the root window is never narrowed. That costs some speed,
 * but it is what makes the scores of all moves comparable: with the usual
 * alpha narrowing, everything except the best move only gets an upper bound,
 * which is useless for picking between near-equal moves.
 */
function searchRoot (game, depth, colorSign, rootMoves, exactScores, halfMoves) {
    var alpha = -Infinity;
    var beta = Infinity;
    var bestMove = rootMoves[0];
    var bestScore = -Infinity;
    var scored = [];

    for (var i = 0; i < rootMoves.length; i++) {
        var childHalfMoves = (rootMoves[i].captured || rootMoves[i].piece === 'p')
            ? 0
            : halfMoves + 1;

        game.move(rootMoves[i]);
        var tracked = childHalfMoves >= 4;
        if (tracked) repetitionKeys.push(positionKey(game));

        var score = -negamax(game, depth - 1, -beta, -alpha, -colorSign,
                             1, childHalfMoves);

        if (tracked) repetitionKeys.pop();
        game.undo(); // must always run, even when the search is being aborted

        if (searchAborted) return null;
        if (exactScores) {
            scored.push({ move: rootMoves[i], score: score });
        }
        if (score > bestScore) {
            bestScore = score;
            bestMove = rootMoves[i];
        }
        if (!exactScores && bestScore > alpha) alpha = bestScore;
    }

    return { move: bestMove, score: bestScore, scored: scored };
}

/*
 * Picks one of the moves that are at most 'margin' worse than the best one,
 * the closer to the best, the more likely. This is what keeps Khianat from
 * repeating the same game over and over: among moves it considers equally
 * good it simply makes a choice, like a human would. Anything clearly worse
 * (a hanging piece is hundreds of centipawns) never enters the selection.
 */
function pickVariedMove (scored, bestScore, margin) {
    var candidates = [];
    var totalWeight = 0;
    var i;

    for (i = 0; i < scored.length; i++) {
        var loss = bestScore - scored[i].score;
        if (loss <= margin) {
            // full weight for the best move, decreasing towards the margin
            var weight = margin - loss + 1;
            candidates.push({ move: scored[i].move, weight: weight });
            totalWeight += weight;
        }
    }

    if (candidates.length === 0) return null;

    var pick = Math.random() * totalWeight;
    for (i = 0; i < candidates.length; i++) {
        pick -= candidates[i].weight;
        if (pick <= 0) return candidates[i].move;
    }
    return candidates[candidates.length - 1].move;
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

    // draw bookkeeping for this search
    repetitionKeys = buildRepetitionHistory(game);
    var rootHalfMoves = parseInt(game.fen().split(' ')[4], 10) || 0;

    var colorSign = game.turn() === 'w' ? 1 : -1;
    var rootMoves = orderMoves(game.moves({ verbose: true }));

    if (rootMoves.length === 0) return null;
    if (rootMoves.length === 1) return rootMoves[0]; // forced move: no need to think

    // in the opening, score every root move exactly so equally good moves
    // can be told apart and chosen between
    var inOpening = realHistoryLength < OPENING_VARIETY_PLIES;

    var bestMove = rootMoves[0];
    var lastResult = null;
    var forcedMate = false;

    for (var depth = 1; depth <= level.maxDepth; depth++) {
        var result = searchRoot(game, depth, colorSign, rootMoves, inOpening,
                                rootHalfMoves);

        // time ran out during this depth: keep the move of the last finished depth
        if (result === null) break;

        bestMove = result.move;
        lastResult = result;

        // put the best move first for the next, deeper iteration
        var idx = rootMoves.indexOf(bestMove);
        if (idx > 0) {
            rootMoves.splice(idx, 1);
            rootMoves.unshift(bestMove);
        }

        // stop early if a forced mate was found
        if (Math.abs(result.score) >= MATE_VALUE - MAX_SEARCH_DEPTH) {
            forcedMate = true;
            break;
        }
    }

    // opening: pick among the moves that are just as good (but never give up
    // a forced mate for the sake of variety)
    if (inOpening && !forcedMate && lastResult && lastResult.scored.length > 0) {
        var varied = pickVariedMove(lastResult.scored, lastResult.score, level.varietyMargin);
        if (varied) bestMove = varied;
    }

    // safety net: take back anything the search may have left on the board.
    // With the flag-based abort this should never trigger, but the game
    // state staying consistent is too important to rely on "should".
    while (game.history().length > realHistoryLength) {
        game.undo();
    }
    repetitionKeys = [];

    return bestMove;
}

// This file is pure engine logic with no DOM access, so it can be loaded
// both in the page (as a fallback) and inside the Web Worker
// (engine-worker.js) that normally runs the search in the background.
