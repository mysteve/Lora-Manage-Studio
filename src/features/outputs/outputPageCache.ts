// 每次刷新或更换目录新建缓存，只保留相邻的三页；同页并发读取共用请求。
export function outputPageCache<T>(read: (page: number) => Promise<T>) {
  const pending = new Map<number, Promise<T>>();
  const ready = new Map<number, T>();
  return {
    peek: (page: number) => ready.get(page),
    get(page: number): Promise<T> {
      const existing = pending.get(page);
      if (existing) return existing;
      for (const key of pending.keys()) {
        if (Math.abs(key - page) > 1) {
          pending.delete(key);
          ready.delete(key);
        }
      }
      const request = read(page)
        .then((data) => {
          if (pending.get(page) === request) ready.set(page, data);
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
