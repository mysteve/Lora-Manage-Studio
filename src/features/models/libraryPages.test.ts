import { describe, expect, it, vi } from 'vitest';
import type { LibraryEntry } from '../../types/models';
import { createLibraryPages, type LibraryPage } from './libraryPages';

const entry = (id: string, favorite = false) => ({ id, favorite } as LibraryEntry);
const page = (ids: string[], nextCursor: string | null): LibraryPage => ({ items: ids.map((id) => entry(id)), nextCursor, total: 130 });
const filters = { query: '', baseModel: '', fileStatus: '', sort: 'newest' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('library cursor accumulation', () => {
  it('appends after 60, deduplicates ids and only null ends pagination', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(Array.from({ length: 60 }, (_, i) => String(i)), 'a'))
      .mockResolvedValueOnce(page(['59', '60'], ''))
      .mockResolvedValueOnce(page([], 'b'))
      .mockResolvedValueOnce(page(['61'], null));
    const pages = createLibraryPages(fetch);
    await pages.loadMore();
    expect(pages.getSnapshot().items).toHaveLength(60);
    await pages.loadMore();
    expect(pages.getSnapshot().items).toHaveLength(61);
    await pages.loadMore();
    expect(fetch.mock.calls[2][1]).toBe('');
    await pages.loadMore();
    await pages.loadMore();
    expect(pages.getSnapshot().items).toHaveLength(62);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('deduplicates simultaneous requests and rejects stale responses after reset', async () => {
    const first = deferred<LibraryPage>();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(page(['new'], null));
    const pages = createLibraryPages(fetch);
    const pending = pages.loadMore();
    await pages.loadMore();
    expect(fetch).toHaveBeenCalledTimes(1);
    pages.reset({ ...filters, query: 'new' });
    await pages.loadMore();
    first.resolve(page(['old'], 'old'));
    await pending;
    expect(pages.getSnapshot().items.map((item) => item.id)).toEqual(['new']);
  });
  it('retains accumulated items after failure and retries same cursor', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(['a'], 'next')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(['b'], null));
    const pages = createLibraryPages(fetch);
    await pages.loadMore();
    await pages.loadMore();
    expect(pages.getSnapshot().error).toBe('offline');
    expect(pages.getSnapshot().items).toHaveLength(1);
    await pages.loadMore();
    expect(fetch.mock.calls[1][1]).toBe(fetch.mock.calls[2][1]);
    expect(pages.getSnapshot().items).toHaveLength(2);
  });
  it('preserves favorite updates against an in-flight duplicate item', async () => {
    const next = deferred<LibraryPage>();
    const fetch = vi.fn().mockResolvedValueOnce(page(['a'], 'next')).mockReturnValueOnce(next.promise);
    const pages = createLibraryPages(fetch);
    await pages.loadMore();
    const pending = pages.loadMore();
    pages.update(entry('a', true));
    next.resolve(page(['a', 'b'], null));
    await pending;
    expect(pages.getSnapshot().items[0].favorite).toBe(true);
  });
  it('blocks repeated and cyclic cursors without losing accumulated items', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(['a'], 'one')).mockResolvedValueOnce(page(['b'], 'two')).mockResolvedValueOnce(page(['c'], 'one'));
    const pages = createLibraryPages(fetch);
    await pages.loadMore();
    await pages.loadMore();
    await pages.loadMore();
    expect(pages.getSnapshot().error).toContain('游标重复');
    expect(pages.getSnapshot().items).toHaveLength(2);
    expect(pages.getSnapshot().loading).toBe(false);
  });
  it('invalidates unmounted requests', async () => {
    const next = deferred<LibraryPage>();
    const pages = createLibraryPages(() => next.promise);
    const pending = pages.loadMore();
    pages.invalidate();
    next.resolve(page(['old'], null));
    await pending;
    expect(pages.getSnapshot().items).toHaveLength(0);
  });
});
