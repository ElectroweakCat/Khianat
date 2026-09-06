/*
 * One benchmark worker: its own private engine, fed one position at a time.
 *
 * Every worker builds its own engine instance. That is not a detail but the
 * whole point: the engine keeps state in globals (the repetition list, the
 * current difficulty, the search deadline), so two workers sharing one
 * instance would quietly corrupt each other's searches.
 */

const { parentPort, workerData } = require('worker_threads');
const { loadEngine, useFixedDepth } = require('./load-engine');
const { solvePuzzle, playEndgame } = require('./tests');

const engine = loadEngine();
useFixedDepth(engine, workerData.depth);

parentPort.on('message', message => {
    if (message.type === 'stop') {
        parentPort.close();
        return;
    }

    const task = message.task;
    const result = task.kind === 'puzzle'
        ? solvePuzzle(engine, task.puzzle)
        : playEndgame(engine, task.test);

    parentPort.postMessage({ index: message.index, result });
});
