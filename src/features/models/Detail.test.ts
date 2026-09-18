import { describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/api', () => ({ call: vi.fn(), asset: vi.fn() }));
import { reconcileSavedRecipe } from './Detail';
import type { Recipe } from '../../types/models';

const submitted: Recipe = {
  id: '',
  owner: 'version:1',
  name: '新配方',
  positive: 'old prompt',
  negative: '',
  modelWeight: 1,
  clipWeight: 1,
  notes: '',
};

describe('recipe save snapshot reconciliation', () => {
  it('adopts the saved identity without overwriting edits made while saving', () => {
    const result = { ...submitted, id: 'persisted-id' };
    const current = { ...submitted, positive: 'new prompt', notes: 'keep these notes', modelWeight: 0.8 };
    expect(reconcileSavedRecipe(current, submitted, result)).toEqual({ ...current, id: 'persisted-id' });
    expect(reconcileSavedRecipe(current, submitted, result)).not.toEqual(result);
  });
  it('uses the saved response when the submitted draft is unchanged', () => {
    const result = { ...submitted, id: 'persisted-id', name: '服务端名称' };
    expect(reconcileSavedRecipe(submitted, submitted, result)).toEqual(result);
  });
  it('does not mutate either the submitted snapshot or later draft', () => {
    const current = Object.freeze({ ...submitted, negative: 'new negative' });
    const result = Object.freeze({ ...submitted, id: 'id' });
    const merged = reconcileSavedRecipe(current, Object.freeze(submitted), result);
    expect(merged.negative).toBe('new negative');
    expect(current.id).toBe('');
    expect(result.negative).toBe('');
  });
});
