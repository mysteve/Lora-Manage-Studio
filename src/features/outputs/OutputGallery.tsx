import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AnimatePresence } from 'motion/react';
import { FolderOpen, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { asset, call, reveal } from '../../lib/api';
import { Empty, ErrorBox, Loading } from '../../components/ui';
import { bytes } from '../../lib/utils';
import type { LibraryEntry, Settings } from '../../types/models';
import { OutputMetadata } from './OutputMetadata';
import { OutputViewer } from './OutputViewer';
import { adjacentOutput } from './outputNavigation';
import { outputPageCache } from './outputPageCache';
import { ZoomableOutput } from './ZoomableOutput';
import { outputImagePreload } from './outputImagePreload';

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
  nextCursor: string | null;
  startIndex: number;
  items: OutputImage[];
}
export interface OutputView {
  page: number;
  cursors: (string | null)[];
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
  const setPage = (page: number) => onViewChange((previous) => ({ ...previous, page, cursors: cache.history() }));
  const setSelected = useCallback((selected: OutputImage | null) =>
    onViewChange((previous) => ({ ...previous, selected })), [onViewChange]);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<OutputImages | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const cache = useMemo(
    () => outputPageCache((cursor) => call<OutputImages>('list_output_images', { cursor }), revision === 0 ? view.cursors : [null]),
    [settings.comfyRoot, settings.outputDir, revision],
  );
  const imagePreload = useMemo(() => outputImagePreload(), [cache]);
  useEffect(() => () => imagePreload.clear(), [imagePreload]);
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
            setData(result);
            onViewChange((previous) => ({
              ...previous,
              cursors: cache.history(),
              selected: previous.selected
                ? (result.items.find((item) => item.path === previous.selected?.path) ?? result.items[0] ?? null)
                : null,
            }));
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
    if (!selected || !data || selectedIndex < 0) {
      imagePreload.clear();
      return;
    }
    // Only retain a few full-size decoded images, never the whole output page.
    for (const offset of [-2, 2, -1, 1]) {
      const item = data.items[selectedIndex + offset];
      if (item) imagePreload.preload(asset(item.path));
    }
  }, [data, selectedIndex, !!selected, imagePreload]);
  useEffect(() => {
    if (!selected || !data || selectedIndex < 0) return;
    const nextPage =
      selectedIndex >= data.items.length - 5 && !!data.nextCursor
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
          imagePreload.preload(asset(item.path));
        }
      })
      .catch(() => {
        /* 预取失败留待用户翻页时重试。 */
      });
    return () => {
      active = false;
    };
  }, [cache, page, selectedIndex, !!selected, data, imagePreload]);
  const move = (direction: -1 | 1) => {
    if (busy || navigationLocked.current || !data) return;
    const target = adjacentOutput(page, selectedIndex, data.items.length, !!data.nextCursor, direction);
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
          const item = target.index < 0 ? result.items.at(-1) : result.items[target.index];
          if (!item) {
            notify('输出目录内容已变化，请刷新列表', true);
            return;
          }
          setData(result);
          onViewChange({ page: target.page, selected: item, cursors: cache.history() });
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
  const cards = useMemo(() => (
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
  ), [data?.items, setSelected]);
  const refresh = () => {
    onViewChange({ page: 0, selected: null, cursors: [null] });
    setRevision((value) => value + 1);
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
            onClick={refresh}
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
        <ErrorBox message={error} retry={refresh} />
      ) : data && !data.items.length ? (
        <Empty
          title={page > 0 ? '当前页已没有图像' : data.exists ? '还没有图像' : '输出目录尚不存在'}
          description="支持 PNG、JPG、JPEG 和 WebP。生成图片后点击刷新，或在设置中指定实际输出目录。"
        />
      ) : (
        cards
      )}
      {data && (page > 0 || data.nextCursor) && (
        <div className="output-pagination">
          <button disabled={busy || page === 0} onClick={() => setPage(page - 1)}>
            上一页
          </button>
          <span>
            {page + 1}
          </span>
          <button disabled={busy || !data.nextCursor} onClick={() => setPage(page + 1)}>
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
          (cards.find((card) => card.dataset.outputPath === returnFocus.current) ?? cards[0])?.focus({ preventScroll: true });
          returnFocus.current = null;
        }}
      >
        {selected && (
          <OutputViewer
            name={selected.name}
            position={selectedIndex < 0 ? 0 : (data?.startIndex ?? 0) + selectedIndex + 1}
            total={data?.total ?? 0}
            busy={busy || turning}
            canPrevious={!!data && !!adjacentOutput(page, selectedIndex, data.items.length, !!data.nextCursor, -1)}
            canNext={!!data && !!adjacentOutput(page, selectedIndex, data.items.length, !!data.nextCursor, 1)}
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
            {error && <ErrorBox message={error} retry={refresh} />}
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
