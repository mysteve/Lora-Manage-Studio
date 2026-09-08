import { useEffect, useState } from 'react';
import { FolderOpen, KeyRound, Loader2, Save, ShieldCheck } from 'lucide-react';
import { call, chooseDirectory } from './api';
import { Modal } from './components';
import type { Settings } from './types';
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
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState('');
  const [location, setLocation] = useState('');
  useEffect(() => {
    void call<boolean>('has_token')
      .then(setHasToken)
      .catch(() => {});
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
    <Modal title="设置" onClose={onClose} wide>
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
          <div className="settings-storage">
            <strong>LoRA 保存目录</strong>
            <p>
              {draft.comfyRoot === settings.comfyRoot && settings.loraDir
                ? settings.loraDir
                : '绑定后自动使用根目录下的 models/loras'}
            </p>
            <small>保存时会自动创建缺失的 models/loras 文件夹，下载完成后直接安装到这里。</small>
          </div>
        </section>
        <section>
          <h2>
            <KeyRound size={18} />
            civitai.red 访问
          </h2>
          <label className="field">
            API Token{' '}
            <span className="field-help">
              {hasToken ? '已安全保存，留空保留现有 Token' : '可选，部分模型下载需要登录权限'}
            </span>
            <div className="input-action">
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="在此粘贴 Token，不会显示在日志中"
              />
              {hasToken && (
                <button
                  disabled={!!busy}
                  onClick={() =>
                    perform('clear-token', async () => {
                      await call('save_token', { token: '' });
                      setHasToken(false);
                      setToken('');
                      notify('Token 已清除');
                    })
                  }
                >
                  清除
                </button>
              )}
            </div>
          </label>
          <p className="field-help">
            <ShieldCheck size={13} />
            Token 存在 Windows 凭据管理器中。
          </p>
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
          <small>SQLite 数据库、封面缓存与个人配方保存在这里。模型文件位于上面指定的 LoRA 目录。</small>
        </section>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>关闭</button>
        <button
          className="primary"
          disabled={!!busy}
          onClick={() =>
            perform('save', async () => {
              const s = await call<Settings>('save_settings', { settings: draft });
              if (token.trim()) {
                await call('save_token', { token });
                setToken('');
                setHasToken(true);
              }
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
