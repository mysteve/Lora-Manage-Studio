import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { AnimatePresence } from 'motion/react';
import { FolderOpen, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { asset, call, reveal } from '../../lib/api';
import { Empty, ErrorBox, Loading, Modal } from '../../components/ui';
import { bytes } from '../../lib/utils';
import type { LibraryEntry, Settings } from '../../types/models';
import { OutputMetadata } from './OutputMetadata';

interface OutputImage {
  path: string;
  name: string;
  modified: number;
  size: number;
}
interface OutputImages {
  directory: string;
  exists: boolean;
  total: number;
  items: OutputImage[];
}
export interface OutputView {
  page: number;
  selected: OutputImage | null;
}

export function OutputGallery({
  settings,
  onSettings,
  notify,
  library,
  onOpenEntry,
  view,
  onViewChange,
}: {
  settings: Settings;
  library: LibraryEntry[];
  onOpenEntry: (entry: LibraryEntry) => void;
  view: OutputView;
  onViewChange: Dispatch<SetStateAction<OutputView>>;
  onSettings: () => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const { page, selected } = view;
  const setPage = (page: number) => onViewChange((previous) => ({ ...previous, page }));
  const setSelected = (selected: OutputImage | null) =>
    onViewChange((previous) => ({ ...previous, selected }));
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<OutputImages | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const configured = !!(settings.comfyRoot || settings.outputDir);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    setBusy(configured);
    if (configured)
      void call<OutputImages>('list_output_images', { page })
        .then((result) => {
          if (active) {
            if (page > 0 && page * 60 >= result.total) setPage(0);
            else setData(result);
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    return () => {
      active = false;
    };
  }, [configured, settings.comfyRoot, settings.outputDir, page, revision]);
  const perform = (operation: Promise<unknown>) => void operation.catch((e) => notify(String(e), true));
  return (
    <div className="output-page">
      <header className="page-header">
        <div>
          <h1>输出结果</h1>
          <p>浏览 ComfyUI 已生成的图片，点击查看大图、模型、提示词和生成参数。</p>
        </div>
        <div className="output-actions">
          <button onClick={onSettings}>
            <SettingsIcon size={17} />
            设置目录
          </button>
          <button disabled={!data?.exists || busy} onClick={() => perform(call('open_output_directory'))}>
            <FolderOpen size={17} />
            打开目录
          </button>
          <button
            disabled={busy || !configured}
            onClick={() => {
              setPage(0);
              setRevision((value) => value + 1);
            }}
          >
            <RefreshCw size={17} />
            刷新
          </button>
        </div>
      </header>
      {data && (
        <div className="output-location">
          <span>{data.directory}</span>
          <small>{data.total} 张图片</small>
        </div>
      )}
      {!configured ? (
        <Empty
          title="设置图像输出位置"
          description="绑定 ComfyUI 后自动读取 output 文件夹，也可以单独指定其他图像目录。"
          action={<button onClick={onSettings}>前往设置</button>}
        />
      ) : busy ? (
        <Loading text="正在读取输出结果…" />
      ) : error ? (
        <ErrorBox message={error} retry={() => setRevision((value) => value + 1)} />
      ) : data && !data.items.length ? (
        <Empty
          title={data.exists ? '还没有图像' : '输出目录尚不存在'}
          description="支持 PNG、JPG、JPEG 和 WebP。生成图片后点击刷新，或在设置中指定实际输出目录。"
        />
      ) : (
        <div className="output-grid">
          {data?.items.map((item) => (
            <button className="output-card" key={item.path} onClick={() => setSelected(item)}>
              <OutputPicture item={item} />
              <strong title={item.name}>{item.name}</strong>
              <small>
                {item.modified ? new Date(item.modified).toLocaleString() : '时间未知'} · {bytes(item.size)}
              </small>
            </button>
          ))}
        </div>
      )}
      {data && data.total > 60 && (
        <div className="output-pagination">
          <button disabled={busy || page === 0} onClick={() => setPage(page - 1)}>
            上一页
          </button>
          <span>
            {page + 1} / {Math.ceil(data.total / 60)}
          </span>
          <button disabled={busy || (page + 1) * 60 >= data.total} onClick={() => setPage(page + 1)}>
            下一页
          </button>
        </div>
      )}
      <AnimatePresence>
        {selected && (
          <Modal title={selected.name} onClose={() => setSelected(null)} wide className="output-preview">
            <div className="output-detail-layout">
              <div className="output-detail-image">
                <OutputPicture key={selected.path} item={selected} />
                <div className="output-actions">
                  <button onClick={() => perform(reveal(selected.path))}>
                    <FolderOpen size={17} />
                    在文件夹中定位
                  </button>
                </div>
              </div>
              <OutputMetadata
                key={selected.path}
                path={selected.path}
                notify={notify}
                library={library}
                loraDir={settings.loraDir}
                onOpenEntry={onOpenEntry}
              />
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function OutputPicture({ item }: { item: OutputImage }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="output-image-error">图片无法读取，请刷新后重试</span>
  ) : (
    <img src={asset(item.path)} alt={item.name} loading="lazy" onError={() => setFailed(true)} />
  );
}
