/*
 * Minimal UCI wrapper around a local Stockfish executable.
 *
 * Stockfish is GPL licensed and is deliberately NOT part of the website.
 * It is only started here, on your own machine, as a separate program that
 * communicates over standard input and output.
 */

const { spawn } = require('child_process');

class Uci {
    constructor (enginePath) {
        this.process = spawn(enginePath);
        this.buffer = '';
        this.listeners = [];

        this.process.stdout.on('data', chunk => {
            this.buffer += chunk.toString();
            let index;
            while ((index = this.buffer.indexOf('\n')) >= 0) {
                const line = this.buffer.slice(0, index).trim();
                this.buffer = this.buffer.slice(index + 1);
                this.listeners.slice().forEach(listener => listener(line));
            }
        });
    }

    send (command) {
        this.process.stdin.write(command + '\n');
    }

    // resolves once a line satisfies the predicate, collecting everything before it
    until (predicate) {
        return new Promise(resolve => {
            const collected = [];
            const listener = line => {
                collected.push(line);
                if (predicate(line)) {
                    this.listeners = this.listeners.filter(l => l !== listener);
                    resolve(collected);
                }
            };
            this.listeners.push(listener);
        });
    }

    async init (options = {}) {
        this.send('uci');
        await this.until(line => line === 'uciok');

        for (const [name, value] of Object.entries(options)) {
            this.send(`setoption name ${name} value ${value}`);
        }

        this.send('isready');
        await this.until(line => line === 'readyok');
    }

    async newGame () {
        this.send('ucinewgame');
        this.send('isready');
        await this.until(line => line === 'readyok');
    }

    /*
     * Returns { bestMove, scoreCp } for a position. scoreCp is from the point
     * of view of the side to move; a forced mate is reported as +/- 10000.
     */
    async analyse (fen, { depth = 16, moveTime = null } = {}) {
        this.send(`position fen ${fen}`);
        this.send(moveTime ? `go movetime ${moveTime}` : `go depth ${depth}`);

        const lines = await this.until(line => line.startsWith('bestmove'));

        let scoreCp = null;
        for (const line of lines) {
            const cp = line.match(/score cp (-?\d+)/);
            const mate = line.match(/score mate (-?\d+)/);
            if (cp) scoreCp = parseInt(cp[1], 10);
            if (mate) scoreCp = parseInt(mate[1], 10) > 0 ? 10000 : -10000;
        }

        const best = lines[lines.length - 1].split(' ')[1];
        return { bestMove: best, scoreCp };
    }

    quit () {
        this.send('quit');
        this.process.kill();
    }
}

module.exports = { Uci };
