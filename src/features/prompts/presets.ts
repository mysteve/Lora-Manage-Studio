import type { PromptSegment } from './composer';

export interface PromptPreset {
  id: string;
  name: string;
  segments: PromptSegment[];
}
export const presetStorageKey = 'lora-studio.prompt-presets.v1';
export function readPresets(storage: Pick<Storage, 'getItem'>, key = presetStorageKey): PromptPreset[] {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.presets)) throw new Error('预设数据格式不正确');
  const ids = new Set<string>();
  for (const preset of data.presets) {
    if (
      !preset ||
      typeof preset.id !== 'string' ||
      !preset.id ||
      ids.has(preset.id) ||
      typeof preset.name !== 'string' ||
      !preset.name.trim() ||
      !Array.isArray(preset.segments)
    )
      throw new Error('预设数据格式不正确');
    ids.add(preset.id);
    const segmentIds = new Set<string>();
    for (const segment of preset.segments) {
      if (
        !segment ||
        typeof segment.id !== 'string' ||
        !segment.id ||
        segmentIds.has(segment.id) ||
        typeof segment.text !== 'string' ||
        typeof segment.enabled !== 'boolean' ||
        !['positive', 'negative'].includes(segment.kind) ||
        (segment.name !== undefined && typeof segment.name !== 'string')
      )
        throw new Error('预设片段格式不正确');
      segmentIds.add(segment.id);
    }
  }
  return data.presets;
}
export function writePresets(
  storage: Pick<Storage, 'setItem'>,
  presets: PromptPreset[],
  key = presetStorageKey,
) {
  storage.setItem(key, JSON.stringify({ version: 1, presets }));
}
