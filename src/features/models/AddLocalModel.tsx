import { useCallback, useRef, useState, type FormEvent } from 'react';
import { FolderOpen, Loader2, Plus } from 'lucide-react';
import { ErrorBox, Modal } from '../../components/ui';
import { call, chooseLoraFile } from '../../lib/api';
import { parseTriggerWords } from '../../lib/utils';
import type { LibraryEntry } from '../../types/models';

export function AddLocalModel({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (entry: LibraryEntry) => void;
}) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [baseModel, setBaseModel] = useState('');
  const [triggerWords, setTriggerWords] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const close = useCallback(() => {
    if (!pending.current) onClose();
  }, [onClose]);
  const updatePath = (value: string) => {
    setPath(value);
    setName(
      (previous) =>
        previous ||
        value
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.[^.]+$/, '') ||
        '',
    );
  };
  const browse = async () => {
    setError('');
    try {
      const selected = await chooseLoraFile();
      if (selected) updatePath(selected);
    } catch (e) {
      setError(String(e));
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !path.trim() || !name.trim()) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const entry = await call<LibraryEntry>('add_local_model', {
        input: {
          path: path.trim(),
          name: name.trim(),
          baseModel,
          triggerWords: parseTriggerWords(triggerWords),
          tags: parseTriggerWords(tags),
          notes,
        },
      });
      onAdded(entry);
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title="添加本地 LoRA" onClose={close}>
      <form onSubmit={submit} aria-busy={busy}>
        <p className="field-help">选择已有的 LoRA 文件并填写资料。文件保留在原位置，无需绑定 ComfyUI。</p>
        <label className="field" htmlFor="local-model-path">
          模型文件
        </label>
        <div className="input-action">
          <input
            id="local-model-path"
            required
            value={path}
            disabled={busy}
            onChange={(e) => setPath(e.target.value)}
            onBlur={() => updatePath(path)}
            placeholder="选择文件，或粘贴完整文件路径"
          />
          <button type="button" disabled={busy} onClick={browse}>
            <FolderOpen size={17} />
            浏览
          </button>
        </div>
        <p className="field-help">支持 .safetensors、.ckpt、.pt、.bin。添加后可在详情中设置封面和配方。</p>
        <div className="settings-two">
          <label className="field">
            模型名称
            <input
              required
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder="用于模型库展示"
            />
          </label>
          <label className="field">
            基础模型（可选）
            <input
              value={baseModel}
              disabled={busy}
              onChange={(e) => setBaseModel(e.target.value)}
              placeholder="例如 SDXL 1.0、Flux.1 D"
            />
          </label>
        </div>
        <label className="field">
          自定义触发词（可选）
          <textarea
            rows={2}
            value={triggerWords}
            disabled={busy}
            onChange={(e) => setTriggerWords(e.target.value)}
            placeholder="每行一个，也可使用中英文逗号分隔"
          />
        </label>
        <label className="field">
          标签（可选）
          <input
            value={tags}
            disabled={busy}
            onChange={(e) => setTags(e.target.value)}
            placeholder="例如 人物、画风、服装，使用逗号分隔"
          />
        </label>
        <label className="field">
          备注（可选）
          <textarea
            rows={2}
            value={notes}
            disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="记录推荐权重或使用方法"
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
          <button type="submit" className="primary" disabled={busy || !path.trim() || !name.trim()}>
            {busy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />}
            {busy ? '正在读取模型…' : '添加到我的模型'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
