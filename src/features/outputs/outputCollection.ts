export interface OutputImage {
  path: string;
  name: string;
  modified: number;
  size: number;
}
export interface OutputImages {
  directory: string;
  exists: boolean;
  total: number;
  nextCursor: string | null;
  startIndex: number;
  items: OutputImage[];
}
export interface OutputCollection {
  directoryKey: string;
  batches: OutputImages[];
}

// 按路径去重；批次仍保留原始边界供看图器跨批次导航。
export function collectedOutputItems(batches: OutputImages[]) {
  const seen = new Set<string>();
  return batches.flatMap((batch, page) => batch.items.flatMap((item) => {
    if (seen.has(item.path)) return [];
    seen.add(item.path);
    return [{ item, page }];
  }));
}

export function appendOutputBatch(batches: OutputImages[], page: number, batch: OutputImages) {
  // 自动加载与看图导航可以等待同一请求，但只能追加一次，不能留下批次空洞。
  return page === batches.length ? [...batches, batch] : batches;
}
