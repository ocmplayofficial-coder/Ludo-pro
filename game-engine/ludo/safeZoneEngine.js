export const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];

export function isSafeCell(trackCellIndex) {
  return SAFE_CELLS.includes(trackCellIndex);
}
