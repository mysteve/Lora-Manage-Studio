import { describe, expect, it } from 'vitest';
import { builtInTerms } from './terms';
import { translateFromLibrary } from './translation';
const translated = (text: string) =>
  translateFromLibrary(text, builtInTerms)
    .map((part) => part.text)
    .join('');
describe('inline vocabulary translations', () => {
  it('translates complete phrases and ignores trailing separators', () => {
    expect(translated('masterpiece, watercolor painting, best quality, ')).toBe('杰作，水彩画，最佳画质');
    expect(translated('long_hair')).toBe('长发');
    expect(translated('')).toBe('');
  });
  it('preserves unknown text and never uses partial matches as translations', () => {
    expect(translateFromLibrary('a forest creature', builtInTerms)).toEqual([
      { source: 'a forest creature', text: 'a forest creature', missing: true },
    ]);
    expect(
      translateFromLibrary('portrait, unknown style', builtInTerms)
        .filter((part) => part.missing)
        .map((part) => part.source),
    ).toEqual(['unknown style']);
  });
  it('preserves weights and LoRA identifiers while translating grouped terms', () => {
    expect(translated('(soft lighting:1.2), [portrait], <lora:my_model:0.8>')).toBe(
      '(柔和光照:1.2)，[肖像]，<lora:my_model:0.8>',
    );
    expect(translated('(portrait), (soft lighting)')).toBe('(肖像)，(柔和光照)');
    expect(translated('(portrait, soft lighting:1.2)')).toBe('(肖像，柔和光照:1.2)');
  });
  it('uses maintained translations and excludes disabled entries', () => {
    const term = { ...builtInTerms[0], translation: '用户译文' };
    expect(translateFromLibrary(term.text, [term])[0].text).toBe('用户译文');
    expect(translateFromLibrary(term.text, [{ ...term, enabled: false }])[0].missing).toBe(true);
  });
});
