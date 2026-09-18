import type { DownloadTask } from '../types/models';

/** Shared by page-changing requests: only the latest intent may update the UI. */
export function createRequestGate() {
  let generation = 0;
  return {
    invalidate: () => { generation += 1; },
    begin: () => {
      const current = ++generation;
      return () => generation === current;
    },
  };
}

export interface SearchConditions {
  query: string;
  baseModel: string;
  tag: string;
  sort: string;
}
export interface SearchRequest {
  conditions: SearchConditions;
  cursor: string | null;
  stack: (string | null)[];
  page: number;
}
export function searchRequest(
  conditions: SearchConditions,
  cursor: string | null = null,
  stack: (string | null)[] = [null],
  page = 0,
): SearchRequest {
  return { conditions: { ...conditions }, cursor, stack: [...stack], page };
}

/** Seed from persisted tasks so reconnects/cover refreshes do not replay terminal notices. */
export function createTaskTransitions() {
  const statuses = new Map<string, DownloadTask['status']>();
  return {
    seed: (tasks: DownloadTask[]) => {
      for (const task of tasks) statuses.set(task.id, task.status);
    },
    accept: (task: DownloadTask) => {
      const changed = statuses.get(task.id) !== task.status;
      statuses.set(task.id, task.status);
      return changed && (task.status === 'failed' || task.status === 'completed');
    },
  };
}
