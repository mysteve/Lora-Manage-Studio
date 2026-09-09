import { useEffect } from 'react';
import { call } from '../../lib/api';
import type { Settings } from '../../types/models';

let pending: Promise<void> | undefined;
export function useLibraryCoverMetadata(
  ready: boolean,
  settings: Settings,
  reload: () => Promise<void>,
  notify: (message: string, error?: boolean) => void,
) {
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    if (!pending) {
      pending = call<void>('refresh_library_cover_metadata').finally(() => {
        pending = undefined;
      });
    }
    void pending
      .then(async () => {
        if (alive) await reload();
      })
      .catch((error) => {
        if (alive) notify(String(error), true);
      });
    return () => {
      alive = false;
    };
  }, [ready, settings, reload, notify]);
}
