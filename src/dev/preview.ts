// Development-only visual fixtures. Never enabled in a packaged desktop build.
import data from './preview-models.json';
import { parseTriggerWords } from '../lib/utils';
import type {
  DownloadTask,
  LibraryEntry,
  ModelVersion,
  Recipe,
  RemoteModel,
  Settings,
} from '../types/models';
type Raw = Record<string, any>;
const models: RemoteModel[] = (data as Raw[]).map((m) => ({
  id: m.id,
  name: m.name,
  author: m.creator?.username ?? '',
  description: '来自 civitai.red 的模型资料，用于开发环境视觉验收。',
  tags: m.tags ?? [],
  downloads: m.stats?.downloadCount ?? 0,
  versions: (m.modelVersions ?? []).map((v: Raw): ModelVersion => ({
    id: v.id,
    modelId: m.id,
    name: v.name,
    baseModel: v.baseModel,
    description: '适用于风景与光影创作。此页面为开发环境预览，模型安装与下载状态为示例。',
    trainedWords: v.trainedWords ?? [],
    availability: v.availability ?? 'Public',
    files: (v.files ?? []).map((f: Raw) => ({
      id: f.id,
      name: f.name,
      sizeKb: f.sizeKB,
      downloadUrl: f.downloadUrl,
      sha256: f.hashes?.SHA256 ?? '',
      format: f.metadata?.format ?? '',
      primary: f.primary ?? false,
    })),
    images: (v.images ?? [])
      .filter((i: Raw) => i.type === 'image')
      .map((i: Raw) => ({ url: i.url, localPath: '' })),
  })),
}));
let settings: Settings = {
  loraDir: 'D:\\ComfyUI\\models\\loras',
  comfyRoot: 'D:\\ComfyUI',
  proxyMode: 'system',
  proxyUrl: '',
  safeContent: true,
  setupDismissed: false,
};
let library: LibraryEntry[] = models.map((m, i) => ({
  id: `preview-${i}`,
  path: `D:\\ComfyUI\\models\\loras\\${m.versions[0]?.files[0]?.name ?? 'model.safetensors'}`,
  size: (m.versions[0]?.files[0]?.sizeKb ?? 0) * 1024,
  modified: 0,
  sha256: m.versions[0]?.files[0]?.sha256 ?? '',
  name: m.name,
  triggerWords: [],
  triggerPreviews: [],
  author: m.author,
  baseModel: m.versions[0]?.baseModel ?? '',
  tags: m.tags,
  notes: '',
  favorite: i < 2,
  missing: false,
  verified: true,
  cover: m.versions[0]?.images[0] ?? { url: '', localPath: '' },
  customCover: false,
  modelId: m.id,
  version: m.versions[0] ?? null,
  createdAt: Date.now() / 1000 - i,
}));
if (new URLSearchParams(location.search).has('empty')) library = [];
let recipes: Recipe[] = models.slice(0, 3).map((m, i) => ({
  id: `r-${i}`,
  owner: `version:${m.versions[0]?.id}`,
  name: ['日常电影感', '自然光线', '柔和色调'][i],
  positive: 'a cinematic landscape, soft lighting, detailed atmosphere',
  negative: 'blurry, low quality',
  modelWeight: 0.8,
  clipWeight: 1,
  notes: '适合自然风景，搭配柔和光线。',
}));
const tasks: DownloadTask[] = models.slice(0, 5).map((m, i) => ({
  id: `task-${i}`,
  model: m,
  version: m.versions[0],
  file: m.versions[0].files[0],
  destination: `D:\\ComfyUI\\models\\loras\\${m.versions[0].files[0].name}`,
  status: ['downloading', 'downloading', 'queued', 'completed', 'paused'][i],
  downloaded: m.versions[0].files[0].sizeKb * 1024 * [0.64, 0.28, 0, 1, 0.3][i],
  total: m.versions[0].files[0].sizeKb * 1024,
  speed: i < 2 ? 8.4 * 1024 * 1024 : 0,
  error: '',
  createdAt: Date.now() / 1000 - i,
}));
export async function previewCall(command: string, args: Raw): Promise<unknown> {
  switch (command) {
    case 'get_settings':
      return settings;
    case 'dismiss_setup':
      settings = { ...settings, setupDismissed: true };
      return settings;
    case 'save_settings':
      settings = args.settings;
      return settings;
    case 'list_library':
      return library;
    case 'add_local_model': {
      const input = args.input;
      if (!input.name.trim()) throw new Error('模型名称不能为空');
      if (!/\.(safetensors|ckpt|pt|bin)$/i.test(input.path)) {
        throw new Error('仅支持 .safetensors、.ckpt、.pt、.bin 模型文件');
      }
      if (library.some((entry) => entry.path.toLowerCase() === input.path.toLowerCase())) {
        throw new Error('该文件已在我的模型中，可打开详情编辑资料');
      }
      const entry: LibraryEntry = {
        id: crypto.randomUUID(),
        path: input.path,
        name: input.name.trim(),
        size: 0,
        modified: 0,
        sha256: '',
        author: '',
        baseModel: input.baseModel.trim(),
        triggerWords: parseTriggerWords(input.triggerWords.join('\n')),
        triggerPreviews: [],
        tags: parseTriggerWords(input.tags.join('\n')),
        notes: input.notes,
        favorite: false,
        missing: false,
        verified: false,
        cover: { url: '', localPath: '' },
        customCover: false,
        modelId: null,
        version: null,
        createdAt: Date.now() / 1000,
      };
      library = [entry, ...library];
      return entry;
    }
    case 'list_downloads':
      return tasks;
    case 'save_trigger_preview': {
      const entry = library.find((item) => item.id === args.entryId);
      if (!entry) throw new Error('模型记录不存在');
      const input = args.input;
      const triggerWords = parseTriggerWords(input.triggerWords.join('\n'));
      if (!triggerWords.length) throw new Error('请至少填写一个触发词');
      const existing = entry.triggerPreviews.find((group) => group.id === input.id);
      if (input.id && !existing) throw new Error('该组合已不存在');
      const group = {
        id: input.id || crypto.randomUUID(),
        name: input.name.trim() || triggerWords.join(' + '),
        triggerWords,
        notes: input.notes,
        image: input.imagePath
          ? { url: '', localPath: input.imagePath }
          : input.removeImage
            ? { url: '', localPath: '' }
            : (existing?.image ?? { url: '', localPath: '' }),
      };
      const result = {
        ...entry,
        triggerPreviews: existing
          ? entry.triggerPreviews.map((p) => (p.id === group.id ? group : p))
          : [...entry.triggerPreviews, group],
      };
      library = library.map((item) => (item.id === result.id ? result : item));
      return result;
    }
    case 'delete_trigger_preview': {
      const entry = library.find((item) => item.id === args.entryId);
      if (!entry) throw new Error('模型记录不存在');
      const result = {
        ...entry,
        triggerPreviews: entry.triggerPreviews.filter((group) => group.id !== args.previewId),
      };
      library = library.map((item) => (item.id === result.id ? result : item));
      return result;
    }
    case 'auth_status':
      return { hasToken: false, oauthConfigured: false };
    case 'has_token':
      return false;
    case 'save_token':
    case 'start_login':
    case 'poll_login':
      throw new Error('请在桌面应用中设置登录凭据');
    case 'cancel_login':
      return null;
    case 'data_location':
      return '开发环境示例数据';
    case 'cache_cover':
      return { url: args.url, localPath: args.url };
    case 'get_base_models':
      return [...new Set(models.flatMap((model) => model.versions.map((version) => version.baseModel)))];
    case 'get_model_tags':
      return [...new Set(models.flatMap((model) => model.tags))].filter((tag) =>
        tag.toLowerCase().includes((args.query ?? '').trim().toLowerCase()),
      );
    case 'search_models':
      return {
        items: models.filter(
          (m) =>
            m.name.toLowerCase().includes((args.query ?? '').toLowerCase()) &&
            (!args.baseModel || m.versions.some((version) => version.baseModel === args.baseModel)) &&
            (!args.tag || m.tags.includes(args.tag)),
        ),
        nextCursor: null,
      };
    case 'model_details':
      return models.find((m) => m.id === args.id);
    case 'resolve_link':
      return { model: models[0], versionId: models[0].versions[0].id };
    case 'list_recipes':
      return recipes.filter((r) => !args.owner || r.owner === args.owner);
    case 'save_recipe': {
      const r = { ...args.recipe, id: args.recipe.id || crypto.randomUUID() };
      recipes = [r, ...recipes.filter((e) => e.id !== r.id)];
      return r;
    }
    case 'delete_recipe':
      recipes = recipes.filter((r) => r.id !== args.id);
      return null;
    case 'update_entry':
      library = library.map((e) => (e.id === args.id ? { ...e, ...args.edit } : e));
      return library.find((e) => e.id === args.id);
    case 'remove_entry':
      library = library.filter((e) => e.id !== args.id);
      return null;
    default:
      throw new Error('该操作需要桌面环境，预览不会写入模型文件。');
  }
}
