import { compareHands } from './winnerEngine.js';

export function handleSideshow(game) {
  // Simple sideshow logic: player asks bot for sideshow.
  // Bot accepts if bot has a decent hand, otherwise rejects.
  const botAccepts = Math.random() > 0.3;
  if (!botAccepts) {
    game.logs.unshift("Bot declined the Sideshow request.");
    return { accepted: false, game };
  }

  game.logs.unshift("Bot accepted the Sideshow! Comparing cards...");
  const winner = compareHands(game.playerHand, game.botHand, game.variant);
  
  if (winner === 'player') {
    game.botFolded = true;
    game.winner = 'player';
    game.status = 'FINISHED';
    game.logs.unshift("Bot lost the Sideshow and folded!");
  } else {
    game.playerFolded = true;
    game.winner = 'bot';
    game.status = 'FINISHED';
    game.logs.unshift("You lost the Sideshow and folded!");
  }
  return { accepted: true, game };
}
