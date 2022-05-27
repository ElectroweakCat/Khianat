/*
 * Performs the minimax algorithm to choose the best move: https://en.wikipedia.org/wiki/Minimax (pseudocode provided)
 * Recursively explores all possible moves up to a given depth, and evaluates the game board at the leaves.
 * 
 * Basic idea: maximize the minimum value of the position resulting from the opponent's possible following moves.
 * Optimization: alpha-beta pruning: https://en.wikipedia.org/wiki/Alpha%E2%80%93beta_pruning (pseudocode provided)
 * 
 * Inputs:
 *  - game:                 the game object.
 *  - depth:                the depth of the recursive tree of all possible moves (i.e. height limit).
 *  - isMaximizingPlayer:   true if the current layer is maximizing, false otherwise.
 *  - sum:                  the sum (evaluation) so far at the current layer.
 *  - color:                the color of the current player.
 * 
 * Output:
 *  the best move at the root of the current subtree.
 */
function minimax(game, depth, alpha, beta, isMaximizingPlayer, sum, color)
{
    positionCount++; 
    var children = game.moves({verbose: true});

    // Sort moves randomly, so the same move isn't always picked on ties
    children.sort(function(a, b){return 0.5 - Math.random()});

    var currMove;
    // Maximum depth exceeded or node is a terminal node (no children)
    if (depth === 0 || children.length === 0)
    {
        return [null, sum]
    }

    // Find maximum/minimum from list of 'children' (possible moves)
    var maxValue = Number.NEGATIVE_INFINITY;
    var minValue = Number.POSITIVE_INFINITY;
    var bestMove;
    for (var i = 0; i < children.length; i++)
    {
        currMove = children[i];

        // Note: in our case, the 'children' are simply modified game states
        var currPrettyMove = game.move(currMove);
        var newSum = evaluateBoard(currPrettyMove, sum, color);
        var [childBestMove, childValue] = minimax(game, depth - 1, alpha, beta, !isMaximizingPlayer, newSum, color);

        game.undo();

        if (isMaximizingPlayer)
        {
            if (childValue > maxValue)
            {
                maxValue = childValue;
                bestMove = currPrettyMove;
            }
            if (childValue > alpha)
            {
                alpha = childValue;
            }
        }

        else
        {
            if (childValue < minValue)
            {
                minValue = childValue;
                bestMove = currPrettyMove;
            }
            if (childValue < beta)
            {
                beta = childValue;
            }
        }

        // Alpha-beta pruning
        if (alpha >= beta)
        {
            break;
        }
    }

    if (isMaximizingPlayer)
    {
        return [bestMove, maxValue]
    }
    else
    {
        return [bestMove, minValue];
    }
}

/*
 * Makes the best legal move for the given color.
 */
function makeBestMove(color) {
  if (color === 'b') {
    var move = getBestMove(game, color, globalSum)[0];
  } else {
    var move = getBestMove(game, color, -globalSum)[0];
  }

  globalSum = evaluateBoard(game, move, globalSum, 'b');
  updateAdvantage();

  game.move(move);
  board.position(game.fen());

  if (color === 'b') {
    checkStatus('black');

    // Highlight black move
    $board.find('.' + squareClass).removeClass('highlight-black');
    $board.find('.square-' + move.from).addClass('highlight-black');
    squareToHighlight = move.to;
    colorToHighlight = 'black';

    $board
      .find('.square-' + squareToHighlight)
      .addClass('highlight-' + colorToHighlight);
  } else {
    checkStatus('white');

    // Highlight white move
    $board.find('.' + squareClass).removeClass('highlight-white');
    $board.find('.square-' + move.from).addClass('highlight-white');
    squareToHighlight = move.to;
    colorToHighlight = 'white';

    $board
      .find('.square-' + squareToHighlight)
      .addClass('highlight-' + colorToHighlight);
  }
}

function makeMove () {
    let possibleMoves = game.moves();
    let randomNum = Math.random();

    // game over
    if (possibleMoves.length === 0) return

    // here comes the opening theory

    //first black move
    if (game.fen() === "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1") {
      if (randomNum > 0.5) {
        game.move("e5");
      } else {
        game.move("c5");
      }
    
    } else if (game.fen() === "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1") {
      if (randomNum > 0.3) {
        game.move("g6");
      } else {
        game.move("e5");
      }
    
    } else if (game.fen() === "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1") {
        if (randomNum > 0.5) {
          game.move("b5");
        } else {
          game.move("c5");
        }
    
    } else if (game.fen() === "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1") {
        if (randomNum > 0.5) {
          game.move("b6");
        } else {
          game.move("e5");
        }

    } else if (game.fen() === "rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 1") {
        if (randomNum > 0.5) {
          game.move("d5");
        } else {
          game.move("c5");
        }
    
    } else if (game.fen() === "rnbqkbnr/pppppppp/8/8/8/6P1/PPPPPP1P/RNBQKBNR b KQkq - 0 1") {
        if (randomNum > 0.5) {
          game.move("e5");
        } else {
          game.move("c5");
        }

    //second black move

    //Englund gambit
    } else if (game.fen() === "rnbqkbnr/pppp1ppp/8/4P3/8/8/PPP1PPPP/RNBQKBNR b KQkq - 0 2") {
      if (randomNum > 0.9) {
        game.move("Qh4");
      } else {
        game.move("Nc6");
      }
    
    //Sicilian defense
    } else if (game.fen() === "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2") {
      if (randomNum > 0.5) {
        game.move("e6");
      } else {
        game.move("a6");
      }

    //Kings pawn opening, Kings knight variation
    } else if (game.fen() === "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2") {
      if (randomNum > 0.5) {
        game.move("Nc6");
      } else {
        game.move("f5");
      }

    //Vienna game
    } else if (game.fen() === "rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2") {
      if (randomNum > 0.5) {
        game.move("Nf6");
      } else {
        game.move("Nc3");
      }

    //Modern defense with d4, e4
    } else if (game.fen() === "rnbqkbnr/pppppp1p/6p1/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq e3 0 2") {
      if (randomNum > 0.5) {
        game.move("Bg7");
      } else {
        game.move("d6");
      }
    
    //Modern defense with d4, c4
    } else if (game.fen() === "rnbqkbnr/pppppp1p/6p1/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2") {
      if (randomNum > 0.5) {
        game.move("Bg7");
      } else {
        game.move("Nf6");
      }



    // actual engine part    
    } else {

    //evaluate move simply by checking if checkmate/castling is available or if opponents piece can be taken
      var step = 0;
      var goodMoves = [];
      var checkmateMoves =[];
      var castlingMoves =[];
      var promotionMoves =[];
      while (step < possibleMoves.length) {

        let checkmate = /[#]/;
        let castling = /[O]/;
        let promotion = /=Q/;

        if (possibleMoves[step].search(checkmate) != -1) {
          checkmateMoves.push(possibleMoves[step]);

        } else if (possibleMoves[step].search(promotion) != -1) {
          promotionMoves.push(possibleMoves[step]);

        } else if (possibleMoves[step].search(castling) != -1) {
          castlingMoves.push(possibleMoves[step]);
        }

        else if (possibleMoves[step].length > 3) {
          goodMoves.push(possibleMoves[step]);
        }
        step += 1;
      }
    
    // otherwise play random move -.- 
      let randomIdx0 = Math.floor(Math.random() * checkmateMoves.length);
      let randomIdx1 = Math.floor(Math.random() * promotionMoves.length);
      let randomIdx2 = Math.floor(Math.random() * castlingMoves.length);
      let randomIdx3 = Math.floor(Math.random() * goodMoves.length);
      let randomIdx4 = Math.floor(Math.random() * possibleMoves.length);

      if (checkmateMoves.length > 0) {
        game.move(checkmateMoves[randomIdx0]);

      } else if (promotionMoves.length > 0) {
        game.move(promotionMoves[randomIdx1]);
      
      } else if (castlingMoves.length > 0) {
        game.move(castlingMoves[randomIdx2]);

      } else if (goodMoves.length > 0) {
        game.move(goodMoves[randomIdx3]);

      } else {
        game.move(possibleMoves[randomIdx4]);
      }
    }
    document.getElementById("demo3").innerHTML = goodMoves;
    document.getElementById("demo4").innerHTML = checkmateMoves;
    document.getElementById("demo5").innerHTML = promotionMoves;
    document.getElementById("demo6").innerHTML = castlingMoves;
    board.position(game.fen());
    updateStatus();
  }