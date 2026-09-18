import type { PromptDraft } from './composer';

export const draftStorageKey = 'lora-studio.prompt-draft.v1';
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

function isDraft(value: unknown): value is PromptDraft {
  if (!value || typeof value !== 'object' || !('segments' in value) || !Array.isArray(value.segments))
    return false;
  const ids = new Set<string>();
  return value.segments.every((segment: unknown) => {
    if (!segment || typeof segment !== 'object') return false;
    const entry = segment as Record<string, unknown>;
    if (
      typeof entry.id !== 'string' ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.text !== 'string' ||
      typeof entry.enabled !== 'boolean' ||
      (entry.kind !== 'positive' && entry.kind !== 'negative') ||
      (entry.name !== undefined && typeof entry.name !== 'string')
    )
      return false;
    ids.add(entry.id);
    return true;
  });
}

/** One storage session per mounted App. A failed read locks writes for this session. */
export function createPromptDraftStorage(getStorage: () => DraftStorage, preview = false) {
  const key = preview ? `${draftStorageKey}.preview` : draftStorageKey;
  let draft: PromptDraft = { segments: [] };
  let readError: string | null = null;
  let storage: DraftStorage | undefined;
  try {
    storage = getStorage();
    const raw = storage.getItem(key);
    if (raw !== null) {
      const data: unknown = JSON.parse(raw);
      if (
        !data ||
        typeof data !== 'object' ||
        !('version' in data) ||
        data.version !== 1 ||
        !('draft' in data) ||
        !isDraft(data.draft)
      )
        throw new Error('Invalid draft');
      draft = data.draft;
    }
  } catch {
    readError = '读取当前组合草稿失败。为保护已有数据，本次不会保存草稿；当前编辑仅在本次运行中保留。';
  }
  return {
    draft,
    readError,
    save(next: PromptDraft): string | null {
      if (readError) return readError;
      try {
        if (!isDraft(next)) throw new Error('Invalid draft');
        storage!.setItem(key, JSON.stringify({ version: 1, draft: next }));
        return null;
      } catch {
        return '当前组合草稿保存失败，最新修改尚未持久化。请勿关闭应用；下次编辑时会重试保存。';
      }
    },
  };
}
