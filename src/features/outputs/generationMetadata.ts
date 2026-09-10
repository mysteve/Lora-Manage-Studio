export interface ImageMetadata {
  width: number;
  height: number;
  text: Record<string, string>;
  prompt: unknown;
}
export interface ParameterRow {
  label: string;
  value: string;
}
export interface GenerationGroup {
  title: string;
  rows: ParameterRow[];
  loras: string[];
}
interface Node {
  class_type: string;
  inputs: Record<string, unknown>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const scalar = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';

function promptRecord(value: unknown): Record<string, unknown> | null {
  for (let depth = 0; depth < 4; depth++) {
    if (typeof value === 'string') {
      try {
        // 先保护 JSON 字符串，再将超出安全整数范围的数字转为字符串，避免种子精度丢失。
        value = JSON.parse(
          value.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) =>
            /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? `"${token}"` : token,
          ),
        );
      } catch {
        return null;
      }
    } else if (record(value) && 'prompt' in value) value = value.prompt;
    else return record(value) ? value : null;
  }
  return record(value) ? value : null;
}

export function generationGroups(metadata: ImageMetadata): GenerationGroup[] {
  const graph: Record<string, Node> = Object.create(null);
  const source = promptRecord(metadata.prompt) ?? promptRecord(metadata.text.prompt);
  if (source)
    for (const [id, value] of Object.entries(source)) {
      if (record(value) && typeof value.class_type === 'string' && record(value.inputs))
        graph[id] = value as unknown as Node;
    }
  const link = (value: unknown) =>
    Array.isArray(value) && value.length === 2 && graph[String(value[0])] ? String(value[0]) : null;
  const upstream = (start: unknown, excluded: string[] = []) => {
    const found = new Set<string>();
    const pending = [link(start)];
    while (pending.length && found.size < 4096) {
      const id = pending.pop();
      if (!id || found.has(id)) continue;
      found.add(id);
      for (const [key, value] of Object.entries(graph[id].inputs))
        if (!excluded.includes(key)) pending.push(link(value));
    }
    return [...found];
  };
  const valueOf = (value: unknown, visited = new Set<string>()): string => {
    const id = link(value);
    if (!id) return scalar(value);
    if (visited.has(id) || visited.size > 32) return '';
    visited.add(id);
    const node = graph[id];
    if (node.class_type === 'ImpactWildcardProcessor') {
      // reproduce 保存的是本次使用的文本；不能重新展开通配符或采用随机生成模式的旧文本。
      return node.inputs.mode === 'reproduce' ? valueOf(node.inputs.populated_text, visited) : '';
    }
    if (node.class_type === 'Seed (rgthree)') return valueOf(node.inputs.seed, visited);
    // 只解引用值节点，不尝试执行文本拼接、计算或其他自定义节点。
    if (node.class_type === 'Reroute') return valueOf(node.inputs.value ?? node.inputs.input, visited);
    if (
      /^(PrimitiveNode|PrimitiveString|PrimitiveInt|PrimitiveFloat|PrimitiveBoolean|String|INT|FLOAT|easy int|easy float|easy string)$/.test(
        node.class_type,
      )
    ) {
      return valueOf(node.inputs.value ?? node.inputs.text ?? node.inputs.string, visited);
    }
    return '';
  };
  const prompts = (start: unknown, polarity: 'positive' | 'negative') => {
    if (typeof start === 'string') return start;
    const values: string[] = [];
    const pending = [link(start)];
    const visited = new Set<string>();
    while (pending.length && visited.size < 4096) {
      const id = pending.pop();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const node = graph[id];
      if (node.class_type === 'ConditioningZeroOut') {
        values.push('此分支的条件已清零');
        continue;
      }
      if (/TextEncode/i.test(node.class_type)) {
        for (const key of ['text', 'prompt', 'text_g', 'text_l', 't5xxl', 'clip_l', 'clip_g']) {
          const value = valueOf(node.inputs[key]);
          if (value) values.push(value);
        }
      } else {
        for (const [key, value] of Object.entries(node.inputs)) {
          if (
            /^(conditioning|conditioning_\d+|conditioning_to|conditioning_from)$/.test(key) ||
            key === polarity ||
            (node.class_type === 'Reroute' && /^(value|input)$/.test(key))
          )
            pending.push(link(value));
        }
      }
    }
    return [...new Set(values)].join('\n\n');
  };
  const outputs = Object.entries(graph).filter(([, node]) =>
    /^(SaveImage|PreviewImage|SaveAnimatedWEBP|SaveImageWebP|SaveImageJPEG)$/.test(node.class_type),
  );
  const reachable = new Set(outputs.flatMap(([id]) => upstream([id, '0'])));
  const samplers = Object.entries(graph).filter(
    ([id, node]) =>
      /^(KSampler|KSamplerAdvanced|SamplerCustom|SamplerCustomAdvanced)$/.test(node.class_type) &&
      (!outputs.length || reachable.has(id)),
  );
  // 自定义采样节点仍按明确的正负输入分组，不通过节点顺序猜测正负方向。
  const sources = samplers.length
    ? samplers
    : Object.entries(graph).filter(([, node]) => 'positive' in node.inputs && 'negative' in node.inputs);
  const groups: GenerationGroup[] = sources.map(([id, node]) => {
    const rows: ParameterRow[] = [];
    const loras: string[] = [];
    const add = (label: string, value: string) => {
      if (value) rows.push({ label, value });
    };
    const relevant = upstream([id, '0']);
    const guider = graph[link(node.inputs.guider) ?? ''];
    const modelStart = node.inputs.model ?? guider?.inputs.model;
    const models = upstream(modelStart).flatMap((modelId) => {
      const loader = graph[modelId];
      return ['ckpt_name', 'unet_name', 'model_name', 'lora_name'].flatMap((key) => {
        const name = valueOf(loader.inputs[key]);
        if (!name) return [];
        if (key === 'lora_name') loras.push(name);
        const weights =
          key === 'lora_name'
            ? ['strength_model', 'strength_clip']
                .map((weight) => {
                  const value = valueOf(loader.inputs[weight]);
                  return value ? `${weight === 'strength_model' ? '模型权重' : 'CLIP 权重'} ${value}` : '';
                })
                .filter(Boolean)
                .join('，')
            : '';
        return [`${key === 'lora_name' ? 'LoRA' : '模型'}：${name}${weights ? `（${weights}）` : ''}`];
      });
    });
    add('模型与 LoRA', [...new Set(models)].join('\n') || '未识别到模型名称，请查看原始记录');
    add(
      '正向提示词',
      prompts(node.inputs.positive ?? guider?.inputs.positive ?? guider?.inputs.conditioning, 'positive') ||
        '未识别到正向提示词，请查看原始记录',
    );
    add(
      '负向提示词',
      prompts(node.inputs.negative ?? guider?.inputs.negative, 'negative') || '未记录或未识别到负向提示词',
    );
    const labels: Record<string, string> = {
      seed: '随机种子',
      noise_seed: '随机种子',
      steps: '步数',
      cfg: 'CFG 引导系数',
      sampler_name: '采样器',
      scheduler: '调度器',
      denoise: '降噪强度',
      start_at_step: '起始步数',
      end_at_step: '结束步数',
      add_noise: '添加噪声',
      return_with_leftover_noise: '保留剩余噪声',
    };
    // 参数只取当前采样节点和直接连接的采样配置，避免混入前一轮采样。
    const configuration = [
      id,
      ...['guider', 'noise', 'sigmas', 'sampler'].flatMap((key) =>
        upstream(node.inputs[key], ['model', 'positive', 'negative', 'conditioning']),
      ),
    ];
    for (const configId of new Set(configuration))
      for (const [key, label] of Object.entries(labels)) {
        const value = valueOf(graph[configId].inputs[key]);
        if (value) add(label, value);
      }
    const vaes = relevant.map((nodeId) => valueOf(graph[nodeId].inputs.vae_name)).filter(Boolean);
    add('VAE（输入分支）', [...new Set(vaes)].join('\n'));
    return { title: `${node.class_type} · 节点 ${id}`, rows, loras: [...new Set(loras)] };
  });
  if (!groups.length && metadata.text.parameters) {
    const raw = metadata.text.parameters;
    const match = /(?:^|\n)(Steps:\s*\d+[^\n]*)/.exec(raw);
    const promptsText = match ? raw.slice(0, match.index).trim() : raw;
    const [positive, ...negative] = promptsText.split(/\nNegative prompt:\s*/);
    const rows: ParameterRow[] = [{ label: '正向提示词', value: positive }];
    if (negative.length) rows.push({ label: '负向提示词', value: negative.join('\n') });
    if (match) rows.push({ label: '生成参数（原文）', value: raw.slice(match.index).trim() });
    const loras = [...raw.matchAll(/<lora:([^:>]+):[^>]+>/gi)].map((match) => match[1]);
    groups.push({
      title: '图片内嵌生成记录',
      rows: rows.filter((row) => row.value),
      loras: [...new Set(loras)],
    });
  }
  return groups;
}
