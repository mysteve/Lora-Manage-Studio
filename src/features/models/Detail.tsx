import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react';
import { ask, call, chooseImage, copy, external, reveal } from '../../lib/api';
import { Badge, CoverImage, Loading, Modal } from '../../components/ui';
import { TriggerPreviews } from './TriggerPreviews';
import { blankRecipe, bytes, combine, modelTriggerWords, owner, parseTriggerWords } from '../../lib/utils';
import type { LibraryEntry, ModelVersion, Recipe, RemoteModel, Settings } from '../../types/models';

interface Props {
  selection: { model: RemoteModel; versionId: number; entryId?: string; fileId?: number; recipeId?: string };
  library: LibraryEntry[];
  settings: Settings;
  notify: (s: string, error?: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onNeedSettings: () => void;
  onDownloaded: () => Promise<void>;
}
export function Detail({
  selection,
  library,
  settings,
  notify,
  onDirtyChange,
  onClose,
  onChanged,
  onNeedSettings,
  onDownloaded,
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
  const recipeOwner = owner(entry, version);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipe, setRecipe] = useState<Recipe>(blankRecipe(recipeOwner));
  const [saved, setSaved] = useState('');
  const [recipeLoading, setRecipeLoading] = useState(true);
  const [recipeError, setRecipeError] = useState('');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState(entry && !selection.recipeId ? 'previews' : 'recipe');
  const [editOpen, setEditOpen] = useState(false);
  const [bindLink, setBindLink] = useState('');
  const dirty = !!saved && JSON.stringify(recipe) !== saved;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
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
  const reloadRecipes = useCallback(async () => {
    setRecipeLoading(true);
    setRecipeError('');
    try {
      const list = await call<Recipe[]>('list_recipes', { owner: recipeOwner });
      const r = list.find((r) => r.id === selection.recipeId) ?? list[0] ?? blankRecipe(recipeOwner);
      setRecipes(list);
      setRecipe(r);
      setSaved(JSON.stringify(r));
    } catch (e) {
      setRecipeError(String(e));
    } finally {
      setRecipeLoading(false);
    }
  }, [recipeOwner, selection.recipeId]);
  useEffect(() => {
    void reloadRecipes();
  }, [reloadRecipes]);
  useEffect(() => {
    setFileId(version?.id === selection.versionId ? (selection.fileId ?? 0) : 0);
  }, [version?.id, selection.fileId, selection.versionId]);
  const guard = async () => !dirty || (await ask('配方有尚未保存的修改，确认放弃这些修改？'));
  const close = async () => {
    if (await guard()) onClose();
  };
  const switchVersion = async (id: number) => {
    if (await guard()) setVid(id);
  };
  const save = async () =>
    perform('save', async () => {
      const result = await call<Recipe>('save_recipe', { recipe });
      setRecipe(result);
      setSaved(JSON.stringify(result));
      setRecipes((list) => [result, ...list.filter((r) => r.id !== result.id)]);
      notify('配方已保存到本机');
    });
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
    if (!(await guard())) return;
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
  const patchRecipe = (patch: Partial<Recipe>) => setRecipe((prev) => ({ ...prev, ...patch }));
  return (
    <section className="detail-page">
      <header className="detail-header">
        <button className="icon-button back-button" onClick={close} aria-label="返回模型库">
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
              编辑别名与触发词
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
          <CoverImage className="detail-cover" cover={entry?.cover ?? version?.images[0]} alt={name} />
          <div className="thumbnail-row">
            {version?.images.slice(0, 3).map((c, i) => (
              <button
                key={c.url}
                disabled={!entry || !!busy}
                className={entry?.cover.url === c.url ? 'chosen' : ''}
                aria-label={`选择封面 ${i + 1}`}
                onClick={() => changeCover('remote', c.url)}
              >
                <CoverImage cover={c} alt={`封面 ${i + 1}`} />
              </button>
            ))}
            {entry && (
              <button
                className="cover-upload"
                disabled={!!busy}
                onClick={() =>
                  perform('cover-picker', async () => {
                    const image = await chooseImage();
                    if (image) await changeCover('local', image);
                  })
                }
              >
                <ImagePlus size={21} />
                <span>{entry.cover.localPath || entry.cover.url ? '更换封面' : '添加封面'}</span>
              </button>
            )}
          </div>
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
            {entry && (
              <button className={tab === 'previews' ? 'active' : ''} onClick={() => setTab('previews')}>
                组合预览
              </button>
            )}
            <button className={tab === 'recipe' ? 'active' : ''} onClick={() => setTab('recipe')}>
              提示词配方
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
              onChange={(e) => void switchVersion(Number(e.target.value))}
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
          {tab === 'previews' && entry ? (
            <TriggerPreviews key={entry.id} entry={entry} onChanged={onChanged} notify={notify} />
          ) : tab === 'recipe' ? (
            <>
              <div className="trigger-section">
                <strong>官方触发词</strong>
                <div className="tag-list">
                  {version?.trainedWords.length ? (
                    version.trainedWords.map((w, i) => (
                      <Badge key={i} tone="accent">
                        {w}
                      </Badge>
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
              {entry && (
                <div className="trigger-section">
                  <strong>自定义触发词</strong>
                  <div className="tag-list">
                    {entry.triggerWords?.length ? (
                      entry.triggerWords.map((word) => (
                        <Badge key={word} tone="accent">
                          {word}
                        </Badge>
                      ))
                    ) : (
                      <span className="muted">可添加自己训练或常用的触发词</span>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    aria-label="复制自定义触发词"
                    disabled={!entry.triggerWords?.length}
                    onClick={() => copyText((entry.triggerWords ?? []).join(', '))}
                  >
                    <Copy size={17} />
                  </button>
                  <button onClick={() => setEditOpen(true)}>编辑</button>
                </div>
              )}
              {recipeLoading ? (
                <Loading text="正在读取个人配方…" />
              ) : recipeError ? (
                <p className="error-box">
                  {recipeError}
                  <button onClick={reloadRecipes}>重试</button>
                </p>
              ) : (
                <div className="recipe-editor">
                  <div className="recipe-selector">
                    <strong>我的配方</strong>
                    <select
                      aria-label="选择个人配方"
                      value={recipe.id}
                      onChange={async (e) => {
                        const id = e.target.value;
                        if (await guard()) {
                          const r = recipes.find((r) => r.id === id) ?? blankRecipe(recipeOwner);
                          setRecipe(r);
                          setSaved(JSON.stringify(r));
                        }
                      }}
                    >
                      <option value="">新配方</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        if (await guard()) {
                          const r = { ...blankRecipe(recipeOwner), name: `新配方 ${recipes.length + 1}` };
                          setRecipe(r);
                          setSaved(JSON.stringify(r));
                        }
                      }}
                    >
                      <Plus size={16} />
                      新建
                    </button>
                  </div>
                  <label className="field">
                    配方名称
                    <input
                      value={recipe.name}
                      onChange={(e) => patchRecipe({ name: e.target.value })}
                      maxLength={120}
                    />
                  </label>
                  <label className="field">
                    正向提示词
                    <div className="textarea-wrap">
                      <textarea
                        value={recipe.positive}
                        onChange={(e) => patchRecipe({ positive: e.target.value })}
                        placeholder="写下画面、风格、光线与细节…"
                        rows={4}
                      />
                      <button
                        className="textarea-copy"
                        title="复制正向提示词"
                        aria-label="复制正向提示词"
                        onClick={() => copyText(recipe.positive)}
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  </label>
                  <label className="field">
                    负向提示词
                    <div className="textarea-wrap">
                      <textarea
                        value={recipe.negative}
                        onChange={(e) => patchRecipe({ negative: e.target.value })}
                        placeholder="不希望在画面中出现的内容…"
                        rows={3}
                      />
                      <button
                        className="textarea-copy"
                        title="复制负向提示词"
                        aria-label="复制负向提示词"
                        onClick={() => copyText(recipe.negative)}
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  </label>
                  <div className="weight-row">
                    <label>
                      模型权重
                      <input
                        type="number"
                        min={-20}
                        max={20}
                        step={0.05}
                        value={recipe.modelWeight}
                        onChange={(e) => patchRecipe({ modelWeight: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      CLIP 权重
                      <input
                        type="number"
                        min={-20}
                        max={20}
                        step={0.05}
                        value={recipe.clipWeight}
                        onChange={(e) => patchRecipe({ clipWeight: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <label className="field">
                    备注
                    <textarea
                      value={recipe.notes}
                      onChange={(e) => patchRecipe({ notes: e.target.value })}
                      placeholder="适用场景、搭配建议或这次的灵感…"
                      rows={2}
                    />
                  </label>
                  <div className="recipe-footer">
                    {recipe.id && (
                      <button
                        className="icon-button danger"
                        aria-label="删除配方"
                        disabled={!!busy}
                        onClick={() =>
                          perform('delete-recipe', async () => {
                            if (await ask(`删除配方「${recipe.name}」？`)) {
                              await call('delete_recipe', { id: recipe.id });
                              await reloadRecipes();
                            }
                          })
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                    <span className="save-hint">{dirty ? '有未保存的修改' : '仅保存在本机'}</span>
                    <button
                      onClick={() => copyText(combine(modelTriggerWords(entry, version), recipe.positive))}
                    >
                      <Copy size={17} />
                      复制组合提示词
                    </button>
                    <button className="primary" disabled={!!busy} onClick={save}>
                      {busy === 'save' ? <Loader2 size={17} className="spin" /> : <Save size={17} />}保存配方
                    </button>
                  </div>
                  <p className="field-help">
                    组合复制包含官方触发词、自定义触发词和正向提示词，重复的触发词只保留一次。权重请在 ComfyUI
                    的 LoRA 节点中设置。
                  </p>
                </div>
              )}
            </>
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
  const [triggerWords, setTriggerWords] = useState((entry.triggerWords ?? []).join('\n'));
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
        自定义触发词
        <textarea
          rows={3}
          value={triggerWords}
          onChange={(e) => setTriggerWords(e.target.value)}
          placeholder="每行一个，也可使用中英文逗号分隔"
        />
      </label>
      <p className="field-help">与官方触发词分别保存，刷新网站资料时保留。清空后保存即可移除自定义触发词。</p>
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
                  triggerWords: parseTriggerWords(triggerWords),
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
