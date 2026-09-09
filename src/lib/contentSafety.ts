import { createContext, useContext } from 'react';
import type { Cover } from '../types/models';

export const ContentSafetyContext = createContext(true);
export const useContentSafety = () => useContext(ContentSafetyContext);

export function coverSafety(cover: Cover | undefined, enabled: boolean) {
  if (!enabled || !cover?.url) return 'visible';
  if (cover.nsfwLevel == null) return 'unknown';
  return cover.nsfwLevel > 1 ? 'hidden' : 'visible';
}
