// 每次刷新或更换目录新建缓存，只保留相邻的三页；同页并发读取共用请求。
export function outputPageCache<T extends { nextCursor: string | null }>(
  read: (cursor: string | null) => Promise<T>,
  initial: (string | null)[] = [null],
) {
  let cursors = [...initial];
  const pending = new Map<number, Promise<T>>();
  const ready = new Map<number, T>();
  return {
    history: () => [...cursors],
    peek: (page: number) => ready.get(page),
    get(page: number): Promise<T> {
      if (page < 0 || page >= cursors.length) return Promise.reject(new Error('输出页位置已失效，请刷新列表'));
      const existing = pending.get(page);
      if (existing) return existing;
      for (const key of pending.keys()) {
        if (Math.abs(key - page) > 1) {
          pending.delete(key);
          ready.delete(key);
        }
      }
      const request = read(cursors[page])
        .then((data) => {
          if (pending.get(page) === request) {
            const next = data.nextCursor;
            if (next && cursors.slice(0, page + 1).includes(next)) throw new Error('输出图片游标重复，请刷新列表');
            if (cursors[page + 1] !== next || !next) {
              cursors = [...cursors.slice(0, page + 1), ...(next ? [next] : [])];
              for (const key of pending.keys()) {
                if (key > page) { pending.delete(key); ready.delete(key); }
              }
            }
            ready.set(page, data);
          }
          return data;
        })
        .catch((error) => {
          if (pending.get(page) === request) pending.delete(page);
          throw error;
        });
      pending.set(page, request);
      return request;
    },
  };
}
