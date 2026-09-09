import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Pause, Play, X } from 'lucide-react';
import { call, desktop, preview } from '../../lib/api';
import { resourceSummary, type ResourceSnapshot } from './resources';

const memory = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;
const percent = (value: number | null) => (value === null ? '采样中…' : `${value.toFixed(1)}%`);

export default function ResourceMonitor() {
  const [enabled, setEnabled] = useState(!desktop && preview);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    void call<boolean>('debug_resources_enabled')
      .then((value) => {
        if (!disposed) setEnabled(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);
  if (!enabled) return null;
  return (
    <>
      <button
        ref={button}
        className="debug-resource-toggle"
        aria-expanded={open}
        aria-controls="resource-monitor"
        onClick={() => setOpen(!open)}
      >
        <Activity size={15} />
        资源监测<span>DEV</span>
      </button>
      {open &&
        createPortal(
          <ResourcePanel
            onClose={() => {
              setOpen(false);
              button.current?.focus();
            }}
          />,
          document.body,
        )}
    </>
  );
}
function ResourcePanel({ onClose }: { onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [data, setData] = useState<ReturnType<typeof resourceSummary> | null>(null);
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!desktop || paused || !visible) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let previous: ResourceSnapshot | null = null;
    const sample = async () => {
      try {
        const current = await call<ResourceSnapshot>('debug_resource_snapshot');
        if (disposed) return;
        setData(resourceSummary(current, previous));
        setSnapshot(current);
        previous = current;
        setUpdated(new Date().toLocaleTimeString());
        setError('');
      } catch (e) {
        if (!disposed) {
          setError(String(e));
          previous = null;
        }
      } finally {
        if (!disposed) timer = setTimeout(sample, 2000);
      }
    };
    void sample();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [paused, visible]);
  return (
    <aside id="resource-monitor" className="resource-monitor" aria-label="开发资源监测">
      <header>
        <div>
          <strong>
            <Activity size={17} />
            资源监测
          </strong>
          <small>仅开发模式 · 每 2 秒采样</small>
        </div>
        <div className="resource-monitor-actions">
          <button
            className="icon-button"
            disabled={!desktop}
            aria-label={paused ? '继续采样' : '暂停采样'}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="icon-button" aria-label="关闭资源监测" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>
      {!desktop ? (
        <p className="field-help resource-empty">
          请通过 npm run tauri -- dev 启动桌面开发模式以读取真实资源数据。浏览器预览不模拟进程占用。
        </p>
      ) : (
        <>
          <p className="resource-state" role="status">
            {paused
              ? '已暂停，保留最后一次采样'
              : !visible
                ? '窗口不可见，已暂停采样'
                : error
                  ? '采样失败，稍后自动重试'
                  : updated
                    ? `最近采样 ${updated}`
                    : '正在读取进程资源…'}
          </p>
          {error && (
            <p className="api-access-error" role="alert">
              {error}
            </p>
          )}
          {data && (
            <>
              <div className="resource-metrics">
                <div>
                  <span>CPU 占用</span>
                  <strong>{percent(data.cpu)}</strong>
                </div>
                <div>
                  <span>工作集内存</span>
                  <strong>{memory(data.workingSet)}</strong>
                </div>
                <div>
                  <span>私有提交内存</span>
                  <strong>{memory(data.privateBytes)}</strong>
                </div>
                <div>
                  <span>进程 / 线程</span>
                  <strong>
                    {data.processes.length} / {data.threads}
                  </strong>
                </div>
              </div>
              <div className="resource-processes">
                <table>
                  <thead>
                    <tr>
                      <th>进程 / PID</th>
                      <th>CPU</th>
                      <th>工作集</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.processes.map((p) => (
                      <tr key={`${p.pid}:${p.started}`}>
                        <td>
                          <strong>{p.pid === snapshot?.rootPid ? '应用主进程' : p.name}</strong>
                          <small>PID {p.pid}</small>
                        </td>
                        <td>{p.cpu === null ? '—' : percent(p.cpu)}</td>
                        <td>{memory(p.workingSet)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!!snapshot?.skipped && (
                <p className="field-help">
                  有 {snapshot.skipped} 个进程已退出或无法读取，当前统计不包含它们。
                </p>
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}
