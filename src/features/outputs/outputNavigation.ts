export const OUTPUT_PAGE_SIZE = 60;

export function adjacentOutput(page: number, index: number, total: number, direction: -1 | 1) {
  if (index < 0) return null;
  const target = page * OUTPUT_PAGE_SIZE + index + direction;
  if (target < 0 || target >= total) return null;
  return { page: Math.floor(target / OUTPUT_PAGE_SIZE), index: target % OUTPUT_PAGE_SIZE };
}
