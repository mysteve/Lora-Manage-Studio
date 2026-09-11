import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PromptSearchClient,
  type SearchMessage,
  type SearchResponse,
  type SearchWorker,
} from './promptSearchClient';
import { builtInTerms } from './terms';

function mockWorker() {
  const sent: SearchMessage[] = [];
  const worker: SearchWorker = {
    postMessage: (message) => {
      sent.push(message);
    },
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  };
  return {
    worker,
    sent,
    reply: (data: SearchResponse) => worker.onmessage?.({ data } as MessageEvent<SearchResponse>),
  };
}
afterEach(() => vi.useRealTimers());
describe('background prompt search', () => {
  it('transfers dictionaries in small deferred batches rather than during input rendering', () => {
    vi.useFakeTimers();
    const { worker, sent } = mockWorker();
    const client = new PromptSearchClient(
      worker,
      Array.from({ length: 2501 }, () => builtInTerms[0]),
    );
    expect(sent).toEqual([{ type: 'reset' }]);
    vi.runAllTimers();
    expect(
      sent.filter((message) => message.type === 'append').map((message) => message.terms.length),
    ).toEqual([1000, 1000, 501]);
    expect(sent.at(-1)).toEqual({ type: 'ready' });
    client.dispose();
  });
  it('only sends uncancelled searches after indexing and ignores stale replies', () => {
    vi.useFakeTimers();
    const { worker, sent, reply } = mockWorker();
    const client = new PromptSearchClient(worker, builtInTerms);
    const outdated = vi.fn(),
      latest = vi.fn();
    const cancel = client.search('ha', 'positive', outdated);
    cancel();
    client.search('hair', 'positive', latest);
    vi.runAllTimers();
    reply({ type: 'ready' });
    expect(sent.filter((message) => message.type === 'search')).toEqual([
      { type: 'search', id: 2, query: 'hair', kind: 'positive' },
    ]);
    reply({ type: 'result', id: 1, terms: [builtInTerms[0]] });
    expect(outdated).not.toHaveBeenCalled();
    reply({ type: 'result', id: 2, terms: [builtInTerms[1]] });
    expect(latest).toHaveBeenCalledWith([builtInTerms[1]]);
    client.dispose();
  });
  it('drops cancelled in-flight results and terminates all work when leaving the page', () => {
    vi.useFakeTimers();
    const { worker, reply, sent } = mockWorker();
    const client = new PromptSearchClient(worker, builtInTerms);
    vi.runAllTimers();
    reply({ type: 'ready' });
    const done = vi.fn();
    client.search('cat', 'negative', done)();
    reply({ type: 'result', id: 1, terms: [builtInTerms[0]] });
    expect(done).not.toHaveBeenCalled();
    client.dispose();
    client.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const count = sent.length;
    client.search('x', 'positive', done);
    expect(done).toHaveBeenCalledWith([]);
    expect(sent.length).toBe(count);
  });
});
