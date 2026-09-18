import type { LibraryEntry } from '../../types/models';

export interface LibraryFilters {
  query: string;
  baseModel: string;
  fileStatus: string;
  sort: string;
}
export interface LibraryPage {
  items: LibraryEntry[];
  nextCursor: string | null;
  total: number;
}
export interface LibraryPagesState extends LibraryPage {
  loading: boolean;
  loaded: boolean;
  error: string;
}

export function createLibraryPages(fetchPage: (filters: LibraryFilters, cursor: string | null) => Promise<LibraryPage>) {
  let state: LibraryPagesState = { items: [], nextCursor: null, total: 0, loading: false, loaded: false, error: '' };
  let generation = 0;
  let filters: LibraryFilters = { query: '', baseModel: '', fileStatus: '', sort: 'newest' };
  const listeners = new Set<() => void>();
  const patches = new Map<string, LibraryEntry>();
  const consumedCursors = new Set<string>();
  const publish = (next: LibraryPagesState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const loadMore = async () => {
    if (state.loading || (state.loaded && state.nextCursor === null)) return;
    const current = generation;
    const cursor = state.loaded ? state.nextCursor : null;
    publish({ ...state, loading: true, error: '' });
    try {
      const result = await fetchPage(filters, cursor);
      if (current !== generation) return;
      if (result.nextCursor !== null && (result.nextCursor === cursor || consumedCursors.has(result.nextCursor))) {
        throw new Error('分页游标重复，请刷新模型库后重试');
      }
      if (cursor !== null) consumedCursors.add(cursor);
      const items = new Map(state.items.map((entry) => [entry.id, entry]));
      result.items.forEach((entry) => items.set(entry.id, patches.get(entry.id) ?? entry));
      publish({ ...result, items: [...items.values()], loading: false, loaded: true, error: '' });
    } catch (error) {
      if (current === generation) publish({ ...state, loading: false, error: String(error instanceof Error ? error.message : error) });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reset(next: LibraryFilters) {
      generation += 1;
      filters = next;
      patches.clear();
      consumedCursors.clear();
      publish({ items: [], nextCursor: null, total: 0, loading: false, loaded: false, error: '' });
    },
    invalidate() { generation += 1; },
    update(entry: LibraryEntry) {
      patches.set(entry.id, entry);
      publish({ ...state, items: state.items.map((item) => item.id === entry.id ? entry : item) });
    },
    loadMore,
  };
}
