import { describe, expect, it } from 'vitest';
import { generationGroups, type ImageMetadata } from './generationMetadata';

const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });
const graph = {
  '1': node('CheckpointLoaderSimple', { ckpt_name: 'base.safetensors' }),
  '2': node('LoraLoader', {
    model: ['1', '0'],
    lora_name: 'style.safetensors',
    strength_model: '0.8',
    strength_clip: '0',
  }),
  '3': node('CLIPTextEncode', { text: '山间小屋，晨光', clip: ['1', '1'] }),
  '4': node('CLIPTextEncode', { text: 'blurry', clip: ['1', '1'] }),
  '5': node('KSampler', {
    model: ['2', '0'],
    positive: ['3', '0'],
    negative: ['4', '0'],
    seed: '18446744073709551615',
    steps: '20',
    cfg: '7',
    denoise: '0',
    sampler_name: 'euler',
    scheduler: 'normal',
  }),
  '6': node('VAEDecode', { samples: ['5', '0'], vae: ['1', '2'] }),
  '7': node('SaveImage', { images: ['6', '0'] }),
};
const metadata = (prompt: unknown): ImageMetadata => ({ width: 1024, height: 1024, text: {}, prompt });

describe('输出图片生成信息', () => {
  it('通过连接找到模型和正负提示词，保留种子和零值', () => {
    const [group] = generationGroups(metadata(graph));
    expect(group.loras).toEqual(['style.safetensors']);
    expect(group.rows.find((r) => r.label === '模型与 LoRA')?.value).toContain(
      'style.safetensors（模型权重 0.8，CLIP 权重 0）',
    );
    expect(group.rows.find((r) => r.label === '正向提示词')?.value).toBe('山间小屋，晨光');
    expect(group.rows.find((r) => r.label === '负向提示词')?.value).toBe('blurry');
    expect(group.rows.find((r) => r.label === '随机种子')?.value).toBe('18446744073709551615');
    expect(group.rows.find((r) => r.label === '降噪强度')?.value).toBe('0');
  });
  it('忽略与保存结果无关的采样分支', () => {
    expect(generationGroups(metadata({ ...graph, '99': node('KSampler', { seed: '123' }) }))).toHaveLength(1);
  });
  it('多次采样分别显示自己的种子和步数', () => {
    const result = generationGroups(
      metadata({
        ...graph,
        '8': node('KSamplerAdvanced', {
          latent_image: ['5', '0'],
          model: ['1', '0'],
          positive: ['3', '0'],
          negative: ['4', '0'],
          noise_seed: '42',
          steps: '10',
        }),
        '6': node('VAEDecode', { samples: ['8', '0'] }),
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[1].rows.filter((r) => r.label === '随机种子').map((r) => r.value)).toEqual(['42']);
  });
  it('自定义采样器从 guider 和 noise 读取配置', () => {
    const result = generationGroups(
      metadata({
        ...graph,
        '5': node('SamplerCustomAdvanced', { guider: ['8', '0'], noise: ['9', '0'], sigmas: ['10', '0'] }),
        '8': node('CFGGuider', { model: ['2', '0'], positive: ['3', '0'], negative: ['4', '0'], cfg: '4' }),
        '9': node('RandomNoise', { noise_seed: '88' }),
        '10': node('BasicScheduler', { model: ['2', '0'], steps: '30', scheduler: 'simple' }),
      }),
    );
    expect(result[0].rows.find((r) => r.label === '正向提示词')?.value).toBe('山间小屋，晨光');
    expect(result[0].rows.find((r) => r.label === '随机种子')?.value).toBe('88');
  });
  it('循环连接和未知节点不会导致无限递归或捏造提示词', () => {
    const result = generationGroups(
      metadata({ ...graph, '3': node('UnknownNode', { conditioning: ['3', '0'] }) }),
    );
    expect(result[0].rows.find((r) => r.label === '正向提示词')?.value).toContain('未识别');
    expect(generationGroups(metadata(null))).toEqual([]);
  });
  it('兼容 parameters 文本，保持原始参数完整', () => {
    const result = generationGroups({
      ...metadata(null),
      text: {
        parameters: 'a cat\nNegative prompt: blurry\nSteps: 20, Seed: 18446744073709551615, Model: base',
      },
    });
    expect(result[0].rows[0].value).toBe('a cat');
    expect(result[0].rows[1].value).toBe('blurry');
    expect(result[0].rows[2].value).toContain('18446744073709551615');
  });
});
