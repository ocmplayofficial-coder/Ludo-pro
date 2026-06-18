export function moveToken(token, roll) {
  token.prevPosition = token.position;

  // Time & Turn mode:
  // token.position = -1 means killed/reset piece
  // Piece should reopen automatically without needing a 6

  if (token.position === -1) {
    token.position = 0; // move to starting square
  } else {
    token.position += roll;
  }

  return token.position;
}