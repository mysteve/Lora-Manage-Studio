import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Github, Loader2, RefreshCw, Scale } from 'lucide-react';
import { Modal } from '../../components/ui';
import ProfileCard from '../../components/react-bits/ProfileCard';
import { call, desktop, external } from '../../lib/api';
import { APP_VERSION, PROJECT_URL, RELEASES_URL, compareRelease } from './project';
import projectLicense from '../../../LICENSE?raw';
import reactLicense from './licenses/React.txt?raw';
import lucideLicense from './licenses/Lucide.txt?raw';
import motionLicense from './licenses/Motion.txt?raw';
import reactBitsLicense from '../../components/react-bits/LICENSE.md?raw';

const notices = [
  { name: 'LoRA Studio', license: 'MIT', text: projectLicense },
  { name: 'React', license: 'MIT', text: reactLicense },
  { name: 'Lucide', license: 'ISC', text: lucideLicense },
  { name: 'Motion', license: 'MIT', text: motionLicense },
  { name: 'React Bits', license: 'MIT + Commons Clause', text: reactBitsLicense },
];
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const [notice, setNotice] = useState('LoRA Studio');
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = async (url: string) => {
    try {
      await external(url);
    } catch (e) {
      if (mounted.current) setError(String(e));
    }
  };
  const check = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    setAvailable(false);
    try {
      const release = await call<{ tag_name: string } | null>('check_app_update');
      if (!mounted.current) return;
      if (!release) {
        setMessage('暂未找到公开的正式发布版本，可前往发布页面查看。');
        return;
      }
      const comparison = compareRelease(release.tag_name, APP_VERSION);
      setAvailable(comparison === 1);
      setMessage(
        comparison === 1
          ? `发现新版本 ${release.tag_name}，可前往发布页面下载。`
          : comparison === 0
            ? '当前已是最新正式版本。'
            : comparison === -1
              ? `当前版本高于最新公开版本 ${release.tag_name}。`
              : `最新发布标签为 ${release.tag_name}，请前往发布页面核对版本。`,
      );
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Modal title="关于 LoRA Studio" onClose={onClose} wide className="about-dialog">
      <div className="about-identity">
        <ProfileCard avatarUrl="/lora-studio-icon-hd.png" alt="LoRA Studio 高清项目图标" />
        <div>
          <span className="about-eyebrow">模型与灵感，井然有序</span>
          <h2>LoRA Studio</h2>
          <span className="about-version">版本 {APP_VERSION}</span>
          <p>面向 ComfyUI 的本地 LoRA 管理工具，让模型、触发词与创作配方各归其位。</p>
          <button onClick={() => void open(PROJECT_URL)}>
            <Github size={16} />
            项目仓库
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
      <section className="about-updates" aria-labelledby="about-update-heading">
        <div>
          <h3 id="about-update-heading">版本更新</h3>
          <p className="field-help">检查 GitHub 正式发布版本，下载与安装由你手动完成。</p>
        </div>
        <button className="primary" disabled={busy} onClick={() => void check()}>
          {busy ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          {busy ? '正在检查…' : '检查更新'}
        </button>
        {(message || error) && (
          <div className="about-update-result">
            {message && <p role="status">{message}</p>}
            {error && (
              <p className="api-access-error" role="alert">
                {error}
              </p>
            )}
            <button className="link-button" onClick={() => void open(RELEASES_URL)}>
              {available ? '前往下载新版本' : '查看发布页面'}
              <ExternalLink size={14} />
            </button>
          </div>
        )}
        {!desktop && (
          <p className="field-help about-preview">浏览器预览不执行更新检查，请在桌面应用中使用。</p>
        )}
      </section>
      <section className="about-licenses" aria-labelledby="about-license-heading">
        <h3 id="about-license-heading">
          <Scale size={18} />
          开源与许可证
        </h3>
        <p className="field-help">
          项目自有代码采用 MIT 许可证。第三方组件保留各自的许可条款，包括 React Bits 的 MIT + Commons Clause
          限制。
        </p>
        <details>
          <summary>查看项目与组件许可证</summary>
          <label className="field">
            项目 / 组件与许可证
            <select value={notice} onChange={(e) => setNotice(e.target.value)}>
              {notices.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} · {item.license}
                </option>
              ))}
            </select>
          </label>
          <pre className="about-license-text" tabIndex={0}>
            {notices.find((item) => item.name === notice)?.text}
          </pre>
        </details>
      </section>
      <div className="modal-actions">
        <button onClick={onClose}>关闭</button>
      </div>
    </Modal>
  );
}
