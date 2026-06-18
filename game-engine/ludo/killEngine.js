import { getLudoCommonTrackCell } from './pathEngine.js';
import { isSafeCell } from './safeZoneEngine.js';

export function evaluateCaptures(game, movingToken) {
  const targetCell = getLudoCommonTrackCell(movingToken.color, movingToken.position);
  if (targetCell === -1 || isSafeCell(targetCell)) {
    return false;
  }

  const opponentColor = movingToken.color === 'red' ? 'yellow' : 'red';
  const enemyTokens = game.tokens.filter(t => t.color === opponentColor);
  let captured = false;

  enemyTokens.forEach(enemy => {
    if (getLudoCommonTrackCell(enemy.color, enemy.position) === targetCell) {
      enemy.prevPosition = enemy.position;
      const isTimeOrTurn = game.variant === 'TIME' || game.variant === 'TURN';
      enemy.position = isTimeOrTurn ? 0 : -1; // reset back to start square or base
      captured = true;
      // Update scoring: killer +22, victim -22 (minimum 0)
      if (!game.scores) game.scores = { red: 0, yellow: 0 };
      game.scores[movingToken.color] = (game.scores[movingToken.color] || 0) + 22;
      game.scores[opponentColor] = Math.max(0, (game.scores[opponentColor] || 0) - 22);
      
      const destination = isTimeOrTurn ? 'start square' : 'base';
      game.logs.unshift(`💥 Knockout! ${movingToken.color === 'red' ? 'You' : 'Opponent'} captured ${opponentColor}'s token back to ${destination}!`);
    }
  });

  return captured;
}
