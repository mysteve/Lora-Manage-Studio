import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptDraft } from './composer';
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      hooks.slots[index],
      (next: unknown) => {
        hooks.slots[index] = typeof next === 'function' ? next(hooks.slots[index]) : next;
      },
    ];
  },
  useEffect: (effect: () => void) => {
    hooks.effects.push(effect);
  },
}));
import { usePromptDraft } from './usePromptDraft';
const draft: PromptDraft = { segments: [{ id: 'a', text: 'cat', enabled: true, kind: 'positive' }] };
beforeEach(() => {
  hooks.slots = [];
  hooks.index = 0;
  hooks.effects = [];
});
function setup(readFailure = false) {
  const storage = {
    getItem: vi.fn(() => {
      if (readFailure) throw new Error('read blocked');
      return null;
    }),
    setItem: vi.fn(),
  };
  const render = () => {
    hooks.index = 0;
    return usePromptDraft({ preview: false, getStorage: () => storage });
  };
  const flush = () => {
    const effects = hooks.effects.splice(0);
    effects.forEach((effect) => effect());
  };
  return { storage, render, flush };
}
describe('usePromptDraft persistence and close protection', () => {
  it('does not write on mount or repeated effects, tracks edits until successfully saved', () => {
    const app = setup();
    let state = app.render();
    expect(state.hasUnsavedChanges).toBe(false);
    app.flush();
    app.render();
    app.flush();
    expect(app.storage.setItem).not.toHaveBeenCalled();
    state.setDraft(() => draft);
    state = app.render();
    expect(state.hasUnsavedChanges).toBe(true);
    app.flush();
    state = app.render();
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.storageError).toBeNull();
  });
  it('keeps unsaved edits and exposes write errors, clears both on successful retry', () => {
    const app = setup();
    let state = app.render();
    app.flush();
    app.storage.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    state.setDraft(draft);
    app.render();
    app.flush();
    state = app.render();
    expect(state.hasUnsavedChanges).toBe(true);
    expect(state.storageError).toContain('保存失败');
    // Discard the mock render's effect: real React only reruns on changed deps.
    hooks.effects = [];
    state.setDraft({ segments: [] });
    app.render();
    app.flush();
    state = app.render();
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.storageError).toBeNull();
  });
  it('read failure alone is not an unsaved edit, but subsequent edits stay unsaved and never overwrite', () => {
    const app = setup(true);
    let state = app.render();
    app.flush();
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.storageError).toContain('读取');
    state.setDraft(draft);
    app.render();
    app.flush();
    state = app.render();
    expect(state.hasUnsavedChanges).toBe(true);
    expect(state.storageError).toContain('不会保存');
    expect(app.storage.setItem).not.toHaveBeenCalled();
  });
});
