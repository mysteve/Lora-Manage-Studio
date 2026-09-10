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

export function generationGroups(metadata: ImageMetadata): GenerationGroup[] {
  const graph: Record<string, Node> = Object.create(null);
  if (record(metadata.prompt))
    for (const [id, value] of Object.entries(metadata.prompt)) {
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
    // 只解引用值节点，不尝试执行文本拼接、计算或其他自定义节点。
    if (
      /^(PrimitiveNode|PrimitiveString|PrimitiveInt|PrimitiveFloat|PrimitiveBoolean|String|INT|FLOAT)$/.test(
        node.class_type,
      )
    ) {
      return valueOf(node.inputs.value, visited);
    }
    return '';
  };
  const prompts = (start: unknown) => {
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
      if (node.class_type.startsWith('CLIPTextEncode')) {
        for (const key of ['text', 'text_g', 'text_l', 't5xxl', 'clip_l', 'clip_g']) {
          const value = valueOf(node.inputs[key]);
          if (value) values.push(value);
        }
      } else {
        for (const [key, value] of Object.entries(node.inputs)) {
          if (
            /^(conditioning|conditioning_\d+|conditioning_to|conditioning_from|positive|negative)$/.test(key)
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
  const groups: GenerationGroup[] = samplers.map(([id, node]) => {
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
      prompts(node.inputs.positive ?? guider?.inputs.positive ?? guider?.inputs.conditioning) ||
        '未识别到正向提示词，请查看原始记录',
    );
    add(
      '负向提示词',
      prompts(node.inputs.negative ?? guider?.inputs.negative) || '未记录或未识别到负向提示词',
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
