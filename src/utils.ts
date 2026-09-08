import type { LibraryEntry, ModelVersion, Recipe } from './types';
export function bytes(value: number) {
  if (!value) return '0 B';
  const i = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${['B', 'KB', 'MB', 'GB'][i]}`;
}
export function count(value: number) {
  return value >= 10000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString();
}
export function owner(entry?: LibraryEntry, version?: ModelVersion) {
  return version?.id ? `version:${version.id}` : `local:${entry?.id ?? ''}`;
}
export function blankRecipe(key: string): Recipe {
  return {
    id: '',
    owner: key,
    name: '默认配方',
    positive: '',
    negative: '',
    modelWeight: 0.8,
    clipWeight: 1,
    notes: '',
  };
}
export function combine(words: string[], positive: string) {
  return [...words.map((s) => s.trim()).filter(Boolean), positive.trim()].filter(Boolean).join(', ');
}
export function matchesEntry(e: LibraryEntry, q: string) {
  const hay = [e.name, ...e.tags, ...(e.version?.trainedWords ?? [])].join(' ').toLocaleLowerCase();
  return hay.includes(q.trim().toLocaleLowerCase());
}
export const statusLabels: Record<string, string> = {
  queued: '等待中',
  downloading: '下载中',
  paused: '已暂停',
  verifying: '校验中',
  completed: '已安装',
  failed: '下载失败',
  cancelled: '已取消',
};
