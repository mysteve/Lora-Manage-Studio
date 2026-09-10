import { describe, expect, it, vi } from 'vitest';
import { outputImagePreload } from './outputImagePreload';

describe('输出图片预解码', () => {
  it('复用相邻图片，只保留六张，关闭后重新读取', () => {
    const create = vi.fn(() => ({ decode: () => Promise.resolve() }) as HTMLImageElement);
    const preload = outputImagePreload(create);
    preload.preload('a');
    preload.preload('a');
    expect(create).toHaveBeenCalledTimes(1);
    for (const src of ['b', 'c', 'd', 'e', 'f', 'g']) preload.preload(src);
    preload.preload('a');
    expect(create).toHaveBeenCalledTimes(8);
    preload.clear();
    preload.preload('a');
    expect(create).toHaveBeenCalledTimes(9);
  });
  it('解码失败不锁死后续重试', async () => {
    const create = vi.fn(() => ({ decode: () => Promise.reject(new Error('bad image')) }) as HTMLImageElement);
    const preload = outputImagePreload(create);
    preload.preload('a');
    await Promise.resolve();
    preload.preload('a');
    expect(create).toHaveBeenCalledTimes(2);
  });
});
