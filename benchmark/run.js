/*
 * Khianat benchmark runner.
 *
 *   node run.js puzzles   [--depth 3] [--workers 6]
 *   node run.js mates     [--depth 3] [--workers 6]
 *   node run.js endgames  [--depth 3] [--workers 6]
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
const { eloDifference, eloConfidence, fitPuzzleRating } = require('./lib/elo');
const { runTasks, defaultWorkerCount } = require('./lib/pool');
const { moveFromUci } = require('./lib/tests');

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

// ---------------------------------------------------------------------------
// tactics: Lichess puzzles
// ---------------------------------------------------------------------------

async function runPuzzles (depth, workers) {
    const suite = readSuite('puzzles.json');

    // one flat list of tasks, tagged with the band they belong to
    const tasks = [];
    suite.bands.forEach((band, bandIndex) => {
        band.puzzles.forEach(puzzle => {
            tasks.push({ kind: 'puzzle', puzzle, bandIndex, label: `rated ${band.from}-${band.to}` });
        });
    });

    const progress = makeProgress(tasks.length);
    const solvedFlags = await runTasks(tasks, {
        depth,
        workers,
        onProgress (done, total, task) {
            progress.working(task.label);
            progress.tick();
        }
    });
    progress.done();

    const bands = suite.bands.map(band => ({
        from: band.from, to: band.to, solved: 0, total: band.puzzles.length
    }));
    let solvedTotal = 0;

    solvedFlags.forEach((solved, index) => {
        if (!solved) return;
        bands[tasks[index].bandIndex].solved++;
        solvedTotal++;
    });

    bands.forEach(band => console.log(`  ${band.from}-${band.to}: ${band.solved}/${band.total}`));

    const fit = fitPuzzleRating(bands);
    if (fit) {
        console.log(`  fitted puzzle rating: ${fit.rating} (95% range ${fit.low} to ${fit.high})`);
    }

    return {
        depth,
        total: tasks.length,
        solved: solvedTotal,
        bands,
        ratingEstimate: fit ? fit.rating : null,
        ratingRange: fit ? [fit.low, fit.high] : null,
        ratingBounded: fit ? fit.bounded : false,
        source: suite.source
    };
}

async function runMates (depth, workers) {
    const suite = readSuite('mates.json');

    const tasks = [];
    suite.groups.forEach((group, groupIndex) => {
        group.puzzles.forEach(puzzle => {
            tasks.push({ kind: 'puzzle', puzzle, groupIndex, label: group.id });
        });
    });

    const progress = makeProgress(tasks.length);
    const solvedFlags = await runTasks(tasks, {
        depth,
        workers,
        onProgress (done, total, task) {
            progress.working(task.label);
            progress.tick();
        }
    });
    progress.done();

    const groups = suite.groups.map(group => ({
        id: group.id, solved: 0, total: group.puzzles.length
    }));

    solvedFlags.forEach((solved, index) => {
        if (solved) groups[tasks[index].groupIndex].solved++;
    });

    groups.forEach(group => console.log(`  ${group.id}: ${group.solved}/${group.total}`));

    return { depth, groups, source: suite.source };
}

// ---------------------------------------------------------------------------
// endgame technique
// ---------------------------------------------------------------------------

async function runEndgames (depth, workers) {
    const suite = readSuite('endgames.json');
    const tasks = suite.positions.map(test => ({ kind: 'endgame', test, label: test.id }));

    const progress = makeProgress(tasks.length);
    const positions = await runTasks(tasks, {
        depth,
        workers,
        onProgress (done, total, task) {
            progress.working(task.label);
            progress.tick();
        }
    });
    progress.done();

    positions.forEach(result => {
        console.log(`  ${result.id}: ${result.solved ? 'mate in ' + result.moves : 'not solved'}`);
    });

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

/*
 * Games against the same opponent add up across runs instead of replacing
 * each other. A hundred games at depth 5 take many hours, so being able to
 * collect them over several evenings is what makes that sample size
 * realistic at all. Different opponents are kept side by side.
 */
function mergeMatches (existing, fresh) {
    const merged = existing.slice();

    fresh.forEach(match => {
        const index = merged.findIndex(m => m.opponentElo === match.opponentElo);
        if (index === -1) {
            merged.push(match);
            return;
        }

        const previous = merged[index];
        const wins = previous.wins + match.wins;
        const draws = previous.draws + match.draws;
        const losses = previous.losses + match.losses;
        const games = wins + draws + losses;
        const score = (wins + draws / 2) / games;
        const difference = eloDifference(score);

        merged[index] = Object.assign({}, match, {
            games,
            wins,
            draws,
            losses,
            score: Math.round(score * 1000) / 10,
            eloDifference: Math.round(difference),
            confidence95: eloConfidence(score, games),
            estimatedElo: Math.round(match.opponentElo + difference)
        });

        console.log(`  added to the previous ${previous.games} games: ${games} in total`);
    });

    return merged.sort((a, b) => a.opponentElo - b.opponentElo);
}

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

    if (tests.matches) {
        tests.matches = mergeMatches(run.tests.matches || [], tests.matches);
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

    const workers = parseInt(args.workers || defaultWorkerCount(), 10);

    // the main thread only needs an engine for the Stockfish based tests;
    // the position tests each run in their own worker
    const engine = loadEngine();
    useFixedDepth(engine, depth);
    const version = engine.KHIANAT_VERSION;

    console.log(`Khianat ${version}, fixed search depth ${depth}, ${workers} worker${workers === 1 ? '' : 's'}\n`);

    const needsStockfish = ['acpl', 'match'].includes(command) ||
                           (command === 'all' && args.stockfish);
    if (needsStockfish && !args.stockfish) {
        console.error('this test needs --stockfish <path to stockfish executable>');
        process.exit(1);
    }

    const tests = {};

    if (command === 'puzzles' || command === 'all') {
        console.log('tactics:');
        tests.puzzles = await runPuzzles(depth, workers);
    }
    if (command === 'mates' || command === 'all') {
        console.log('forced mates:');
        tests.mates = await runMates(depth, workers);
    }
    if (command === 'endgames' || command === 'all') {
        console.log('endgame technique:');
        tests.endgames = await runEndgames(depth, workers);
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
    // a plain message for the everyday mistakes, the full trace for the rest
    console.error('\n' + (error && error.message ? error.message : error));
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
});
