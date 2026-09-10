import { describe, expect, it } from 'vitest';
import { readPresets, writePresets, type PromptPreset } from './presets';
describe('prompt preset persistence', () => {
  it('restores all segment fields and order from serialized storage', () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    expect(readPresets(storage)).toEqual([]);
    const presets: PromptPreset[] = [
      {
        id: 'preset',
        name: '电影',
        segments: [
          { id: 'a', name: '光线', kind: 'positive', text: '(light:1.2)\nforest', enabled: false },
          { id: 'b', kind: 'negative', text: 'blur', enabled: true },
        ],
      },
    ];
    writePresets(storage, presets);
    const loaded = readPresets(storage);
    expect(loaded).toEqual(presets);
    loaded[0].segments[0].text = 'changed';
    expect(readPresets(storage)).toEqual(presets);
  });
  it('rejects invalid data rather than treating it as empty and overwriting it', () => {
    for (const raw of [
      '{',
      '{"version":2,"presets":[]}',
      '{"version":1,"presets":[{"id":"p","name":"n","segments":[{}]}]}',
    ]) {
      expect(() => readPresets({ getItem: () => raw })).toThrow();
    }
  });
  it('propagates storage failures instead of reporting a successful save', () => {
    expect(() =>
      writePresets(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        [],
      ),
    ).toThrow('quota');
  });
});
