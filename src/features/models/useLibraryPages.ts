import { useEffect, useState, useSyncExternalStore } from 'react';
import { call } from '../../lib/api';
import { createLibraryPages, type LibraryFilters, type LibraryPage } from './libraryPages';

export function useLibraryPages(filters: LibraryFilters, revision: number, enabled: boolean) {
  const [controller] = useState(() => createLibraryPages((conditions, cursor) =>
    call<LibraryPage>('list_library_page', { ...conditions, cursor })));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { query, baseModel, fileStatus, sort } = filters;
  useEffect(() => {
    controller.reset({ query, baseModel, fileStatus, sort });
    return () => controller.invalidate();
  }, [controller, query, baseModel, fileStatus, sort, revision]);
  useEffect(() => {
    if (enabled && !state.loaded && !state.loading && !state.error) void controller.loadMore();
  }, [controller, enabled, state.loaded, state.loading, state.error, query, baseModel, fileStatus, sort, revision]);
  return { ...state, loadMore: controller.loadMore, update: controller.update };
}
