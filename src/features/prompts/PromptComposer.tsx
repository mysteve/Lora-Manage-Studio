import { useEffect, useRef, useState } from 'react';
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { ask, copy } from '../../lib/api';
import { composePrompt, moveSegment, type PromptDraft, type PromptSegment } from './composer';
import './prompts.css';
import { PromptPresets } from './PromptPresets';

function DeleteSegment({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return (
    <div
      className="prompt-delete"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="prompt-delete-trigger icon-button"
        aria-label={`删除${label}`}
        title="删除片段"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Trash2 size={16} />
      </button>
      {open && (
        <div className="prompt-delete-confirm" role="group" aria-label={`确认删除${label}`}>
          <p>确定删除此片段？</p>
          <div>
            <button onClick={close}>取消</button>
            <button className="danger" onClick={onDelete}>确认删除</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PromptComposer({
  draft,
  onChange,
  notify,
}: {
  draft: PromptDraft;
  onChange: (draft: PromptDraft) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [kind, setKind] = useState<PromptSegment['kind']>('positive');
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const result = composePrompt(draft);
  const visible = draft.segments.filter((segment) => segment.kind === kind);
  useEffect(() => {
    if (focusId) {
      root.current?.querySelector<HTMLTextAreaElement>(`[data-editor="${focusId}"]`)?.focus();
      setFocusId(null);
    }
  }, [focusId]);
  const update = (id: string, changes: Partial<PromptSegment>) =>
    onChange({
      segments: draft.segments.map((segment) => (segment.id === id ? { ...segment, ...changes } : segment)),
    });
  const add = () => {
    const segment: PromptSegment = { id: crypto.randomUUID(), name: '', text: '', enabled: true, kind };
    const segments = [...draft.segments];
    segments.push(segment);
    onChange({ segments });
    setFocusId(segment.id);
  };
  const reorder = (source: string, target: string, after: boolean) => {
    onChange({ segments: moveSegment(draft.segments, source, target, after) });
    setAnnouncement('片段顺序已更新');
  };
  const step = (index: number, direction: number) => {
    const target = visible[index + direction];
    if (target) reorder(visible[index].id, target.id, direction > 0);
  };
  const copyResult = async (value: string, label: string) => {
    try {
      await copy(value);
      notify(`${label}已复制`);
    } catch (error) {
      notify(`复制失败：${String(error)}`, true);
    }
  };
  return (
    <div className="prompt-composer" ref={root}>
      <span className="prompt-sr-only" role="status">
        {announcement}
      </span>
      <section className="prompt-panel prompt-editor" aria-label="提示词片段">
        <div className="prompt-editor-header">
          <div className="prompt-tabs" role="tablist" aria-label="提示词分组">
            {(['positive', 'negative'] as const).map((value) => (
              <button
                key={value}
                id={`prompt-tab-${value}`}
                role="tab"
                aria-selected={kind === value}
                aria-controls="prompt-segments"
                tabIndex={kind === value ? 0 : -1}
                onClick={() => setKind(value)}
                onKeyDown={(event) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const next =
                      event.key === 'Home'
                        ? 'positive'
                        : event.key === 'End'
                          ? 'negative'
                          : kind === 'positive'
                            ? 'negative'
                            : 'positive';
                    setKind(next);
                    document.getElementById(`prompt-tab-${next}`)?.focus();
                  }
                }}
              >
                {value === 'positive' ? '正向提示词' : '负向提示词'}
                <span>{draft.segments.filter((segment) => segment.kind === value).length}</span>
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => add()}>
            <Plus size={16} />
            添加片段
          </button>
        </div>
        <div id="prompt-segments" role="tabpanel" aria-labelledby={`prompt-tab-${kind}`}>
          {!visible.length && (
            <div className="prompt-empty">
              <p>还没有{kind === 'positive' ? '正向' : '负向'}提示词</p>
              <small>添加主体、环境、光线等片段，自由组合。</small>
            </div>
          )}
          {visible.map((segment, index) => (
            <div key={segment.id}>
              <article
                className={`prompt-segment${!segment.enabled ? ' is-disabled' : ''}${dragged === segment.id ? ' is-dragging' : ''}${drop?.id === segment.id ? (drop.after ? ' drop-after' : ' drop-before') : ''}`}
                onDragOver={(event) => {
                  if (!dragged || dragged === segment.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const rect = event.currentTarget.getBoundingClientRect();
                  setDrop({ id: segment.id, after: event.clientY > rect.top + rect.height / 2 });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged && drop?.id === segment.id) reorder(dragged, segment.id, drop.after);
                  setDragged(null);
                  setDrop(null);
                }}
              >
                <button
                  className="prompt-grip icon-button"
                  draggable
                  aria-label={`拖动片段 ${index + 1}，或按上下方向键排序`}
                  title="拖动排序，也可按上下方向键"
                  onDragStart={(event) => {
                    setDragged(segment.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', segment.id);
                    const row = event.currentTarget.closest('article');
                    if (row) event.dataTransfer.setDragImage(row, 20, 20);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                    setDrop(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      step(index, event.key === 'ArrowUp' ? -1 : 1);
                    }
                  }}
                >
                  <GripVertical size={19} />
                </button>
                <span className="prompt-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="prompt-segment-body">
                  <div className="prompt-row">
                    <input
                      className="prompt-name"
                      aria-label={`片段 ${index + 1} 名称`}
                      value={segment.name ?? ''}
                      placeholder={`片段 ${index + 1}`}
                      onChange={(event) => update(segment.id, { name: event.target.value })}
                    />
                    <div className="prompt-actions">
                      <button
                        className="prompt-toggle"
                        role="switch"
                        aria-checked={segment.enabled}
                        aria-label={`启用片段 ${index + 1}`}
                        onClick={() => update(segment.id, { enabled: !segment.enabled })}
                      >
                        <span />
                      </button>
                      <DeleteSegment
                        label={`片段 ${index + 1}`}
                        onDelete={() => {
                          onChange({ segments: draft.segments.filter((item) => item.id !== segment.id) });
                          setAnnouncement('片段已删除');
                          const next = visible[index + 1] ?? visible[index - 1];
                          if (next) setFocusId(next.id);
                          else document.getElementById(`prompt-tab-${kind}`)?.focus();
                        }}
                      />
                    </div>
                  </div>
                  <textarea
                    data-editor={segment.id}
                    aria-label={`片段 ${index + 1} 内容`}
                    rows={2}
                    value={segment.text}
                    placeholder="输入或粘贴提示词…"
                    onChange={(event) => update(segment.id, { text: event.target.value })}
                  />
                </div>
              </article>
            </div>
          ))}
        </div>
        <footer className="prompt-footer">
          <button
            className="text-button"
            disabled={!draft.segments.length}
            onClick={async () => {
              if (await ask('清空所有正向和负向提示词片段？')) onChange({ segments: [] });
            }}
          >
            清空组合
          </button>
        </footer>
      </section>
      <section className="prompt-panel prompt-results" aria-label="组合结果">
        <div className="prompt-results-header">
          <h2>组合结果</h2>
        </div>
        <PromptPresets draft={draft} onChange={onChange} notify={notify} />
        {(['positive', 'negative'] as const).map((value) => (
          <div className="prompt-result" key={value}>
            <div className="prompt-row">
              <h2>{value === 'positive' ? '正向' : '负向'}提示词</h2>
              <button
                className={value === 'positive' ? 'primary' : ''}
                disabled={!result[value]}
                onClick={() =>
                  void copyResult(result[value], value === 'positive' ? '正向提示词' : '负向提示词')
                }
              >
                <Copy size={15} />
                复制{value === 'positive' ? '正向' : '负向'}
              </button>
            </div>
            <textarea
              aria-label={value === 'positive' ? '正向组合结果' : '负向组合结果'}
              readOnly
              rows={value === 'positive' ? 9 : 6}
              value={result[value]}
              placeholder="添加并启用片段后，结果会显示在这里。"
            />
          </div>
        ))}
      </section>
    </div>
  );
}
