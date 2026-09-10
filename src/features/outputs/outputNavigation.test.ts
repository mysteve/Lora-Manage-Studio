import { describe, expect, it } from 'vitest';
import { adjacentOutput } from './outputNavigation';

describe('输出图片游标导航', () => {
  it('按当前页实际长度切图，不依赖总数或固定页长', () => {
    expect(adjacentOutput(2, 1, 3, true, 1)).toEqual({ page: 2, index: 2 });
    expect(adjacentOutput(2, 2, 3, true, 1)).toEqual({ page: 3, index: 0 });
    expect(adjacentOutput(2, 0, 3, true, -1)).toEqual({ page: 1, index: -1 });
  });
  it('没有下一游标时停止，首张和失效选择不越界', () => {
    expect(adjacentOutput(0, 0, 60, true, -1)).toBeNull();
    expect(adjacentOutput(1, 4, 5, false, 1)).toBeNull();
    expect(adjacentOutput(0, -1, 0, false, 1)).toBeNull();
    expect(adjacentOutput(0, 60, 60, true, 1)).toBeNull();
  });
});
