export function calculatePlayerScore(game, color) {
  if (!game || !game.tokens) return 0;
  const boardScore = game.tokens
    .filter(t => t.color === color)
    .reduce((sum, t) => sum + (t.position === -1 ? 0 : t.position), 0);
  const bonus = game.bonusScore ? (game.bonusScore[color] || 0) : 0;
  return boardScore + bonus;
}

export function calculateScores(game) {
  const redProgress = calculatePlayerScore(game, 'red');
  const yellowProgress = calculatePlayerScore(game, 'yellow');
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
