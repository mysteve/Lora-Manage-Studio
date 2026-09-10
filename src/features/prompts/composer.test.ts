import { describe, expect, it } from 'vitest';
import { composePrompt, moveSegment, type PromptSegment } from './composer';
const segment = (text: string, kind: PromptSegment['kind'] = 'positive', enabled = true): PromptSegment => ({
  id: text,
  text,
  kind,
  enabled,
});
describe('prompt composition', () => {
  it('moves segments before and after a target without changing the other group order', () => {
    const segments = [
      segment('a'),
      segment('n1', 'negative'),
      segment('b'),
      segment('n2', 'negative'),
      segment('c'),
    ];
    const moved = moveSegment(segments, 'a', 'c', true);
    expect(composePrompt({ segments: moved })).toEqual({ positive: 'b, c, a', negative: 'n1, n2' });
    expect(composePrompt({ segments: moveSegment(moved, 'a', 'b', false) }).positive).toBe('a, b, c');
    expect(segments.map((item) => item.id)).toEqual(['a', 'n1', 'b', 'n2', 'c']);
    expect(moveSegment(segments, 'a', 'n1', false)).toBe(segments);
    expect(moveSegment(segments, 'missing', 'a', true)).toBe(segments);
    expect(moveSegment(segments, 'a', 'a', true)).toBe(segments);
  });
  it('preserves expression syntax and line breaks while joining in order', () => {
    expect(
      composePrompt({ segments: [segment(' cinematic '), segment('(red, blue:1.2)\nBREAK landscape')] })
        .positive,
    ).toBe('cinematic, (red, blue:1.2)\nBREAK landscape');
  });
  it('separates negative prompts and excludes disabled and empty segments', () => {
    expect(
      composePrompt({
        segments: [
          segment('portrait'),
          segment('blurry', 'negative'),
          segment('hidden', 'positive', false),
          segment('  '),
        ],
      }),
    ).toEqual({ positive: 'portrait', negative: 'blurry' });
  });
  it('updates the result after reordering and keeps intentional repeated content', () => {
    const segments = [segment('first'), segment('second'), segment('first')];
    expect(composePrompt({ segments: segments.reverse() }).positive).toBe('first, second, first');
    expect(composePrompt({ segments: [segments[1], segments[0]] }).positive).toBe('second, first');
    expect(composePrompt({ segments: [] })).toEqual({ positive: '', negative: '' });
  });
});
