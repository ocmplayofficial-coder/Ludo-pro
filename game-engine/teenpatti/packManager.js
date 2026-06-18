export function handleFold(game, side) {
  if (side === 'player') {
    game.playerFolded = true;
    game.winner = 'bot';
    game.status = 'FINISHED';
    game.logs.unshift("You folded. Bot collects the pot shares.");
  } else {
    game.botFolded = true;
    game.winner = 'player';
    game.status = 'FINISHED';
    game.logs.unshift("Bot folded! You won the Pot!");
  }
  return game;
}
