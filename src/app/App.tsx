import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion } from '../lib/useReducedMotion';
import { NavIndicator, PageTransition, StateIcon, easeOut } from '../components/Motion';
import CountUp from '../components/react-bits/CountUp';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Folder,
  Compass,
  Download,
  Heart,
  Sparkles,
  Settings as SettingsIcon,
  Link,
  FolderSearch,
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  Check,
  X,
  FolderOpen,
  Plus,
  LayoutGrid,
  HardDrive,
  Loader2,
} from 'lucide-react';
import { ask, call, desktop, preview, reveal } from '../lib/api';
import { Badge, CoverImage, Empty, ErrorBox, Loading, Modal, SearchInput } from '../components/ui';
import { bytes, count, matchesEntry, statusLabels } from '../lib/utils';
import { Detail } from '../features/models/Detail';
import { AddLocalModel } from '../features/models/AddLocalModel';
import { SettingsPanel } from '../features/settings/SettingsPanel';
import { WindowControls } from '../components/WindowControls';
import { BaseModelFilter } from '../features/discover/BaseModelFilter';
import { CategoryFilter } from '../features/discover/CategoryFilter';
import type {
  DownloadTask,
  LibraryEntry,
  Page,
  Recipe,
  RemoteModel,
  ScanProgress,
  SearchResult,
  Settings,
} from '../types/models';

const pageTitles: Record<Page, string> = {
  library: '我的模型',
  discover: '在线发现',
  downloads: '下载中心',
  favorites: '收藏模型',
  recipes: '提示词配方',
};
const subtitles: Record<Page, string> = {
  library: '为每一次创作，找到恰好的 LoRA。',
  discover: '探索新的风格，让灵感落地。',
  downloads: '灵感正在抵达，下载完成后自动安装到 ComfyUI。',
  favorites: '把喜欢的风格，留在手边。',
  recipes: '保存每一次恰到好处的表达。',
};
const defaultSettings: Settings = {
  loraDir: '',
  comfyRoot: '',
  setupDismissed: false,
  proxyMode: 'system',
  proxyUrl: '',
  safeContent: true,
};
export default function App() {
  const reduced = useReducedMotion();
  const [page, setPage] = useState<Page>('library');
  const [settings, setSettings] = useState(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSafeContent, setSavingSafeContent] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addLocalOpen, setAddLocalOpen] = useState(false);
  const [link, setLink] = useState('');
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [initialError, setInitialError] = useState('');
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [query, setQuery] = useState('');
  const [base, setBase] = useState('');
  const [fileStatus, setFileStatus] = useState('');
  const [localSort, setLocalSort] = useState('newest');
  const [remoteQuery, setRemoteQuery] = useState('');
  const [remoteBase, setRemoteBase] = useState('');
  const [remoteTag, setRemoteTag] = useState('');
  const [sort, setSort] = useState('Most Downloaded');
  const [searchResult, setSearchResult] = useState<SearchResult>({ items: [], nextCursor: null });
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<{
    model: RemoteModel;
    versionId: number;
    entryId?: string;
    fileId?: number;
    recipeId?: string;
  } | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [taskTab, setTaskTab] = useState('all');
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchSeq = useRef(0);
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), error ? 8500 : 3800);
  }, []);
  const perform = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        notify(String(e instanceof Error ? e.message : e), true);
      }
    },
    [notify],
  );
  const loadLibrary = useCallback(async () => setLibrary(await call<LibraryEntry[]>('list_library')), []);
  const loadTasks = useCallback(async () => setTasks(await call<DownloadTask[]>('list_downloads')), []);
  const initialize = useCallback(async () => {
    setInitializing(true);
    setInitialError('');
    try {
      const [s, l, t] = await Promise.all([
        call<Settings>('get_settings'),
        call<LibraryEntry[]>('list_library'),
        call<DownloadTask[]>('list_downloads'),
      ]);
      setSettings(s);
      setLibrary(l);
      setTasks(t);
      if (!s.comfyRoot && !s.setupDismissed) setShowSettings(true);
    } catch (e) {
      setInitialError(String(e instanceof Error ? e.message : e));
    } finally {
      setInitializing(false);
    }
  }, []);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (hasUnsaved) {
          event.preventDefault();
          if (await ask('配方尚未保存，确认关闭应用并放弃修改？')) await getCurrentWindow().destroy();
        }
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error) => notify(String(error), true));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [hasUnsaved, notify]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const unsubs: (() => void)[] = [];
    let debounce: ReturnType<typeof setTimeout>;
    const add = async <T,>(event: string, handler: (payload: T) => void) => {
      const unlisten = await listen<T>(event, (e) => handler(e.payload));
      if (disposed) unlisten();
      else unsubs.push(unlisten);
    };
    void add<DownloadTask>('download-progress', (task) => {
      setTasks((prev) =>
        [task, ...prev.filter((t) => t.id !== task.id)].sort((a, b) => b.createdAt - a.createdAt),
      );
      if (task.status === 'completed') {
        void loadLibrary();
        notify(`${task.model.name} 已安装`);
      }
    });
    void add<ScanProgress>('scan-progress', (s) => {
      setScan(s);
      if (!s.running) {
        void loadLibrary();
        notify(`扫描完成：${s.processed} 个文件，补齐 ${s.matched} 个模型`);
      }
    });
    void add('library-changed', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void loadLibrary().catch((e) => notify(String(e), true)), 200);
    });
    return () => {
      disposed = true;
      unsubs.forEach((f) => f());
      clearTimeout(debounce);
    };
  }, [loadLibrary, notify]);
  useEffect(() => {
    if (page === 'recipes')
      void perform(async () => setRecipes(await call<Recipe[]>('list_recipes', { owner: null })));
  }, [page, selected, perform]);
  const doSearch = useCallback(
    async (
      cursor: string | null = null,
      stack: (string | null)[] = [null],
      filters: { baseModel?: string; tag?: string; sort?: string } = {},
    ) => {
      const seq = ++searchSeq.current;
      setSearchBusy(true);
      setSearchError('');
      setSearched(true);
      try {
        const result = await call<SearchResult>('search_models', {
          query: remoteQuery,
          baseModel: filters.baseModel ?? remoteBase,
          tag: filters.tag ?? remoteTag,
          sort: filters.sort ?? sort,
          cursor,
        });
        if (searchSeq.current === seq) {
          setSearchResult(result);
          setCursorStack(stack);
        }
      } catch (e) {
        if (searchSeq.current === seq) setSearchError(String(e));
      } finally {
        if (searchSeq.current === seq) setSearchBusy(false);
      }
    },
    [remoteQuery, remoteBase, remoteTag, sort],
  );
  const changeRemoteFilters = (filters: { baseModel?: string; tag?: string; sort?: string }) => {
    if (filters.baseModel !== undefined) setRemoteBase(filters.baseModel);
    if (filters.tag !== undefined) setRemoteTag(filters.tag);
    if (filters.sort !== undefined) setSort(filters.sort);
    // Pass the new selection directly because React state updates apply on the next render.
    void doSearch(null, [null], filters);
  };
  const navigate = async (next: Page) => {
    if (hasUnsaved && !(await ask('配方尚未保存，确认离开并放弃修改？'))) return;
    setHasUnsaved(false);
    setSelected(null);
    setPage(next);
    setQuery('');
    if (next === 'discover' && !searched) void doSearch();
    if (next === 'downloads') void perform(loadTasks);
  };
  const openRemote = async (model: RemoteModel, vid?: number) => {
    setDetailBusy(true);
    try {
      const full = await call<RemoteModel>('model_details', { id: model.id });
      setSelected({ model: full, versionId: vid ?? full.versions[0]?.id ?? 0 });
    } catch (e) {
      notify(String(e), true);
    } finally {
      setDetailBusy(false);
    }
  };
  const openLocal = (entry: LibraryEntry, recipeId?: string) => {
    const model: RemoteModel = {
      id: entry.modelId ?? 0,
      name: entry.name,
      author: entry.author,
      description: entry.version?.description ?? entry.notes,
      tags: entry.tags,
      downloads: 0,
      versions: entry.version ? [entry.version] : [],
    };
    setSelected({ model, versionId: entry.version?.id ?? 0, entryId: entry.id, recipeId });
  };
  const resolve = async () => {
    if (!link.trim()) return;
    if (hasUnsaved && !(await ask('配方尚未保存，确认查看另一个模型？'))) return;
    setImportBusy(true);
    try {
      const r = await call<{ model: RemoteModel; versionId: number; fileId?: number }>('resolve_link', {
        link,
      });
      setSelected(r);
      setImportOpen(false);
      setLink('');
    } catch (e) {
      notify(String(e), true);
    } finally {
      setImportBusy(false);
    }
  };
  const startScan = async () => {
    if (!settings.comfyRoot) {
      setShowSettings(true);
      notify('先绑定 ComfyUI 根目录');
      return;
    }
    await perform(async () => {
      await call('scan_library');
      setScan({ running: true, processed: 0, matched: 0, current: '正在准备扫描', errors: [] });
    });
  };
  const favorite = async (e: LibraryEntry) => {
    await perform(async () => {
      const updated = await call<LibraryEntry>('update_entry', {
        id: e.id,
        edit: { name: e.name, baseModel: e.baseModel, tags: e.tags, notes: e.notes, favorite: !e.favorite },
      });
      setLibrary((prev) => prev.map((item) => (item.id === e.id ? updated : item)));
    });
  };
  const visibleLibrary = useMemo(
    () =>
      library
        .filter(
          (e) =>
            matchesEntry(e, query) &&
            (!base || e.baseModel === base) &&
            (page !== 'favorites' || e.favorite) &&
            (!fileStatus || (fileStatus === 'missing' ? e.missing : !e.missing)),
        )
        .sort((a, b) =>
          localSort === 'name'
            ? a.name.localeCompare(b.name)
            : localSort === 'size'
              ? b.size - a.size
              : b.createdAt - a.createdAt,
        ),
    [library, query, base, page, fileStatus, localSort],
  );
  const bases = useMemo(
    () => [...new Set(library.map((e) => e.baseModel).filter(Boolean))].sort(),
    [library],
  );
  const activeTasks = tasks.filter((t) => ['queued', 'downloading', 'verifying'].includes(t.status)).length;
  const shownTasks = tasks.filter(
    (t) =>
      taskTab === 'all' ||
      (taskTab === 'active'
        ? ['queued', 'downloading', 'verifying', 'paused'].includes(t.status)
        : t.status === 'completed'),
  );
  const closeImport = useCallback(() => setImportOpen(false), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const totalSize = library.filter((e) => !e.missing).reduce((a, e) => a + e.size, 0);
  const modelCards = (items: LibraryEntry[]) => (
    <div className="model-grid">
      {items.map((e) => (
        <article className="model-card" key={e.id}>
          <button className="card-open" onClick={() => openLocal(e)} aria-label={`查看 ${e.name}`}>
            <CoverImage cover={e.cover} alt={e.name} />
            <div className="card-body">
              <h2 title={e.name}>{e.name}</h2>
              <p>{e.author ? `by ${e.author}` : '本地模型 · 待补齐资料'}</p>
              <div className="card-meta">
                <Badge>{e.baseModel || '未分类'}</Badge>
                <span className="version">{e.version?.name ?? '本地'}</span>
                <span className={`install-state ${e.missing ? 'warning' : ''}`}>
                  <i />
                  {e.missing ? '文件缺失' : '已安装'}
                </span>
              </div>
            </div>
          </button>
          <button
            className={`favorite-button ${e.favorite ? 'selected' : ''}`}
            aria-label={e.favorite ? `取消收藏 ${e.name}` : `收藏 ${e.name}`}
            onClick={() => favorite(e)}
          >
            <Heart size={19} fill={e.favorite ? 'currentColor' : 'none'} />
          </button>
        </article>
      ))}
    </div>
  );
  return (
    <div className="app-shell">
      <WindowControls onError={notify} />
      <aside className="sidebar">
        <div className="sidebar-drag-area" data-tauri-drag-region aria-hidden="true" />
        <div className="brand" data-tauri-drag-region>
          <div className="brand-mark">
            <img src="/lora-studio-icon.png" alt="" draggable={false} />
          </div>
          <div>
            <strong>LoRA Studio</strong>
            <small>模型与灵感，井然有序</small>
          </div>
        </div>
        <nav aria-label="主导航">
          <button className={page === 'library' ? 'active' : ''} onClick={() => navigate('library')}>
            {page === 'library' && <NavIndicator />}
            <Folder size={21} />
            我的模型
          </button>
          <button className={page === 'discover' ? 'active' : ''} onClick={() => navigate('discover')}>
            {page === 'discover' && <NavIndicator />}
            <Compass size={21} />
            在线发现
            <ArrowUpRight className="nav-arrow" size={14} />
          </button>
          <button className={page === 'downloads' ? 'active' : ''} onClick={() => navigate('downloads')}>
            {page === 'downloads' && <NavIndicator />}
            <Download size={21} />
            下载中心{activeTasks > 0 && <span className="nav-count">{activeTasks}</span>}
          </button>
          <div className="nav-divider" />
          <span className="nav-label">工作空间</span>
          <button className={page === 'favorites' ? 'active' : ''} onClick={() => navigate('favorites')}>
            {page === 'favorites' && <NavIndicator />}
            <Heart size={21} />
            收藏模型
          </button>
          <button className={page === 'recipes' ? 'active' : ''} onClick={() => navigate('recipes')}>
            {page === 'recipes' && <NavIndicator />}
            <Sparkles size={21} />
            提示词配方
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="settings-nav" onClick={() => setShowSettings(true)}>
            <SettingsIcon size={21} />
            设置
          </button>
          <span className="app-version">
            LoRA Studio <span>v0.1.0</span>
          </span>
        </div>
      </aside>
      <main className="main">
        <div className="breadcrumb" data-tauri-drag-region>
          <span>{page === 'discover' ? 'civitai.red' : '工作空间'}</span>
          <span>/</span>
          <span>{pageTitles[page]}</span>
          {selected && (
            <>
              <span>/</span>
              <strong>{selected.model.name}</strong>
            </>
          )}
          {preview && <span className="top-status">设计验收预览 · 示例数据</span>}
        </div>
        {initialError && <ErrorBox message={initialError} retry={() => void initialize()} />}
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition
            key={
              selected ? `detail-${selected.entryId ?? selected.model.id}-${selected.recipeId ?? ''}` : page
            }
            detail={!!selected}
          >
            {detailBusy ? (
              <Loading text="正在获取完整模型信息…" />
            ) : selected ? (
              <Detail
                key={`${selected.entryId ?? selected.model.id}-${selected.recipeId ?? ''}`}
                selection={selected}
                library={library}
                settings={settings}
                notify={notify}
                onDirtyChange={setHasUnsaved}
                onClose={() => setSelected(null)}
                onChanged={loadLibrary}
                onNeedSettings={() => setShowSettings(true)}
                onDownloaded={async () => {
                  await loadTasks();
                  setSelected(null);
                  setPage('downloads');
                }}
              />
            ) : (
              <>
                <header className="page-header">
                  <div>
                    <h1>{pageTitles[page]}</h1>
                    <p>{subtitles[page]}</p>
                  </div>
                  <div className="header-actions">
                    {page === 'library' && (
                      <button onClick={() => setAddLocalOpen(true)}>
                        <Plus size={17} />
                        添加本地 LoRA
                      </button>
                    )}
                    {(page === 'library' || page === 'favorites') && (
                      <>
                        <button onClick={() => setImportOpen(true)}>
                          <Link size={17} />
                          导入链接
                        </button>
                        <button className="primary" disabled={!!scan?.running} onClick={startScan}>
                          {scan?.running ? (
                            <Loader2 size={17} className="spin" />
                          ) : (
                            <FolderSearch size={17} />
                          )}
                          扫描本地模型
                        </button>
                      </>
                    )}
                    {page === 'discover' && (
                      <button onClick={() => setImportOpen(true)}>
                        <Link size={17} />
                        导入链接
                      </button>
                    )}
                    {page === 'downloads' && (
                      <button
                        disabled={!settings.loraDir}
                        onClick={() => perform(() => reveal(settings.loraDir))}
                      >
                        <FolderOpen size={17} />
                        打开模型目录
                      </button>
                    )}
                  </div>
                </header>
                {scan && (
                  <div className={`scan-strip ${scan.running ? 'running' : ''}`}>
                    <span>
                      {scan.running ? <Loader2 size={17} className="spin" /> : <Check size={17} />}{' '}
                      {scan.running ? '扫描中' : '扫描完成'} · {scan.processed} 个文件 · 已补齐 {scan.matched}{' '}
                      个
                    </span>
                    <span className="scan-current">{scan.current}</span>
                    {!scan.running && (
                      <button className="icon-button" onClick={() => setScan(null)} aria-label="关闭扫描状态">
                        <X size={15} />
                      </button>
                    )}
                  </div>
                )}
                {scan && !scan.running && scan.errors.length > 0 && (
                  <details className="scan-errors">
                    <summary>扫描有 {scan.errors.length} 条提示</summary>
                    {scan.errors.map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </details>
                )}
                {(page === 'library' || page === 'favorites') && (
                  <>
                    <div className="toolbar">
                      <SearchInput value={query} onChange={setQuery} />
                      <label className="inline-label">
                        基础模型
                        <select aria-label="基础模型" value={base} onChange={(e) => setBase(e.target.value)}>
                          <option value="">全部</option>
                          {bases.map((b) => (
                            <option key={b}>{b}</option>
                          ))}
                        </select>
                      </label>
                      <select
                        aria-label="文件状态"
                        value={fileStatus}
                        onChange={(e) => setFileStatus(e.target.value)}
                      >
                        <option value="">全部状态</option>
                        <option value="installed">已安装</option>
                        <option value="missing">文件缺失</option>
                      </select>
                      <select
                        aria-label="本地排序"
                        value={localSort}
                        onChange={(e) => setLocalSort(e.target.value)}
                      >
                        <option value="newest">最近添加</option>
                        <option value="name">名称排序</option>
                        <option value="size">文件大小</option>
                      </select>
                    </div>
                    <div className="filter-row">
                      <div className="chips">
                        <button className={!base ? 'selected' : ''} onClick={() => setBase('')}>
                          全部模型 <CountUp to={library.length} duration={0.45} />
                        </button>
                        {bases.slice(0, 4).map((b) => (
                          <button key={b} className={base === b ? 'selected' : ''} onClick={() => setBase(b)}>
                            {b}
                            <CountUp to={library.filter((e) => e.baseModel === b).length} duration={0.45} />
                          </button>
                        ))}
                      </div>
                      <span className="muted">{visibleLibrary.length} 个模型</span>
                    </div>
                    {initializing ? (
                      <Loading />
                    ) : visibleLibrary.length ? (
                      modelCards(visibleLibrary)
                    ) : (
                      <Empty
                        title={library.length ? '没有找到匹配的模型' : '你的灵感库，从这里开始'}
                        description={
                          library.length
                            ? '试试其他关键词，或清除筛选条件。'
                            : '添加本地 LoRA、扫描模型文件夹，或从 civitai.red 发现新的风格。'
                        }
                        action={
                          <div className="empty-actions">
                            <button onClick={() => setAddLocalOpen(true)}>
                              <Plus size={17} />
                              添加本地 LoRA
                            </button>
                            <button className="primary" onClick={() => navigate('discover')}>
                              <Compass size={17} />
                              探索在线模型
                            </button>
                            <button onClick={startScan}>
                              <FolderSearch size={17} />
                              扫描本地文件夹
                            </button>
                          </div>
                        }
                      />
                    )}
                    <footer className="library-footer">
                      <span>
                        {library.length} 个模型 · {bytes(totalSize)} · 资料保存在本机
                      </span>
                      <LayoutGrid size={17} />
                    </footer>
                  </>
                )}
                {page === 'discover' && (
                  <>
                    <div className="toolbar search-toolbar">
                      <SearchInput
                        value={remoteQuery}
                        onChange={setRemoteQuery}
                        placeholder="搜索 civitai.red 上的 LoRA…"
                        onSubmit={() => void doSearch()}
                      />
                      <button className="primary" disabled={searchBusy} onClick={() => doSearch()}>
                        {searchBusy ? <Loader2 size={17} className="spin" /> : '搜索'}
                      </button>
                    </div>
                    <div className="discovery-filters">
                      <BaseModelFilter
                        value={remoteBase}
                        onChange={(baseModel) => changeRemoteFilters({ baseModel })}
                        reloadKey={JSON.stringify([settings.proxyMode, settings.proxyUrl])}
                      />
                      <label className="inline-label">
                        排序
                        <select value={sort} onChange={(e) => changeRemoteFilters({ sort: e.target.value })}>
                          <option value="Most Downloaded">下载最多</option>
                          <option value="Newest">最新发布</option>
                          <option value="Highest Rated">评分最高</option>
                        </select>
                      </label>
                      <label className="safe-content-toggle">
                        <span>安全内容</span>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label="安全内容"
                          checked={settings.safeContent}
                          disabled={savingSafeContent || initializing}
                          onChange={async (event) => {
                            const safeContent = event.target.checked;
                            setSavingSafeContent(true);
                            try {
                              const saved = await call<Settings>('save_settings', {
                                settings: { ...settings, safeContent },
                              });
                              setSettings(saved);
                              setSearchResult({ items: [], nextCursor: null });
                              await doSearch();
                            } catch (error) {
                              notify(String(error), true);
                            } finally {
                              setSavingSafeContent(false);
                            }
                          }}
                        />
                        <span className="safe-content-track" aria-hidden="true" />
                      </label>
                    </div>
                    <CategoryFilter
                      value={remoteTag}
                      onChange={(tag) => changeRemoteFilters({ tag })}
                      baseModel={remoteBase}
                      reloadKey={JSON.stringify([settings.proxyMode, settings.proxyUrl])}
                    />
                    <div className="link-bar">
                      <Link size={19} />
                      <input
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="粘贴 civitai.red 模型链接…"
                        aria-label="模型链接"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void resolve();
                        }}
                      />
                      <button disabled={importBusy || !link.trim()} onClick={resolve}>
                        {importBusy ? '解析中…' : '解析链接'}
                      </button>
                    </div>
                    {searchError ? (
                      <ErrorBox message={searchError} retry={() => void doSearch()} />
                    ) : searchBusy ? (
                      <div className="model-grid">
                        {Array.from({ length: 8 }, (_, i) => (
                          <div className="skeleton-card" key={i}>
                            <div />
                            <span />
                            <span />
                          </div>
                        ))}
                      </div>
                    ) : searchResult.items.length ? (
                      <div className="model-grid">
                        {searchResult.items.map((m) => {
                          const v = m.versions[0];
                          const installed = library.some((e) => e.modelId === m.id && !e.missing);
                          return (
                            <article className="model-card" key={m.id}>
                              <button
                                className="card-open"
                                onClick={() => openRemote(m)}
                                aria-label={`查看 ${m.name}`}
                              >
                                <CoverImage cover={v?.images[0]} alt={m.name} />
                                <div className="card-body">
                                  <h2 title={m.name}>{m.name}</h2>
                                  <p>by {m.author || '未知作者'}</p>
                                  <div className="card-meta">
                                    <Badge>{v?.baseModel || 'LoRA'}</Badge>
                                    <span className="remote-download-count">
                                      <Download size={13} />
                                      {count(m.downloads)}
                                    </span>
                                    {installed ? (
                                      <span className="install-state">
                                        <i />
                                        已安装
                                      </span>
                                    ) : (
                                      <span className="card-download-icon">
                                        <Download size={18} />
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <Empty title="暂时没有搜索结果" description="换个关键词或基础模型，再试一次。" />
                    )}
                    {!searchBusy && !searchError && (
                      <div className="pagination">
                        <button
                          disabled={cursorStack.length <= 1}
                          onClick={() => {
                            const stack = cursorStack.slice(0, -1);
                            void doSearch(stack[stack.length - 1], stack);
                          }}
                        >
                          上一页
                        </button>
                        <span>{cursorStack.length}</span>
                        <button
                          disabled={!searchResult.nextCursor}
                          onClick={() =>
                            void doSearch(searchResult.nextCursor, [...cursorStack, searchResult.nextCursor])
                          }
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </>
                )}
                {page === 'downloads' && (
                  <>
                    <div className="download-summary">
                      <span>
                        下载中{' '}
                        <strong>
                          {tasks.filter((t) => ['downloading', 'verifying'].includes(t.status)).length}
                        </strong>
                      </span>
                      <span>
                        等待中 <strong>{tasks.filter((t) => t.status === 'queued').length}</strong>
                      </span>
                      <span>
                        已完成 <strong>{tasks.filter((t) => t.status === 'completed').length}</strong>
                      </span>
                    </div>
                    <div className="tabs">
                      {[
                        ['all', '全部任务'],
                        ['active', '进行中'],
                        ['completed', '已完成'],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          className={taskTab === key ? 'active' : ''}
                          onClick={() => setTaskTab(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="download-list">
                      {shownTasks.map((t) => {
                        const progress = t.total ? Math.min(100, (t.downloaded / t.total) * 100) : 0;
                        return (
                          <article className="download-row" key={t.id}>
                            <CoverImage cover={t.version.images[0]} alt={t.model.name} />
                            <div className="download-info">
                              <h2 title={t.model.name}>{t.model.name}</h2>
                              <p title={t.file.name}>{t.file.name}</p>
                              <Badge
                                tone={
                                  t.status === 'completed'
                                    ? 'success'
                                    : t.status === 'failed'
                                      ? 'error'
                                      : t.status === 'paused'
                                        ? 'warning'
                                        : ''
                                }
                              >
                                {statusLabels[t.status] || t.status}
                              </Badge>
                              {t.error && <span className="download-error">{t.error}</span>}
                            </div>
                            <div className="download-progress">
                              {t.status === 'completed' ? (
                                <>
                                  <span className="verified">
                                    <Check size={16} />
                                    {t.file.sha256 ? 'SHA-256 已校验' : '文件大小与格式已校验'}
                                  </span>
                                  <small>{bytes(t.total)} · 已安装到模型目录</small>
                                </>
                              ) : (
                                <>
                                  <div className="progress-line">
                                    <progress value={t.status === 'verifying' ? 100 : progress} max={100} />
                                    <span>{Math.round(progress)}%</span>
                                  </div>
                                  <small>
                                    {bytes(t.downloaded)} / {bytes(t.total)}
                                    {t.speed > 0 ? ` · ${bytes(t.speed)}/s` : ''}
                                  </small>
                                </>
                              )}
                            </div>
                            <div className="download-actions">
                              {['queued', 'downloading', 'verifying', 'paused', 'failed'].includes(
                                t.status,
                              ) && (
                                <button
                                  className="icon-button"
                                  aria-label={`${t.status === 'failed' ? '重试' : t.status === 'paused' ? '继续' : '暂停'} ${t.model.name}`}
                                  onClick={() =>
                                    perform(() =>
                                      call('control_download', {
                                        id: t.id,
                                        action:
                                          t.status === 'failed'
                                            ? 'retry'
                                            : t.status === 'paused'
                                              ? 'resume'
                                              : 'pause',
                                      }),
                                    )
                                  }
                                >
                                  <StateIcon
                                    name={
                                      t.status === 'failed'
                                        ? 'retry'
                                        : t.status === 'paused'
                                          ? 'play'
                                          : 'pause'
                                    }
                                    size={19}
                                  />
                                </button>
                              )}
                              {t.status === 'completed' ? (
                                <button
                                  onClick={() => {
                                    const entry = library.find((e) => e.path === t.destination);
                                    if (entry) openLocal(entry);
                                    else void openRemote(t.model, t.version.id);
                                  }}
                                >
                                  查看模型
                                </button>
                              ) : (
                                t.status !== 'cancelled' && (
                                  <button
                                    className="icon-button"
                                    aria-label={`取消 ${t.model.name}`}
                                    onClick={() =>
                                      perform(async () => {
                                        if (await ask('取消该下载并清除临时文件？'))
                                          await call('control_download', { id: t.id, action: 'cancel' });
                                      })
                                    }
                                  >
                                    <X size={18} />
                                  </button>
                                )
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    {!shownTasks.length && (
                      <Empty
                        icon={<Download size={32} />}
                        title="下载队列很安静"
                        description="选一个喜欢的 LoRA，剩下的交给这里。下载、校验、安装会依次完成。"
                        action={
                          <button className="primary" onClick={() => navigate('discover')}>
                            <Plus size={17} />
                            发现新的模型
                          </button>
                        }
                      />
                    )}
                    <div className="directory-card">
                      <FolderOpen size={29} />
                      <div>
                        <strong>ComfyUI 安装目录</strong>
                        <p>{settings.loraDir || '尚未选择模型文件夹'}</p>
                        <small>下载校验完成后自动安装 · 同时下载 2 个文件</small>
                      </div>
                      <button onClick={() => setShowSettings(true)}>更改目录</button>
                    </div>
                  </>
                )}
                {page === 'recipes' && (
                  <>
                    <div className="toolbar">
                      <SearchInput value={query} onChange={setQuery} placeholder="搜索配方名称或提示词…" />
                    </div>
                    <div className="recipe-grid">
                      {recipes
                        .filter((r) =>
                          [r.name, r.positive, r.negative]
                            .join(' ')
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((r) => {
                          const e = library.find(
                            (e) => (e.version ? `version:${e.version.id}` : `local:${e.id}`) === r.owner,
                          );
                          return (
                            <button
                              className="recipe-card"
                              key={r.id}
                              onClick={() => {
                                if (e) openLocal(e, r.id);
                                else if (r.owner.startsWith('version:')) {
                                  setLink(`https://civitai.red/api/download/models/${r.owner.split(':')[1]}`);
                                  setImportOpen(true);
                                }
                              }}
                            >
                              <Sparkles size={20} />
                              <h2>{r.name}</h2>
                              <small>{e?.name ?? `模型版本 ${r.owner.split(':')[1]}`}</small>
                              <p>{r.positive || '还没有正向提示词'}</p>
                              <div>
                                <Badge>MODEL {r.modelWeight}</Badge>
                                <Badge>CLIP {r.clipWeight}</Badge>
                                <ChevronRight size={17} />
                              </div>
                            </button>
                          );
                        })}
                    </div>
                    {!recipes.length && (
                      <Empty
                        icon={<Sparkles size={32} />}
                        title="把好用的提示词，存成配方"
                        description="打开一个模型，在详情页创建配方。官方触发词与个人提示词分别保存，随时复制使用。"
                        action={<button onClick={() => navigate('library')}>打开我的模型</button>}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </PageTransition>
        </AnimatePresence>
      </main>
      <AnimatePresence>
        {addLocalOpen && (
          <AddLocalModel
            key="addLocalOpen"
            onClose={() => setAddLocalOpen(false)}
            onAdded={(entry) => {
              setLibrary((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
              setQuery('');
              setBase('');
              setFileStatus('');
              setLocalSort('newest');
              setPage('library');
              setAddLocalOpen(false);
              notify('已添加到我的模型');
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {importOpen && (
          <Modal key="importOpen" title="从链接导入模型" onClose={closeImport}>
            <p className="modal-description">粘贴模型、版本或下载入口链接，先查看资料，再选择文件下载。</p>
            <input
              autoFocus
              className="full-width"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://civitai.red/models/…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void resolve();
              }}
            />
            <div className="modal-actions">
              <button onClick={closeImport}>取消</button>
              <button className="primary" disabled={importBusy || !link.trim()} onClick={resolve}>
                {importBusy ? <Loader2 size={17} className="spin" /> : <Link size={17} />}解析链接
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            key="showSettings"
            settings={settings}
            onClose={closeSettings}
            onSaved={async (s) => {
              setSettings(s);
            }}
            notify={notify}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`toast ${toast.error ? 'toast-error' : ''}`}
            role="status"
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: easeOut }}
          >
            <StateIcon name={toast.error ? 'close' : 'check'} />
            <span>{toast.text}</span>
            <button className="icon-button" onClick={() => setToast(null)} aria-label="关闭提示">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
