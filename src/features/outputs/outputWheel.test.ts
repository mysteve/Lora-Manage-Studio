import { describe, expect, it } from 'vitest';
import { wheelNavigation, wheelPixels, wheelScale } from './outputWheel';

describe('看图滚轮', () => {
  it('缩放方向正确且限制在1到8倍', () => {
    expect(wheelScale(2, -100)).toBeGreaterThan(2);
    expect(wheelScale(2, 100)).toBeLessThan(2);
    expect(wheelScale(1, 200)).toBe(1);
    expect(wheelScale(8, -200)).toBe(8);
  });
  it('兼容像素、行和页单位', () => {
    expect(wheelPixels(3, 0)).toBe(3);
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(1, 2)).toBe(600);
  });
  it('小幅滚动累积，连续事件限速，反向不受旧累计影响', () => {
    const wheel = wheelNavigation();
    expect(wheel(20, 0)).toBeNull();
    expect(wheel(20, 30)).toBe(1);
    expect(wheel(120, 60)).toBeNull();
    expect(wheel(-60, 350)).toBe(-1);
    expect(wheel(10, 700)).toBeNull();
    expect(wheel(30, 1000)).toBeNull();
  });
});
