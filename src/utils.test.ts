import { describe, it, expect } from 'vitest';
import { combine, matchesEntry, owner } from './utils';
import type { LibraryEntry } from './types';
describe('prompt and library behavior', () => {
  it('combines triggers without treating ComfyUI weights as prompt syntax', () =>
    expect(combine([' cinematic ', ''], ' soft light ')).toBe('cinematic, soft light'));
  it('searches names, tags and triggers case insensitively', () => {
    const entry = {
      name: 'Forest',
      tags: ['风景'],
      version: { trainedWords: ['CINEMATIC'] },
    } as LibraryEntry;
    expect(matchesEntry(entry, 'cinematic')).toBe(true);
    expect(matchesEntry(entry, '风景')).toBe(true);
    expect(matchesEntry(entry, 'portrait')).toBe(false);
  });
  it('keeps unmatched file recipes separate', () => {
    expect(owner({ id: 'a' } as LibraryEntry)).toBe('local:a');
    expect(owner({ id: 'b' } as LibraryEntry)).toBe('local:b');
  });
});
