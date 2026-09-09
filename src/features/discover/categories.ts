// Civitai model categories use tag names independently of the baseModels filter.
// Keep the API values in English; only the visible labels are translated.
export const modelCategories = [
  { value: 'character', label: '角色' },
  { value: 'style', label: '画风' },
  { value: 'concept', label: '概念' },
  { value: 'clothing', label: '服装' },
  { value: 'poses', label: '姿势' },
  { value: 'action', label: '动作' },
  { value: 'background', label: '背景' },
  { value: 'buildings', label: '建筑' },
  { value: 'vehicle', label: '载具' },
  { value: 'objects', label: '物品' },
  { value: 'animal', label: '动物' },
  { value: 'assets', label: '素材' },
  { value: 'tool', label: '工具' },
];

export function categoryLabel(value: string) {
  return modelCategories.find((category) => category.value === value)?.label ?? value;
}
