import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy, ImagePlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, CoverImage, Empty, ErrorBox, Modal } from '../../components/ui';
import { ask, call, chooseImage, copy } from '../../lib/api';
import { modelTriggerWords, parseTriggerWords } from '../../lib/utils';
import type { LibraryEntry, TriggerPreview } from '../../types/models';
import './TriggerPreviews.css';

type Notify = (message: string, error?: boolean) => void;
export function TriggerPreviews({
  entry,
  onChanged,
  notify,
}: {
  entry: LibraryEntry;
  onChanged: () => Promise<void>;
  notify: Notify;
}) {
  const [groups, setGroups] = useState(entry.triggerPreviews ?? []);
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState<TriggerPreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => setGroups(entry.triggerPreviews ?? []), [entry.triggerPreviews]);
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0];
  const availableWords = parseTriggerWords(
    [
      ...modelTriggerWords(entry, entry.version ?? undefined),
      ...groups.flatMap((group) => group.triggerWords),
    ].join('\n'),
  );
  const updated = (result: LibraryEntry) => {
    setGroups(result.triggerPreviews);
    void onChanged().catch((e) => notify(`组合已保存，刷新模型资料失败：${String(e)}`, true));
  };
  const remove = async () => {
    if (!selected || busy) return;
    if (!(await ask(`删除组合 ${selected.name} 及其预览关联？其他组合和模型文件会保留。`))) return;
    setBusy(true);
    try {
      updated(
        await call<LibraryEntry>('delete_trigger_preview', { entryId: entry.id, previewId: selected.id }),
      );
      notify('组合已删除');
    } catch (e) {
      notify(String(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="trigger-previews" aria-label="触发词组合预览">
      <div className="preview-heading">
        <div>
          <h2>触发词组合</h2>
          <p>每套词搭配一张效果图，点击组合查看差异。</p>
        </div>
        <button className="primary" disabled={busy} onClick={() => setEditing(null)}>
          <Plus size={16} />
          新建组合
        </button>
      </div>
      {selected ? (
        <>
          <div className="preview-choices" role="group" aria-label="选择触发词组合">
            {groups.map((group) => (
              <button
                key={group.id}
                className={`preview-choice ${selected.id === group.id ? 'selected' : ''}`}
                aria-pressed={selected.id === group.id}
                onClick={() => setSelectedId(group.id)}
              >
                <CoverImage cover={group.image} alt={`${group.name} 缩略图`} />
                <span>
                  <strong>{group.name}</strong>
                  <small>{group.triggerWords.join(' + ')}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="preview-stage" aria-live="polite">
            {selected.image.localPath || selected.image.url ? (
              <CoverImage
                key={selected.id + selected.image.localPath + selected.image.url}
                className="combination-image"
                cover={selected.image}
                alt={`${selected.name} 效果预览`}
              />
            ) : (
              <div className="preview-no-image">
                <ImagePlus size={32} />
                <strong>这套组合还没有效果图</strong>
                <button onClick={() => setEditing(selected)}>添加预览图</button>
              </div>
            )}
            <div className="preview-caption">
              <strong>{selected.name}</strong>
              <div className="tag-list">
                {selected.triggerWords.map((word) => (
                  <Badge key={word} tone="accent">
                    {word}
                  </Badge>
                ))}
              </div>
              {selected.notes && <p>{selected.notes}</p>}
            </div>
          </div>
          <div className="preview-actions">
            <button disabled={busy} onClick={() => setEditing(selected)}>
              <Pencil size={16} />
              编辑组合
            </button>
            <button className="icon-button danger" aria-label="删除当前组合" disabled={busy} onClick={remove}>
              <Trash2 size={16} />
            </button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await copy(selected.triggerWords.join(', '));
                  notify('已复制当前组合的触发词');
                } catch (e) {
                  notify(String(e), true);
                }
              }}
            >
              <Copy size={16} />
              复制这组触发词
            </button>
          </div>
          <p className="field-help">预览展示你保存的效果图；复制时只包含当前组合的触发词。</p>
        </>
      ) : (
        <Empty
          icon={<ImagePlus size={30} />}
          title="为不同搭配保存效果图"
          description="例如：词 A 保存一张图，词 A + 词 B 再保存一张图。添加组合后即可切换比较。"
          action={
            <button onClick={() => setEditing(null)}>
              <Plus size={16} />
              添加第一套组合
            </button>
          }
        />
      )}
      {editing !== undefined && (
        <PreviewEditor
          entryId={entry.id}
          initial={editing}
          availableWords={availableWords}
          onClose={() => setEditing(undefined)}
          onSaved={(result) => {
            updated(result);
            setSelectedId(editing?.id ?? result.triggerPreviews[result.triggerPreviews.length - 1].id);
            setEditing(undefined);
            notify('触发词组合和预览已保存');
          }}
        />
      )}
    </section>
  );
}

function PreviewEditor({
  entryId,
  initial,
  availableWords,
  onClose,
  onSaved,
}: {
  entryId: string;
  initial: TriggerPreview | null;
  availableWords: string[];
  onClose: () => void;
  onSaved: (entry: LibraryEntry) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [words, setWords] = useState(initial?.triggerWords.join(', ') ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [imagePath, setImagePath] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const changed = useRef(false);
  changed.current =
    name !== (initial?.name ?? '') ||
    words !== (initial?.triggerWords.join(', ') ?? '') ||
    notes !== (initial?.notes ?? '') ||
    !!imagePath ||
    removeImage;
  const close = useCallback(async () => {
    if (!pending.current && (!changed.current || (await ask('组合有未保存的修改，确认放弃？')))) onClose();
  }, [onClose]);
  const selectedWords = parseTriggerWords(words);
  const toggle = (word: string) => {
    const exists = selectedWords.some((item) => item.toLowerCase() === word.toLowerCase());
    setWords(
      (exists
        ? selectedWords.filter((item) => item.toLowerCase() !== word.toLowerCase())
        : [...selectedWords, word]
      ).join(', '),
    );
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !selectedWords.length) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await call<LibraryEntry>('save_trigger_preview', {
        entryId,
        input: {
          id: initial?.id ?? '',
          name,
          triggerWords: selectedWords,
          notes,
          imagePath: imagePath.trim() || null,
          removeImage,
        },
      });
      onSaved(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title={initial ? '编辑触发词组合' : '新建触发词组合'} onClose={close}>
      <form onSubmit={submit} aria-busy={busy}>
        <label className="field">
          组合名称（可选）
          <input
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如 单独画风、画风 + 服装"
          />
        </label>
        {!!availableWords.length && (
          <div className="preview-word-picker">
            <span>点击已有触发词来搭配</span>
            <div className="tag-list">
              {availableWords.map((word) => (
                <button
                  type="button"
                  key={word}
                  disabled={busy}
                  aria-pressed={selectedWords.some((item) => item.toLowerCase() === word.toLowerCase())}
                  onClick={() => toggle(word)}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="field">
          这套组合的触发词
          <textarea
            required
            rows={3}
            disabled={busy}
            value={words}
            onChange={(e) => setWords(e.target.value)}
            placeholder="例如 styleA，outfitB；每行一个或用逗号分隔"
          />
        </label>
        <p className="field-help">可以只填一个词，也可以组合多个词。切换组合时会显示它对应的预览图。</p>
        <label className="field" htmlFor="preview-image-path">
          效果图（可选）
        </label>
        <div className="input-action">
          <input
            id="preview-image-path"
            value={imagePath}
            disabled={busy}
            placeholder={
              initial?.image.localPath && !removeImage
                ? '已保存效果图，留空保留原图'
                : '选择图片，或粘贴完整文件路径'
            }
            onChange={(e) => {
              setImagePath(e.target.value);
              setRemoveImage(false);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              try {
                const path = await chooseImage('选择组合效果图');
                if (path) {
                  setImagePath(path);
                  setRemoveImage(false);
                }
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <ImagePlus size={16} />
            选择图片
          </button>
        </div>
        <p className="field-help">支持 PNG、JPEG、WebP，最大 20 MB。保存时会复制图片，原图移动后仍能查看。</p>
        {initial && (initial.image.localPath || initial.image.url) && !removeImage && !imagePath && (
          <button type="button" className="text-button" disabled={busy} onClick={() => setRemoveImage(true)}>
            移除这套组合的预览图
          </button>
        )}
        {removeImage && <p className="field-help">保存后移除预览图，触发词组合会保留。</p>}
        <label className="field">
          效果备注（可选）
          <textarea
            rows={2}
            value={notes}
            disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="记录权重、基础模型或对比时的生成参数"
          />
        </label>
        {error && (
          <div role="alert">
            <ErrorBox message={error} />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={close}>
            取消
          </button>
          <button type="submit" className="primary" disabled={busy || !selectedWords.length}>
            {busy && <Loader2 size={16} className="spin" />}
            {busy ? '正在保存…' : '保存组合'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
