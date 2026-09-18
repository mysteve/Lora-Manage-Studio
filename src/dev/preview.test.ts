import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchesEntry } from '../lib/utils';
import type { LibraryEntry } from '../types/models';

type Page = { items: LibraryEntry[]; total: number; nextCursor: string | null };
async function setup(search = '?preview&library-pagination-preview') {
  vi.resetModules();
  vi.stubGlobal('location', { search });
  const { previewCall } = await import('./preview');
  const list = (args: Record<string, unknown> = {}) => previewCall('list_library_page', args) as Promise<Page>;
  const all = await previewCall('list_library', {}) as LibraryEntry[];
  return { previewCall, list, all };
}
afterEach(() => vi.unstubAllGlobals());

describe('preview library cursor pagination', () => {
  it('only adds pagination examples under its explicit flag and preserves existing examples', async () => {
    const normal = await setup('?preview');
    const expanded = await setup();
    expect(expanded.all.length).toBe(normal.all.length + 65);
    expect(expanded.all.slice(0, normal.all.length).map((entry) => entry.id)).toEqual(normal.all.map((entry) => entry.id));
    const empty = await setup('?preview&library-pagination-preview&empty');
    expect(await empty.list()).toEqual({ items: [], total: 0, nextCursor: null });
  });

  it.each(['newest', 'size', 'name'])('returns fixed batches without gaps or duplicates for %s', async (sort) => {
    const { list, all } = await setup();
    const expected = [...all].sort((a, b) => {
      const text = (x: string, y: string) => x < y ? -1 : x > y ? 1 : 0;
      return (sort === 'name' ? text(a.name, b.name) : sort === 'size' ? b.size - a.size : b.createdAt - a.createdAt) || text(a.id, b.id);
    });
    const first = await list({ sort, limit: 1 });
    expect(first.items).toHaveLength(60);
    expect(first.total).toBe(all.length);
    const second = await list({ sort, cursor: first.nextCursor });
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((entry) => entry.id)).toEqual(expected.map((entry) => entry.id));
  });

  it('matches utils search including tags and official/custom triggers, and reports filtered totals', async () => {
    const { list, all, previewCall } = await setup();
    await previewCall('update_entry', { id: all[0].id, edit: {
      tags: ['UniqueTag'], triggerWords: ['CustomKeyword'],
      version: { ...all[0].version, trainedWords: ['OfficialKeyword'] },
    } });
    for (const query of [' UNIQUETAG ', 'customkeyword', 'officialkeyword']) {
      expect((await list({ query })).items.map((entry) => entry.id)).toEqual([all[0].id]);
    }
    const args = { query: '预览', baseModel: all[0].baseModel, fileStatus: 'missing' };
    const expected = all.filter((entry) => matchesEntry(entry, args.query) && entry.baseModel === args.baseModel && entry.missing);
    const page = await list(args);
    expect(page.total).toBe(expected.length);
    expect(page.items.every((entry) => entry.missing)).toBe(true);
    expect((await list({ fileStatus: 'installed' })).total).toBe(all.filter((entry) => !entry.missing).length);
  });

  it('continues after a removed boundary rather than using an offset or requiring its existence', async () => {
    const { list, previewCall } = await setup();
    const first = await list();
    const expected = await list({ cursor: first.nextCursor });
    await previewCall('remove_entry', { id: first.items[59].id });
    await previewCall('remove_entry', { id: first.items[0].id });
    const next = await list({ cursor: first.nextCursor });
    expect(next.items.map((entry) => entry.id)).toEqual(expected.items.map((entry) => entry.id));
    expect(next.total).toBe(first.total - 2);
  });

  it('uses Rust scalar string ordering rather than locale collation or UTF-16 ordering', async () => {
    const { list, all, previewCall } = await setup();
    const names = ['a', 'Z', '\u{10000}', '\uE000'];
    for (let index = 0; index < names.length; index++) {
      await previewCall('update_entry', { id: all[index].id, edit: { name: names[index], tags: ['scalar-sort-test'] } });
    }
    expect((await list({ sort: 'name', query: 'scalar-sort-test' })).items.map((entry) => entry.name)).toEqual(['Z', 'a', '\uE000', '\u{10000}']);
  });

  it('rejects malformed cursors and reuse with different filters or sorting', async () => {
    const { list } = await setup();
    const first = await list();
    for (const cursor of ['', 'garbage', 'preview-library:null', 'preview-library:{}', 60]) {
      await expect(list({ cursor })).rejects.toThrow('游标');
    }
    for (const change of [{ query: 'x' }, { baseModel: 'x' }, { fileStatus: 'missing' }, { sort: 'size' }]) {
      await expect(list({ ...change, cursor: first.nextCursor })).rejects.toThrow('游标');
    }
    const decoded = JSON.parse(first.nextCursor!.slice('preview-library:'.length));
    for (const after of [null, { id: '', value: 1 }, { id: 'x', value: 'invalid' }]) {
      await expect(list({ cursor: `preview-library:${JSON.stringify({ ...decoded, after })}` })).rejects.toThrow('游标');
    }
    await expect(list({ sort: 'invalid' })).rejects.toThrow('排序');
    await expect(list({ fileStatus: 'invalid' })).rejects.toThrow('筛选');
  });

  it('keeps the independent 65-image preview fixture available alongside library pagination', async () => {
    const { previewCall } = await setup('?preview&library-pagination-preview&outputs-preview');
    const first = await previewCall('list_output_images', {}) as Page;
    const second = await previewCall('list_output_images', { cursor: first.nextCursor }) as Page;
    expect(first.total).toBe(65);
    expect(first.items).toHaveLength(60);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
  });
});
