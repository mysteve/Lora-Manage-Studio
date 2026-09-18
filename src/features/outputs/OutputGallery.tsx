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

import { appendOutputBatch, collectedOutputItems, type OutputCollection, type OutputImage, type OutputImages } from './outputCollection';
import './OutputGallery.css';

export interface OutputView {
  page: number;
  cursors: (string | null)[];
  selected: OutputImage | null;
  collection?: OutputCollection;
  scrollTop?: number;
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
  const directoryKey = JSON.stringify([settings.comfyRoot, settings.outputDir]);
  const batches = useMemo(() => view.collection?.directoryKey === directoryKey
    ? view.collection.batches : [], [view.collection, directoryKey]);
  const data = batches[page] ?? null;
  const last = batches.at(-1);
  const setSelected = useCallback((selected: OutputImage | null, page?: number) => {
    const scrollTop = selected ? window.scrollY : undefined;
    onViewChange((previous) => ({
      ...previous, selected, page: page ?? previous.page,
      scrollTop: selected && !previous.selected ? scrollTop : previous.scrollTop,
    }));
  }, [onViewChange]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cache = useMemo(
    () => outputPageCache((cursor) => call<OutputImages>('list_output_images', { cursor }),
      view.collection?.directoryKey === directoryKey ? view.cursors : [null], batches),
    [directoryKey, revision],
  );
  const currentCache = useRef(cache);
  currentCache.current = cache;
  const mounted = useRef(false);
  const imagePreload = useMemo(() => outputImagePreload(), [cache]);
  useEffect(() => () => imagePreload.clear(), [imagePreload]);
  const navigationRequest = useRef(0);
  const [turning, setTurning] = useState(false);
  const navigationLocked = useRef(false);
  const loading = useRef(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<string | null>(null);
  const configured = !!(settings.comfyRoot || settings.outputDir);
  const commitBatch = useCallback((batchPage: number, result: OutputImages) => {
    if (!mounted.current || currentCache.current !== cache) return;
    onViewChange((previous) => {
      if (currentCache.current !== cache) return previous;
      const old = previous.collection?.directoryKey === directoryKey ? previous.collection.batches : [];
      const next = appendOutputBatch(old, batchPage, result);
      if (next === old) return previous;
      return { ...previous, cursors: cache.history(), collection: { directoryKey, batches: next } };
    });
  }, [cache, directoryKey, onViewChange]);
  const loadMore = useCallback(() => {
    if (!configured || loading.current || (last && !last.nextCursor)) return;
    loading.current = true;
    setBusy(true);
    setError('');
    void cache.get(batches.length)
      .then((result) => commitBatch(batches.length, result))
      .catch((e) => { if (mounted.current && currentCache.current === cache) setError(String(e)); })
      .finally(() => {
        if (mounted.current && currentCache.current === cache) {
          loading.current = false;
          setBusy(false);
        }
      });
  }, [configured, cache, batches.length, last, commitBatch]);
  useEffect(() => {
    mounted.current = true;
    loading.current = false;
    setBusy(false);
    setError('');
    setTurning(false);
    if (view.collection && view.collection.directoryKey !== directoryKey) {
      onViewChange({ page: 0, selected: null, cursors: [null], scrollTop: 0 });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    return () => {
      mounted.current = false;
      navigationRequest.current++;
      navigationLocked.current = false;
    };
  }, [cache]);
  useEffect(() => {
    if (!batches.length && !error) loadMore();
  }, [batches.length, error, loadMore]);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !configured || selected || busy || error || !last?.nextCursor || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { root: null, rootMargin: '400px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [configured, selected, busy, error, last, loadMore]);
  const viewing = useRef(!!selected);
  viewing.current = !!selected || !!returnFocus.current;
  useEffect(() => {
    // 返回关联详情或关闭看图后恢复位置；看图锁滚动期间不覆盖列表位置。
    if (selected) return;
    const scrollTop = view.collection?.directoryKey === directoryKey ? view.scrollTop ?? 0 : 0;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [directoryKey, !!selected]);
  useEffect(() => {
    let tick = 0;
    const save = () => {
      if (tick || viewing.current) return;
      tick = requestAnimationFrame(() => {
        tick = 0;
        if (viewing.current) return;
        const scrollTop = window.scrollY;
        onViewChange((previous) => previous.scrollTop === scrollTop ? previous : { ...previous, scrollTop });
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(tick);
      window.removeEventListener('scroll', save);
    };
  }, [directoryKey, onViewChange]);
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
    if (navigationLocked.current || !data) return;
    const target = adjacentOutput(page, selectedIndex, data.items.length, !!data.nextCursor, direction);
    if (!target) return;
    if (target.page === page) setSelected(data.items[target.index]);
    else {
      navigationLocked.current = true;
      const request = ++navigationRequest.current;
      setTurning(true);
      void cache
        .get(target.page)
        .then((result) => {
          if (request !== navigationRequest.current || currentCache.current !== cache || !mounted.current) return;
          const item = target.index < 0 ? result.items.at(-1) : result.items[target.index];
          if (!item) {
            notify('输出目录内容已变化，请刷新列表', true);
            return;
          }
          commitBatch(target.page, result);
          onViewChange((previous) => ({ ...previous, page: target.page, selected: item, cursors: cache.history() }));
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
  const items = useMemo(() => collectedOutputItems(batches), [batches]);
  const cards = useMemo(() => (
        <div className="output-grid">
          {items.map(({ item, page }) => (
            <button
              className="output-card"
              key={item.path}
              data-output-path={item.path}
              onClick={() => setSelected(item, page)}
            >
              <OutputPicture item={item} />
              <strong title={item.name}>{item.name}</strong>
              <small>
                {item.modified ? new Date(item.modified).toLocaleString() : '时间未知'} · {bytes(item.size)}
              </small>
            </button>
          ))}
        </div>
  ), [items, setSelected]);
  const refresh = () => {
    navigationRequest.current++;
    navigationLocked.current = false;
    imagePreload.clear();
    onViewChange({ page: 0, selected: null, cursors: [null], scrollTop: 0 });
    window.scrollTo({ top: 0, behavior: 'instant' });
    setRevision((value) => value + 1);
  };
  const perform = (operation: Promise<unknown>) => void operation.catch((e) => notify(String(e), true));
  return (
    <div className="output-page" ref={galleryRef}>
      <header className="page-header">
        <div>
          <h1>我的图像</h1>
          <p>浏览 ComfyUI 已生成的图片，点击查看大图、模型、提示词和生成参数。</p>
        </div>
        <div className="output-actions">
          <button onClick={onSettings}>
            <SettingsIcon size={17} />
            设置目录
          </button>
          <button disabled={!batches[0]?.exists || busy} onClick={() => perform(call('open_output_directory'))}>
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
      {batches[0] && (
        <div className="output-location">
          <span>{batches[0].directory}</span>
          <small>{batches[0].total} 张图片</small>
        </div>
      )}
      {!configured ? (
        <Empty
          title="设置图像输出位置"
          description="绑定 ComfyUI 后自动读取 output 文件夹，也可以单独指定其他图像目录。"
          action={<button onClick={onSettings}>前往设置</button>}
        />
      ) : !batches.length ? (
        error ? <ErrorBox message={error} retry={loadMore} /> : <Loading text="正在读取图像…" />
      ) : !batches.some((batch) => batch.items.length) && !last?.nextCursor ? (
        <Empty
          title={last?.exists ? '还没有图像' : '输出目录尚不存在'}
          description="支持 PNG、JPG、JPEG 和 WebP。生成图片后点击刷新，或在设置中指定实际输出目录。"
        />
      ) : cards}
      {configured && batches.length > 0 && (
        <div className="output-load-more" ref={sentinelRef} aria-live="polite">
          {busy ? <Loading text="正在加载更多图像…" /> : error ? (
            <ErrorBox message={error} retry={loadMore} />
          ) : last?.nextCursor ? (
            <button onClick={loadMore}>加载更多图像</button>
          ) : <span>已到底，共加载 {items.length} 张图像</span>}
        </div>
      )}
      <AnimatePresence
        onExitComplete={() => {
          window.scrollTo({ top: view.scrollTop ?? 0, behavior: 'instant' });
          if (!returnFocus.current) return;
          const cards = Array.from(
            galleryRef.current?.querySelectorAll<HTMLButtonElement>('.output-card') ?? [],
          );
          (cards.find((card) => card.dataset.outputPath === returnFocus.current) ?? cards[0])?.focus({ preventScroll: true });
          returnFocus.current = null;
          viewing.current = false;
        }}
      >
        {selected && (
          <OutputViewer
            name={selected.name}
            position={selectedIndex < 0 ? 0 : (data?.startIndex ?? 0) + selectedIndex + 1}
            total={data?.total ?? 0}
            busy={turning}
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
