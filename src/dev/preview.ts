// Development-only visual fixtures. Never enabled in a packaged desktop build.
import data from './preview-models.json';
import outputSample from '../assets/safety-cover.png';
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
    imagesClassified: true,
    images: (v.images ?? [])
      .filter((i: Raw) => i.type === 'image')
      .map((i: Raw) => ({ url: i.url, localPath: '', meta: i.meta, nsfwLevel: i.nsfwLevel ?? 1 })),
  })),
}));
// Use harmless landscape images to exercise safety states without restricted media.
if (new URLSearchParams(location.search).has('safety-preview')) {
  models[0].name = '安全审查示例 · 风景封面';
  models[0].versions[0].images = models[0].versions[0].images.map((image) => ({ ...image, nsfwLevel: 4 }));
  models[1].name = '无封面示例';
  models[1].versions[0].images = [];
}
let settings: Settings = {
  loraDir: 'D:\\ComfyUI\\models\\loras',
  outputDir: '',
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
let aiConfig = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: '' };
export async function previewCall(command: string, args: Raw): Promise<unknown> {
  switch (command) {
    case 'debug_resources_enabled':
      return false;
    case 'debug_resource_snapshot':
      throw new Error('资源监测需要 Windows 桌面开发模式');
    case 'check_app_update':
      throw new Error('请在桌面应用中检查更新，或打开 GitHub 发布页面');
    case 'get_ai_config':
      return aiConfig;
    case 'save_ai_config':
      aiConfig = { ...args.config };
      return aiConfig;
    case 'ai_has_token':
      return false;
    case 'save_ai_token':
    case 'list_ai_models':
      throw new Error('请在桌面应用中接入真实 AI 服务');
    case 'refresh_library_cover_metadata':
      return null;
    case 'get_settings':
      return settings;
    case 'dismiss_setup':
      settings = { ...settings, setupDismissed: true };
      return settings;
    case 'save_settings':
      settings = args.settings;
      return settings;
    case 'output_image_metadata':
      if (new URLSearchParams(location.search).get('metadata-preview') === 'wildcard') {
        const prompt = {
          '3': {
            class_type: 'ImpactWildcardProcessor',
            inputs: {
              wildcard_text: '__landscape__',
              populated_text: 'mountain, morning light',
              mode: 'reproduce',
            },
          },
          '4': {
            class_type: 'ImpactWildcardProcessor',
            inputs: { wildcard_text: '__negative__', populated_text: 'blurry, watermark', mode: 'reproduce' },
          },
          '45': { class_type: 'CLIPTextEncode', inputs: { text: ['3', 0] } },
          '48': { class_type: 'CLIPTextEncode', inputs: { text: ['4', 0] } },
          '40': { class_type: 'Seed (rgthree)', inputs: { seed: '812642747445401' } },
          '42': { class_type: 'easy int', inputs: { value: 30 } },
          '5': {
            class_type: 'KSampler',
            inputs: { positive: ['45', 0], negative: ['48', 0], seed: ['40', 0], steps: ['42', 0] },
          },
        };
        return { width: 1024, height: 1024, text: { prompt: JSON.stringify(prompt) }, prompt: null };
      }
      if (new URLSearchParams(location.search).get('metadata-preview') === 'empty') {
        return { width: 1024, height: 1024, text: {}, prompt: null };
      }
      if (new URLSearchParams(location.search).get('metadata-preview') === 'error') {
        throw new Error('开发预览：图片生成信息读取失败');
      }
      return {
        width: 1024,
        height: 1024,
        text: { parameters: '开发预览示例，非真实图片生成记录', workflow: '{"nodes": []}' },
        prompt: {
          '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '示例基础模型.safetensors' } },
          '2': {
            class_type: 'LoraLoader',
            inputs: {
              model: ['1', '0'],
              lora_name: library[0]?.path.split(/[\\/]/).pop() ?? '示例风格.safetensors',
              strength_model: '0.8',
              strength_clip: '1',
            },
          },
          '3': {
            class_type: 'CLIPTextEncode',
            inputs: { text: '山间小屋，柔和晨光，远山与云雾，细腻的水彩笔触' },
          },
          '4': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry, low quality, watermark' } },
          '5': {
            class_type: 'KSampler',
            inputs: {
              model: ['2', '0'],
              positive: ['3', '0'],
              negative: ['4', '0'],
              seed: '18446744073709551615',
              steps: '28',
              cfg: '7',
              sampler_name: 'dpmpp_2m',
              scheduler: 'karras',
              denoise: '1',
            },
          },
          '6': { class_type: 'VAEDecode', inputs: { samples: ['5', '0'] } },
          '7': { class_type: 'SaveImage', inputs: { images: ['6', '0'] } },
        },
      };
    case 'list_output_images': {
      const start = args.cursor ? Number(String(args.cursor).replace('preview-output:', '')) : 0;
      const total = new URLSearchParams(location.search).has('outputs-preview') ? 65 : 0;
      if (start > 0 && new URLSearchParams(location.search).has('outputs-delay')) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      return {
        directory: settings.outputDir || `${settings.comfyRoot}\\output`,
        exists: true,
        total,
        startIndex: start,
        nextCursor: start + 60 < total ? `preview-output:${start + 60}` : null,
        items: new URLSearchParams(location.search).has('outputs-preview')
          ? Array.from({ length: 65 }, (_, index) => ({
              path: `${outputSample}?sample=${index}`,
              name: `预览示例/图像_${index + 1}.png`,
              modified: 1789000000000 - index * 60000,
              size: 1565400,
            })).slice(start, start + 60)
          : [],
      };
    }
    case 'open_output_directory':
      throw new Error('请在桌面应用中打开真实输出目录');
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
        nextCursor: new URLSearchParams(location.search).has('pagination-preview') && Number(args.cursor ?? 1) < 12 ? String(Number(args.cursor ?? 1) + 1) : null,
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
