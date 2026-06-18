import { buildDeck } from './deckManager.js';
import { shuffleDeck } from './cardShuffler.js';
import { initializePot } from './potManager.js';

export function createTeenPattiTable(matchId, variant, minBet) {
  const deck = shuffleDeck(buildDeck());

  const playerHand = [deck.pop(), deck.pop(), deck.pop()];
  const botHand = [deck.pop(), deck.pop(), deck.pop()];

  return {
    matchId,
    variant,
    minBet,
    pot: initializePot(minBet),
    currentBet: minBet,
    playerHand,
    botHand,
    playerSeen: false,
    botSeen: false,
    playerFolded: false,
    botFolded: false,
    turn: 'player',
    winner: null,
    status: 'PLAYING',
    logs: ["Table matched!", `Ante values of ₹${minBet} placed on pot.`, "Cards dealt. Choose Chaal, Fold, or peek!"]
  };
}
