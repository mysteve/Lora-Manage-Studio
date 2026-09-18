import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const harness = vi.hoisted(() => ({ visible: false, reduced: false, effect: undefined as undefined | (() => void | (() => void)) }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: () => [harness.visible, (visible: boolean) => { harness.visible = visible; }],
  useEffect: (effect: () => void | (() => void)) => { harness.effect = effect; },
}));
vi.mock('react-dom', () => ({ createPortal: (element: ReactElement) => element }));
vi.mock('../lib/useReducedMotion', () => ({ useReducedMotion: () => harness.reduced }));
import { BackToTop } from './BackToTop';

afterEach(() => { vi.unstubAllGlobals(); harness.visible = false; harness.reduced = false; });
describe('back to top', () => {
  it('tracks window scroll above 400 and cleans up listeners', () => {
    const windowMock = { scrollY: 400, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('window', windowMock);
    vi.stubGlobal('document', { scrollingElement: { scrollTop: 400 }, body: {} });
    expect(BackToTop({ enabled: true })).toBeNull();
    const stop = harness.effect!();
    expect(harness.visible).toBe(false);
    windowMock.scrollY = 401;
    windowMock.addEventListener.mock.calls[0][1]();
    expect(harness.visible).toBe(true);
    expect(BackToTop({ enabled: true })).not.toBeNull();
    expect(BackToTop({ enabled: false })).toBeNull();
    if (stop) stop();
    expect(windowMock.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
  it('focuses main without scrolling and respects live reduced motion', () => {
    const focus = vi.fn();
    const scrollTo = vi.fn();
    vi.stubGlobal('window', { scrollTo });
    vi.stubGlobal('document', { body: {}, querySelector: () => ({ focus }) });
    harness.visible = true;
    const click = () => {
      const button = BackToTop({ enabled: true }) as ReactElement<{ onClick: () => void; 'aria-label': string }>;
      expect(button.props['aria-label']).toBe('回到顶部');
      button.props.onClick();
    };
    click();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
    harness.reduced = true;
    click();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
  });
});
