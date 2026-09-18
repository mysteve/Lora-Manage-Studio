import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Settings } from '../../types/models';
import type { OutputImages } from './outputCollection';

const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as (() => void)[] }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: any) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[index], (next: any) => {
      hooks.slots[index] = typeof next === 'function' ? next(hooks.slots[index]) : next;
    }];
  },
  useRef: (value: any) => {
    const index = hooks.cursor++;
    return hooks.slots[index] ??= { current: value };
  },
  useMemo: (fn: () => unknown, deps: any[]) => {
    const index = hooks.cursor++;
    const old = hooks.slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) hooks.slots[index] = { deps, value: fn() };
    return hooks.slots[index].value;
  },
  useCallback: (fn: any, deps: any[]) => {
    const index = hooks.cursor++;
    const old = hooks.slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) hooks.slots[index] = { deps, value: fn };
    return hooks.slots[index].value;
  },
  useEffect: (fn: () => void | (() => void), deps: any[]) => {
    const index = hooks.cursor++;
    const old = hooks.slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) hooks.effects.push(() => {
      old?.cleanup?.();
      hooks.slots[index] = { deps, cleanup: fn() };
    });
  },
}));
vi.mock('../../lib/api', () => ({ call: vi.fn(), asset: (path: string) => path, reveal: vi.fn() }));
vi.mock('../../components/ui', () => ({ Empty: () => null, ErrorBox: () => null, Loading: () => null }));
vi.mock('./OutputMetadata', () => ({ OutputMetadata: () => null }));
vi.mock('./OutputViewer', () => ({ OutputViewer: () => null }));
vi.mock('./ZoomableOutput', () => ({ ZoomableOutput: () => null }));
vi.mock('./outputImagePreload', () => ({ outputImagePreload: () => ({ clear: vi.fn(), preload: vi.fn() }) }));
import { call } from '../../lib/api';
import { ErrorBox } from '../../components/ui';
import { OutputGallery, type OutputView } from './OutputGallery';
import { OutputViewer } from './OutputViewer';

function nodes(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
const batch = (name: string, nextCursor: string | null): OutputImages => ({
  directory: 'output', exists: true, total: 3, startIndex: 0, nextCursor,
  items: [{ path: name, name, modified: 0, size: 1 }],
});
let view: OutputView;
let settings: Settings;
let observed: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
const onViewChange = (next: any) => { view = typeof next === 'function' ? next(view) : next; };
function render() {
  hooks.cursor = 0;
  const tree = OutputGallery({ settings, view, onViewChange, library: [], notify: vi.fn(), onOpenEntry: vi.fn(), onSettings: vi.fn() });
  // Host refs are assigned before passive effects, like React's commit phase.
  for (const node of nodes(tree)) if (typeof node.type === 'string' && node.props.ref) node.props.ref.current = { querySelectorAll: () => [] };
  hooks.effects.splice(0).forEach((effect) => effect());
  return tree;
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const grid = (tree: ReactElement) => nodes(tree).find((node) => node.props?.className === 'output-grid');
const cards = (tree: ReactElement) => nodes(tree).filter((node) => node.props?.className === 'output-card');

beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0; hooks.effects = [];
  view = { page: 0, cursors: [null], selected: null };
  settings = { comfyRoot: 'comfy', outputDir: '' } as Settings;
  observed = undefined;
  vi.mocked(call).mockReset();
  vi.stubGlobal('window', { scrollY: 0, scrollTo: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof observed, options: IntersectionObserverInit) {
      observed = callback;
      expect(options).toEqual({ root: null, rootMargin: '400px 0px' });
    }
    observe() {}
    disconnect() { observed = undefined; }
  });
});
afterEach(() => {
  hooks.slots.forEach((slot) => slot?.cleanup?.());
  vi.unstubAllGlobals();
});

describe('输出无限滚动生命周期', () => {
  it('旧App初始状态兼容，触底追加并去重，错误重试保留已有卡片', async () => {
    vi.mocked(call).mockResolvedValueOnce(batch('a', 'next'))
      .mockRejectedValueOnce(new Error('scan failed'))
      .mockResolvedValueOnce({ ...batch('b', null), items: [batch('a', null).items[0], batch('b', null).items[0]] });
    render(); await settle();
    let tree = render();
    expect(cards(tree)).toHaveLength(1);
    observed?.([{ isIntersecting: true }]); await settle();
    tree = render();
    expect(cards(tree)).toHaveLength(1);
    expect(observed).toBeUndefined();
    nodes(tree).find((node) => node.type === ErrorBox).props.retry();
    await settle(); tree = render();
    expect(cards(tree).map((node) => node.props['data-output-path'])).toEqual(['a', 'b']);
    expect(view.collection?.batches).toHaveLength(2);
    expect(vi.mocked(call).mock.calls.map((args) => args[1])).toEqual([{ cursor: null }, { cursor: 'next' }, { cursor: 'next' }]);
  });
  it('看图页位置独立，切图不重建累计卡片且跨批追加保留已有列表', async () => {
    vi.mocked(call).mockResolvedValueOnce(batch('a', 'next')).mockResolvedValueOnce(batch('b', null));
    render(); await settle();
    let tree = render();
    const originalGrid = grid(tree);
    cards(tree)[0].props.onClick(); tree = render();
    expect(grid(tree)).toBe(originalGrid);
    await settle(); // 边界预取
    nodes(tree).find((node) => node.type === OutputViewer).props.onMove(1);
    await settle(); tree = render();
    expect(view.page).toBe(1);
    expect(view.selected?.path).toBe('b');
    expect(cards(tree)).toHaveLength(2);
    expect(call).toHaveBeenCalledTimes(2);
    const appendedGrid = grid(tree);
    nodes(tree).find((node) => node.type === OutputViewer).props.onMove(-1);
    await settle(); tree = render();
    expect(view.page).toBe(0);
    expect(grid(tree)).toBe(appendedGrid);
  });
  it('切换目录后忽略旧请求完成，恢复累计数据时不重新读取', async () => {
    let finish!: (value: OutputImages) => void;
    vi.mocked(call).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(batch('new', null));
    render();
    settings = { ...settings, outputDir: 'new-directory' };
    render(); await settle();
    finish(batch('old', 'obsolete')); await settle();
    const tree = render();
    expect(cards(tree).map((node) => node.props['data-output-path'])).toEqual(['new']);
    expect(view.cursors).toEqual([null]);
    hooks.slots.forEach((slot) => slot?.cleanup?.());
    hooks.slots = []; hooks.cursor = 0;
    render(); await settle();
    expect(call).toHaveBeenCalledTimes(2);
    expect(cards(render())).toHaveLength(1);
  });
});
