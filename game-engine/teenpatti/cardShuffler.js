export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const idx = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[idx];
    shuffled[idx] = tmp;
  }
  return shuffled;
}
