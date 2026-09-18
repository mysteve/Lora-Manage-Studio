import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const effects = vi.hoisted(() => ({ pending: [] as (() => void | (() => void))[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: () => ({ current: {} }),
  useEffect: (effect: () => void | (() => void)) => effects.pending.push(effect),
}));
import { LibraryContinuation } from './LibraryContinuation';

afterEach(() => { effects.pending = []; vi.unstubAllGlobals(); });
describe('library continuation', () => {
  it('observes the document viewport again after each successful append', () => {
    const load = vi.fn(async () => {});
    const disconnect = vi.fn();
    const observe = vi.fn();
    let callback!: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(fn: IntersectionObserverCallback) { callback = fn; }
      observe = observe;
      disconnect = disconnect;
    });
    renderToStaticMarkup(<LibraryContinuation loading={false} error="" hasMore count={60} onLoad={load} />);
    const stop = effects.pending.pop()!();
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(load).toHaveBeenCalledTimes(1);
    if (stop) stop();
    renderToStaticMarkup(<LibraryContinuation loading={false} error="" hasMore count={120} onLoad={load} />);
    effects.pending.pop()!();
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(load).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it('does not automatically retry failures and provides a manual fallback', () => {
    const observer = vi.fn();
    vi.stubGlobal('IntersectionObserver', observer);
    const html = renderToStaticMarkup(<LibraryContinuation loading={false} error="offline" hasMore count={60} onLoad={async () => {}} />);
    effects.pending.pop()!();
    expect(observer).not.toHaveBeenCalled();
    expect(html).toContain('重试加载');
    expect(html).toContain('role="alert"');
    vi.unstubAllGlobals();
    const fallback = renderToStaticMarkup(<LibraryContinuation loading={false} error="" hasMore count={60} onLoad={async () => {}} />);
    expect(() => effects.pending.pop()!()).not.toThrow();
    expect(fallback).toContain('加载更多模型');
  });
});
