import { useEffect, useState } from 'react';
import { createPromptDraftStorage, type DraftStorage } from './draftStorage';

/**
 * App replaces its promptDraft useState with this hook. Render storageError in a
 * persistent role="alert" near the composer; do not silently discard it.
 * preview is fixed for this App lifetime, matching the existing preview mode.
 */
export function usePromptDraft({
  preview,
  getStorage = () => window.localStorage,
}: {
  preview: boolean;
  getStorage?: () => DraftStorage;
}) {
  const [session] = useState(() => createPromptDraftStorage(getStorage, preview));
  const [draft, setDraft] = useState(session.draft);
  const [storageError, setStorageError] = useState(session.readError);
  const [savedDraft, setSavedDraft] = useState(session.draft);
  useEffect(() => {
    // Loading (including StrictMode's repeated effect) never rewrites stored data.
    if (draft === savedDraft) return;
    const error = session.save(draft);
    setStorageError(error);
    if (!error) setSavedDraft(draft);
  }, [draft, savedDraft, session]);
  return { draft, setDraft, storageError, hasUnsavedChanges: draft !== savedDraft };
}
