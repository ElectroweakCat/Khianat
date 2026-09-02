# Khianat

A hand-built chess engine in plain JavaScript, playable in the browser.

**Play it live at [khianat.org](https://khianat.org/)** — you have the white pieces.

## Motivation

Khianat combines my passion for chess with my interest in software development and artificial intelligence. The goal was never to compete with Stockfish, but to build my own opponent from scratch and understand every single move it makes. The engine, the website and the design are all my own work, developed continuously since 2022 (the [blog](https://khianat.org/blog.html) documents the journey).

## How the engine works

Khianat runs entirely in the browser — no engine server, no cloud.

1. **Opening book:** for the first moves, a small hand-written repertoire with weighted random replies (Sicilian, Modern defense, occasionally the Englund gambit).
2. **Search:** negamax (minimax) with alpha-beta pruning and iterative deepening on a time budget of up to 5 seconds, typically reaching depth 4–5 in the middlegame at full strength. Five difficulty levels cap the depth and thinking time. Moves are ordered (captures and promotions first, previous best move first) so pruning cuts the tree by roughly two orders of magnitude.
3. **Quiescence search:** capture sequences are played out at the leaves to avoid horizon-effect blunders.
4. **Evaluation:** material values plus piece square tables (adapted from Sunfish), with a separate king table for the endgame. Checkmate is scored by distance to mate; stalemate and draws count as zero.

Estimated playing strength: roughly 1600–1800 Elo against human casual players at the highest difficulty — an estimate derived from the engine's features, not from rated games. Measured results (tactics suites, forced mates, endgame technique, centipawn loss and matches against Stockfish) are collected on the [benchmark page](https://khianat.org/benchmark.html); the runner lives in [`benchmark/`](benchmark/). A detailed, illustrated explanation of the engine lives on the [About page](https://khianat.org/about.html).

## Tech stack

- **Engine & UI:** vanilla JavaScript, HTML, CSS — no frameworks, no build step, no tracking
- **Chess rules:** [chess.js](https://github.com/jhlywa/chess.js) (move generation & validation)
- **Board rendering:** [chessboard.js](https://chessboardjs.com/) (drag & drop board)
- **Poll backend:** a single small PHP script storing anonymous counts in JSON

## Features

- Play against the engine with five difficulty levels, drag or click-to-move, move sounds, last-move highlighting and a mobile-friendly responsive board
- Statistics dashboard: personal results per difficulty (stored locally) and global results of all players (stored server-side)
- Technical documentation page with hand-drawn SVG diagrams of the search
- Visitor poll with live percentages
- Development blog

## Run locally

```bash
git clone https://github.com/ElectroweakCat/Khianat.git
cd Khianat
```

Open `index.html` in a browser — the game works as-is. Only the poll needs PHP:

```bash
php -S localhost:8000
```

## License

[MIT](LICENSE) for my own code. Third-party components keep their own licenses: chess.js (BSD-2-Clause, Jeff Hlywa), chessboard.js (MIT, Chris Oakman), piece values and piece square tables adapted from [Sunfish](https://github.com/thomasahle/sunfish) (Thomas Ahle), sound samples from Mixkit and freesound.org (user mh2o).
