import { useEffect, useState } from 'react';
import { FolderOpen, KeyRound, Loader2, Save } from 'lucide-react';
import { call, chooseDirectory } from '../../lib/api';
import { Modal } from '../../components/ui';
import { ApiAccess } from './ApiAccess';
import type { Settings } from '../../types/models';
export function SettingsPanel({
  settings,
  onClose,
  onSaved,
  notify,
}: {
  settings: Settings;
  onClose: () => void;
  onSaved: (s: Settings) => Promise<void>;
  notify: (s: string, error?: boolean) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState('');
  const [location, setLocation] = useState('');
  useEffect(() => {
    void call<string>('data_location')
      .then(setLocation)
      .catch(() => {});
  }, []);
  const patch = (s: Partial<Settings>) => setDraft((prev) => ({ ...prev, ...s }));
  const perform = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      notify(String(e), true);
    } finally {
      setBusy('');
    }
  };
  return (
    <Modal title="设置" onClose={onClose} wide className="settings-modal">
      <div className="settings-content">
        <section>
          <h2>
            <FolderOpen size={18} />
            ComfyUI 工作空间
          </h2>
          <label className="field">
            ComfyUI 根目录
            <div className="input-action">
              <input
                value={draft.comfyRoot}
                onChange={(e) => patch({ comfyRoot: e.target.value })}
                placeholder="例如 D:\ComfyUI，或 ComfyUI_windows_portable"
              />
              <button
                onClick={() =>
                  perform('folder', async () => {
                    const path = await chooseDirectory();
                    if (path) patch({ comfyRoot: path });
                  })
                }
              >
                <FolderOpen size={17} />
                浏览
              </button>
            </div>
          </label>
          <p className="field-help">
            选择包含 main.py 的 ComfyUI 根目录，也支持选择便携版外层文件夹。只绑定本地目录，无需启动 ComfyUI。
          </p>
        </section>
        <section>
          <h2>
            <KeyRound size={18} />
            civitai.red 访问
          </h2>
          <ApiAccess notify={notify} />
          <div className="settings-two">
            <label className="field">
              代理模式
              <select value={draft.proxyMode} onChange={(e) => patch({ proxyMode: e.target.value })}>
                <option value="system">使用系统代理</option>
                <option value="none">直接连接</option>
                <option value="manual">手动代理</option>
              </select>
            </label>
            <label className="field">
              代理地址
              <input
                disabled={draft.proxyMode !== 'manual'}
                value={draft.proxyUrl}
                onChange={(e) => patch({ proxyUrl: e.target.value })}
                placeholder="http://127.0.0.1:7890"
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.safeContent}
              onChange={(e) => patch({ safeContent: e.target.checked })}
            />
            在线搜索仅显示安全内容
          </label>
        </section>
        <section className="settings-storage">
          <strong>本地资料存储位置</strong>
          <p>{location || '应用数据目录'}</p>
          <small>数据库、封面缓存与个人配方保存在这里。</small>
        </section>
      </div>
      <div className="modal-actions">
        {!settings.comfyRoot && !settings.setupDismissed && (
          <button
            disabled={!!busy}
            onClick={() =>
              perform('skip', async () => {
                const saved = await call<Settings>('dismiss_setup');
                await onSaved(saved);
                onClose();
                notify('已跳过，之后可从侧栏打开设置');
              })
            }
          >
            {busy === 'skip' && <Loader2 size={17} className="spin" />}暂不设置
          </button>
        )}
        <button onClick={onClose}>关闭</button>
        <button
          className="primary"
          disabled={!!busy}
          onClick={() =>
            perform('save', async () => {
              const s = await call<Settings>('save_settings', { settings: draft });
              await onSaved(s);
              notify('设置已保存');
              onClose();
            })
          }
        >
          {busy === 'save' ? <Loader2 size={17} className="spin" /> : <Save size={17} />}保存设置
        </button>
      </div>
    </Modal>
  );
}
