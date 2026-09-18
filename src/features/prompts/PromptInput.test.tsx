import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0 }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useId: () => 'suggestions',
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [
      hooks.slots[index],
      (value: unknown) => {
        hooks.slots[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    return (hooks.slots[index] ??= { current: initial });
  },
}));
const suggestions = vi.hoisted(() => ({
  matches: [
    { id: 'a', text: 'cat', translation: '猫', category: '主体', aliases: [], scope: 'both', enabled: true },
    { id: 'b', text: 'car', translation: '车', category: '主体', aliases: [], scope: 'both', enabled: true },
  ],
}));
vi.mock('./usePromptSearch', () => ({ useTermSuggestions: () => suggestions.matches }));
import { PromptInput } from './PromptInput';

type InputProps = React.ComponentProps<'textarea'>;
function setup() {
  const onChange = vi.fn();
  let value = 'ca';
  const render = () => {
    hooks.index = 0;
    const tree = PromptInput({ id: 'x', label: '片段', value, kind: 'positive', search: null, onChange });
    return (tree.props.children[0] as ReactElement<InputProps>).props;
  };
  let input = render();
  const event = { currentTarget: { selectionStart: 2 }, target: { value, selectionStart: 2 } };
  input.onFocus!(event as never);
  input = render();
  return {
    onChange,
    key(key: string, overrides = {}) {
      const e = { key, nativeEvent: {}, keyCode: 0, preventDefault: vi.fn(), ...overrides };
      input.onKeyDown!(e as never);
      input = render();
      return e;
    },
    change() {
      value = 'cat';
      input.onChange!({ target: { value, selectionStart: 3 } } as never);
      input = render();
    },
    blur() {
      input.onBlur!(event as never);
      input.onFocus!(event as never);
      input = render();
    },
    compose() {
      input.onCompositionStart!(event as never);
      input = render();
    },
    refresh() {
      input = render();
    },
  };
}
beforeEach(() => {
  hooks.slots = [];
  hooks.index = 0;
  vi.stubGlobal('document', { getElementById: () => null });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
});
describe('PromptInput keyboard completion', () => {
  it('leaves Tab native until an arrow explicitly selects a suggestion', () => {
    const input = setup();
    expect(input.key('Tab').preventDefault).not.toHaveBeenCalled();
    expect(input.onChange).not.toHaveBeenCalled();
    input.key('ArrowDown');
    expect(input.key('Tab').preventDefault).toHaveBeenCalled();
    expect(input.onChange).toHaveBeenCalledWith('car, ');
  });
  it('preserves Enter completion and Shift+Tab focus movement', () => {
    const input = setup();
    input.key('ArrowUp');
    expect(input.key('Tab', { shiftKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(input.key('Enter').preventDefault).toHaveBeenCalled();
    expect(input.onChange).toHaveBeenCalled();
  });
  it.each(['change', 'blur', 'refresh'] as const)('resets Tab consent after %s', (action) => {
    const input = setup();
    input.key('ArrowDown');
    if (action === 'refresh') suggestions.matches = [...suggestions.matches];
    input[action]();
    expect(input.key('Tab').preventDefault).not.toHaveBeenCalled();
  });
  it('Escape dismisses without completion', () => {
    const input = setup();
    input.key('ArrowDown');
    input.key('Escape');
    expect(input.key('Tab').preventDefault).not.toHaveBeenCalled();
    expect(input.onChange).not.toHaveBeenCalled();
  });
  it('does not intercept IME composition or modified Enter', () => {
    const input = setup();
    expect(input.key('Enter', { shiftKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(input.key('Enter', { nativeEvent: { isComposing: true } }).preventDefault).not.toHaveBeenCalled();
    expect(input.key('Enter', { keyCode: 229 }).preventDefault).not.toHaveBeenCalled();
    input.compose();
    expect(input.key('ArrowDown').preventDefault).not.toHaveBeenCalled();
    expect(input.key('Enter').preventDefault).not.toHaveBeenCalled();
    expect(input.onChange).not.toHaveBeenCalled();
  });
});
