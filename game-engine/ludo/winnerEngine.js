export function calculatePlayerScore(game, color) {
  if (!game || !game.tokens) return 0;
  return game.tokens
    .filter(t => t.color === color)
    .reduce((sum, t) => sum + (t.position === -1 ? 0 : t.position), 0);
}

export function calculateScores(tokens) {
  const redProgress = tokens.filter(t => t.color === 'red').reduce((acc, t) => acc + (t.position === -1 ? 0 : t.position), 0);
  const yellowProgress = tokens.filter(t => t.color === 'yellow').reduce((acc, t) => acc + (t.position === -1 ? 0 : t.position), 0);
  return { redProgress, yellowProgress };
}

export function evaluateWinnerByScore(game) {
  const red = calculatePlayerScore(game, 'red');
  const yellow = calculatePlayerScore(game, 'yellow');
  if (!game.scores) game.scores = { red: 0, yellow: 0 };
  game.scores.red = red;
  game.scores.yellow = yellow;

  if (red > yellow) return 'red';
  if (yellow > red) return 'yellow';
  return 'draw';
}
