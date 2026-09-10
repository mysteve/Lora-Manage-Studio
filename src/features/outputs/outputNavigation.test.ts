import { describe, expect, it } from 'vitest';
import { adjacentOutput } from './outputNavigation';

describe('输出图片连续浏览', () => {
  it('在当前页前后切换', () => {
    expect(adjacentOutput(0, 10, 130, 1)).toEqual({ page: 0, index: 11 });
    expect(adjacentOutput(0, 10, 130, -1)).toEqual({ page: 0, index: 9 });
  });
  it('跨页时选择下一页首张或上一页末张', () => {
    expect(adjacentOutput(0, 59, 130, 1)).toEqual({ page: 1, index: 0 });
    expect(adjacentOutput(1, 0, 130, -1)).toEqual({ page: 0, index: 59 });
    expect(adjacentOutput(1, 59, 121, 1)).toEqual({ page: 2, index: 0 });
  });
  it('首尾、空列表和失效选择不越界', () => {
    expect(adjacentOutput(0, 0, 130, -1)).toBeNull();
    expect(adjacentOutput(2, 0, 121, 1)).toBeNull();
    expect(adjacentOutput(0, -1, 0, 1)).toBeNull();
    expect(adjacentOutput(0, 0, 1, 1)).toBeNull();
  });
});
