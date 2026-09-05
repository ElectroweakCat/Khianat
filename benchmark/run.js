/*
 * Khianat benchmark runner.
 *
 *   node run.js puzzles   [--depth 3]
 *   node run.js mates     [--depth 3]
 *   node run.js endgames  [--depth 3]
 *   node run.js acpl      --stockfish <path> [--depth 3] [--games 6] [--sf-depth 16]
 *   node run.js match     --stockfish <path> [--depth 3] [--games 40] [--elo 1500]
 *   node run.js all       [--stockfish <path>]
 *
 * Results are merged into ../benchmark-results.json, one entry per engine
 * version, so later runs can be compared fairly. See README.md.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadEngine, useFixedDepth, ROOT } = require('./lib/load-engine');
const { eloDifference, eloConfidence, crossingRating } = require('./lib/elo');

const RESULTS_FILE = path.join(ROOT, 'benchmark-results.json');
const SUITES = path.join(__dirname, 'suites');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function parseArgs (argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const key = argv[i].slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith('--')) { args[key] = next; i++; }
            else { args[key] = true; }
        } else {
            args._.push(argv[i]);
        }
    }
    return args;
}

/*
 * A one line progress display with a rough estimate of the time left.
 * Long runs otherwise sit silently for hours, which makes it impossible
 * to tell a slow test from a stuck one.
 */
function formatTime (seconds) {
    if (seconds < 90) return Math.round(seconds) + 's';
    const minutes = seconds / 60;
    if (minutes < 90) return Math.round(minutes) + 'm';
    return (minutes / 60).toFixed(1) + 'h';
}

function makeProgress (total) {
    const start = Date.now();
    let done = 0;
    let current = '';

    function draw () {
        const elapsed = (Date.now() - start) / 1000;
        const left = done > 0 ? (elapsed / done) * (total - done) : null;

        process.stdout.write(
            '\r  ' + done + '/' + total +
            (current ? '  ' + current : '') +
            '  ' + formatTime(elapsed) + ' elapsed' +
            (left !== null ? ', about ' + formatTime(left) + ' left' : '') +
            '        '
        );
    }

    function clear () {
        process.stdout.write('\r' + ' '.repeat(78) + '\r');
    }

    return {
        working (label) { current = label; draw(); },
        tick () { done++; draw(); },
        log (line) { clear(); console.log(line); draw(); },
        done () { clear(); }
    };
}

function readSuite (name) {
    const file = path.join(SUITES, name);
    if (!fs.existsSync(file)) {
        console.error(`missing suite: ${file}`);
        console.error('run "node tools/prepare-puzzles.js <lichess_db_puzzle.csv>" first');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

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

// ---------------------------------------------------------------------------
// tactics: Lichess puzzles
// ---------------------------------------------------------------------------

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
            if (!mated) return false;
            return true;
        }

        game.move(chosen);
        const reply = puzzle.moves[i + 1];
        if (reply) game.move(moveFromUci(reply));
    }
    return true;
}

function runPuzzles (engine, depth) {
    const suite = readSuite('puzzles.json');
    const bands = [];
    let solvedTotal = 0;
    let total = 0;

    const progress = makeProgress(
        suite.bands.reduce((sum, band) => sum + band.puzzles.length, 0)
    );

    for (const band of suite.bands) {
        let solved = 0;
        progress.working(`rated ${band.from}-${band.to}`);

        for (const puzzle of band.puzzles) {
            if (solvePuzzle(engine, puzzle)) solved++;
            progress.tick();
        }

        bands.push({ from: band.from, to: band.to, solved, total: band.puzzles.length });
        solvedTotal += solved;
        total += band.puzzles.length;
        progress.log(`  ${band.from}-${band.to}: ${solved}/${band.puzzles.length}`);
    }
    progress.done();

    return {
        depth,
        total,
        solved: solvedTotal,
        bands,
        ratingEstimate: crossingRating(bands),
        source: suite.source
    };
}

function runMates (engine, depth) {
    const suite = readSuite('mates.json');
    const groups = [];

    const progress = makeProgress(
        suite.groups.reduce((sum, group) => sum + group.puzzles.length, 0)
    );

    for (const group of suite.groups) {
        let solved = 0;
        progress.working(group.id);

        for (const puzzle of group.puzzles) {
            if (solvePuzzle(engine, puzzle)) solved++;
            progress.tick();
        }

        groups.push({ id: group.id, solved, total: group.puzzles.length });
        progress.log(`  ${group.id}: ${solved}/${group.puzzles.length}`);
    }
    progress.done();

    return { depth, groups, source: suite.source };
}

// ---------------------------------------------------------------------------
// endgame technique
// ---------------------------------------------------------------------------

function runEndgames (engine, depth) {
    const suite = readSuite('endgames.json');
    const positions = [];
    const progress = makeProgress(suite.positions.length);

    for (const test of suite.positions) {
        progress.working(test.id);
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

        positions.push({
            id: test.id,
            description: test.description,
            solved: mated,
            moves: mated ? moves : null,
            maxMoves: test.maxMoves
        });
        progress.tick();
        progress.log(`  ${test.id}: ${mated ? 'mate in ' + moves : 'not solved'}`);
    }
    progress.done();

    return { depth, positions, method: suite.method };
}

// ---------------------------------------------------------------------------
// move quality: average centipawn loss in self play, judged by Stockfish
// ---------------------------------------------------------------------------

async function runAcpl (engine, depth, options) {
    const { Uci } = require('./lib/uci');
    const stockfish = new Uci(options.stockfish);
    await stockfish.init({ Threads: 1, Hash: 64 });

    const gameCount = parseInt(options.games || 6, 10);
    const sfDepth = parseInt(options['sf-depth'] || 16, 10);
    const maxPlies = 120;

    let totalLoss = 0;
    let judged = 0;
    let blunders = 0;

    for (let g = 0; g < gameCount; g++) {
        const game = new engine.Chess();
        await stockfish.newGame();

        while (!game.game_over() && game.history().length < maxPlies) {
            const before = await stockfish.analyse(game.fen(), { depth: sfDepth });

            const move = engine.getBestMove(game);
            if (!move) break;
            game.move(move);

            const after = await stockfish.analyse(game.fen(), { depth: sfDepth });

            if (before.scoreCp !== null && after.scoreCp !== null) {
                const scoreForMover = -after.scoreCp;
                const loss = Math.min(1000, Math.max(0, before.scoreCp - scoreForMover));
                totalLoss += loss;
                judged++;
                if (loss >= 200) blunders++;
            }
        }
        console.log(`  self play game ${g + 1}/${gameCount} done (${judged} moves judged)`);
    }

    stockfish.quit();

    return {
        depth,
        stockfishDepth: sfDepth,
        games: gameCount,
        movesJudged: judged,
        averageCentipawnLoss: judged ? Math.round(totalLoss / judged) : null,
        blunderRate: judged ? Math.round((blunders / judged) * 1000) / 10 : null,
        note: 'Self play positions, every Khianat move judged by Stockfish. Losses are capped at 1000 centipawns so single mate scores cannot dominate the average.'
    };
}

// ---------------------------------------------------------------------------
// match play against a rating limited Stockfish
// ---------------------------------------------------------------------------

async function runMatch (engine, depth, options) {
    const { Uci } = require('./lib/uci');
    const opponentElo = parseInt(options.elo || 1500, 10);
    const gameCount = parseInt(options.games || 40, 10);
    const moveTime = parseInt(options['sf-movetime'] || 100, 10);
    const maxPlies = 200;

    const stockfish = new Uci(options.stockfish);
    await stockfish.init({
        Threads: 1,
        Hash: 64,
        UCI_LimitStrength: 'true',
        UCI_Elo: opponentElo
    });

    let wins = 0, draws = 0, losses = 0;

    for (let g = 0; g < gameCount; g++) {
        const khianatIsWhite = g % 2 === 0;
        const game = new engine.Chess();
        await stockfish.newGame();

        while (!game.game_over() && game.history().length < maxPlies) {
            const khianatToMove = (game.turn() === 'w') === khianatIsWhite;
            let move;

            if (khianatToMove) {
                move = engine.getBookMove(game) || engine.getBestMove(game);
            } else {
                const answer = await stockfish.analyse(game.fen(), { moveTime });
                move = moveFromUci(answer.bestMove);
            }
            if (!move) break;
            if (game.move(move) === null) break;
        }

        let result = 'draw';
        if (game.in_checkmate()) {
            const loserIsWhite = game.turn() === 'w';
            result = (loserIsWhite !== khianatIsWhite) ? 'win' : 'loss';
        }

        if (result === 'win') wins++;
        else if (result === 'loss') losses++;
        else draws++;

        console.log(`  game ${g + 1}/${gameCount}: ${result} (+${wins} =${draws} -${losses})`);
    }

    stockfish.quit();

    const score = (wins + draws / 2) / gameCount;
    const difference = eloDifference(score);

    return {
        depth,
        opponent: `Stockfish, UCI_LimitStrength at UCI_Elo ${opponentElo}, ${moveTime} ms per move`,
        opponentElo,
        games: gameCount,
        wins,
        draws,
        losses,
        score: Math.round(score * 1000) / 10,
        eloDifference: Math.round(difference),
        confidence95: eloConfidence(score, gameCount),
        estimatedElo: Math.round(opponentElo + difference),
        note: 'Stockfish UCI_Elo is the engine authors own scale and is not the same thing as a human rating. Treat the number as an orientation, not as a rating.'
    };
}

// ---------------------------------------------------------------------------
// results file
// ---------------------------------------------------------------------------

function saveResults (engineVersion, depth, tests) {
    let data = { schemaVersion: 1, runs: [] };
    if (fs.existsSync(RESULTS_FILE)) {
        data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        if (!Array.isArray(data.runs)) data.runs = [];
    }

    const key = `${engineVersion}@depth${depth}`;
    let run = data.runs.find(r => r.key === key);
    if (!run) {
        run = {
            key,
            engineVersion,
            searchDepth: depth,
            date: new Date().toISOString().slice(0, 10),
            machine: `${os.type()} ${os.arch()}, ${os.cpus()[0] ? os.cpus()[0].model : 'unknown cpu'}, Node ${process.versions.node}`,
            tests: {}
        };
        data.runs.push(run);
    }

    run.date = new Date().toISOString().slice(0, 10);

    // matches against different opponents add up instead of replacing each other
    if (tests.matches) {
        const existing = run.tests.matches || [];
        const kept = existing.filter(
            m => !tests.matches.some(fresh => fresh.opponentElo === m.opponentElo)
        );
        tests.matches = kept.concat(tests.matches)
            .sort((a, b) => a.opponentElo - b.opponentElo);
    }

    Object.assign(run.tests, tests);

    fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 1));
    console.log(`\nsaved to ${RESULTS_FILE} (${key})`);
}

// ---------------------------------------------------------------------------

async function main () {
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0];
    const depth = parseInt(args.depth || 3, 10);

    if (!command) {
        console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
        process.exit(0);
    }

    const engine = loadEngine();
    useFixedDepth(engine, depth);
    const version = engine.KHIANAT_VERSION;

    console.log(`Khianat ${version}, fixed search depth ${depth}\n`);

    const needsStockfish = ['acpl', 'match'].includes(command) ||
                           (command === 'all' && args.stockfish);
    if (needsStockfish && !args.stockfish) {
        console.error('this test needs --stockfish <path to stockfish executable>');
        process.exit(1);
    }

    const tests = {};

    if (command === 'puzzles' || command === 'all') {
        console.log('tactics:');
        tests.puzzles = runPuzzles(engine, depth);
    }
    if (command === 'mates' || command === 'all') {
        console.log('forced mates:');
        tests.mates = runMates(engine, depth);
    }
    if (command === 'endgames' || command === 'all') {
        console.log('endgame technique:');
        tests.endgames = runEndgames(engine, depth);
    }
    if (command === 'acpl' || (command === 'all' && args.stockfish)) {
        console.log('move quality:');
        tests.acpl = await runAcpl(engine, depth, args);
    }
    if (command === 'match' || (command === 'all' && args.stockfish)) {
        console.log('match play:');
        const match = await runMatch(engine, depth, args);
        tests.matches = [match];
    }

    if (Object.keys(tests).length === 0) {
        console.error(`unknown command: ${command}`);
        process.exit(1);
    }

    saveResults(version, depth, tests);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
