/*
 * A small worker pool for the position based tests.
 *
 * Tasks are handed out one at a time rather than split into equal blocks up
 * front: positions differ wildly in how long they take, and a worker that
 * happens to draw the ten hardest puzzles would otherwise keep everyone
 * else waiting at the end.
 */

const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

function defaultWorkerCount () {
    // os.cpus() counts logical processors; on a machine with SMT, using half
    // of them is usually the sweet spot for pure number crunching
    return Math.max(1, Math.floor(os.cpus().length / 2));
}

/*
 * Runs every task and resolves with the results in the original order.
 * onProgress(done, total, task) is called after each finished task.
 */
function runTasks (tasks, { depth, workers, onProgress }) {
    return new Promise((resolve, reject) => {
        if (tasks.length === 0) return resolve([]);

        const results = new Array(tasks.length);
        const count = Math.max(1, Math.min(workers, tasks.length));
        const pool = [];

        let next = 0;
        let finished = 0;
        let failed = false;

        function shutDown () {
            pool.forEach(worker => worker.terminate());
        }

        function assign (worker) {
            if (next >= tasks.length) {
                worker.postMessage({ type: 'stop' });
                return;
            }
            const index = next++;
            worker.postMessage({ type: 'task', index, task: tasks[index] });
        }

        for (let i = 0; i < count; i++) {
            const worker = new Worker(path.join(__dirname, 'worker-task.js'), {
                workerData: { depth }
            });
            pool.push(worker);

            worker.on('message', message => {
                if (failed) return;

                results[message.index] = message.result;
                finished++;
                if (onProgress) onProgress(finished, tasks.length, tasks[message.index]);

                if (finished === tasks.length) {
                    shutDown();
                    resolve(results);
                    return;
                }
                assign(worker);
            });

            worker.on('error', error => {
                if (failed) return;
                failed = true;
                shutDown();
                reject(error);
            });

            assign(worker);
        }
    });
}

module.exports = { runTasks, defaultWorkerCount };
