/*
 * evaluation.js - static board evaluation for the Khianat chess engine.
 *
 * The evaluation combines:
 *  - material values per piece
 *  - piece square tables (PST), adapted from Sunfish.py:
 *    https://github.com/thomasahle/sunfish/blob/master/sunfish.py
 *  - a separate king table for the endgame (centralize the king)
 *
 * evaluateBoard(game) returns the score in centipawn-like units from
 * White's point of view: positive = good for White, negative = good for Black.
 */

// Material values (the king is not counted as material; mate is handled by the search)
var PIECE_VALUES = { p: 100, n: 280, b: 320, r: 479, q: 929, k: 0 };

// Piece square tables from White's point of view.
// Row 0 = rank 8 (Black's back rank), row 7 = rank 1 (White's back rank),
// which matches the layout of game.board() from chess.js.
var PST_W = {
    'p': [
            [ 100, 100, 100, 100, 105, 100, 100,  100],
            [  78,  83,  86,  73, 102,  82,  85,  90],
            [   7,  29,  21,  44,  40,  31,  44,   7],
            [ -17,  16,  -2,  15,  14,   0,  15, -13],
            [ -26,   3,  10,   9,   6,   1,   0, -23],
            [ -22,   9,   5, -11, -10,  -2,   3, -19],
            [ -31,   8,  -7, -37, -36, -14,   3, -31],
            [   0,   0,   0,   0,   0,   0,   0,   0]
        ],
    'n': [
            [-66, -53, -75, -75, -10, -55, -58, -70],
            [ -3,  -6, 100, -36,   4,  62,  -4, -14],
            [ 10,  67,   1,  74,  73,  27,  62,  -2],
            [ 24,  24,  45,  37,  33,  41,  25,  17],
            [ -1,   5,  31,  21,  22,  35,   2,   0],
            [-18,  10,  13,  22,  18,  15,  11, -14],
            [-23, -15,   2,   0,   2,   0, -23, -20],
            [-74, -23, -26, -24, -19, -35, -22, -69]
        ],
    'b': [
            [-59, -78, -82, -76, -23,-107, -37, -50],
            [-11,  20,  35, -42, -39,  31,   2, -22],
            [ -9,  39, -32,  41,  52, -10,  28, -14],
            [ 25,  17,  20,  34,  26,  25,  15,  10],
            [ 13,  10,  17,  23,  17,  16,   0,   7],
            [ 14,  25,  24,  15,   8,  25,  20,  15],
            [ 19,  20,  11,   6,   7,   6,  20,  16],
            [ -7,   2, -15, -12, -14, -15, -10, -10]
        ],
    'r': [
            [ 35,  29,  33,   4,  37,  33,  56,  50],
            [ 55,  29,  56,  67,  55,  62,  34,  60],
            [ 19,  35,  28,  33,  45,  27,  25,  15],
            [  0,   5,  16,  13,  18,  -4,  -9,  -6],
            [-28, -35, -16, -21, -13, -29, -46, -30],
            [-42, -28, -42, -25, -25, -35, -26, -46],
            [-53, -38, -31, -26, -29, -43, -44, -53],
            [-30, -24, -18,   5,  -2, -18, -31, -32]
        ],
    'q': [
            [  6,   1,  -8,-104,  69,  24,  88,  26],
            [ 14,  32,  60, -10,  20,  76,  57,  24],
            [ -2,  43,  32,  60,  72,  63,  43,   2],
            [  1, -16,  22,  17,  25,  20, -13,  -6],
            [-14, -15,  -2,  -5,  -1, -10, -20, -22],
            [-30,  -6, -13, -11, -16, -11, -16, -27],
            [-36, -18,   0, -19, -15, -15, -21, -38],
            [-39, -30, -31, -13, -31, -36, -34, -42]
        ],
    'k': [
            [  4,  54,  47, -99, -99,  60,  83, -62],
            [-32,  10,  55,  56,  56,  55,  10,   3],
            [-62,  12, -57,  44, -67,  28,  37, -31],
            [-55,  50,  11,  -4, -19,  13,   0, -49],
            [-55, -43, -52, -28, -51, -47,  -8, -50],
            [-47, -42, -43, -79, -64, -32, -29, -32],
            [ -4,   3, -14, -50, -57, -18,  13,   4],
            [ 17,  30,  -3, -14,   6,  -1,  40,  18]
        ],

    // Endgame king table: the king should walk to the center
    'k_e': [
            [-50, -40, -30, -20, -20, -30, -40, -50],
            [-30, -20, -10,   0,   0, -10, -20, -30],
            [-30, -10,  20,  30,  30,  20, -10, -30],
            [-30, -10,  30,  40,  40,  30, -10, -30],
            [-30, -10,  30,  40,  40,  30, -10, -30],
            [-30, -10,  20,  30,  30,  20, -10, -30],
            [-30, -30,   0,   0,   0,   0, -30, -30],
            [-50, -30, -30, -30, -30, -30, -30, -50]
        ]
};

/*
 * A position counts as an endgame when little non-pawn material is left
 * (roughly: both sides together have less than a rook + bishop each).
 * In the endgame the king uses the k_e table and becomes an active piece.
 */
var ENDGAME_MATERIAL_LIMIT = 2 * (PIECE_VALUES.r + PIECE_VALUES.b);

function isEndgame (board) {
    var nonPawnMaterial = 0;
    for (var row = 0; row < 8; row++) {
        for (var col = 0; col < 8; col++) {
            var piece = board[row][col];
            if (piece && piece.type !== 'p' && piece.type !== 'k') {
                nonPawnMaterial += PIECE_VALUES[piece.type];
            }
        }
    }
    return nonPawnMaterial <= ENDGAME_MATERIAL_LIMIT;
}

/*
 * Full board evaluation from White's point of view.
 *
 * White pieces read the tables directly (row 0 = rank 8).
 * Black pieces read the tables vertically mirrored (row 7 - row),
 * so both sides use the same, correctly oriented values.
 */
function evaluateBoard (game) {
    var board = game.board();
    var endgame = isEndgame(board);
    var score = 0;

    for (var row = 0; row < 8; row++) {
        for (var col = 0; col < 8; col++) {
            var piece = board[row][col];
            if (!piece) continue;

            var tableKey = (piece.type === 'k' && endgame) ? 'k_e' : piece.type;
            var table = PST_W[tableKey];

            if (piece.color === 'w') {
                score += PIECE_VALUES[piece.type] + table[row][col];
            } else {
                score -= PIECE_VALUES[piece.type] + table[7 - row][col];
            }
        }
    }

    return score;
}
