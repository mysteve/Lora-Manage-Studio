import { describe, expect, it } from 'vitest';
import { builtInTerms, completeTerm, promptToken, readTerms, searchTerms, writeTerms } from './terms';

describe('prompt vocabulary', () => {
  it('matches English suffixes, Chinese translations, aliases and multiple words', () => {
    expect(
      searchTerms(builtInTerms, 'lighting', 'positive').some((term) => term.text === 'soft lighting'),
    ).toBe(true);
    expect(searchTerms(builtInTerms, '柔光', 'positive')[0].text).toBe('soft lighting');
    expect(searchTerms(builtInTerms, '自然光', 'positive')[0].text).toBe('natural light');
    expect(searchTerms(builtInTerms, 'LIGHTING soft', 'positive')[0].text).toBe('soft lighting');
    expect(searchTerms(builtInTerms, 'long_hair', 'positive')[0].text).toBe('long hair');
    expect(searchTerms(builtInTerms, '不存在的词条', 'positive')).toEqual([]);
  });
  it('filters disabled terms and the opposite prompt group', () => {
    expect(searchTerms(builtInTerms, '模糊', 'positive')).toEqual([]);
    expect(searchTerms(builtInTerms, '模糊', 'negative')[0].text).toBe('blurry');
    const term = { ...builtInTerms[0], enabled: false };
    expect(searchTerms([term], term.text, 'positive')).toEqual([]);
    expect(searchTerms([term], term.text)).toHaveLength(1);
  });
  it('completes only the current token and preserves following text and weights', () => {
    expect(completeTerm('portrait, soft li', 17, 'soft lighting')).toEqual({
      text: 'portrait, soft lighting, ',
      caret: 'portrait, soft lighting, '.length,
    });
    expect(completeTerm('portrait, soft li, forest', 17, 'soft lighting').text).toBe(
      'portrait, soft lighting, forest',
    );
    expect(completeTerm('(soft li:1.2), forest', 8, 'soft lighting').text).toBe(
      '(soft lighting:1.2), forest',
    );
    expect(completeTerm('portrait，柔光\nforest', 11, 'soft lighting').text).toBe(
      'portrait， soft lighting\nforest',
    );
    expect(promptToken('<lora:soft', 10).query).toBe('');
    expect(promptToken('portrait, ', 10).query).toBe('');
  });
  it('adds one space after adjacent commas and positions the caret for continued typing', () => {
    for (const value of ['portrait,柔光,forest', 'portrait,  柔光,  forest']) {
      expect(completeTerm(value, value.indexOf('柔光') + 2, 'soft lighting')).toEqual({
        text: 'portrait, soft lighting, forest',
        caret: 'portrait, soft lighting, '.length,
      });
    }
    expect(completeTerm('柔光,', 2, 'soft lighting')).toEqual({
      text: 'soft lighting, ',
      caret: 'soft lighting, '.length,
    });
  });
  it('round-trips customizations including an empty library without restoring deleted terms', () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_: string, value: string) => {
        raw = value;
      },
    };
    expect(readTerms(storage)).toHaveLength(builtInTerms.length);
    const terms = [{ ...builtInTerms[0], translation: '自定义翻译', enabled: false }];
    writeTerms(storage, terms);
    expect(readTerms(storage)).toEqual(terms);
    writeTerms(storage, []);
    expect(readTerms(storage)).toEqual([]);
  });
  it('rejects corrupt, unknown-version and duplicate data without writing', () => {
    for (const raw of [
      '{',
      'null',
      '{"version":2,"terms":[]}',
      JSON.stringify({ version: 1, terms: [builtInTerms[0], builtInTerms[0]] }),
    ]) {
      expect(() => readTerms({ getItem: () => raw })).toThrow();
    }
  });
});
