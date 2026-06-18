export function getSeenBetAmount(currentBet) {
  return currentBet * 2;
}

export function handlePlayerSeen(game) {
  game.playerSeen = true;
  game.logs.unshift("You saw your cards! Bet stakes are now normal. (Chaals will cost 2x of Blind bet)");
  return game;
}
