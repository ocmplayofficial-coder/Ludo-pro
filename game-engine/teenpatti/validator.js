export function validateAction(game, playerColor, actionType) {
  if (game.status !== 'PLAYING') {
    return { valid: false, error: "Game is not in active play state." };
  }
  if (game.turn !== playerColor) {
    return { valid: false, error: "It is not your turn to act." };
  }
  return { valid: true };
}
