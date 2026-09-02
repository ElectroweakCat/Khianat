# Khianat benchmark

Measures how strong the engine actually is, instead of guessing from its
feature list. Everything here runs **offline on your own machine** and is kept
strictly separate from the website: no benchmark code and no Stockfish is ever
shipped to visitors.

The results land in `../benchmark-results.json`, which is the only file
`benchmark.html` reads.

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

Useful options: `--depth N` (search depth, default 3), `--games N`,
`--elo N` (strength of the Stockfish opponent), `--sf-depth N`.

## Why fixed depth

The difficulty levels on the website are defined by *thinking time*, so a fast
desktop searches deeper than a phone. That makes time based results impossible
to compare between machines or between engine versions. The runner therefore
uses a **fixed search depth** and switches the opening randomisation off, which
makes every run reproducible. The recorded machine details are only there to
explain how long a run took, not to explain its results.

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
