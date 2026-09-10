import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { ask, preview } from '../../lib/api';
import type { PromptDraft } from './composer';
import { presetStorageKey, readPresets, writePresets, type PromptPreset } from './presets';

export function PromptPresets({
  draft,
  onChange,
  notify,
}: {
  draft: PromptDraft;
  onChange: (draft: PromptDraft) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = preview ? `${presetStorageKey}.preview` : presetStorageKey;
  useEffect(() => {
    try {
      setPresets(readPresets(localStorage, key));
      setReady(true);
    } catch {
      setError('预设读取失败，请检查本地存储后重新打开页面。');
    }
  }, [key]);
  const current = presets.find((preset) => preset.id === selected);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notify(`预设操作失败：${String(error)}`, true);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      // Read before writing so another open window's presets are retained.
      const latest = readPresets(localStorage, key);
      const existing = latest.find((preset) => preset.name === trimmed);
      if (existing && !(await ask(`覆盖预设「${trimmed}」？`))) return;
      const preset: PromptPreset = {
        id: existing?.id ?? crypto.randomUUID(),
        name: trimmed,
        segments: draft.segments.map((segment) => ({ ...segment })),
      };
      const next = [...latest.filter((item) => item.id !== preset.id), preset];
      writePresets(localStorage, next, key);
      setPresets(next);
      setSelected(preset.id);
      setName(trimmed);
      notify('预设已保存');
    });
  return (
    <div className="prompt-presets">
      {error && <p role="alert">{error}</p>}
      <div className="prompt-preset-row">
        <select
          aria-label="选择预设"
          value={selected}
          disabled={!ready || busy}
          onChange={(event) => {
            setSelected(event.target.value);
            const item = presets.find((preset) => preset.id === event.target.value);
            setName(item?.name ?? '');
          }}
        >
          <option value="">{presets.length ? '选择已保存的预设' : '暂无预设'}</option>
          {presets.map((preset) => (
            <option value={preset.id} key={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <button
          disabled={!current || busy}
          onClick={() =>
            void run(async () => {
              const latest = readPresets(localStorage, key).find((preset) => preset.id === selected);
              if (!latest) throw new Error('此预设已被删除，请重新打开页面');
              if (draft.segments.length && !(await ask('加载预设将替换当前片段，确认继续？'))) return;
              onChange({
                segments: latest.segments.map((segment) => ({ ...segment, id: crypto.randomUUID() })),
              });
              notify('预设已加载');
            })
          }
        >
          加载
        </button>
        <button
          className="icon-button"
          aria-label="删除预设"
          disabled={!current || busy}
          onClick={() =>
            void run(async () => {
              if (!current || !(await ask(`删除预设「${current.name}」？`))) return;
              const next = readPresets(localStorage, key).filter((preset) => preset.id !== current.id);
              writePresets(localStorage, next, key);
              setPresets(next);
              setSelected('');
              setName('');
              notify('预设已删除');
            })
          }
        >
          <Trash2 size={16} />
        </button>
      </div>
      <form
        className="prompt-preset-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !busy && name.trim() && draft.segments.length) void save();
        }}
      >
        <input
          aria-label="预设名称"
          placeholder="输入预设名称"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!ready || busy}
        />
        <button disabled={!ready || busy || !name.trim() || !draft.segments.length} type="submit">
          <Save size={16} />
          保存预设
        </button>
      </form>
    </div>
  );
}
