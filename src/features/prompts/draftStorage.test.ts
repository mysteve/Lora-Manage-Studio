import { describe, expect, it, vi } from 'vitest';
import { createPromptDraftStorage, draftStorageKey } from './draftStorage';
import type { PromptDraft } from './composer';

const draft: PromptDraft = {
  segments: [
    { id: '1', name: '主体', text: '(cat:1.2)', enabled: true, kind: 'positive' },
    { id: '2', text: 'blur', enabled: false, kind: 'negative' },
  ],
};
function memory(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[draftStorageKey, raw]]);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}
describe('current prompt draft storage', () => {
  it('loads empty without writing, and round trips all draft fields in versioned storage', () => {
    const storage = memory();
    const session = createPromptDraftStorage(() => storage);
    expect(session.draft).toEqual({ segments: [] });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(session.save(draft)).toBeNull();
    expect(JSON.parse(storage.getItem(draftStorageKey)!)).toEqual({ version: 1, draft });
    expect(createPromptDraftStorage(() => storage).draft).toEqual(draft);
  });
  it('keeps preview, real draft, and named presets separate', () => {
    const storage = memory();
    createPromptDraftStorage(() => storage).save(draft);
    const preview = createPromptDraftStorage(() => storage, true);
    expect(preview.draft.segments).toEqual([]);
    preview.save({ segments: [] });
    expect(createPromptDraftStorage(() => storage).draft).toEqual(draft);
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([
      draftStorageKey,
      `${draftStorageKey}.preview`,
    ]);
  });
  it.each([
    '{',
    'null',
    '{"version":2,"draft":{"segments":[]}}',
    JSON.stringify({ version: 1, draft: { segments: [{ ...draft.segments[0], enabled: 'yes' }] } }),
    JSON.stringify({ version: 1, draft: { segments: [draft.segments[0], draft.segments[0]] } }),
  ])('locks writes after invalid saved data: %s', (raw) => {
    const storage = memory(raw);
    const session = createPromptDraftStorage(() => storage);
    expect(session.readError).toContain('读取');
    expect(session.save(draft)).toBe(session.readError);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem(draftStorageKey)).toBe(raw);
  });
  it('locks writes if localStorage access or reads throw', () => {
    expect(
      createPromptDraftStorage(() => {
        throw new Error('blocked');
      }).save(draft),
    ).toContain('不会保存');
    const storage = memory();
    storage.getItem.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(createPromptDraftStorage(() => storage).save(draft)).toContain('不会保存');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('returns a visible save failure and allows retry', () => {
    const storage = memory();
    const session = createPromptDraftStorage(() => storage);
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    expect(session.save(draft)).toContain('保存失败');
    expect(session.save(draft)).toBeNull();
    expect(createPromptDraftStorage(() => storage).draft).toEqual(draft);
  });
});
