import { searchTerms, type PromptTerm } from './terms';
import type { SearchMessage, SearchResponse } from './promptSearchClient';

let terms: PromptTerm[] = [];
const cache = new Map<string, PromptTerm[]>();
self.onmessage = ({ data }: MessageEvent<SearchMessage>) => {
  if (data.type === 'reset') {
    terms = [];
    cache.clear();
  } else if (data.type === 'append') terms.push(...data.terms);
  else if (data.type === 'ready') {
    // 首次索引构建也在后台线程完成。
    searchTerms(terms, '', undefined, 0);
    self.postMessage({ type: 'ready' } satisfies SearchResponse);
  } else {
    const key = `${data.kind}:${data.query}`;
    let matches = cache.get(key);
    if (!matches) {
      matches = searchTerms(terms, data.query, data.kind, 8);
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, matches);
    }
    self.postMessage({ type: 'result', id: data.id, terms: matches } satisfies SearchResponse);
  }
};
