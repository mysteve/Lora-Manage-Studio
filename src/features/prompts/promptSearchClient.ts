import type { PromptTerm } from './terms';

export type SearchMessage =
  | { type: 'reset' }
  | { type: 'append'; terms: PromptTerm[] }
  | { type: 'ready' }
  | { type: 'search'; id: number; query: string; kind: 'positive' | 'negative' };
export type SearchResponse = { type: 'ready' } | { type: 'result'; id: number; terms: PromptTerm[] };
export interface SearchWorker {
  postMessage(message: SearchMessage): void;
  onmessage: ((event: MessageEvent<SearchResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

export class PromptSearchClient {
  private nextId = 0;
  private ready = false;
  private disposed = false;
  private jobs = new Map<
    number,
    { query: string; kind: 'positive' | 'negative'; done: (terms: PromptTerm[]) => void }
  >();
  private transferTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private worker: SearchWorker,
    terms: PromptTerm[],
  ) {
    worker.onmessage = ({ data }) => {
      if (this.disposed) return;
      if (data.type === 'ready') {
        this.ready = true;
        for (const [id, job] of this.jobs)
          worker.postMessage({ type: 'search', id, query: job.query, kind: job.kind });
      } else {
        const job = this.jobs.get(data.id);
        this.jobs.delete(data.id);
        job?.done(data.terms);
      }
    };
    worker.onerror = () => this.dispose();
    worker.postMessage({ type: 'reset' });
    // 分批复制到 Worker，避免初始化时一次序列化整个词库阻塞界面。
    let offset = 0;
    const transfer = () => {
      if (this.disposed) return;
      worker.postMessage({ type: 'append', terms: terms.slice(offset, offset + 1000) });
      offset += 1000;
      if (offset < terms.length) this.transferTimer = setTimeout(transfer, 0);
      else worker.postMessage({ type: 'ready' });
    };
    this.transferTimer = setTimeout(transfer, 0);
  }

  search(query: string, kind: 'positive' | 'negative', done: (terms: PromptTerm[]) => void) {
    if (this.disposed) {
      done([]);
      return () => {};
    }
    const id = ++this.nextId;
    this.jobs.set(id, { query, kind, done });
    if (this.ready) this.worker.postMessage({ type: 'search', id, query, kind });
    return () => {
      this.jobs.delete(id);
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.transferTimer);
    this.worker.terminate();
    for (const job of this.jobs.values()) job.done([]);
    this.jobs.clear();
  }
}
