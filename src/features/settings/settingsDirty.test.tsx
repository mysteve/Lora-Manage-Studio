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
vi.mock('../../lib/api', () => ({
  call: vi.fn(),
  ask: vi.fn(async () => true),
  desktop: true,
  chooseDirectory: vi.fn(),
}));
vi.mock('../../components/Motion', () => ({ StateIcon: () => null }));
vi.mock('../../components/ui', () => ({ Modal: () => null, Loading: () => null, Badge: () => null }));
import { call } from '../../lib/api';
import { AiAccess } from './AiAccess';
import { ApiAccess } from './ApiAccess';
import { SettingsPanel } from './SettingsPanel';

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
  return nodes(tree).find((node) => node.type === 'button' && text(node).includes(label));
}
function dispose() {
  hooks.slots.forEach((slot) => slot?.cleanup?.());
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: string) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const config = { provider: 'custom', baseUrl: 'http://localhost:1234', model: 'original' };
beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  hooks.cursor = 0;
  vi.clearAllMocks();
});

describe('AI initialization and dirty state', () => {
  it('disables the entire AI editor while a key save is pending', async () => {
    const pending = deferred<boolean>();
    vi.mocked(call).mockImplementation(
      async (command) =>
        (command === 'get_ai_config'
          ? config
          : command === 'save_ai_token'
            ? await pending.promise
            : false) as never,
    );
    render(() => AiAccess());
    await flush();
    let tree = render(() => AiAccess());
    nodes(tree)
      .find((n) => n.type === 'input' && n.props.type === 'password')
      .props.onChange({ target: { value: 'secret' } });
    tree = render(() => AiAccess());
    button(tree, '保存 AI 密钥').props.onClick();
    tree = render(() => AiAccess());
    expect(nodes(tree).find((n) => n.type === 'fieldset').props.disabled).toBe(true);
    pending.resolve(true);
    await flush();
    tree = render(() => AiAccess());
    expect(nodes(tree).find((n) => n.type === 'fieldset').props.disabled).toBe(false);
    expect(nodes(tree).find((n) => n.type === 'input' && n.props.type === 'password').props.value).toBe('');
  });
  it('retries outside the disabled fieldset, tracks model and sensitive drafts, clears after save', async () => {
    const dirty = vi.fn();
    vi.mocked(call).mockImplementation(async (command) => {
      if (command === 'get_ai_config') return config as never;
      if (command === 'save_ai_config') return { ...config, model: 'edited' } as never;
      return false as never;
    });
    vi.mocked(call).mockRejectedValueOnce('read failed');
    const component = () => <AiAccess onDirtyChange={dirty} />;
    render(() => AiAccess(component().props));
    await flush();
    let tree = render(() => AiAccess(component().props));
    const retry = button(tree, '重新读取 AI 配置');
    expect(retry.props.disabled).toBe(false);
    const fieldset = nodes(tree).find((n) => n.type === 'fieldset');
    expect(fieldset.props.disabled).toBe(true);
    expect(nodes(fieldset)).not.toContain(retry);
    retry.props.onClick();
    await flush();
    tree = render(() => AiAccess(component().props));
    const model = nodes(tree).find((n) => n.type === 'input' && n.props.list === 'ai-model-list');
    model.props.onChange({ target: { value: 'edited' } });
    tree = render(() => AiAccess(component().props));
    expect(dirty).toHaveBeenLastCalledWith(true);
    button(tree, '保存 AI 配置').props.onClick();
    tree = render(() => AiAccess(component().props));
    expect(nodes(tree).find((n) => n.type === 'fieldset').props.disabled).toBe(true);
    await flush();
    tree = render(() => AiAccess(component().props));
    expect(dirty).toHaveBeenLastCalledWith(false);
    nodes(tree)
      .find((n) => n.type === 'input' && n.props.type === 'password')
      .props.onChange({ target: { value: ' ' } });
    render(() => AiAccess(component().props));
    expect(dirty).toHaveBeenLastCalledWith(true);
    dispose();
    expect(dirty).toHaveBeenLastCalledWith(false);
  });

  it('ignores an initialization response from the previous effect lifetime', async () => {
    const old = deferred<typeof config>();
    vi.mocked(call)
      .mockImplementation(async () => config as never)
      .mockReturnValueOnce(old.promise);
    render(() => AiAccess());
    dispose();
    // StrictMode replays effects with the same refs/state.
    hooks.slots.forEach((slot, index) => {
      if (slot?.deps) delete hooks.slots[index];
    });
    render(() => AiAccess());
    await flush();
    old.resolve({ ...config, model: 'stale' });
    await flush();
    const tree = render(() => AiAccess());
    expect(nodes(tree).find((n) => n.props?.list === 'ai-model-list').props.value).toBe('original');
  });
});

describe('settings dirty aggregation', () => {
  it('preserves dirty fields across tabs and clears only the saved tab', async () => {
    const settings = {
      comfyRoot: 'C:/ComfyUI',
      outputDir: '',
      loraDir: '',
      setupDismissed: true,
      proxyMode: 'system',
      proxyUrl: '',
      safeContent: true,
    };
    vi.mocked(call).mockImplementation(
      async (command, args: any) =>
        (command === 'get_settings' ? settings : command === 'save_settings' ? args.settings : '') as never,
    );
    const dirty = vi.fn();
    const props = {
      settings,
      onDirtyChange: dirty,
      notify: vi.fn(),
      onClose: vi.fn(),
      onSaved: vi.fn(async () => {}),
    };
    let tree = render(() => SettingsPanel(props));
    nodes(tree)
      .find((n) => n.type === 'input' && n.props.value === 'C:/ComfyUI')
      .props.onChange({ target: { value: 'D:/ComfyUI' } });
    nodes(tree)
      .find((n) => n.type === 'select')
      .props.onChange({ target: { value: 'none' } });
    tree = render(() => SettingsPanel(props));
    expect(dirty).toHaveBeenLastCalledWith(true);
    button(tree, '网站访问').props.onClick();
    tree = render(() => SettingsPanel(props));
    button(tree, '保存网站访问设置').props.onClick();
    tree = render(() => SettingsPanel(props));
    expect(
      nodes(tree)
        .filter((n) => n.type === 'input' || n.type === 'select')
        .every((n) => n.props.disabled),
    ).toBe(true);
    expect(
      nodes(tree)
        .filter((n) => n.type === 'button' && text(n) === '浏览')
        .every((n) => n.props.disabled),
    ).toBe(true);
    await flush();
    tree = render(() => SettingsPanel(props));
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(nodes(tree).some((n) => n.type === 'input' && n.props.value === 'D:/ComfyUI')).toBe(true);
    button(tree, '保存工作空间设置').props.onClick();
    await flush();
    tree = render(() => SettingsPanel(props));
    expect(dirty).toHaveBeenLastCalledWith(false);
    nodes(tree)
      .find((n) => n.type === AiAccess)
      .props.onDirtyChange(true);
    tree = render(() => SettingsPanel(props));
    expect(dirty).toHaveBeenLastCalledWith(true);
    nodes(tree)
      .find((n) => n.type === AiAccess)
      .props.onDirtyChange(false);
    nodes(tree)
      .find((n) => n.type === ApiAccess)
      .props.onDirtyChange(true);
    render(() => SettingsPanel(props));
    expect(dirty).toHaveBeenLastCalledWith(true);
    dispose();
    expect(dirty).toHaveBeenLastCalledWith(false);
  });

  it('tracks the website key until successful save, including whitespace input', async () => {
    vi.mocked(call).mockResolvedValue({ hasToken: false, oauthConfigured: false });
    const dirty = vi.fn();
    const props = { notify: vi.fn(), onDirtyChange: dirty };
    let tree = render(() => ApiAccess(props));
    nodes(tree)
      .find((n) => n.props?.id === 'api-token')
      .props.onChange({ target: { value: 'secret' } });
    tree = render(() => ApiAccess(props));
    expect(dirty).toHaveBeenLastCalledWith(true);
    button(tree, '保存密钥').props.onClick();
    tree = render(() => ApiAccess(props));
    expect(nodes(tree).find((n) => n.props?.id === 'api-token').props.disabled).toBe(true);
    await flush();
    tree = render(() => ApiAccess(props));
    expect(dirty).toHaveBeenLastCalledWith(false);
    nodes(tree)
      .find((n) => n.props?.id === 'api-token')
      .props.onChange({ target: { value: ' ' } });
    render(() => ApiAccess(props));
    expect(dirty).toHaveBeenLastCalledWith(true);
    dispose();
    expect(dirty).toHaveBeenLastCalledWith(false);
  });
});
