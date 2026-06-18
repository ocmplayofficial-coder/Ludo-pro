export function switchTurn(game, roll, captured) {
  // Extra roll rule: roll 6 or capture an opponent piece
  const awardExtra = roll === 6 || captured;
  if (awardExtra) {
    game.logs.unshift(`${game.turn === 'red' ? 'You get' : 'Opponent gets'} an extra roll by rolling 6 or capturing!`);
    game.diceHasRolled = false;
    game.diceRoll = null;
  } else {
    game.diceHasRolled = false;
    game.diceRoll = null;
    game.turn = game.turn === 'red' ? 'yellow' : 'red';
  }
}
