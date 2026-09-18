import { AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  File,
  FolderOpen,
  Heart,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react';
import { ask, call, chooseImage, copy, external, reveal } from '../../lib/api';
import { Badge, Modal } from '../../components/ui';
import { ImageGallery } from './ImageGallery';
import { bytes } from '../../lib/utils';
import type { LibraryEntry, RemoteModel, Settings } from '../../types/models';

interface Props {
  selection: { model: RemoteModel; versionId: number; entryId?: string; fileId?: number; recipeId?: string };
  library: LibraryEntry[];
  settings: Settings;
  notify: (s: string, error?: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
  backLabel?: string;
  onChanged: () => Promise<void>;
  onNeedSettings: () => void;
  onDownloaded: () => Promise<void>;
}
export function Detail({
  selection,
  library,
  settings,
  notify,
  onClose,
  onChanged,
  onNeedSettings,
  onDownloaded,
  backLabel = '返回模型库',
}: Props) {
  const root = library.find((e) => e.id === selection.entryId);
  const versions = useMemo(
    () => (root?.version ? [root.version] : selection.model.versions),
    [root?.version, selection.model.versions],
  );
  const [vid, setVid] = useState(selection.versionId);
  const version = versions.find((v) => v.id === vid) ?? versions[0];
  const entry = root ?? library.find((e) => e.version?.id === version?.id);
  const name = entry?.name ?? selection.model.name;
  const [fileId, setFileId] = useState(0);
  const safeFiles = useMemo(
    () => version?.files.filter((f) => f.name.toLowerCase().endsWith('.safetensors')) ?? [],
    [version],
  );
  const file = safeFiles.find((f) => f.id === fileId) ?? safeFiles.find((f) => f.primary) ?? safeFiles[0];
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState('recipe');
  const [editOpen, setEditOpen] = useState(false);
  const [bindLink, setBindLink] = useState('');
  const perform = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e), true);
    } finally {
      setBusy('');
    }
  };
  useEffect(() => {
    setFileId(version?.id === selection.versionId ? (selection.fileId ?? 0) : 0);
  }, [version?.id, selection.fileId, selection.versionId]);
  const copyText = async (text: string) =>
    perform('copy', async () => {
      await copy(text);
      notify('已复制到剪贴板');
    });
  const download = async () => {
    if (!settings.comfyRoot) {
      onNeedSettings();
      notify('请先绑定 ComfyUI 根目录');
      return;
    }
    if (!version || !file) return;
    await perform('download', async () => {
      await call('enqueue_download', { modelId: selection.model.id, versionId: version.id, fileId: file.id });
      notify('已加入下载队列');
      await onDownloaded();
    });
  };
  const website = `https://civitai.red/models/${entry?.modelId ?? selection.model.id}${version ? `?modelVersionId=${version.id}` : ''}`;
  const changeCover = async (mode: string, value = '') => {
    if (!entry) return;
    await perform('cover', async () => {
      await call('set_cover', { id: entry.id, mode, value });
      await onChanged();
      notify('封面已更新');
    });
  };
  return (
    <section className="detail-page">
      <header className="detail-header">
        <button
          className="icon-button back-button"
          onClick={onClose}
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 title={name}>{name}</h1>
          <p>
            {entry?.author || selection.model.author
              ? `by ${entry?.author || selection.model.author}`
              : '本地模型'}{' '}
            · {version?.baseModel || entry?.baseModel || '未分类'}
          </p>
        </div>
        <div className="header-actions">
          {entry && (
            <button onClick={() => setEditOpen(true)}>
              <SlidersHorizontal size={19} />
              编辑本地资料
            </button>
          )}
          {!!(entry?.modelId ?? selection.model.id) && (
            <button onClick={() => perform('external', () => external(website))}>
              <ArrowUpRight size={17} />
              官网详情
            </button>
          )}
        </div>
      </header>
      <div className="detail-columns">
        <div className="detail-left">
          <ImageGallery
            key={`${selection.model.id}:${version?.id ?? entry?.id}`}
            images={version?.images ?? []}
            cover={entry?.cover}
            name={name}
            onCopy={copyText}
            onSetCover={entry ? (url) => changeCover('remote', url) : undefined}
            busy={!!busy}
          />
          {entry && (
            <button
              disabled={!!busy}
              onClick={() =>
                perform('cover-picker', async () => {
                  const image = await chooseImage();
                  if (image) await changeCover('local', image);
                })
              }
            >
              <ImagePlus size={21} /> 更换本地封面
            </button>
          )}
          {entry?.customCover && (
            <button className="text-button" disabled={!!busy} onClick={() => changeCover('reset')}>
              {version?.images.length ? '恢复网站默认封面' : '移除自定义封面'}
            </button>
          )}
          <section className="description-block">
            <h2>简介</h2>
            <p>
              {version?.description ||
                selection.model.description ||
                '暂无网站简介。可以在本地资料中补充备注，或绑定对应的网站版本。'}
            </p>
          </section>
          <dl className="metadata">
            <div>
              <dt>
                <LayersIcon />
                基础模型
              </dt>
              <dd>{entry?.baseModel || version?.baseModel || '未分类'}</dd>
            </div>
            <div>
              <dt>
                <File size={16} />
                模型格式
              </dt>
              <dd>
                {file?.format ||
                  (entry?.path.toLowerCase().endsWith('.safetensors') ? 'SafeTensor' : '本地文件')}
              </dd>
            </div>
            <div>
              <dt>
                <File size={16} />
                文件大小
              </dt>
              <dd>{bytes(entry?.size ?? (file?.sizeKb ?? 0) * 1024)}</dd>
            </div>
            <div>
              <dt>
                <Download size={16} />
                安装状态
              </dt>
              <dd className={entry && !entry.missing ? 'accent-text' : ''}>
                {entry ? (entry.missing ? '文件缺失' : '已安装') : '未安装'}
              </dd>
            </div>
            {entry && (
              <div>
                <dt>
                  <Check size={16} />
                  文件校验
                </dt>
                <dd>{entry.verified ? 'SHA-256 已验证' : '本地文件，未匹配网站'}</dd>
              </div>
            )}
          </dl>
          {(entry?.tags ?? selection.model.tags).length > 0 && (
            <div className="tag-list">
              {(entry?.tags ?? selection.model.tags).map((t, i) => (
                <Badge key={`${t}-${i}`}>{t}</Badge>
              ))}
            </div>
          )}
          {entry && (
            <div className="local-tools">
              <button onClick={() => perform('reveal', () => reveal(entry.path))}>
                <FolderOpen size={16} />
                定位文件
              </button>
              {entry.version && (
                <button
                  disabled={!!busy}
                  onClick={() =>
                    perform('refresh', async () => {
                      await call('refresh_entry', { id: entry.id });
                      await onChanged();
                      notify('网站资料已更新，个人内容已保留');
                    })
                  }
                >
                  <RefreshCw size={16} className={busy === 'refresh' ? 'spin' : ''} />
                  更新资料
                </button>
              )}
            </div>
          )}
        </div>
        <div className="detail-panel">
          <div className="tabs">
            <button className={tab === 'recipe' ? 'active' : ''} onClick={() => setTab('recipe')}>
              官方触发词
            </button>
            <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>
              模型信息
            </button>
          </div>
          <div className="version-row">
            <label>版本</label>
            <select
              aria-label="模型版本"
              value={version?.id ?? 0}
              onChange={(e) => setVid(Number(e.target.value))}
              disabled={!!busy}
            >
              {versions.length ? (
                versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.baseModel}
                  </option>
                ))
              ) : (
                <option value={0}>未绑定的本地模型</option>
              )}
            </select>
            {entry && (
              <Badge tone={entry.missing ? 'warning' : 'success'}>
                {entry.missing ? '文件缺失' : '已安装'}
              </Badge>
            )}
          </div>
          {tab === 'recipe' ? (
            <div className="trigger-section">
              <strong>官方触发词</strong>
              <div className="tag-list">
                {version?.trainedWords.length ? (
                  version.trainedWords.map((w, i) => (
                    <button
                      key={i}
                      type="button"
                      className="badge accent"
                      aria-label={`复制触发词 ${w}`}
                      title="点击复制此触发词"
                      onClick={() => void copyText(w)}
                    >
                      {w}
                    </button>
                  ))
                ) : (
                  <span className="muted">作者未提供触发词</span>
                )}
              </div>
              <button
                className="icon-button"
                aria-label="复制官方触发词"
                disabled={!version?.trainedWords.length}
                onClick={() => copyText((version?.trainedWords ?? []).join(', '))}
              >
                <Copy size={17} />
              </button>
            </div>
          ) : (
            <div className="model-info-tab">
              <h2>文件与来源</h2>
              {entry && (
                <>
                  <label className="field">
                    本地文件
                    <input readOnly value={entry.path} />
                  </label>
                  <label className="field">
                    SHA-256
                    <input readOnly value={entry.sha256} />
                  </label>
                  <label className="field">
                    个人备注<p className="notes-display">{entry.notes || '暂无备注'}</p>
                  </label>
                </>
              )}
              {version && (
                <>
                  <p>
                    版本编号 <strong>{version.id}</strong> · {version.availability || '网站公开版本'}
                  </p>
                  <p className="muted">{version.files.length} 个文件；首版支持下载 SafeTensor 格式。</p>
                </>
              )}
              {entry && (
                <>
                  <h2>绑定网站版本</h2>
                  <p className="field-help">绑定时重新计算文件哈希，只有与目标版本一致才保存关联。</p>
                  <div className="bind-form">
                    <input
                      value={bindLink}
                      onChange={(e) => setBindLink(e.target.value)}
                      placeholder="https://civitai.red/models/…"
                    />
                    <button
                      disabled={!!busy || !bindLink.trim()}
                      onClick={() =>
                        perform('bind', async () => {
                          await call('bind_entry', { id: entry.id, link: bindLink });
                          await onChanged();
                          setBindLink('');
                          notify('哈希匹配，已绑定网站资料');
                        })
                      }
                    >
                      {busy === 'bind' ? <Loader2 size={16} className="spin" /> : <LinkIcon size={16} />}绑定
                    </button>
                  </div>
                  <div className="danger-zone">
                    <button
                      onClick={() =>
                        perform('remove', async () => {
                          if (await ask('将模型移出管理库？模型文件和配方会保留，再次扫描可找回。')) {
                            await call('remove_entry', { id: entry.id, deleteFile: false });
                            await onChanged();
                            onClose();
                          }
                        })
                      }
                    >
                      移出管理库
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        perform('delete-file', async () => {
                          if (await ask(`将「${entry.name}」的模型文件移入 Windows 回收站？`)) {
                            await call('remove_entry', { id: entry.id, deleteFile: true });
                            await onChanged();
                            onClose();
                          }
                        })
                      }
                    >
                      <Trash2 size={16} />
                      删除模型文件
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {(!entry || entry.missing) && version && (
            <div className="download-box">
              <label className="field">
                下载文件
                <select
                  aria-label="下载文件"
                  value={file?.id ?? 0}
                  onChange={(e) => setFileId(Number(e.target.value))}
                >
                  {safeFiles.length ? (
                    safeFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} · {bytes(f.sizeKb * 1024)}
                      </option>
                    ))
                  ) : (
                    <option value={0}>该版本没有可下载的 SafeTensor 文件</option>
                  )}
                </select>
              </label>
              <div>
                <button disabled={!file} onClick={() => copyText(file?.downloadUrl ?? '')}>
                  <LinkIcon size={16} />
                  复制下载入口
                </button>
                <button className="primary" disabled={!file || !!busy} onClick={download}>
                  {busy === 'download' ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
                  下载并安装
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {editOpen && entry && (
          <EntryEditor
            entry={entry}
            onClose={() => setEditOpen(false)}
            onSaved={async () => {
              await onChanged();
              setEditOpen(false);
            }}
            notify={notify}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
function LayersIcon() {
  return <SlidersHorizontal size={16} />;
}
function EntryEditor({
  entry,
  onClose,
  onSaved,
  notify,
}: {
  entry: LibraryEntry;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: Props['notify'];
}) {
  const [name, setName] = useState(entry.name);
  const [base, setBase] = useState(entry.baseModel);
  const [tags, setTags] = useState(entry.tags.join(', '));
  const [notes, setNotes] = useState(entry.notes);
  const [favorite, setFavorite] = useState(entry.favorite);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="编辑本地资料" onClose={onClose}>
      <label className="field">
        模型别名（本地显示名称）
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="field-help">别名用于模型库展示和搜索，不会修改模型文件名。</p>
      <label className="field">
        基础模型
        <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="例如 SDXL 1.0" />
      </label>
      <label className="field">
        标签
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="使用逗号分隔" />
      </label>
      <label className="field">
        备注
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
        <Heart size={16} />
        收藏这个模型
      </label>
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button
          className="primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await call('update_entry', {
                id: entry.id,
                edit: {
                  name,
                  triggerWords: entry.triggerWords,
                  baseModel: base,
                  tags: tags.split(/[,，]/),
                  notes,
                  favorite,
                },
              });
              await onSaved();
              notify('本地资料已保存');
            } catch (e) {
              notify(String(e), true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save size={16} />
          保存资料
        </button>
      </div>
    </Modal>
  );
}
