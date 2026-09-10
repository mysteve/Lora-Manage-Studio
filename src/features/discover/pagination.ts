export function rememberCursors(history: (string | null)[], page: number, next: string | null) {
  if (!next || history.slice(0, page + 1).includes(next)) return history.slice(0, page + 1);
  if (history[page + 1] === next) return history;
  return [...history.slice(0, page + 1), next];
}
