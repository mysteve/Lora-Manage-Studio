import type { LibraryEntry } from '../../types/models';

const normalize = (path: string) =>
  path.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
const filename = (path: string) => normalize(path).split('/').pop() ?? '';
const stem = (path: string) => filename(path).replace(/\.(safetensors|ckpt|pt|bin)$/i, '');

export interface LoraAssociation {
  recordedName: string;
  basis: 'path' | 'filename' | 'stem' | 'none';
  candidates: LibraryEntry[];
}

// 仅按实际文件路径匹配；用户编辑的展示名称不能证明是同一个模型文件。
export function associateLora(
  recordedName: string,
  library: LibraryEntry[],
  loraDir: string,
): LoraAssociation {
  const source = normalize(recordedName);
  if (!source) return { recordedName, basis: 'none', candidates: [] };
  const absolute = /^(?:[a-z]:\/|\/)/.test(source);
  const root = normalize(loraDir);
  const target = absolute ? source : root ? `${root}/${source}` : '';
  const exact = target ? library.filter((entry) => normalize(entry.path) === target) : [];
  if (exact.length) return { recordedName, basis: 'path', candidates: exact };
  const sameFile = library.filter((entry) => filename(entry.path) === filename(source));
  if (sameFile.length) return { recordedName, basis: 'filename', candidates: sameFile };
  // parameters 格式的 <lora:name:weight> 经常不带扩展名。
  if (!/\.(safetensors|ckpt|pt|bin)$/i.test(source)) {
    const sameStem = library.filter((entry) => stem(entry.path) === filename(source));
    if (sameStem.length) return { recordedName, basis: 'stem', candidates: sameStem };
  }
  return { recordedName, basis: 'none', candidates: [] };
}
