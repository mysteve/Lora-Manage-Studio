import { describe, expect, it, vi } from 'vitest';
import { outputPageCache } from './outputPageCache';

describe('输出图片游标缓存', () => {
  it('预取与翻页共用请求并记录下一游标', async () => {
    const read = vi.fn(async (cursor: string | null) => ({ cursor, nextCursor: cursor === null ? 'a' : null }));
    const cache = outputPageCache(read);
    const request = cache.get(0);
    expect(cache.get(0)).toBe(request);
    await request;
    await cache.get(1);
    expect(read.mock.calls).toEqual([[null], ['a']]);
    expect(cache.history()).toEqual([null, 'a']);
    await cache.get(0);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('失败可以重试，未知页不可跳转', async () => {
    const read = vi.fn(async () => ({ nextCursor: null })).mockRejectedValueOnce(new Error('scan failed'));
    const cache = outputPageCache(read);
    await expect(cache.get(0)).rejects.toThrow('scan failed');
    await cache.get(0);
    await expect(cache.get(1)).rejects.toThrow('输出页位置已失效');
  });
  it('恢复历史位置、释放远页，并在重新读取时删除变化的后续游标', async () => {
    const read = vi.fn(async (cursor: string | null) => ({ nextCursor: cursor === 'b' ? 'c' : 'new' }));
    const cache = outputPageCache(read, [null, 'a', 'b', 'c']);
    await cache.get(2);
    expect(read).toHaveBeenLastCalledWith('b');
    await cache.get(0);
    expect(cache.peek(2)).toBeUndefined();
    expect(cache.history()).toEqual([null, 'new']);
  });
  it('累计模式恢复批次并保留远处批次，预取和追加共用请求', async () => {
    const first = { nextCursor: 'a' as string | null };
    const read = vi.fn(async (cursor: string | null) => ({ nextCursor: cursor === 'a' ? 'b' : null }));
    const cache = outputPageCache(read, [null, 'a'], [first]);
    expect(await cache.get(0)).toBe(first);
    const request = cache.get(1);
    expect(cache.get(1)).toBe(request);
    await request;
    await cache.get(2);
    expect(await cache.get(0)).toBe(first);
    expect(read.mock.calls).toEqual([['a'], ['b']]);
  });
  it('拒绝重复游标且失败后可重试', async () => {
    const read = vi.fn(async (): Promise<{ nextCursor: string | null }> => ({ nextCursor: 'a' }))
      .mockResolvedValueOnce({ nextCursor: 'a' })
      .mockResolvedValueOnce({ nextCursor: 'a' })
      .mockResolvedValueOnce({ nextCursor: null });
    const cache = outputPageCache(read, [null], []);
    await cache.get(0);
    await expect(cache.get(1)).rejects.toThrow('游标重复');
    expect((await cache.get(1)).nextCursor).toBeNull();
  });
  it('新目录缓存与旧请求隔离', async () => {
    let resolve!: (value: { nextCursor: string | null }) => void;
    const old = outputPageCache(() => new Promise<{ nextCursor: string | null }>((done) => { resolve = done; }), [null], []);
    const request = old.get(0);
    const current = outputPageCache(async () => ({ nextCursor: null }), [null], []);
    await current.get(0);
    resolve({ nextCursor: 'old' });
    await request;
    expect(current.history()).toEqual([null]);
    expect(current.peek(0)?.nextCursor).toBeNull();
  });
});
