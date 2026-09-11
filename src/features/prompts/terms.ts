export interface PromptTerm {
  source?: string;
  count?: number;
  id: string;
  text: string;
  translation: string;
  category: string;
  aliases: string;
  kind: 'positive' | 'negative' | 'both';
  enabled: boolean;
}

const groups: [string, PromptTerm['kind'], [string, string, string?][]][] = [
  [
    '画质',
    'positive',
    [
      ['masterpiece', '杰作'],
      ['best quality', '最佳画质'],
      ['highly detailed', '高度细致'],
      ['sharp focus', '清晰对焦'],
      ['high resolution', '高分辨率', '高清'],
      ['intricate details', '精细细节'],
    ],
  ],
  [
    '风格',
    'positive',
    [
      ['anime style', '动漫风格', '二次元'],
      ['photorealistic', '照片级写实', '真实摄影'],
      ['watercolor painting', '水彩画'],
      ['oil painting', '油画'],
      ['pencil sketch', '铅笔素描'],
      ['pixel art', '像素艺术'],
      ['concept art', '概念艺术'],
      ['cinematic', '电影质感'],
      ['minimalist', '极简风格'],
      ['3d render', '三维渲染'],
    ],
  ],
  [
    '人物',
    'positive',
    [
      ['portrait', '肖像'],
      ['full body', '全身'],
      ['upper body', '上半身'],
      ['looking at viewer', '看向观众', '直视镜头'],
      ['smile', '微笑'],
      ['long hair', '长发'],
      ['short hair', '短发'],
      ['flowing hair', '飘动的头发'],
      ['detailed eyes', '细致的眼睛'],
      ['dynamic pose', '动态姿势'],
    ],
  ],
  [
    '构图',
    'positive',
    [
      ['close-up', '特写'],
      ['wide shot', '远景'],
      ['from above', '俯视'],
      ['from below', '仰视'],
      ['depth of field', '景深'],
      ['bokeh', '散景', '背景虚化'],
      ['symmetrical composition', '对称构图'],
      ['rule of thirds', '三分法构图'],
      ['centered composition', '居中构图'],
    ],
  ],
  [
    '光影',
    'positive',
    [
      ['soft lighting', '柔和光照', '柔光'],
      ['cinematic lighting', '电影光照'],
      ['volumetric lighting', '体积光'],
      ['rim lighting', '轮廓光'],
      ['backlighting', '逆光'],
      ['golden hour', '黄金时刻'],
      ['natural light', '自然光'],
      ['dramatic shadows', '强烈的阴影'],
      ['neon lights', '霓虹灯光'],
    ],
  ],
  [
    '场景',
    'positive',
    [
      ['forest', '森林'],
      ['mountain landscape', '山地风景'],
      ['ocean', '海洋'],
      ['cherry blossoms', '樱花'],
      ['starry sky', '星空'],
      ['cityscape', '城市景观'],
      ['cyberpunk city', '赛博朋克城市'],
      ['cozy room', '温馨的房间'],
      ['ancient ruins', '古代遗迹'],
      ['snowy landscape', '雪景'],
      ['sunset', '日落'],
      ['rainy street', '雨中的街道'],
    ],
  ],
  [
    '色彩',
    'positive',
    [
      ['pastel colors', '柔和的粉彩色'],
      ['vibrant colors', '鲜艳色彩'],
      ['monochrome', '单色'],
      ['warm tones', '暖色调'],
      ['cool tones', '冷色调'],
    ],
  ],
  [
    '句式',
    'positive',
    [
      ['a quiet village surrounded by mountains', '群山环绕的宁静村庄'],
      ['sunlight filtering through the leaves', '阳光透过树叶洒落'],
      ['a portrait with soft natural lighting', '柔和自然光下的人像'],
      ['reflections on a rain-soaked street', '雨后街道上的倒影'],
    ],
  ],
  [
    '负向',
    'negative',
    [
      ['low quality', '低画质'],
      ['worst quality', '最差画质'],
      ['blurry', '模糊'],
      ['out of focus', '失焦'],
      ['bad anatomy', '人体结构错误'],
      ['bad hands', '手部错误'],
      ['extra fingers', '多余手指'],
      ['missing fingers', '缺少手指'],
      ['extra limbs', '多余肢体'],
      ['deformed', '变形'],
      ['watermark', '水印'],
      ['text', '文字'],
      ['signature', '签名'],
      ['jpeg artifacts', 'JPEG 压缩痕迹'],
      ['overexposed', '过曝'],
      ['underexposed', '曝光不足'],
    ],
  ],
];
export const builtInTerms: PromptTerm[] = groups.flatMap(([category, kind, terms], group) =>
  terms.map(([text, translation, aliases = ''], index) => ({
    id: `builtin-${group}-${index}`,
    text,
    translation,
    aliases,
    category,
    kind,
    enabled: true,
  })),
);
export const termStorageKey = 'lora-studio.prompt-terms.v1';
export const normalizeTerm = (text: string) =>
  text.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();

function validateTerms(terms: unknown): asserts terms is PromptTerm[] {
  if (!Array.isArray(terms)) throw new Error('词库条目格式不正确');
  const ids = new Set<string>();
  const texts = new Set<string>();
  for (const term of terms) {
    if (
      !term ||
      typeof term.id !== 'string' ||
      !term.id ||
      ids.has(term.id) ||
      !['text', 'category'].every((field) => typeof term[field] === 'string' && term[field].trim()) ||
      typeof term.translation !== 'string' ||
      typeof term.aliases !== 'string' ||
      typeof term.enabled !== 'boolean' ||
      !['positive', 'negative', 'both'].includes(term.kind) ||
      texts.has(normalizeTerm(term.text))
    )
      throw new Error('词库条目格式不正确');
    ids.add(term.id);
    texts.add(normalizeTerm(term.text));
  }
}

export function readTerms(
  storage: Pick<Storage, 'getItem'>,
  key = termStorageKey,
  defaults = builtInTerms,
): PromptTerm[] {
  const raw = storage.getItem(key);
  if (raw === null) return defaults;
  const data = JSON.parse(raw);
  if (!data || ![1, 2].includes(data.version)) throw new Error('词库数据格式不正确');
  validateTerms(data.terms);
  let deleted: Set<string>;
  if (data.version === 1) {
    // 旧版保存完整词库，仅对原有 81 条推导删除记录，新扩展词库自动加入。
    const savedIds = new Set(data.terms.map((term: PromptTerm) => term.id));
    deleted = new Set(builtInTerms.filter((term) => !savedIds.has(term.id)).map((term) => term.id));
  } else {
    if (!Array.isArray(data.deleted) || !data.deleted.every((id: unknown) => typeof id === 'string'))
      throw new Error('词库删除记录格式不正确');
    deleted = new Set(data.deleted);
  }
  const overrides = new Set(data.terms.map((term: PromptTerm) => term.id));
  const merged = new Map(
    defaults
      .filter((term) => !deleted.has(term.id) && !overrides.has(term.id))
      .map((term) => [normalizeTerm(term.text), term]),
  );
  for (const term of data.terms) merged.set(normalizeTerm(term.text), term);
  return [...merged.values()];
}

export function writeTerms(
  storage: Pick<Storage, 'setItem'>,
  terms: PromptTerm[],
  key = termStorageKey,
  defaults = builtInTerms,
) {
  const original = new Map(defaults.map((term) => [term.id, term]));
  const present = new Set(terms.map((term) => term.id));
  const fields = ['text', 'translation', 'category', 'aliases', 'kind', 'enabled'] as const;
  const changed = terms.filter((term) => {
    const base = original.get(term.id);
    return !base || fields.some((field) => term[field] !== base[field]);
  });
  const deleted = defaults.filter((term) => !present.has(term.id)).map((term) => term.id);
  storage.setItem(key, JSON.stringify({ version: 2, terms: changed, deleted }));
}

const searchIndexes = new WeakMap<PromptTerm[], { term: PromptTerm; fields: string[] }[]>();
export function searchTerms(
  terms: PromptTerm[],
  query: string,
  kind?: 'positive' | 'negative',
  limit = Infinity,
) {
  let index = searchIndexes.get(terms);
  if (!index) {
    index = terms.map((term) => ({
      term,
      fields: [term.text, term.translation, term.aliases].map(normalizeTerm),
    }));
    searchIndexes.set(terms, index);
  }
  const needle = normalizeTerm(query);
  const words = needle.split(' ');
  const buckets: PromptTerm[][] = [[], [], [], [], []];
  for (const { term, fields } of index) {
    if (kind && (!term.enabled || (term.kind !== kind && term.kind !== 'both'))) continue;
    let score = 0;
    if (!needle) score = 1;
    else if (fields.some((field) => field === needle)) score = 4;
    else if (fields.some((field) => field.startsWith(needle))) score = 3;
    else if (fields.some((field) => field.includes(needle))) score = 2;
    else if (words.length > 1 && words.every((word) => fields.some((field) => field.includes(word))))
      score = 1;
    if (score && buckets[score].length < limit) buckets[score].push(term);
  }
  return [...buckets[4], ...buckets[3], ...buckets[2], ...buckets[1]].slice(0, limit);
}

// Only replace the token around the caret; preserve separators, weights and LoRA expressions.
export function promptToken(value: string, caret: number) {
  caret = Math.max(0, Math.min(caret, value.length));
  const separator = /[,，;；\n()\[\]:<>]/;
  let start = caret;
  let end = caret;
  while (start > 0 && !separator.test(value[start - 1])) start--;
  while (end < value.length && !separator.test(value[end])) end++;
  while (start < caret && /\s/.test(value[start])) start++;
  const before = value.slice(0, caret);
  const protectedExpression = before.lastIndexOf('<') > before.lastIndexOf('>');
  return { start, end, query: protectedExpression ? '' : value.slice(start, caret).trim() };
}
export function completeTerm(value: string, caret: number, term: string) {
  const { start, end } = promptToken(value, caret);
  const prefix = value.slice(0, start).replace(/([,，])[ \t]*$/, '$1 ');
  let remainder = value.slice(end);
  let suffix = end === value.length ? ', ' : '';
  if (/^[,，]/.test(remainder)) {
    suffix = `${remainder[0]} `;
    remainder = remainder.slice(1).replace(/^[ \t]*/, '');
  }
  const inserted = prefix + term + suffix;
  return { text: inserted + remainder, caret: inserted.length };
}
