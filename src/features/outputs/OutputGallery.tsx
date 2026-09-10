import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AnimatePresence } from 'motion/react';
import { FolderOpen, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { asset, call, reveal } from '../../lib/api';
import { Empty, ErrorBox, Loading } from '../../components/ui';
import { bytes } from '../../lib/utils';
import type { LibraryEntry, Settings } from '../../types/models';
import { OutputMetadata } from './OutputMetadata';
import { OutputViewer } from './OutputViewer';
import { adjacentOutput, OUTPUT_PAGE_SIZE } from './outputNavigation';
import { outputPageCache } from './outputPageCache';
import { ZoomableOutput } from './ZoomableOutput';

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
  const cache = useMemo(
    () => outputPageCache((page: number) => call<OutputImages>('list_output_images', { page })),
    [settings.comfyRoot, settings.outputDir, revision],
  );
  const navigationRequest = useRef(0);
  const [turning, setTurning] = useState(false);
  const navigationLocked = useRef(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<string | null>(null);
  const configured = !!(settings.comfyRoot || settings.outputDir);
  useEffect(() => {
    let active = true;
    setData(cache.peek(page) ?? null);
    setError('');
    setBusy(configured && !cache.peek(page));
    if (configured)
      void cache
        .get(page)
        .then((result) => {
          if (active) {
            if (page > 0 && page * OUTPUT_PAGE_SIZE >= result.total) {
              setPage(0);
            } else {
              setData(result);
              onViewChange((previous) => ({
                ...previous,
                selected: previous.selected
                  ? (result.items.find((item) => item.path === previous.selected?.path) ??
                    result.items[0] ??
                    null)
                  : null,
              }));
            }
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        })
        .finally(() => {
          if (active) {
            setBusy(false);
            navigationLocked.current = false;
          }
        });
    return () => {
      active = false;
    };
  }, [configured, cache, page]);
  useEffect(() => {
    return () => {
      navigationRequest.current++;
      navigationLocked.current = false;
    };
  }, [cache]);
  const selectedIndex = data?.items.findIndex((item) => item.path === selected?.path) ?? -1;
  useEffect(() => {
    if (!selected || !data || selectedIndex < 0) return;
    const nextPage =
      selectedIndex >= data.items.length - 5 && (page + 1) * OUTPUT_PAGE_SIZE < data.total
        ? page + 1
        : selectedIndex < 5 && page > 0
          ? page - 1
          : null;
    if (nextPage === null) return;
    let active = true;
    void cache
      .get(nextPage)
      .then((result) => {
        if (!active) return;
        const item = nextPage > page ? result.items[0] : result.items.at(-1);
        if (item) {
          const image = new Image();
          image.src = asset(item.path);
        }
      })
      .catch(() => {
        /* 预取失败留待用户翻页时重试。 */
      });
    return () => {
      active = false;
    };
  }, [cache, page, selectedIndex, !!selected, data]);
  const move = (direction: -1 | 1) => {
    if (busy || navigationLocked.current || !data) return;
    const target = adjacentOutput(page, selectedIndex, data.total, direction);
    if (!target) return;
    if (target.page === page) setSelected(data.items[target.index]);
    else {
      navigationLocked.current = true;
      const request = ++navigationRequest.current;
      setTurning(true);
      setError('');
      void cache
        .get(target.page)
        .then((result) => {
          if (request !== navigationRequest.current) return;
          const item = result.items[target.index];
          if (!item) {
            notify('输出目录内容已变化，请刷新列表', true);
            return;
          }
          setData(result);
          onViewChange({ page: target.page, selected: item });
        })
        .catch((e) => {
          if (request === navigationRequest.current) notify(String(e), true);
        })
        .finally(() => {
          if (request === navigationRequest.current) {
            navigationLocked.current = false;
            setTurning(false);
          }
        });
    }
  };
  const perform = (operation: Promise<unknown>) => void operation.catch((e) => notify(String(e), true));
  return (
    <div className="output-page" ref={galleryRef}>
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
            <button
              className="output-card"
              key={item.path}
              data-output-path={item.path}
              onClick={() => setSelected(item)}
            >
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
      <AnimatePresence
        onExitComplete={() => {
          if (!returnFocus.current) return;
          const cards = Array.from(
            galleryRef.current?.querySelectorAll<HTMLButtonElement>('.output-card') ?? [],
          );
          (cards.find((card) => card.dataset.outputPath === returnFocus.current) ?? cards[0])?.focus();
          returnFocus.current = null;
        }}
      >
        {selected && (
          <OutputViewer
            name={selected.name}
            position={selectedIndex < 0 ? 0 : page * OUTPUT_PAGE_SIZE + selectedIndex + 1}
            total={data?.total ?? 0}
            busy={busy || turning}
            canPrevious={!!data && !!adjacentOutput(page, selectedIndex, data.total, -1)}
            canNext={!!data && !!adjacentOutput(page, selectedIndex, data.total, 1)}
            onMove={move}
            onClose={() => {
              returnFocus.current = selected.path;
              navigationRequest.current++;
              navigationLocked.current = false;
              setTurning(false);
              setSelected(null);
            }}
            onReveal={() => perform(reveal(selected.path))}
            metadata={
              <OutputMetadata
                key={selected.path}
                path={selected.path}
                notify={notify}
                library={library}
                loraDir={settings.loraDir}
                onOpenEntry={onOpenEntry}
              />
            }
          >
            <ZoomableOutput src={asset(selected.path)} name={selected.name} onMove={move} />
            {error && <ErrorBox message={error} retry={() => setRevision((value) => value + 1)} />}
          </OutputViewer>
        )}
      </AnimatePresence>
    </div>
  );
}

function OutputPicture({ item, eager = false }: { item: OutputImage; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="output-image-error">图片无法读取，请刷新后重试</span>
  ) : (
    <img
      src={asset(item.path)}
      alt={item.name}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
    />
  );
}
