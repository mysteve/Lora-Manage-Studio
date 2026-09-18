import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
// Minimal hook runner: exercise state/effect lifetimes without a browser dependency.
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as (() => void)[] }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: any) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      hooks.slots[index],
      (next: any) => {
        hooks.slots[index] = typeof next === 'function' ? next(hooks.slots[index]) : next;
      },
    ];
  },
  useRef: (value: any) => {
    const index = hooks.cursor++;
    return (hooks.slots[index] ??= { current: value });
  },
  useMemo: (fn: () => unknown) => {
    hooks.cursor++;
    return fn();
  },
  useCallback: (fn: any, deps: any[]) => {
    const index = hooks.cursor++;
    const old = hooks.slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
      hooks.slots[index] = { deps, value: fn };
    }
    return hooks.slots[index].value;
  },
  useEffect: (fn: () => void | (() => void), deps: any[]) => {
    const index = hooks.cursor++;
    const old = hooks.slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
      hooks.effects.push(() => {
        old?.cleanup?.();
        hooks.slots[index] = { deps, cleanup: fn() };
      });
    }
  },
}));
vi.mock('../../lib/api', () => ({ call: vi.fn(), copy: vi.fn(async () => {}), ask: vi.fn() }));
vi.mock('../../components/ui', () => ({ Modal: () => null, Badge: () => null }));
vi.mock('./ImageGallery', () => ({ ImageGallery: () => null }));
import { call, copy, ask } from '../../lib/api';
import { Detail } from './Detail';
import { ImageGallery } from './ImageGallery';
import type { LibraryEntry, ModelVersion } from '../../types/models';

function render(component: () => ReactElement) {
  hooks.cursor = 0;
  const tree = component();
  hooks.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function nodes(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function text(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  return text(node?.props?.children ?? '');
}
function button(tree: ReactElement, label: string) {
  const result = nodes(tree).find(
    (n) => n.type === 'button' && (n.props['aria-label'] === label || text(n) === label),
  );
  expect(result, label).toBeDefined();
  return result;
}
const version: ModelVersion = {
  id: 10,
  modelId: 1,
  name: 'v1',
  baseModel: 'SDXL',
  description: '',
  trainedWords: ['official one', 'official two'],
  images: [],
  availability: '',
  files: [
    {
      id: 20,
      name: 'test.safetensors',
      sizeKb: 1,
      downloadUrl: 'https://example.com/model',
      sha256: '',
      format: 'SafeTensor',
      primary: true,
    },
  ],
};
const entry: LibraryEntry = {
  id: 'local',
  path: 'C:/test/model.safetensors',
  size: 1024,
  modified: 0,
  sha256: '',
  name: 'Test',
  triggerWords: ['private custom word'],
  triggerPreviews: [],
  author: '',
  baseModel: 'SDXL',
  tags: [],
  notes: '',
  favorite: false,
  missing: false,
  verified: false,
  cover: { url: '', localPath: '' },
  customCover: false,
  modelId: 1,
  version,
  createdAt: 0,
};
function props(local = true) {
  return {
    selection: {
      model: {
        id: 1,
        name: 'Test',
        author: '',
        description: '',
        tags: [],
        downloads: 0,
        versions: [version, { ...version, id: 11, trainedWords: ['next word'] }],
      },
      versionId: 10,
      entryId: local ? entry.id : undefined,
      recipeId: 'legacy-recipe',
    },
    library: local ? [entry] : [],
    settings: {
      comfyRoot: 'C:/test',
      loraDir: '',
      outputDir: '',
      setupDismissed: true,
      proxyMode: 'system',
      proxyUrl: '',
      safeContent: true,
    },
    notify: vi.fn(),
    onDirtyChange: vi.fn(),
    onClose: vi.fn(),
    onChanged: vi.fn(async () => {}),
    onNeedSettings: vi.fn(),
    onDownloaded: vi.fn(async () => {}),
  };
}
beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  hooks.cursor = 0;
  vi.clearAllMocks();
});
describe('model detail official trigger words', () => {
  it('shows only official words by default and copies individual or all official words without loading recipes', async () => {
    const p = props();
    let tree = render(() => Detail(p));
    expect(text(tree)).toContain('official one');
    for (const removed of [
      '组合预览',
      '我的配方',
      '创作配方',
      '自定义触发词',
      'private custom word',
      '保存配方',
      '正向提示词',
      '模型权重',
    ])
      expect(text(tree)).not.toContain(removed);
    expect(nodes(tree).some((n) => n.type === ImageGallery)).toBe(true);
    button(tree, '复制触发词 official one').props.onClick();
    await Promise.resolve();
    expect(copy).toHaveBeenCalledWith('official one');
    await button(tree, '复制官方触发词').props.onClick();
    expect(copy).toHaveBeenLastCalledWith('official one, official two');
    button(tree, '模型信息').props.onClick();
    tree = render(() => Detail(p));
    expect(text(tree)).toContain('文件与来源');
    button(tree, '返回模型库').props.onClick();
    expect(p.onClose).toHaveBeenCalledOnce();
    expect(call).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    expect(p.onDirtyChange).not.toHaveBeenCalled();
  });
  it('switches remote versions without recipe requests and retains downloading', async () => {
    const p = props(false);
    let tree = render(() => Detail(p));
    nodes(tree)
      .find((n) => n.props?.['aria-label'] === '模型版本')
      .props.onChange({ target: { value: '11' } });
    tree = render(() => Detail(p));
    expect(text(tree)).toContain('next word');
    expect(text(tree)).not.toContain('official one');
    expect(call).not.toHaveBeenCalled();
    await button(tree, '下载并安装').props.onClick();
    expect(call).toHaveBeenCalledExactlyOnceWith('enqueue_download', {
      modelId: 1,
      versionId: 11,
      fileId: 20,
    });
    expect(p.onDownloaded).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
  });
  it('shows the empty official words message rather than falling back to custom words', () => {
    const p = props();
    p.library = [{ ...entry, version: { ...version, trainedWords: [] } }];
    const tree = render(() => Detail(p));
    expect(text(tree)).toContain('作者未提供触发词');
    expect(text(tree)).not.toContain('private custom word');
    expect(button(tree, '复制官方触发词').props.disabled).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });
  it('removes the custom word editor but preserves stored words when saving other metadata', async () => {
    const p = props();
    let tree = render(() => Detail(p));
    button(tree, '编辑本地资料').props.onClick();
    tree = render(() => Detail(p));
    const editor = nodes(tree).find((n) => typeof n.type === 'function' && n.props?.entry === entry);
    expect(editor).toBeDefined();
    hooks.slots = [];
    hooks.effects = [];
    let form = render(() => editor.type(editor.props));
    expect(text(form)).not.toContain('自定义触发词');
    nodes(form)
      .find((n) => n.type === 'input' && n.props.value === 'Test')
      .props.onChange({ target: { value: 'New alias' } });
    form = render(() => editor.type(editor.props));
    await button(form, '保存资料').props.onClick();
    expect(call).toHaveBeenCalledExactlyOnceWith('update_entry', {
      id: entry.id,
      edit: {
        name: 'New alias',
        triggerWords: entry.triggerWords,
        baseModel: entry.baseModel,
        tags: [''],
        notes: '',
        favorite: false,
      },
    });
    expect(entry.triggerWords).toEqual(['private custom word']);
    expect(p.onChanged).toHaveBeenCalledOnce();
  });
});
