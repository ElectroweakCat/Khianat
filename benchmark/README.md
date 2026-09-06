# Khianat benchmark

Measures how strong the engine actually is, instead of guessing from its
feature list. Everything runs **offline on your own machine**; nothing from
here is shipped to visitors. Results land in `../benchmark-results.json`,
the only file `benchmark.html` reads.

## Requirements

- **Node.js 18+** — for the runner itself.
- **Lichess puzzle database** (optional but recommended) — for the tactics and
  mate suites. Published under CC0, so it can be used freely. Download
  `lichess_db_puzzle.csv.zst` from <https://database.lichess.org/#puzzles>,
  unpack it, then build the suites:

  ```
  node tools/prepare-puzzles.js /path/to/lichess_db_puzzle.csv
  ```

  The CSV is not copied into this repository, only the sampled positions are.

- **Stockfish** (optional) — for the move quality and match tests. Download a
  binary from <https://stockfishchess.org/download/> and pass its path.
  Stockfish is **GPL-3.0** licensed and is deliberately *not* bundled with this
  project or the website; the runner merely starts it as a separate program.

## Running

```
node run.js puzzles                                  # tactics by rating band
node run.js mates                                    # forced mate in 2 and 3
node run.js endgames                                 # basic mating technique
node run.js acpl  --stockfish /path/to/stockfish     # average centipawn loss
node run.js match --stockfish /path/to/stockfish --elo 1500 --games 40
node run.js all   --stockfish /path/to/stockfish
```

Useful options: `--depth N` (search depth, default 3), `--workers N`,
`--games N`, `--elo N` (strength of the Stockfish opponent), `--sf-depth N`.

## Matches add up

Repeating `match` against the same `--elo` **adds** the games to the previous
ones and recalculates the score and the interval over the whole sample. Long
matches can therefore be collected over several sessions. Different opponent
levels are stored side by side. To start over, delete that entry from
`../benchmark-results.json`.

How precise the estimate gets, when the score is somewhere near even:

| Games | 95% interval |
|---|---|
| 40 | about ±110 Elo |
| 100 | about ±70 Elo |
| 200 | about ±50 Elo |

The interval shrinks with the square root of the number of games, so halving
it costs four times the work. It also grows quickly once the score becomes
lopsided: an opponent that is beaten every time says almost nothing.

## Speed

`puzzles`, `mates` and `endgames` run on several CPU cores at once. Each
worker gets its own engine instance, because the engine keeps state in
globals and sharing one would corrupt the searches. By default the runner
uses half the logical processors, which is usually the sweet spot on a chip
with SMT; `--workers 1` forces the old sequential behaviour.

The Stockfish tests stay sequential: their games depend on the previous move
and talk to a single Stockfish process.

Depth costs a lot. Each extra ply multiplies the work several times over, so
`--depth 5` on 300 puzzles can run for hours while `--depth 3` takes minutes.

## Why fixed depth

The website's difficulty levels are defined by *thinking time*, so a fast
desktop searches deeper than a phone and time based results cannot be compared
between machines or versions. The runner therefore uses a **fixed search
depth** and switches the opening randomisation off, which makes every run
reproducible.

## What the numbers mean

| Test | Measures | Careful with |
|---|---|---|
| `puzzles` | Solve rate per rating band, plus the rating where it crosses 50% | Puzzle solving is tactics only. It says little about quiet positions. |
| `mates` | Whether forced mates are actually found | Small sample, pass/fail only. |
| `endgames` | Mating technique against a random defence | A random defender is weak on purpose; passing means "no obvious technical hole". |
| `acpl` | Average centipawn loss judged by Stockfish | Depends on the Stockfish depth used. Compare only against runs with the same setting. |
| `match` | Score against a rating limited Stockfish | Stockfish's `UCI_Elo` is its own scale, **not** a human rating. Even 40 games leave a confidence interval of well over ±100 Elo. |

Any Elo number derived from these tests is an **orientation, not a rating**.
Khianat has never played a rated game against humans.
