import { describe, expect, it } from 'vitest';
import { clampOutputOffset, clampOutputScale, outputKeyAction } from './outputKeyboard';

const key = (value: string, overrides = {}) => ({
  key: value,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  defaultPrevented: false,
  isComposing: false,
  ...overrides,
});

describe('输出图片键盘操作', () => {
  it('保留无修饰左右键翻图，Shift 方向键仅平移，不会同时翻图', () => {
    expect(outputKeyAction(key('ArrowLeft'))).toEqual({ type: 'navigate', direction: -1 });
    expect(outputKeyAction(key('ArrowRight'))).toEqual({ type: 'navigate', direction: 1 });
    for (const [name, x, y] of [
      ['ArrowLeft', -80, 0],
      ['ArrowRight', 80, 0],
      ['ArrowUp', 0, -80],
      ['ArrowDown', 0, 80],
    ] as const) {
      expect(outputKeyAction(key(name, { shiftKey: true }))).toEqual({ type: 'pan', x, y });
    }
    expect(outputKeyAction(key('ArrowUp'))).toBeNull();
    expect(outputKeyAction(key('ArrowDown'))).toBeNull();
  });

  it('支持主键盘和数字键盘缩放及复位，不抢占浏览器组合键', () => {
    for (const event of [key('+'), key('+', { shiftKey: true }), key('=')]) {
      expect(outputKeyAction(event)).toEqual({ type: 'zoom', delta: 0.25 });
    }
    expect(outputKeyAction(key('-'))).toEqual({ type: 'zoom', delta: -0.25 });
    expect(outputKeyAction(key('0'))).toEqual({ type: 'reset' });
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      for (const name of ['+', '-', '0', 'ArrowLeft']) {
        expect(outputKeyAction(key(name, { [modifier]: true }))).toBeNull();
      }
    }
  });

  it('输入控件、输入法组合和已处理事件都不抢快捷键', () => {
    for (const name of ['ArrowLeft', 'ArrowRight', 'ArrowUp', '+', '=', '-', '0']) {
      for (const shiftKey of [true, false]) {
        const event = key(name, { shiftKey });
        expect(outputKeyAction(event, true)).toBeNull();
        expect(outputKeyAction({ ...event, isComposing: true })).toBeNull();
        expect(outputKeyAction({ ...event, defaultPrevented: true })).toBeNull();
      }
    }
    expect(outputKeyAction(key('Escape'))).toBeNull();
    expect(outputKeyAction(key('Tab'))).toBeNull();
  });

  it('连续缩放限制在适应窗口的 1–8 倍', () => {
    let scale = 1;
    for (let i = 0; i < 50; i++) scale = clampOutputScale(scale + 0.25);
    expect(scale).toBe(8);
    for (let i = 0; i < 50; i++) scale = clampOutputScale(scale - 0.25);
    expect(scale).toBe(1);
    expect(clampOutputScale(2.25)).toBe(2.25);
  });

  it('按 contain 后的图片边界平移，留白轴不平移', () => {
    expect(clampOutputOffset(900, -900, 2, 1000, 800, 1000, 800)).toEqual({ x: 500, y: -400 });
    expect(clampOutputOffset(80, 80, 2, 1000, 800, 200, 800)).toEqual({ x: 0, y: 80 });
    expect(clampOutputOffset(80, 80, 2, 1000, 800, 1000, 200)).toEqual({ x: 80, y: 0 });
  });

  it('缩回适应窗口、窗口变化和图片未就绪时安全复位或约束偏移', () => {
    expect(clampOutputOffset(500, 400, 1, 1000, 800, 1000, 800)).toEqual({ x: 0, y: 0 });
    expect(clampOutputOffset(500, 400, 2, 500, 400, 1000, 800)).toEqual({ x: 250, y: 200 });
    expect(clampOutputOffset(80, 80, 2, 1000, 800, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(clampOutputOffset(80, 80, 2, 0, 0, 1000, 800)).toEqual({ x: 0, y: 0 });
  });
});
