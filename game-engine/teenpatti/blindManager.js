export function getBlindBetAmount(currentBet) {
  return currentBet;
}

export function isBlindPlayAllowed(game, side) {
  if (side === 'player') {
    return !game.playerSeen;
  } else {
    return !game.botSeen;
  }
}
