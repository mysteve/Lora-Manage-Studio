// Development-only visual fixtures. Never enabled in a packaged desktop build.
import data from './preview-models.json';
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
};
let library: LibraryEntry[] = models.map((m, i) => ({
  id: `preview-${i}`,
  path: `D:\\ComfyUI\\models\\loras\\${m.versions[0]?.files[0]?.name ?? 'model.safetensors'}`,
  size: (m.versions[0]?.files[0]?.sizeKb ?? 0) * 1024,
  modified: 0,
  sha256: m.versions[0]?.files[0]?.sha256 ?? '',
  name: m.name,
  triggerWords: [],
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
  destination: library[i].path,
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
    case 'save_settings':
      settings = args.settings;
      return settings;
    case 'list_library':
      return new URLSearchParams(location.search).has('empty') ? [] : library;
    case 'list_downloads':
      return tasks;
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
    case 'search_models':
      return {
        items: models.filter((m) => m.name.toLowerCase().includes((args.query ?? '').toLowerCase())),
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
