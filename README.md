# Khianat

A chess engine written from scratch in plain JavaScript, playable in the browser.

**[Play it at khianat.org](https://khianat.org/)** — you have the white pieces.

*Khianat* is Indonesian for betrayal. The logo is a pawn casting the shadow of a queen: it looks harmless, it is not.

## The engine

Runs entirely in the browser, no server involved.

- **Opening book** — a small hand-written repertoire with weighted random replies
- **Search** — negamax with alpha-beta pruning, iterative deepening, move ordering, in a Web Worker
- **Quiescence search** — capture sequences played out to avoid horizon blunders
- **Evaluation** — material plus piece square tables, with a separate king table for the endgame

Five difficulty levels. Estimated **1600–1800 Elo** at the highest — an estimate from the engine's features, not from rated games. Measured results live on the [benchmark page](https://khianat.org/benchmark.html), the runner in [`benchmark/`](benchmark/).

[How it works, with diagrams →](https://khianat.org/about.html)

## Built with

Vanilla JavaScript, HTML and CSS. No frameworks, no build step, no tracking.
Chess rules by [chess.js](https://github.com/jhlywa/chess.js), board by [chessboard.js](https://chessboardjs.com/), plus one small PHP script for the poll and statistics.

## Run locally

```bash
git clone https://github.com/ElectroweakCat/Khianat.git
cd Khianat
```

Open `index.html` — the game works as-is. Only poll and statistics need PHP: `php -S localhost:8000`

## License

[MIT](LICENSE) for my own code. Third-party components keep theirs: chess.js (BSD-2-Clause), chessboard.js (MIT), piece values adapted from [Sunfish](https://github.com/thomasahle/sunfish), sounds from Mixkit and freesound.org (user mh2o).
