import { describe, expect, it } from 'vitest';
import { associateLora } from './loraAssociations';
import type { LibraryEntry } from '../../types/models';

const entry = (id: string, path: string, name = '展示名称'): LibraryEntry => ({
  id,
  path,
  name,
  size: 0,
  modified: 0,
  sha256: '',
  triggerWords: [],
  triggerPreviews: [],
  author: '',
  baseModel: '',
  tags: [],
  notes: '',
  favorite: false,
  missing: false,
  verified: false,
  cover: { url: '', localPath: '' },
  customCover: false,
  modelId: null,
  version: null,
  createdAt: 0,
});
const root = 'D:\\ComfyUI\\models\\loras';
describe('输出图像关联本地 LoRA', () => {
  it('优先匹配相对路径并统一 Windows 路径大小写和分隔符', () => {
    const library = [entry('a', `${root}\\风格\\A.safetensors`), entry('b', 'E:/A.safetensors')];
    expect(associateLora('风格/a.safetensors', library, root)).toMatchObject({
      basis: 'path',
      candidates: [library[0]],
    });
  });
  it('绝对路径不拼接根目录', () => {
    const item = entry('a', 'E:/images/model.safetensors');
    expect(associateLora(item.path, [item], root).basis).toBe('path');
  });
  it('无法按路径区分时保留全部同名候选', () => {
    const library = [entry('a', `${root}/a/model.safetensors`), entry('b', `${root}/b/model.safetensors`)];
    expect(associateLora('model.safetensors', library, root)).toMatchObject({
      basis: 'filename',
      candidates: library,
    });
  });
  it('支持不带扩展名的 LoRA 记录，缺失文件仍可查看库资料', () => {
    const item = { ...entry('a', `${root}/model.safetensors`), missing: true };
    expect(associateLora('model', [item], root)).toMatchObject({ basis: 'stem', candidates: [item] });
  });
  it('不按展示名称或相似字符串误匹配，也不匹配基础模型', () => {
    const library = [entry('a', `${root}/other.safetensors`, 'model.safetensors')];
    expect(associateLora('model.safetensors', library, root).candidates).toEqual([]);
    expect(associateLora('', library, root).candidates).toEqual([]);
  });
});
