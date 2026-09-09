import { describe, it, expect } from 'vitest';
import { combine, matchesEntry, modelTriggerWords, owner, parseTriggerWords } from './utils';
import type { LibraryEntry } from '../types/models';
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
  it('searches custom trigger words on an unmatched local model', () => {
    const entry = {
      name: '我的别名',
      tags: [],
      triggerWords: ['myStyle'],
      version: null,
    } as unknown as LibraryEntry;
    expect(matchesEntry(entry, 'MYSTYLE')).toBe(true);
    expect(matchesEntry(entry, '别名')).toBe(true);
    expect(combine(modelTriggerWords(entry), 'soft light')).toBe('myStyle, soft light');
  });
  it('parses separators and deduplicates official and personal triggers', () => {
    expect(parseTriggerWords(' style,STYLE，character\nsoft light\r\n ')).toEqual([
      'style',
      'character',
      'soft light',
    ]);
    const entry = { triggerWords: ['Style', 'custom'] } as LibraryEntry;
    const version = { trainedWords: ['style', 'official'] } as NonNullable<LibraryEntry['version']>;
    expect(modelTriggerWords(entry, version)).toEqual(['style', 'official', 'custom']);
  });
});
