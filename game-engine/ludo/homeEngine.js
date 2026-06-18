export function isTokenAtHome(token) {
  return token.position === 57;
}

export function hasAllTokensReachedHome(tokens, color) {
  const colorTokens = tokens.filter(t => t.color === color);
  return colorTokens.every(t => t.position === 57);
}
