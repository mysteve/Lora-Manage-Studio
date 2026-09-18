import { describe, expect, it } from 'vitest';
import { appendOutputBatch, collectedOutputItems, type OutputImages } from './outputCollection';

const batch = (paths: string[], nextCursor: string | null = null): OutputImages => ({
  directory: 'output', exists: true, total: 100, startIndex: 0, nextCursor,
  items: paths.map((path) => ({ path, name: path, modified: 0, size: 1 })),
});

describe('累计输出列表', () => {
  it('按路径去重并保留第一批次归属，追加不会改变旧图片对象', () => {
    const first = batch(['a', 'b'], 'next');
    const next = appendOutputBatch([first], 1, batch(['b', 'c']));
    const items = collectedOutputItems(next);
    expect(items.map(({ item, page }) => [item.path, page])).toEqual([['a', 0], ['b', 0], ['c', 1]]);
    expect(items[0].item).toBe(first.items[0]);
  });
  it('列表加载与看图跨批请求重复完成时只提交一次，不接受乱序空洞', () => {
    const first = [batch(['a'], 'next')];
    expect(appendOutputBatch(first, 0, batch(['a']))).toBe(first);
    expect(appendOutputBatch(first, 2, batch(['c']))).toBe(first);
    expect(appendOutputBatch(first, 1, batch(['b']))).toHaveLength(2);
  });
  it('空批次仍可保留下一游标并继续追加', () => {
    const batches = appendOutputBatch([batch([], 'next')], 1, batch(['b']));
    expect(collectedOutputItems(batches).map(({ item }) => item.path)).toEqual(['b']);
  });
});
