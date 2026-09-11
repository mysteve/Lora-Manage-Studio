import { describe, expect, it } from 'vitest';
import rawRows from './data/external-terms.json?raw';
import { mergeExternalTerms, type ExternalTermRow } from './vocabulary';
import { builtInTerms, normalizeTerm, readTerms, searchTerms, writeTerms } from './terms';
import { translateFromLibrary } from './translation';
const rows = JSON.parse(rawRows) as ExternalTermRow[];
const defaults = mergeExternalTerms(rows);
const storageFor = (initial: string | null = null) => {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
};
describe('external prompt vocabulary', () => {
  it('ships both English sources and Chinese translations without normalized duplicates', () => {
    expect(rows.length).toBeGreaterThan(200000);
    expect(defaults.some((term) => term.source?.includes('e621'))).toBe(true);
    expect(defaults.filter((term) => term.translation).length).toBeGreaterThan(99000);
    expect(new Set(defaults.map((term) => normalizeTerm(term.text))).size).toBe(defaults.length);
    expect(defaults.find((term) => term.text === 'masterpiece')?.translation).toBe('杰作');
    expect(defaults.find((term) => term.text === 'long hair')?.aliases).toContain('longhair');
  });
  it('finds new English tags, Chinese translations and source aliases', () => {
    expect(searchTerms(defaults, '1girl', 'positive', 8)[0].text).toBe('1girl');
    expect(searchTerms(defaults, '1女孩', 'positive', 8).some((term) => term.text === '1girl')).toBe(true);
    expect(searchTerms(defaults, 'sole_female', 'positive', 8).some((term) => term.text === '1girl')).toBe(
      true,
    );
    expect(
      translateFromLibrary('masterpiece, 1girl', defaults)
        .map((part) => part.text)
        .join(''),
    ).toContain('杰作');
    expect(searchTerms(defaults, 'hair', 'positive', 8)).toHaveLength(8);
  });
  it('migrates the old snapshot preserving edits, deletion, disabled entries and custom terms', () => {
    const legacy = builtInTerms.slice(1).map((term) => ({ ...term }));
    legacy[0].translation = '个人译文';
    legacy[0].enabled = false;
    legacy.push({
      ...builtInTerms[0],
      id: 'custom-test',
      text: 'my special phrase',
      translation: '自己的短句',
    });
    const storage = storageFor(JSON.stringify({ version: 1, terms: legacy }));
    const migrated = readTerms(storage, 'test', defaults);
    expect(migrated.some((term) => term.id === builtInTerms[0].id)).toBe(false);
    expect(migrated.find((term) => term.id === legacy[0].id)).toMatchObject({
      translation: '个人译文',
      enabled: false,
    });
    expect(migrated.some((term) => term.id === 'custom-test')).toBe(true);
    expect(migrated.some((term) => term.text === '1girl')).toBe(true);
    writeTerms(storage, migrated, 'test', defaults);
    expect(storage.getItem()!.length).toBeLessThan(50000);
    const reloaded = readTerms(storage, 'test', defaults);
    expect(reloaded.length).toBe(migrated.length);
    expect(reloaded.find((term) => term.id === legacy[0].id)).toMatchObject({
      translation: '个人译文',
      enabled: false,
    });
    expect(reloaded.some((term) => term.id === 'custom-test')).toBe(true);
    expect(reloaded.some((term) => term.id === builtInTerms[0].id)).toBe(false);
  });
  it('stores only overrides and tombstones for the large library', () => {
    const storage = storageFor();
    const entry = defaults.find((term) => term.text === '1girl')!;
    const removed = defaults.find((term) => term.text === 'solo')!;
    const modified = defaults
      .filter((term) => term.id !== removed.id)
      .map((term) => (term.id === entry.id ? { ...term, enabled: false, translation: '个人翻译' } : term));
    writeTerms(storage, modified, 'test', defaults);
    expect(storage.getItem()!.length).toBeLessThan(1000);
    const loaded = readTerms(storage, 'test', defaults);
    expect(loaded.find((term) => term.id === entry.id)).toMatchObject({
      enabled: false,
      translation: '个人翻译',
    });
    expect(loaded.some((term) => term.id === removed.id)).toBe(false);
  });
});
