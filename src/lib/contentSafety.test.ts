import { describe, expect, it } from 'vitest';
import { coverSafety } from './contentSafety';

describe('cover safety display', () => {
  it('hides a restricted cover even when its original image is already cached', () => {
    const cover = { url: 'https://image.civitai.red/example.png', localPath: 'cached.png', nsfwLevel: 4 };
    expect(coverSafety(cover, true)).toBe('hidden');
    expect(coverSafety(cover, false)).toBe('visible');
    expect(cover.localPath).toBe('cached.png');
  });
  it('distinguishes missing images, local custom covers and unclassified legacy images', () => {
    expect(coverSafety(undefined, true)).toBe('visible');
    expect(coverSafety({ url: '', localPath: 'custom.png' }, true)).toBe('visible');
    expect(coverSafety({ url: 'https://image.civitai.red/old.png', localPath: 'old.png' }, true)).toBe(
      'unknown',
    );
    expect(coverSafety({ url: 'safe', localPath: '', nsfwLevel: 1 }, true)).toBe('visible');
  });
});
