import { describe, expect, it, vi } from 'vitest';
vi.mock('../../components/ui', () => ({ CoverImage: () => null }));
import { metadataRows } from './ImageGallery';

describe('image metadata', () => {
  it('preserves zero, multiline prompts and structured parameters', () => {
    const rows = metadataRows({
      prompt: 'sky\nclouds',
      seed: 0,
      extra: { model: 'demo' },
      empty: '',
      absent: null,
    });
    expect(rows.map((row) => row.key)).toEqual(['prompt', 'seed', 'extra']);
    expect(rows[0].value).toBe('sky\nclouds');
    expect(rows[1].value).toBe('0');
    expect(JSON.parse(rows[2].value)).toEqual({ model: 'demo' });
  });
  it('accepts images without metadata', () => {
    expect(metadataRows()).toEqual([]);
    expect(metadataRows(null)).toEqual([]);
  });
});
