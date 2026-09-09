import { useEffect, useState } from 'react';
import { Bot, FolderOpen, KeyRound, Loader2, Save } from 'lucide-react';
import { call, chooseDirectory } from '../../lib/api';
import { AiAccess } from './AiAccess';
import { ApiAccess } from './ApiAccess';
import { settingsForTab, type GeneralSettingsTab } from './settingsTabs';
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
  const [tab, setTab] = useState<GeneralSettingsTab | 'ai'>('workspace');
  const tabs = [
    { id: 'workspace', label: '工作空间', icon: FolderOpen },
    { id: 'website', label: '网站访问', icon: KeyRound },
    { id: 'ai', label: 'AI 接入', icon: Bot },
  ] as const;
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
  const saveTab = (current: GeneralSettingsTab) =>
    perform(current, async () => {
      const latest = await call<Settings>('get_settings');
      const saved = await call<Settings>('save_settings', {
        settings: settingsForTab(latest, draft, current),
      });
      setDraft((previous) => settingsForTab(previous, saved, current));
      await onSaved(saved);
      notify(current === 'workspace' ? '工作空间设置已保存' : '网站访问设置已保存');
    });
  const saveButton = (current: GeneralSettingsTab, label: string) => (
    <button className="primary" disabled={!!busy} onClick={() => void saveTab(current)}>
      {busy === current ? <Loader2 size={17} className="spin" /> : <Save size={17} />}
      {label}
    </button>
  );
  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <h1>设置</h1>
          <p>管理工作空间、网站访问与 AI 接入。</p>
        </div>
      </header>
      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            id={`settings-tab-${id}`}
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-controls={`settings-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(tabs[next].id);
              document.getElementById(`settings-tab-${tabs[next].id}`)?.focus();
            }}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      <div className="settings-content">
        <div
          role="tabpanel"
          id="settings-panel-workspace"
          aria-labelledby="settings-tab-workspace"
          hidden={tab !== 'workspace'}
          tabIndex={0}
        >
          <section>
            <h2>
              <FolderOpen size={18} />
              ComfyUI 工作空间
            </h2>
            <label className="field">
              ComfyUI 根目录
              <div className="input-action">
                <input
                  disabled={!!busy}
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
              选择包含 main.py 的 ComfyUI 根目录，也支持选择便携版外层文件夹。只绑定本地目录，无需启动
              ComfyUI。
            </p>
            <div className="settings-storage settings-storage-inline">
              <strong>本地资料存储位置</strong>
              <p>{location || '应用数据目录'}</p>
              <small>数据库、封面缓存与个人配方保存在这里。</small>
            </div>
            <div className="settings-actions">
              {!settings.comfyRoot && !settings.setupDismissed && (
                <button
                  disabled={!!busy}
                  onClick={() =>
                    void perform('skip', async () => {
                      const saved = await call<Settings>('dismiss_setup');
                      await onSaved(saved);
                      onClose();
                      notify('已跳过，之后可从侧栏打开设置');
                    })
                  }
                >
                  暂不设置
                </button>
              )}
              {saveButton('workspace', '保存工作空间设置')}
            </div>
          </section>
        </div>
        <div
          role="tabpanel"
          id="settings-panel-website"
          aria-labelledby="settings-tab-website"
          hidden={tab !== 'website'}
          tabIndex={0}
        >
          <section>
            <h2>
              <KeyRound size={18} />
              civitai.red 访问
            </h2>
            <ApiAccess notify={notify} />
            <div className="settings-two">
              <label className="field">
                代理模式
                <select
                  disabled={!!busy}
                  value={draft.proxyMode}
                  onChange={(e) => patch({ proxyMode: e.target.value })}
                >
                  <option value="system">使用系统代理</option>
                  <option value="none">直接连接</option>
                  <option value="manual">手动代理</option>
                </select>
              </label>
              <label className="field">
                代理地址
                <input
                  disabled={!!busy || draft.proxyMode !== 'manual'}
                  value={draft.proxyUrl}
                  onChange={(e) => patch({ proxyUrl: e.target.value })}
                  placeholder="http://127.0.0.1:7890"
                />
              </label>
            </div>
            <div className="settings-safety">
              <label className="safe-content-toggle">
                <span>安全审查</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="安全审查"
                  aria-describedby="safety-description"
                  disabled={!!busy}
                  checked={draft.safeContent}
                  onChange={(e) => patch({ safeContent: e.target.checked })}
                />
                <span className="safe-content-track" aria-hidden="true" />
              </label>
              <p id="safety-description">
                开启后，在线发现筛选安全内容，本地模型中被 C
                站标记为受限的封面和示例图显示占位提示。关闭并保存后恢复原图。
              </p>
            </div>
            <div className="settings-actions">{saveButton('website', '保存网站访问设置')}</div>
          </section>
        </div>
        <div
          role="tabpanel"
          id="settings-panel-ai"
          aria-labelledby="settings-tab-ai"
          hidden={tab !== 'ai'}
          tabIndex={0}
        >
          <AiAccess />
        </div>
      </div>
    </div>
  );
}
