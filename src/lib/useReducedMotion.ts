import { useSyncExternalStore } from 'react';

const preference =
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');
const subscribe = (notify: () => void) => {
  preference?.addEventListener('change', notify);
  return () => preference?.removeEventListener('change', notify);
};

// Keep an open desktop window in sync when the system preference changes.
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => preference?.matches ?? false,
    () => false,
  );
}
