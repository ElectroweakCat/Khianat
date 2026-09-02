/*
 * Loads the unmodified website engine into Node.
 *
 * chess.js, evaluation.js and engine.js are plain browser scripts. They are
 * concatenated and evaluated in one fresh V8 context, which mirrors how the
 * browser loads them. Nothing in the engine is patched: the benchmark only
 * reaches in through the globals the scripts already define.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function loadEngine () {
    const sources = ['chess.js', 'evaluation.js', 'engine.js']
        .map(name => fs.readFileSync(path.join(ROOT, name), 'utf8'))
        .join('\n;\n');

    // Chess is declared with const, so it never lands on globalThis by itself
    const bootstrap = '\n;globalThis.Chess = Chess;\n';

    const context = vm.createContext({});
    vm.runInContext(sources + bootstrap, context, { filename: 'khianat-engine.js' });

    return context;
}

/*
 * Puts the engine into a deterministic, hardware independent mode:
 * a fixed search depth, effectively no time limit, and no opening variety.
 * This is what makes benchmark runs comparable between machines and versions.
 */
function useFixedDepth (engine, depth) {
    engine.DIFFICULTY_LEVELS[99] = {
        timeMs: 3600000,
        maxDepth: depth,
        varietyMargin: 0
    };
    engine.OPENING_VARIETY_PLIES = 0; // never randomise while measuring
    engine.setDifficulty(99);
}

/*
 * Restores one of the difficulty levels the website actually offers.
 * Results measured this way depend on the speed of the machine.
 */
function useWebsiteLevel (engine, level) {
    engine.OPENING_VARIETY_PLIES = 0;
    engine.setDifficulty(level);
}

module.exports = { loadEngine, useFixedDepth, useWebsiteLevel, ROOT };
