import { describe, expect, it, vi } from 'vitest';
import { outputPageCache } from './outputPageCache';

describe('输出图片分页预取缓存', () => {
  it('预取和翻页共用请求，已完成页面直接可用', async () => {
    const read = vi.fn(async (page: number) => ({ page }));
    const cache = outputPageCache(read);
    const prefetch = cache.get(1);
    expect(cache.get(1)).toBe(prefetch);
    await prefetch;
    expect(cache.peek(1)).toEqual({ page: 1 });
    await cache.get(1);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('失败后可重新读取，并释放远离当前页的缓存', async () => {
    const read = vi.fn(async (page: number) => page).mockRejectedValueOnce(new Error('scan failed'));
    const cache = outputPageCache(read);
    await expect(cache.get(0)).rejects.toThrow('scan failed');
    expect(await cache.get(0)).toBe(0);
    await cache.get(1);
    await cache.get(2);
    expect(cache.peek(0)).toBeUndefined();
    expect(cache.peek(1)).toBe(1);
  });
});
