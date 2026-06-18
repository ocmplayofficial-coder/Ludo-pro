export function getLudoCommonTrackCell(color, position) {
  if (position < 0 || position >= 51) return -1; // Not on the core general track
  if (color === 'red') {
    return (position + 39) % 52; // Red starts index 39
  } else {
    return (position + 13) % 52; // Yellow starts index 13
  }
}
