import { describe, expect, it } from 'vitest';
import { createRequestGate, createTaskTransitions, searchRequest } from './asyncState';
import type { DownloadTask } from '../types/models';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('detail request ownership', () => {
  it.each(['navigation', 'local detail', 'import close'])('%s invalidates a pending result', async () => {
    const gate = createRequestGate();
    const current = gate.begin();
    const request = deferred<string>();
    let selected = 'current page';
    const completion = request.promise.then((result) => { if (current()) selected = result; });
    gate.invalidate();
    request.resolve('obsolete detail');
    await completion;
    expect(selected).toBe('current page');
  });
  it('an old rejection cannot report an error or clear the next request busy state', async () => {
    const gate = createRequestGate();
    const old = gate.begin();
    const request = deferred<string>();
    let busy = true;
    let error = '';
    const completion = request.promise.catch(() => { if (old()) error = 'failed'; })
      .finally(() => { if (old()) busy = false; });
    const latest = gate.begin();
    request.reject(new Error('old error'));
    await completion;
    expect(error).toBe('');
    expect(busy).toBe(true);
    expect(latest()).toBe(true);
  });
});

describe('search request snapshots', () => {
  it('keeps submitted conditions and cursor history independent of draft changes', () => {
    const conditions = { query: 'submitted', baseModel: 'Flux', tag: 'style', sort: 'Newest' };
    const stack = [null, 'page-two'];
    const request = searchRequest(conditions, stack[1], stack, 1);
    conditions.query = 'draft not submitted';
    stack.push('later cursor');
    expect(request).toEqual({
      conditions: { query: 'submitted', baseModel: 'Flux', tag: 'style', sort: 'Newest' },
      cursor: 'page-two', stack: [null, 'page-two'], page: 1,
    });
    // A retry uses this entire snapshot, not the current controls or page zero.
    expect(searchRequest(request.conditions, request.cursor, request.stack, request.page)).toEqual(request);
  });
});

describe('download terminal notifications', () => {
  const task = (status: DownloadTask['status'], id = 'one') => ({ id, status }) as DownloadTask;
  it('notifies failure once per transition, including a new failure after retry', () => {
    const transitions = createTaskTransitions();
    transitions.seed([task('downloading')]);
    expect(transitions.accept(task('failed'))).toBe(true);
    expect(transitions.accept(task('failed'))).toBe(false);
    expect(transitions.accept(task('queued'))).toBe(false);
    expect(transitions.accept(task('failed'))).toBe(true);
    expect(transitions.accept(task('failed', 'two'))).toBe(true);
  });
  it('does not replay persisted failures or duplicate completed notices on cover refresh', () => {
    const transitions = createTaskTransitions();
    transitions.seed([task('failed')]);
    expect(transitions.accept(task('failed'))).toBe(false);
    expect(transitions.accept(task('completed'))).toBe(true);
    transitions.seed([task('completed')]);
    expect(transitions.accept(task('completed'))).toBe(false);
  });
});
