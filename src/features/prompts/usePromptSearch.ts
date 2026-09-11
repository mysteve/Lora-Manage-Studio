import { useEffect, useState } from 'react';
import { PromptSearchClient } from './promptSearchClient';
import type { PromptTerm } from './terms';

export function usePromptSearch(terms: PromptTerm[]) {
  const [client, setClient] = useState<{ terms: PromptTerm[]; instance: PromptSearchClient } | null>(null);
  useEffect(() => {
    let next: PromptSearchClient | null = null;
    try {
      next = new PromptSearchClient(
        new Worker(new URL('./promptSearch.worker.ts', import.meta.url), { type: 'module' }),
        terms,
      );
      setClient({ terms, instance: next });
    } catch {
      setClient(null);
    }
    return () => next?.dispose();
  }, [terms]);
  return client?.terms === terms ? client.instance : null;
}

export function useTermSuggestions(
  client: PromptSearchClient | null,
  query: string,
  kind: 'positive' | 'negative',
) {
  const [result, setResult] = useState<{
    client: PromptSearchClient;
    query: string;
    kind: string;
    terms: PromptTerm[];
  } | null>(null);
  useEffect(() => {
    if (!client || !query) return;
    let alive = true;
    let cancel: (() => void) | undefined;
    const timer = setTimeout(() => {
      cancel = client.search(query, kind, (terms) => {
        if (alive) setResult({ client, query, kind, terms });
      });
    }, 80);
    return () => {
      alive = false;
      clearTimeout(timer);
      cancel?.();
    };
  }, [client, query, kind]);
  return result?.client === client && result?.query === query && result?.kind === kind ? result.terms : [];
}
