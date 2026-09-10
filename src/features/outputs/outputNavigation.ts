export function adjacentOutput(page: number, index: number, count: number, hasNext: boolean, direction: -1 | 1) {
  if (index < 0 || index >= count) return null;
  const target = index + direction;
  if (target >= 0 && target < count) return { page, index: target };
  if (target < 0) return page > 0 ? { page: page - 1, index: -1 } : null;
  return hasNext ? { page: page + 1, index: 0 } : null;
}
