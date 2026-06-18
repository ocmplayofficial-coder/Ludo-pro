import { compareHands } from './winnerEngine.js';

export function handleShowdown(game) {
  const winner = compareHands(game.playerHand, game.botHand, game.variant);
  game.winner = winner;
  game.status = 'FINISHED';
  
  if (winner === 'player') {
    game.logs.unshift(`🎉 You won the Showdown! Pot size of ₹${game.pot} is yours.`);
  } else {
    game.logs.unshift(`😢 Bot won the Showdown with a stronger hand. Practice again!`);
  }
  return game;
}
