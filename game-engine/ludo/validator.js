export function canTokenMove(token, roll) {
  if (token.position === -1) {
    return roll === 6; // base escape requires a 6
  }
  return token.position + roll <= 57; // cannot overshoot home (57)
}

export function hasAnyPlayableMoves(tokens, color, roll) {
  const activeTokens = tokens.filter(t => t.color === color);
  return activeTokens.some(t => canTokenMove(t, roll));
}
