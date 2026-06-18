export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const VALUES = [
  { val: '2', rank: 2 },
  { val: '3', rank: 3 },
  { val: '4', rank: 4 },
  { val: '5', rank: 5 },
  { val: '6', rank: 6 },
  { val: '7', rank: 7 },
  { val: '8', rank: 8 },
  { val: '9', rank: 9 },
  { val: '10', rank: 10 },
  { val: 'J', rank: 11 },
  { val: 'Q', rank: 12 },
  { val: 'K', rank: 13 },
  { val: 'A', rank: 14 }
];

export function buildDeck() {
  const deck = [];
  SUITS.forEach(suit => {
    VALUES.forEach(card => {
      deck.push({ suit, value: card.val, rank: card.rank });
    });
  });
  return deck;
}
