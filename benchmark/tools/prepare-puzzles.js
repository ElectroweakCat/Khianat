/*
 * Builds the puzzle and mate suites from the Lichess puzzle database.
 *
 * The database is published under CC0 (public domain), which is why it can
 * be used here. It is not shipped with this project: download and unpack it
 * yourself, then run
 *
 *   node tools/prepare-puzzles.js /path/to/lichess_db_puzzle.csv
 *
 * Sampling is deterministic (first matching entries in file order), so
 * running it twice produces exactly the same suites.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BANDS = [
    { from: 600, to: 899 },
    { from: 900, to: 1199 },
    { from: 1200, to: 1499 },
    { from: 1500, to: 1799 },
    { from: 1800, to: 2099 },
    { from: 2100, to: 2399 },
    { from: 2400, to: 2699 },
    { from: 2700, to: 2999 }
];

const PER_BAND = 50;   // puzzles per rating band
const MATES_PER_TYPE = 40;

// only well established puzzles, so the ratings mean something
const MAX_DEVIATION = 90;
const MIN_PLAYS = 50;

async function main () {
    const csvPath = process.argv[2];
    if (!csvPath) {
        console.error('usage: node tools/prepare-puzzles.js <lichess_db_puzzle.csv>');
        process.exit(1);
    }

    const bands = BANDS.map(band => ({ ...band, puzzles: [] }));
    const mates = { mateIn2: [], mateIn3: [] };

    const stream = readline.createInterface({
        input: fs.createReadStream(csvPath),
        crlfDelay: Infinity
    });

    let isFirstLine = true;
    for await (const line of stream) {
        if (isFirstLine) { isFirstLine = false; continue; } // header
        if (!line) continue;

        // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,...
        const parts = line.split(',');
        if (parts.length < 8) continue;

        const deviation = parseInt(parts[4], 10);
        const plays = parseInt(parts[6], 10);
        if (deviation > MAX_DEVIATION || plays < MIN_PLAYS) continue;

        const puzzle = {
            id: parts[0],
            fen: parts[1],
            moves: parts[2].split(' '),
            rating: parseInt(parts[3], 10),
            themes: parts[7]
        };

        const band = bands.find(b => puzzle.rating >= b.from && puzzle.rating <= b.to);
        if (band && band.puzzles.length < PER_BAND) {
            band.puzzles.push(puzzle);
        }

        if (puzzle.themes.includes('mateIn2') && mates.mateIn2.length < MATES_PER_TYPE) {
            mates.mateIn2.push(puzzle);
        }
        if (puzzle.themes.includes('mateIn3') && mates.mateIn3.length < MATES_PER_TYPE) {
            mates.mateIn3.push(puzzle);
        }

        const bandsFull = bands.every(b => b.puzzles.length >= PER_BAND);
        const matesFull = mates.mateIn2.length >= MATES_PER_TYPE &&
                          mates.mateIn3.length >= MATES_PER_TYPE;
        if (bandsFull && matesFull) break;
    }

    const suiteDir = path.join(__dirname, '..', 'suites');

    write(path.join(suiteDir, 'puzzles.json'), {
        name: 'Lichess tactics, stratified by rating',
        source: 'Lichess puzzle database, CC0 (public domain). Not redistributed here.',
        filter: `rating deviation <= ${MAX_DEVIATION}, at least ${MIN_PLAYS} plays`,
        bands: bands.map(band => ({
            from: band.from,
            to: band.to,
            puzzles: band.puzzles
        }))
    });

    write(path.join(suiteDir, 'mates.json'), {
        name: 'Forced mates',
        source: 'Lichess puzzle database, CC0 (public domain). Not redistributed here.',
        groups: [
            { id: 'mateIn2', puzzles: mates.mateIn2 },
            { id: 'mateIn3', puzzles: mates.mateIn3 }
        ]
    });

    console.log('puzzles per band:', bands.map(b => `${b.from}: ${b.puzzles.length}`).join(', '));
    console.log('mates:', `in 2: ${mates.mateIn2.length}, in 3: ${mates.mateIn3.length}`);
}

function write (file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 1));
    console.log('wrote', file);
}

main();
