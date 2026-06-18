export function initializePot(minBet) {
  return minBet * 2; // Ante from both player and bot
}

export function addToPot(pot, amount) {
  return pot + amount;
}
