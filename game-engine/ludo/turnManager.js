export function switchTurn(game, roll, captured, reachedHome) {
  // Extra roll rule: roll 6, capture an opponent piece, or reach home
  const awardExtra = roll === 6 || captured || reachedHome;
  if (awardExtra) {
    game.logs.unshift(`${game.turn === 'red' ? 'You get' : 'Opponent gets'} an extra roll by rolling 6, capturing, or reaching home!`);
    game.diceHasRolled = false;
    game.diceRoll = null;
  } else {
    game.diceHasRolled = false;
    game.diceRoll = null;
    game.turn = game.turn === 'red' ? 'yellow' : 'red';
  }
}
